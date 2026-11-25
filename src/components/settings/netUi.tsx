/*
 * 网络设置模块的小型 UI 原子：图标、开关、状态徽标
 */
import React from 'react';

const PATHS: Record<string, string> = {
  smart: 'M13 2 4 14h7l-1 8 9-12h-7z',
  system: 'M3 5h18v11H3zM8 20h8M12 16v4',
  direct: 'M5 12h14M13 6l6 6-6 6',
  proxy: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  check: 'M20 6 9 17l-5-5',
  x: 'M6 6l12 12M18 6 6 18',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  down: 'M6 9l6 6 6-6',
  warn: 'M12 3l9 16H3zM12 9v5M12 17h.01',
};

export function NetIcon({ name, size = 18, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

export function NetToggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={'toggle ' + (on ? 'on' : '')}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export type BadgeTone = 'ok' | 'fail' | 'warn' | 'idle';

export function NetBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return <span className={'net-badge net-badge-' + tone}>{children}</span>;
}

/** HTTP 状态码 → 徽标色调 */
export function statusTone(status: number, error?: string): BadgeTone {
  if (error || !status) return 'fail';
  if (status < 300) return 'ok';
  if (status < 400) return 'warn';
  return 'fail';
}

export function fmtMs(ms?: number) {
  if (ms == null) return '-';
  return ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms + ' ms';
}

export function fmtAgo(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + ' 秒前';
  if (s < 3600) return Math.round(s / 60) + ' 分钟前';
  return Math.round(s / 3600) + ' 小时前';
}
