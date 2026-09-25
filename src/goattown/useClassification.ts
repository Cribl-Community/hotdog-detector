import { useCallback, useEffect, useRef, useState } from 'react';
import type { GoatTownClient } from '@criblio/app-utils/goattown';
import type { InvestigatorTranscriptEntry } from '@criblio/app-utils/investigator';
import { readEventCollection } from '@criblio/app-utils/goattown';
import type { PreparedPhoto } from './image';
import { preparePhoto } from './image';
import { loadHistory, saveVerdict } from './history';
import type { VerdictRecord } from './history';
import { observeClassification } from './observer';
import { createClassificationSession, sendClassificationPhoto } from './session';
import { assertVisionReady } from './preflight';
import { answerFromEntries, findingReasonFromEntries, parseVerdict, sessionDisposition } from './verdict';
import { emptyFold, foldFrames } from './wire';
import type { FoldState, SequencedEvent } from './wire';
import type { ServiceKey, RawResponseHandler } from './transport';

export function useClassification(
  makeClient: (capture?: RawResponseHandler) => GoatTownClient,
  service: ServiceKey,
  userId: string,
  active: boolean,
) {
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [entries, setEntries] = useState<InvestigatorTranscriptEntry[]>([]);
  const [rawPayloads, setRawPayloads] = useState<unknown[]>([]);
  const [unknownKinds, setUnknownKinds] = useState(0);
  const [history, setHistory] = useState<VerdictRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('Choose a photo to get started.');
  const [result, setResult] = useState<VerdictRecord | null>(null);
  const foldRef = useRef<FoldState>(emptyFold());
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!userId) return;
    setHistoryLoading(true);
    void loadHistory(userId).then((items) => { if (mounted) setHistory(items); }).catch((e) => {
      if (mounted) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => { if (mounted) setHistoryLoading(false); });
    return () => { mounted = false; };
  }, [userId]);

  useEffect(() => {
    if (!active && controllerRef.current) controllerRef.current.abort();
  }, [active]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    foldRef.current = emptyFold();
    setPhoto(null);
    setEntries([]);
    setRawPayloads([]);
    setUnknownKinds(0);
    setError(null);
    setProgress('Choose a photo to get started.');
    setResult(null);
    setRunning(false);
  }, []);

  const choosePhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const client = makeClient();
      const supported = await client.hasCapability('session-images');
      if (!supported) throw new Error('This GoatTown connection does not support image input.');
      const limits = await client.imageLimits();
      setPhoto(await preparePhoto(file, limits));
      setProgress('Photo ready to classify.');
    } catch (e) {
      setPhoto(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [makeClient]);

  const classify = useCallback(async () => {
    if (!photo || running) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    foldRef.current = emptyFold();
    setEntries([]);
    setRawPayloads([]);
    setUnknownKinds(0);
    setError(null);
    setRunning(true);
    setProgress('Checking image support…');
    let sessionId = '';
    let sessionStatus = 'error';
    const client = makeClient((path, payload) => {
      const frames = readEventCollection(payload) as SequencedEvent[] | null;
      if (!frames) return;
      foldRef.current = foldFrames(foldRef.current, frames);
      setEntries([...foldRef.current.entries]);
      setUnknownKinds(foldRef.current.unknownKinds);
      setRawPayloads((current) => [...current, { path, payload }].slice(-8));
    });
    try {
      const protocol = await client.protocol(controller.signal);
      if (!protocol.capabilities.includes('session-images')) throw new Error('This GoatTown connection does not support image input.');
      setProgress('Starting a private classification session…');
      const session = await createClassificationSession(client, controller.signal);
      sessionId = session.id;
      setProgress('Checking that this agent can see images…');
      await assertVisionReady(client, session.id, controller.signal);
      setProgress('Sending the photo…');
      await sendClassificationPhoto(client, session.id, photo, controller.signal);
      setProgress('The agent is looking at the photo…');
      const observation = await observeClassification(
        client,
        session.id,
        () => foldRef.current,
        () => undefined,
        (status) => { sessionStatus = status; setProgress(status === 'idle' || status === 'waiting' ? 'Waiting for the agent’s answer…' : 'The agent is looking at the photo…'); },
        controller.signal,
      );
      sessionStatus = observation.status;
      if (controller.signal.aborted && !observation.completeByAnswer && !observation.timedOut) return;
      const parsed = observation.timedOut || sessionDisposition(sessionStatus) === 'terminal' && ['failed', 'error', 'cancelled'].includes(sessionStatus)
        ? parseVerdict('UNCLEAR\nThe agent did not finish a usable image classification.')
        : parseVerdict(answerFromEntries(foldRef.current.entries));
      if (!observation.timedOut) {
        const findingReason = findingReasonFromEntries(foldRef.current.entries);
        if (findingReason) parsed.reason = findingReason;
      }
      if (observation.timedOut && !parsed.rawAnswer) parsed.reason = observation.reason;
      const record: VerdictRecord = {
        sessionId,
        createdAt: Date.now(),
        label: parsed.label,
        title: parsed.title,
        reason: parsed.reason || (parsed.rawAnswer ? parsed.rawAnswer.split(/\r?\n/).slice(1).join(' ').trim() : 'No clear reason was returned.'),
        photoDataUrl: photo.dataUrl,
        service,
      };
      setResult(record);
      setProgress(observation.timedOut ? 'Observation timed out.' : 'Classification complete.');
      if (userId) {
        setHistory([record, ...history.filter((item) => item.sessionId !== record.sessionId)].slice(0, 20));
        try {
          setHistory(await saveVerdict(userId, record));
        } catch (historyError) {
          const detail = historyError instanceof Error ? historyError.message : String(historyError);
          setError(`The agent returned “${record.title}”, but its history could not be saved (${detail}).`);
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setProgress('Classification could not be completed.');
      if (sessionId && photo && userId) {
        const record: VerdictRecord = {
          sessionId,
          createdAt: Date.now(),
          label: 'unclear',
          title: "Couldn't tell",
          reason: message,
          photoDataUrl: photo.dataUrl,
          service,
        };
        setResult(record);
        setHistory(await saveVerdict(userId, record).catch(() => history));
      }
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  }, [history, makeClient, photo, running, service, userId]);

  return { photo, choosePhoto, classify, reset, entries, rawPayloads, unknownKinds, history, historyLoading, running, error, progress, result };
}

