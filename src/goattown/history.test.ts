import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionKey, historyKey, keySegment, setupKey, writeKv, writeProxyToken } from './history';

afterEach(() => vi.unstubAllGlobals());

describe('route-safe KV key names', () => {
  it('keeps a member id with path and pipe characters out of the KV key', () => {
    for (const key of [
      connectionKey('member/42'),
      historyKey('google-oauth2|11824999999999'),
      setupKey('member/42', 'production'),
    ]) {
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeURIComponent(key)).not.toMatch(/[~|/%]/);
    }
  });

  it('leaves an already-safe member id unchanged, so existing keys still resolve', () => {
    expect(keySegment('member42')).toBe('member42');
    expect(connectionKey('member42')).toBe('hotdog-connection-member42');
    expect(historyKey('member42')).toBe('hotdog-history-member42');
    expect(setupKey('member42', 'production')).toBe('hotdog-setup-member42-production');
  });

  it('gives one member a stable hashed segment', () => {
    expect(historyKey('member/42')).toBe(historyKey('member/42'));
    expect(historyKey('member/42')).not.toBe(historyKey('member/43'));
  });
});

describe('app KV transport', () => {
  it('writes the credential as raw text to the proxy KV key and never reads it back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('window', { CRIBL_API_URL: 'https://cribl.example/api/v1/' });
    vi.stubGlobal('fetch', fetchMock);

    await writeProxyToken('test-bearer-value');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://cribl.example/api/v1/kvstore/goattownEmbedToken', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'test-bearer-value',
    });
  });

  it('lets the fetch proxy scope the app and never injects an app segment itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('window', {
      CRIBL_API_URL: 'https://cribl.example/api/v1/v/hotdog-detector',
      location: { href: 'https://cribl.example/app-ui/hotdog-detector' },
    });
    vi.stubGlobal('fetch', fetchMock);

    await writeKv(historyKey('member42'), [{ sessionId: 's1' }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cribl.example/api/v1/v/hotdog-detector/kvstore/hotdog-history-member42');
    expect(url).not.toContain('/a/hotdog-detector');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '[{"sessionId":"s1"}]' });
  });
});
