export interface ConnectionSettings {
  service: 'production' | 'staging';
}

export interface VerdictRecord {
  sessionId: string;
  createdAt: number;
  label: 'hot-dog' | 'not-hot-dog' | 'unclear';
  title: string;
  reason: string;
  photoDataUrl: string;
  service: ConnectionSettings['service'];
}

/**
 * The platform's fetch proxy scopes KV to this app, and app code must call
 * `${apiUrl()}/kvstore/{key}` and let the proxy do the scoping. Injecting an
 * app segment here (`/a/{appId}/kvstore/...` or `{appId}/kvstore/...`)
 * double-scopes the path and fails — see `@criblio/app-utils` settings.ts.
 */
const apiUrl = () => (window.CRIBL_API_URL ?? '/api/v1').replace(/\/+$/, '');
const kvUrl = (key: string) => `${apiUrl()}/kvstore/${key}`;
const json = <T>(text: string): T | null => {
  try { return JSON.parse(text) as T; } catch { return null; }
};

export async function readKv<T>(key: string): Promise<T | null> {
  const response = await fetch(kvUrl(key));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`KV read failed (${response.status})`);
  return json<T>(await response.text());
}

async function kvWriteError(response: Response): Promise<Error> {
  let detail = '';
  if (response.headers.get('content-type')?.includes('application/json')) {
    const body = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : '';
    if (message && !/(?:bearer|token|authorization)/i.test(message)) detail = `: ${message.slice(0, 180)}`;
  }
  return new Error(`KV write failed (${response.status})${detail}`);
}

export async function writeKv(key: string, value: unknown): Promise<void> {
  const response = await fetch(kvUrl(key), {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw await kvWriteError(response);
}

/** Store the opaque bearer as plain text for proxy injection; never read it back into the UI. */
export async function writeProxyToken(token: string): Promise<void> {
  const response = await fetch(kvUrl('goattownEmbedToken'), {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: token,
  });
  if (!response.ok) throw new Error(`Could not save the GoatTown token (${response.status})`);
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/** FNV-1a in two variants, so a rewritten id still gets a stable 16-hex key. */
function stableId(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * A KV key must be a single path segment the route can match. Member ids are
 * not restricted — Google ids contain `|` — and a key carrying `~`, `|`, `/`
 * or `%` falls out of the API router, which answers with an HTML 404: reads
 * look like "missing key" and writes fail as `KV write failed (404)`.
 * Safe ids are used unchanged so existing keys keep resolving.
 */
export const keySegment = (value: string): string => (SAFE_SEGMENT.test(value) ? value : `m${stableId(value)}`);

export const connectionKey = (userId: string) => `hotdog-connection-${keySegment(userId)}`;
export const historyKey = (userId: string) => `hotdog-history-${keySegment(userId)}`;
export const setupKey = (userId: string, service: string) => `hotdog-setup-${keySegment(userId)}-${service}`;

export async function readConnection(userId: string): Promise<ConnectionSettings | null> {
  return readKv<ConnectionSettings>(connectionKey(userId));
}

export async function loadHistory(userId: string): Promise<VerdictRecord[]> {
  return (await readKv<VerdictRecord[]>(historyKey(userId))) ?? [];
}

export async function saveVerdict(userId: string, record: VerdictRecord): Promise<VerdictRecord[]> {
  const next = [record, ...(await loadHistory(userId)).filter((item) => item.sessionId !== record.sessionId)].slice(0, 20);
  await writeKv(historyKey(userId), next);
  return next;
}
