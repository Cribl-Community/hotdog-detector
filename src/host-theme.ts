export type HostTheme = 'light' | 'dark';

/** Mirror the Cribl shell theme on body so Capra tokens and portals follow it. */
export function installThemeBridge(): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as { type?: string; theme?: HostTheme } | null;
    if (data?.type !== 'CRIBL_APP_LAYOUT') return;
    if (data.theme !== 'light' && data.theme !== 'dark') return;
    document.body.classList.toggle('dark', data.theme === 'dark');
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
