import { GoatTownClient } from '@criblio/app-utils/goattown';

export const HOSTS = {
  production: { label: 'GoatTown Lab', baseUrl: 'https://goattown.lab.cribl.io' },
  staging: { label: 'Staging', baseUrl: 'https://44-225-69-19.sslip.io' },
} as const;

export type ServiceKey = keyof typeof HOSTS;
export type RawResponseHandler = (path: string, payload: unknown) => void;

/** The browser never handles the GoatTown bearer; the declared proxy injects it. */
export function createGoatTownClient(
  service: ServiceKey,
  onRawResponse?: RawResponseHandler,
): GoatTownClient {
  const fetchWithCapture: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(target, window.location.href).pathname;
    if (onRawResponse && response.ok && /\/investigations\/[^/]+\/(status|events)$/.test(path)) {
      const payload = await response.clone().json().catch(() => null);
      if (payload !== null) onRawResponse(path, payload);
    }
    return response;
  };
  return new GoatTownClient({
    baseUrl: HOSTS[service].baseUrl,
    userId: async () => {
      if (typeof window.getCriblUser !== 'function') return 'local-preview';
      const user = await window.getCriblUser();
      return user.id;
    },
    fetch: fetchWithCapture,
  });
}
