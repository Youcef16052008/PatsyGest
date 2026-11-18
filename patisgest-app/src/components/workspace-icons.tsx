const paths = {
  logo: <><path d="M4 15.5c-1.3-.5-1.7-1.7-1.2-2.8l2.1-3.6c.6-1 1.8-1.4 2.8-.8l2.1 1.1c1.4-.9 3-.9 4.4 0l2.1-1.1c1-.6 2.2-.2 2.8.8l2.1 3.6c.5 1.1.1 2.3-1.2 2.8l-2.8 1.1c-1.4.6-2.7 0-3.2-1.1a5 5 0 0 1-4 0c-.5 1.1-1.8 1.7-3.2 1.1z"/><path d="m7.7 8.3 2.3 7.2m6.3-7.2-2.3 7.2"/></>,
  home: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/></>,
  box: <><path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5zM3 8.5l9 4.5 9-4.5m-9 4.5v7M7.5 6.3l9 4.5"/></>,
  book: <><path d="M12 6.6a8.4 8.4 0 0 1 8.5-1.1v13.2a8.4 8.4 0 0 0-8.5 1.1 8.4 8.4 0 0 0-8.5-1.1V5.5A8.4 8.4 0 0 1 12 6.6zm0 0v13.2"/></>,
  layers: <><path d="m12 3.5 9 5-9 5-9-5 9-5zm9 9-9 5-9-5m18 4-9 5-9-5"/></>,
  receipt: <><path d="M5 3.5h14v17l-2.3-1.6-2.3 1.6-2.4-1.6-2.3 1.6-2.4-1.6L5 20.5zm3.5 5h7m-7 4h7m-7 4h4"/></>,
  arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
  chevron: <><path d="m9 6 6 6-6 6"/></>,
  down: <><path d="m6 9 6 6 6-6"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  minus: <><path d="M5 12h14"/></>,
  close: <><path d="m6 6 12 12M6 18 18 6"/></>,
  search: <><circle cx="10.5" cy="10.5" r="5.8"/><path d="m15 15 4.5 4.5"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 2"/></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7.5 3v4.5M16.5 3v4.5m-13 3h17"/></>,
  alert: <><path d="M10.4 4.5 3.3 17.3a1.6 1.6 0 0 0 1.4 2.4h14.6a1.6 1.6 0 0 0 1.4-2.4L13.6 4.5a1.8 1.8 0 0 0-3.2 0zM12 9v4m0 3.2v.1"/></>,
  trend: <><path d="m3 16 5-5 4 4 7-8m-5 0h5v5"/></>,
  check: <><path d="m5 12 4.3 4.5L19 7"/></>,
  guide: <><path d="M12 2.5 14.7 9l6.8 3-6.8 2.7-2.7 6.8-2.8-6.8L2.5 12l6.7-3z"/></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1"/></>,
  store: <><path d="M4.5 10v10h15V10M3 10l2-6h14l2 6a3 3 0 0 1-4.5 2.6 3 3 0 0 1-4.5 0 3 3 0 0 1-4.5 0A3 3 0 0 1 3 10zm7 10v-5h4v5"/></>,
  grain: <><path d="M12 21V8m0 2s-5 0-5-5c3 0 5 2 5 5zm0 4s5 0 5-5c-3 0-5 2-5 5zm0 4s-5 0-5-5c3 0 5 2 5 5zm0-10s3-1.5 0-5c-3 3.5 0 5 0 5z"/></>,
  print: <><rect x="7" y="3" width="10" height="5" rx="1"/><path d="M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6.5 12h.1"/><rect x="7" y="14" width="10" height="7" rx="1"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M6.3 17.7l-1.4 1.4m14.2-14.2-1.4 1.4"/></>,
  moon: <path d="M20.8 14.2A9 9 0 0 1 9.8 3.1a9 9 0 1 0 11 11.1Z"/>,
  palette: <path d="M21 12a9 9 0 1 0-9 9h1a2 2 0 0 0 1.4-3.4A1.5 1.5 0 0 1 15.5 15H18a3 3 0 0 0 3-3ZM7.5 11h.1M9 7.5h.1M13 6.5h.1M16.5 9h.1"/>,
  logout: <path d="M10 4H5v16h5m4-13 5 5-5 5m-5-5h10"/>,
  cake: <path d="M4 17v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M3 21h18M4 17c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 2 1 4 1m-8-7V8m0-2c1.5 0 2-1.5 0-4-2 2.5-1.5 4 0 4Z"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m20.8 10-2-.8-1-1.8.3-2.1-2.1-1.2-1.7 1.4h-2.2L10.5 4 8.4 5.2l.3 2.2-1.2 1.8-2.1.8v2.5l2 .8 1.2 1.9-.3 2.1 2.2 1.3 1.6-1.4h2.2l1.7 1.4 2.1-1.3-.3-2.2 1-1.8 2-.7Z" transform="translate(-.7 .7)"/></>,
  transfer: <path d="M4 7h16m-4-4 4 4-4 4m4 6H4m4-4-4 4 4 4"/>,
  shield: <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Zm-3 9 2 2 4-4"/>,
  dots: <path d="M5 12h.1m6.9 0h.1m6.9 0h.1" strokeWidth="2.7"/>,
};
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" className="pg-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
