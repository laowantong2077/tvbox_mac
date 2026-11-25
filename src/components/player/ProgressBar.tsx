// 进度条：缓冲段、悬停时间提示、拖动放大圆点、片头片尾标记
import React, { useRef, useState } from 'react';
import { clamp, fmtTime } from './utils';

interface Props {
  cur: number;
  dur: number;
  buffered: [number, number][];
  marks?: number[];
  onSeek: (t: number) => void;
}

function pct(t: number, dur: number) {
  return dur > 0 ? clamp((t / dur) * 100, 0, 100) : 0;
}

export function ProgressBar({ cur, dur, buffered, marks = [], onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1) * dur;
  };

  const onDown = (e: React.PointerEvent) => {
    if (!dur) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(timeAt(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dur) return;
    const t = timeAt(e.clientX);
    setHover(t);
    if (drag !== null) setDrag(t);
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag === null) return;
    onSeek(timeAt(e.clientX));
    setDrag(null);
  };

  const shown = drag ?? cur;
  const tip = drag ?? hover;
  return (
    <div
      className={'sxp-progress' + (drag !== null ? ' dragging' : '')}
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sxp-progress-track">
        {buffered.map(([s, e], i) => (
          <div key={i} className="sxp-progress-buf" style={{ left: pct(s, dur) + '%', width: pct(e - s, dur) + '%' }} />
        ))}
        {tip !== null && <div className="sxp-progress-hover" style={{ width: pct(tip, dur) + '%' }} />}
        <div className="sxp-progress-played" style={{ width: pct(shown, dur) + '%' }} />
        {marks.filter((m) => m > 0 && m < dur).map((m, i) => (
          <div key={'m' + i} className="sxp-progress-mark" style={{ left: pct(m, dur) + '%' }} />
        ))}
      </div>
      <div className="sxp-progress-thumb" style={{ left: pct(shown, dur) + '%' }} />
      {tip !== null && (
        <div className="sxp-progress-tip" style={{ left: pct(tip, dur) + '%' }}>
          {fmtTime(tip)}
        </div>
      )}
    </div>
  );
}
