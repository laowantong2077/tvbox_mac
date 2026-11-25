// 设置面板通用小组件：行、分段选择、开关、滑块、色板
import React from 'react';

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="sxp-row">
      <div className="sxp-row-label">
        {label}
        {hint && <span className="sxp-row-hint">{hint}</span>}
      </div>
      <div className="sxp-row-body">{children}</div>
    </div>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="sxp-seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={'sxp-seg-item' + (o.value === value ? ' active' : '')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={'sxp-switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="sxp-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--p' as any]: p + '%' }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="sxp-slider-val">{format ? format(value) : value}</span>
    </div>
  );
}

export const COLORS = ['#ffffff', '#fe0302', '#ff7204', '#ffaa02', '#ffd302', '#00cd00', '#00a2ff', '#cc0273', '#89d5ff'];

export function Swatches({ value, onChange, colors = COLORS }: { value: string; onChange: (c: string) => void; colors?: string[] }) {
  return (
    <div className="sxp-swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={'sxp-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' active' : '')}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}

export function Stepper({ value, step, onChange, format }: { value: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="sxp-stepper">
      <button onClick={() => onChange(value - step)}>−</button>
      <span>{format(value)}</span>
      <button onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}
