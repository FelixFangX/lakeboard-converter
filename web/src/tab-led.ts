export type InstrumentState = 'idle' | 'armed' | 'processing' | 'done' | 'error';

export function updateTabLED(state: InstrumentState) {
  document.documentElement.dataset.state = state;
  const working = state === 'armed' || state === 'processing';
  const color = state === 'error' ? '#a3241c' : working ? '#e6b54a' : '#23406a';
  const dash = state === 'idle' ? '19 57' : state === 'processing' ? '57 19' : '76 0';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="${dash}"/></svg>`;
  const favicon = document.querySelector<HTMLLinkElement>('#favicon');
  if (favicon) favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const prefix = state === 'done' ? '● Done · ' : state === 'error' ? '● Error · ' : working ? '● Working · ' : '';
  document.title = `${prefix}Mind map to Markdown · ledring tools`;
}
