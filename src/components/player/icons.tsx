// 播放器专用图标（24 栅格线性图标，避免改动共享 Icon.tsx）
import React from 'react';

const STROKE: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  volume: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  volumeLow: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7',
  mute: 'M11 5 6 9H3v6h3l5 4zM16 9.5l5 5M21 9.5l-5 5',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.8 1l-.3 2h-4l-.3-2a7 7 0 0 1-1.8-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L3 9.3l2-3.4 1.9.7a7 7 0 0 1 1.8-1l.3-2h4l.3 2a7 7 0 0 1 1.8 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3Z',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exitFull: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  pip: 'M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v4M3 6.5v11A2.5 2.5 0 0 0 5.5 20H10M13 14h8v6h-8z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  danmaku: 'M3 5h18v11H9l-4 4v-4H3zM7 9h6M7 12h9',
  danmakuOff: 'M3 5h18v11H9l-4 4v-4H3zM7 9h6M7 12h9M3 3l18 18',
  subtitle: 'M3 5h18v14H3zM7 14.5h4M13 14.5h4M7 11h10',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  send: 'M4 12 20 4l-4 16-4-7zM12 13l8-9',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  rewind: 'M11 7 4 12l7 5zM20 7l-7 5 7 5z',
  forward: 'M13 7l7 5-7 5zM4 7l7 5-7 5z',
  warn: 'M12 3l9 16H3zM12 9v5M12 17h.01',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
  check: 'M20 6 9 17l-5-5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  speed: 'M12 21a9 9 0 1 1 9-9M12 12l4-4',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
};

const FILL: Record<string, string> = {
  more: 'M5 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z',
  play: 'M7 4.8v14.4a1 1 0 0 0 1.5.86l11.5-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8Z',
  pause: 'M7 4h3.2v16H7zM13.8 4H17v16h-3.2z',
  next: 'M5 5.2v13.6a.8.8 0 0 0 1.2.7l9.6-6.8a.8.8 0 0 0 0-1.4L6.2 4.5a.8.8 0 0 0-1.2.7ZM17.5 5h2v14h-2z',
  prev: 'M19 5.2v13.6a.8.8 0 0 1-1.2.7l-9.6-6.8a.8.8 0 0 1 0-1.4l9.6-6.8a.8.8 0 0 1 1.2.7ZM4.5 5h2v14h-2z',
};

export type PIconName = keyof typeof STROKE | keyof typeof FILL;

export function PIcon({ name, size = 20, className }: { name: PIconName | string; size?: number; className?: string }) {
  const fill = FILL[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={fill || STROKE[name] || ''} />
    </svg>
  );
}
