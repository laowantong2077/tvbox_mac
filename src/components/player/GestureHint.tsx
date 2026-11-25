// 触控手势浮层：快进快退目标时间 / 亮度 / 音量（长按倍速复用现有 FastHint）
import React from 'react';
import { PIcon } from './icons';
import { fmtTime } from './utils';
import { BRIGHT_MAX, BRIGHT_MIN, type GestureHint as Hint } from './useTouchGestures';

const PERCENT = 100;

/** 在现有画面滤镜之后叠加亮度，不覆盖用户的画面调节 */
export function withBrightness(style: React.CSSProperties, bright: number): React.CSSProperties {
  if (bright === 1) return style;
  const base = style.filter && style.filter !== 'none' ? style.filter + ' ' : '';
  return { ...style, filter: `${base}brightness(${bright})` };
}

function Level({ icon, label, ratio, text }: { icon: string; label: string; ratio: number; text: string }) {
  return (
    <div className="sxp-gesture sxp-gesture-level" role="status" aria-label={label}>
      <PIcon name={icon} size={20} />
      <div className="sxp-gesture-bar">
        <i style={{ width: Math.round(ratio * PERCENT) + '%' }} />
      </div>
      <span>{text}</span>
    </div>
  );
}

export function GestureHintView({ hint, dur }: { hint: Hint | null; dur: number }) {
  if (!hint || hint.kind === 'fast') return null;
  if (hint.kind === 'seek') {
    const sign = hint.delta >= 0 ? '+' : '-';
    return (
      <div className="sxp-gesture sxp-gesture-seek" role="status">
        <div className="sxp-gesture-time">
          <b>{fmtTime(hint.value)}</b> / {fmtTime(dur)}
        </div>
        <div className="sxp-gesture-delta">
          <PIcon name={hint.delta >= 0 ? 'forward' : 'rewind'} size={16} />
          {sign}
          {fmtTime(Math.abs(hint.delta))}
        </div>
      </div>
    );
  }
  if (hint.kind === 'bright') {
    const ratio = (hint.value - BRIGHT_MIN) / (BRIGHT_MAX - BRIGHT_MIN);
    return <Level icon="sun" label="亮度" ratio={ratio} text={'亮度 ' + Math.round(hint.value * PERCENT) + '%'} />;
  }
  const icon = hint.value === 0 ? 'mute' : 'volume';
  return <Level icon={icon} label="音量" ratio={hint.value} text={'音量 ' + Math.round(hint.value * PERCENT) + '%'} />;
}
