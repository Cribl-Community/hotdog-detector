import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, PasswordField, SelectField, Skeleton } from '@capra/core';
import { InvestigatorTranscript } from '@criblio/app-utils/investigator';
import { HOSTS, createGoatTownClient } from './goattown/transport';
import type { ServiceKey } from './goattown/transport';
import { connectionKey, readConnection, writeKv, writeProxyToken } from './goattown/history';
import { useAgentSetup } from './goattown/useAgentSetup';
import { useClassification } from './goattown/useClassification';
import './styles/hotdog.css';

type View = 'classify' | 'history' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('classify');
  const [service, setService] = useState<ServiceKey>('production');
  const [userId, setUserId] = useState('');
  const [settingsReady, setSettingsReady] = useState(false);
  const [connectionState, setConnectionState] = useState('Authentication is injected by the Cribl app proxy.');
  const [testingConnection, setTestingConnection] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenStatus, setTokenStatus] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const user = typeof window.getCriblUser === 'function' ? await window.getCriblUser() : { id: 'local-preview' };
      if (!mounted) return;
      setUserId(user.id);
      const saved = await readConnection(user.id).catch(() => null);
      if (mounted && saved?.service && saved.service in HOSTS) setService(saved.service);
      if (mounted) setSettingsReady(true);
    })();
    return () => { mounted = false; };
  }, []);

  const makeClient = useCallback((capture?: Parameters<typeof createGoatTownClient>[1]) => createGoatTownClient(service, capture), [service]);
  const client = useMemo(() => makeClient(), [makeClient]);
  const setup = useAgentSetup(client, service, userId, view === 'classify' && settingsReady);
  const classification = useClassification(makeClient, service, userId, view === 'classify');

  const chooseService = async (value: unknown) => {
    if (value !== 'production' && value !== 'staging') return;
    setService(value);
    if (userId) {
      try { await writeKv(connectionKey(userId), { service: value }); }
      catch (error) { setConnectionState(error instanceof Error ? error.message : String(error)); }
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionState('Checking GoatTown…');
    try {
      const [protocol, agents] = await Promise.all([client.protocol(), client.listAgents()]);
      const hasClassifier = agents.some((agent) => agent.slug === 'hot-dog-classifier');
      setConnectionState(`Connected · ${protocol.capabilities.includes('session-images') ? 'image input supported' : 'image input unavailable'} · ${hasClassifier ? 'classifier agent ready' : 'classifier setup required'}`);
    } catch (error) {
      setConnectionState(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingConnection(false);
    }
  };

  const saveToken = async () => {
    const token = tokenInput.trim();
    if (!token) { setTokenStatus('Enter a GoatTown bearer token first.'); return; }
    setSavingToken(true);
    setTokenStatus('Saving token to this app’s KV store…');
    try {
      await writeProxyToken(token);
      setTokenInput('');
      setTokenStatus('Token saved. The proxy will inject it on the next request; test the connection below.');
    } catch (error) {
      setTokenStatus(error instanceof Error ? error.message : 'Could not save the token.');
    } finally {
      setSavingToken(false);
    }
  };

  const startNewSession = () => {
    classification.reset();
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
      photoInputRef.current.click();
    }
  };

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">HD</span><div><div className="eyebrow">IMAGE CLASSIFIER</div><h1>Hot Dog or Not Hot Dog</h1></div></div>
        <div className="header-meta"><span className="connection-dot" /> GoatTown vision agent</div>
      </header>

      <main className="page-wrap">
        <section className="intro-row">
          <div><div className="eyebrow">A VERY SERIOUS FOOD QUESTION</div><h2>Is it a hot dog?</h2><p>Drop in a photo. The vision agent will take a look and tell you what it sees.</p></div>
          <div className="result-legend"><span><i className="legend-dot yes" />Hot dog</span><span><i className="legend-dot no" />Not hot dog</span><span><i className="legend-dot unsure" />Couldn’t tell</span></div>
        </section>

        <nav className="view-tabs" aria-label="App sections" role="tablist">
          {([['classify', 'Classify'], ['history', 'History'], ['settings', 'Settings']] as const).map(([key, label]) => (
            <Button key={key} variant={view === key ? 'primary' : 'secondary'} size="sm" onClick={() => setView(key)} aria-current={view === key ? 'page' : undefined}>{label}</Button>
          ))}
        </nav>

        {view === 'classify' && (
          <div className="main-grid">
            <div className="work-column">
              {!setup.checked ? <Card className="setup-card"><Card.Content className="card-content"><Skeleton title={{ width: '50%' }} paragraph={{ rows: 1, width: '85%' }} active /></Card.Content></Card> : !setup.status?.agentAvailable && (
                <Card className="setup-card"><Card.Content className="card-content">
                  <div className="setup-heading"><span className="status-pill pending">SETUP REQUIRED</span><h3>Connect the classifier agent</h3></div>
                  <p>Stage the bundled vision-agent configuration. A tenant administrator must review and activate it in GoatTown before photos can be classified.</p>
                  {setup.error && <p className="inline-error" role="alert">{setup.error}</p>}
                  {setup.staged && <div className="staged-notice">Revision <code>{setup.staged.revisionId}</code> is staged and waiting for approval.</div>}
                  <div className="setup-actions"><Button variant="primary" pending={setup.busy} disabled={setup.busy} onClick={() => void setup.stage()}>{setup.staged ? 'Stage Again' : 'Stage Agent Configuration'}</Button><Button variant="secondary" disabled={setup.busy} onClick={() => void setup.refresh()}>Check Activation</Button></div>
                  {setup.staged?.reviewPath && <a className="review-link" href={`${HOSTS[service].baseUrl}${setup.staged.reviewPath}`} target="_blank" rel="noopener noreferrer">Open configuration review</a>}
                </Card.Content></Card>
              )}

              <Card className="upload-card"><Card.Content className="card-content">
                <div className="section-head"><div><div className="eyebrow">01 / ADD A PHOTO</div><h3>Choose your evidence</h3></div><span className="file-note">JPEG · PNG · WebP</span></div>
                <label className="upload-zone" htmlFor="photo-input">
                  <input ref={photoInputRef} id="photo-input" type="file" accept="image/*" onChange={(event) => void classification.choosePhoto(event.currentTarget.files?.[0])} />
                  {classification.photo ? <><img src={classification.photo.dataUrl} alt="Selected photo preview" /><span className="upload-caption"><strong>{classification.photo.sourceName}</strong><small>{classification.photo.width} × {classification.photo.height} · compressed for secure upload</small></span></> : <><span className="upload-symbol" aria-hidden="true">＋</span><strong>Choose a photo</strong><span>JPG, PNG, or WebP · image stays attached to this session</span></>}
                </label>
                {classification.error && <p className="inline-error" role="alert">{classification.error}</p>}
                <div className="classify-actions"><Button variant="primary" size="lg" pending={classification.running} disabled={!classification.photo || classification.running || !setup.status?.agentAvailable} onClick={() => void classification.classify()}>Classify Photo</Button>{(classification.photo || classification.result) && <Button variant="secondary" onClick={startNewSession}>New Session</Button>}<span className="secure-note">Your image is sent only to the configured GoatTown service.</span></div>
              </Card.Content></Card>

              <Card className="live-card"><Card.Content className="card-content">
                <div className="section-head"><div><div className="eyebrow">02 / THE VERDICT</div><h3>Classification</h3></div>{classification.running && <span className="working-indicator"><i /> Working</span>}</div>
                {classification.result ? <VerdictCard record={classification.result} /> : classification.running ? <div className="first-run-skeleton"><Skeleton title={{ width: '42%' }} paragraph={{ rows: 1, width: '75%' }} active /></div> : <div className="empty-verdict"><span aria-hidden="true">?</span><p>Your verdict will appear here.</p></div>}
                {classification.running && <div className="progress-line" role="status">{classification.progress}</div>}
                {classification.entries.length > 0 && <div className="transcript"><h4>Agent response</h4><InvestigatorTranscript entries={classification.entries} running={classification.running} /> </div>}
              </Card.Content></Card>
            </div>

            <aside className="side-column">
              <Card className="history-card"><Card.Content className="card-content">
                <div className="section-head"><div><div className="eyebrow">RECENT CALLS</div><h3>Session history</h3></div><Button variant="tertiary" size="sm" onClick={() => setView('history')}>View All</Button></div>
                {classification.historyLoading ? <div className="history-loading"><Skeleton title paragraph active /><Skeleton title paragraph active /></div> : classification.history.length === 0 ? <p className="muted-copy">Past classifications will be saved here.</p> : classification.history.slice(0, 4).map((record) => <HistoryRow key={record.sessionId} record={record} />)}
              </Card.Content></Card>
              <Card className="privacy-card"><Card.Content className="card-content"><div className="privacy-icon" aria-hidden="true">i</div><h4>Built to avoid guessing</h4><p>The model must confirm it can see the image before upload. If it can’t, or the answer is unclear, this app says so.</p></Card.Content></Card>
            </aside>
          </div>
        )}

        {view === 'history' && <section className="secondary-view"><div className="secondary-heading"><div><div className="eyebrow">YOUR RECENT CLASSIFICATIONS</div><h2>Session history</h2><p>Each result keeps its photo thumbnail and one-line reason.</p></div><Button variant="secondary" onClick={() => setView('classify')}>Back to Classifier</Button></div>
          {classification.historyLoading ? <Card><Card.Content className="card-content"><Skeleton title paragraph active /><Skeleton title paragraph active /></Card.Content></Card> : classification.history.length === 0 ? <Card><Card.Content className="card-content"><div className="empty-history"><h3>No verdicts yet</h3><p>Classify your first photo and it will show up here.</p></div></Card.Content></Card> : <div className="history-list">{classification.history.map((record) => <HistoryRow key={record.sessionId} record={record} expanded />)}</div>}
        </section>}

        {view === 'settings' && <section className="secondary-view settings-view"><div className="secondary-heading"><div><div className="eyebrow">CONNECTION</div><h2>Settings</h2><p>Choose which GoatTown service this app should use.</p></div></div>
          <Card><Card.Content className="card-content"><div className="settings-layout"><div><h3>GoatTown endpoint</h3><p>Choose the service, then save its bearer token. The app stores it in KV as <code>goattownEmbedToken</code>; the proxy injects it into GoatTown requests.</p><SelectField label="Service" value={service} onChange={(value) => void chooseService(value)} items={Object.entries(HOSTS).map(([id, host]) => ({ id, label: `${host.label} · ${new URL(host.baseUrl).host}` }))} /><div className="credential-form"><PasswordField label="GoatTown bearer token" value={tokenInput} onChange={setTokenInput} placeholder="Paste token" helperText="Saved as plain text for proxy injection. The app never reads it back; saving replaces the current token." /><div className="settings-actions"><Button variant="secondary" pending={savingToken} disabled={savingToken || !tokenInput.trim()} onClick={() => void saveToken()}>Save Token</Button><span className="connection-status" role="status">{tokenStatus}</span></div></div><div className="settings-actions"><Button variant="primary" pending={testingConnection} disabled={testingConnection} onClick={() => void testConnection()}>Test Connection</Button><span className="connection-status" role="status">{connectionState}</span></div></div><div className="connection-note"><strong>Credential handling</strong><p>The bearer is sent only to the app’s scoped Cribl KV write endpoint, then injected by the proxy. It is never returned to this page or included in the bundle.</p></div></div></Card.Content></Card>
        </section>}

        <details className="raw-disclosure"><summary>Raw payload &amp; event stream <span>{classification.unknownKinds ? `${classification.unknownKinds} unknown event kind${classification.unknownKinds === 1 ? '' : 's'}` : 'for debugging'}</span></summary>
          {classification.rawPayloads.length ? <pre>{JSON.stringify({ unknownKinds: classification.unknownKinds, payloads: classification.rawPayloads }, null, 2)}</pre> : <p>No session payload has been received yet.</p>}
        </details>
      </main>
      <footer className="page-footer"><span>HOT DOG OR NOT HOT DOG</span><span>Images are processed for this classification only.</span></footer>
    </div>
  );
}

function VerdictCard({ record }: { record: import('./goattown/history').VerdictRecord }) {
  const cls = record.label === 'hot-dog' ? 'verdict-hotdog' : record.label === 'not-hot-dog' ? 'verdict-not' : 'verdict-unclear';
  return <div className={`verdict-result ${cls}`}><div className="verdict-image"><img src={record.photoDataUrl} alt="Classified photo" /></div><div className="verdict-copy"><span className="verdict-kicker">THE AGENT SAYS</span><h4>{record.title}</h4><p>{record.reason || 'No clear reason was returned.'}</p><time>{new Date(record.createdAt).toLocaleString()}</time></div></div>;
}

function HistoryRow({ record, expanded = false }: { record: import('./goattown/history').VerdictRecord; expanded?: boolean }) {
  return <article className={`history-row ${expanded ? 'history-row-expanded' : ''}`}><img src={record.photoDataUrl} alt="" /><div className="history-row-copy"><span className={`history-label ${record.label}`}>{record.title}</span><p>{record.reason || 'No clear reason was returned.'}</p><time>{new Date(record.createdAt).toLocaleString()}</time></div></article>;
}
