/**
 * The game's iconography: thin engraved line icons in one consistent style (24-unit
 * grid, 1.5 stroke, round caps), drawn in currentColor so they take the theme.
 */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  hand: <><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V13" /><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.6 15.6a1.6 1.6 0 0 1 2.5-2L8 15.5" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  veil: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><path d="M4 4l16 16" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></>,
  candle: <><path d="M9 21h6M10 21V10h4v11" /><path d="M12 7c-1.5-1.5-.8-3.2 0-4.5.8 1.3 1.5 3 0 4.5z" /></>,
  quill: <><path d="M20 3C10 5 6 11 5 20" /><path d="M20 3c-1 6-5 10-11 11" /><path d="M8 15l-2 1" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="5" /><path d="M12 9v6" /></>,
  mask: <><path d="M3 8c3-2 15-2 18 0 0 6-3 9-6 9-1.5 0-2-2-3-2s-1.5 2-3 2c-3 0-6-3-6-9z" /><path d="M7 11c1-.8 2.2-.8 3 0M14 11c.8-.8 2-.8 3 0" /></>,
  dagger: <><path d="M14.5 3.5l6 6-9 9-3-3z" /><path d="M8.5 15.5l-3 3M5 16l3 3M3 21l2-2" /></>,
  seal: <><circle cx="12" cy="10" r="6" /><path d="M9 15.5L7 22l5-2 5 2-2-6.5" /><path d="M10 10h4M12 8v4" /></>,
  scroll: <><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7" /><path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2zM7 20a2 2 0 0 1-2-2v-1h4v1a2 2 0 0 1-2 2z" /><path d="M10 9h6M10 12h6M10 15h4" /></>,
  tower: <><path d="M6 21V8l2-2V3h2v2h4V3h2v3l2 2v13z" /><path d="M10 21v-4a2 2 0 0 1 4 0v4M10 11h4" /></>,
  web: <><circle cx="12" cy="12" r="2" /><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="18" r="2" /><path d="M7 7l3.5 3.5M17 7l-3.5 3.5M7.5 17.5l3-4M16.5 16.5l-3-3" /></>,
  scales: <><path d="M12 3v18M7 21h10M4 7h16" /><path d="M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" /></>,
  crown: <><path d="M3 18l2-10 4 4 3-6 3 6 4-4 2 10z" /><path d="M3 21h18" /></>,
  flame: <><path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z" /></>,
  door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" /><path d="M3 21h18M15 12h.01" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5M8 7h7" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  play: <path d="M7 4l13 8-13 8z" />,
  pause: <><path d="M8 4v16M16 4v16" /></>,
  sand: <><path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z" /><path d="M10 21h4" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="15" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.2A5 5 0 0 1 21 19" /></>,
  map: <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  star: <path d="M12 3l2.6 6 6.4.6-4.8 4.3 1.4 6.4L12 17l-5.6 3.3 1.4-6.4L3 9.6 9.4 9z" />,
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {P[name]}
    </svg>
  );
}

/** The game's mark: an open hand inside a seal ring, with an eye in the palm. */
export function Mark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="32" cy="32" r="29" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="25.5" strokeWidth="0.6" strokeDasharray="1 2.2" />
      <path strokeWidth="1.5" d="M24 36V22a2.4 2.4 0 0 1 4.8 0v10M28.8 31V18.5a2.4 2.4 0 0 1 4.8 0V31M33.6 31V20a2.4 2.4 0 0 1 4.8 0v12M38.4 29a2.4 2.4 0 0 1 4.8 0v8a11 11 0 0 1-11 11h-1.2a11 11 0 0 1-8.8-4.4L17 37.4a2.4 2.4 0 0 1 3.8-3L24 38" />
      <path strokeWidth="1.2" d="M27 40s2.2-3 5.4-3 5.4 3 5.4 3-2.2 3-5.4 3-5.4-3-5.4-3z" />
      <circle cx="32.4" cy="40" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
