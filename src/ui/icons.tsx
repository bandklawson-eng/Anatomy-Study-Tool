import type { JSX } from 'preact';

const P: Record<string, string> = {
  search: 'M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 16l9 5 9-5',
  tree: 'M4 5h6M4 12h10M4 19h6M14 5h6M18 12h2M14 19h6',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  focus: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4M12 9v6M9 12h6',
  isolate: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  xray: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M5 7.5h14M3.5 12h17M5 16.5h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  cut: 'M4 4l16 16M4 20L20 4M3 12h4M17 12h4',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.6-1.6 0-2.4c.7-.9 2-.6 3.5-.6A3.5 3.5 0 0 0 21 12.500 9 9 0 0 0 12 3zM7.5 11.500h.01M10 7.500h.01M14.500 7.500h.01',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11zm0-8.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.500h.01',
  play: 'M7 4.500v15l12-7.500-12-7.500z',
  pause: 'M7 5h3.500v14H7zM13.500 5H17v14h-3.500z',
  back: 'M15 6l-6 6 6 6',
  swap: 'M7 7h13l-3-3M17 17H4l3 3',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  body: 'M12 5.500a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 9l5-1.500L17 9M12 7.500V14M12 14l-3 8M12 14l3 8M7 9l-1.500 6M17 9l1.500 6',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  step: 'M6 5v14M10 5l9 7-9 7V5z',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2',
};

export function Icon({ name, ...rest }: { name: keyof typeof P | string } & JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...(rest as any)}>
      <path d={P[name] || ''} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#4fd1c5" />
      <path d="M16 6.500a2.600 2.600 0 1 1 0 5.200 2.600 2.600 0 0 1 0-5.200zM9 13.800l7-1.600 7 1.600M16 12.200v7.300M16 19.500l-3.600 7M16 19.500l3.600 7M9 13.800l-1.400 6.400M23 13.800l1.400 6.400" stroke="#062b28" stroke-width="2.200" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
