// 设置面板：倍速 / 画面 / 画幅 三个 Tab
import React from 'react';
import { SPEEDS, useCtl } from './ctl';
import { DEFAULT_PIC, AspectMode } from './usePlayerPrefs';
import { Row, Seg, Slider, Switch } from './ui';
import { round2 } from './utils';

export function SpeedTab() {
  const { prefs, update, osd } = useCtl();
  const set = (v: number) => {
    const s = round2(v);
    update({ speed: s });
    osd(`倍速 ${s}x`);
  };
  return (
    <div className="sxp-tab">
      <div className="sxp-speed-grid">
        {SPEEDS.map((s) => (
          <button key={s} className={'sxp-speed-item' + (prefs.speed === s ? ' active' : '')} onClick={() => set(s)}>
            {s === 1 ? '正常' : s + 'x'}
          </button>
        ))}
      </div>
      <Row label="自定义" hint="0.25x ~ 4x">
        <Slider value={prefs.speed} min={0.25} max={4} step={0.05} onChange={set} format={(v) => v.toFixed(2) + 'x'} />
      </Row>
      <div className="sxp-tip">提示：长按 → 键临时 3 倍速，[ / ] 键快速调速</div>
    </div>
  );
}

const pctFmt = (v: number) => v + '%';

export function PictureTab() {
  const { prefs, update, osd } = useCtl();
  const p = prefs.pic;
  const set = (patch: Partial<typeof p>) => update({ pic: patch });
  const rotations = [0, 90, 180, 270] as const;
  return (
    <div className="sxp-tab">
      <Row label="亮度">
        <Slider value={p.brightness} min={30} max={200} step={1} onChange={(v) => set({ brightness: v })} format={pctFmt} />
      </Row>
      <Row label="对比度">
        <Slider value={p.contrast} min={30} max={200} step={1} onChange={(v) => set({ contrast: v })} format={pctFmt} />
      </Row>
      <Row label="饱和度">
        <Slider value={p.saturate} min={0} max={300} step={1} onChange={(v) => set({ saturate: v })} format={pctFmt} />
      </Row>
      <Row label="色相">
        <Slider value={p.hue} min={-180} max={180} step={1} onChange={(v) => set({ hue: v })} format={(v) => v + '°'} />
      </Row>
      <Row label="旋转">
        <Seg value={p.rotate} options={rotations.map((r) => ({ value: r, label: r + '°' }))} onChange={(r) => set({ rotate: r })} />
      </Row>
      <div className="sxp-row-inline">
        <label>
          水平镜像 <Switch on={p.flipH} onChange={(v) => set({ flipH: v })} />
        </label>
        <label>
          垂直翻转 <Switch on={p.flipV} onChange={(v) => set({ flipV: v })} />
        </label>
        <label>
          锐化 <Switch on={p.sharpen} onChange={(v) => set({ sharpen: v })} />
        </label>
      </div>
      <button
        className="sxp-btn sxp-btn-ghost"
        onClick={() => {
          update({ pic: DEFAULT_PIC });
          osd('画面已重置');
        }}
      >
        重置画面
      </button>
    </div>
  );
}

const ASPECTS: { value: AspectMode; label: string }[] = [
  { value: 'auto', label: '原始比例' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '21:9', label: '21:9' },
  { value: '1:1', label: '1:1' },
  { value: 'fill', label: '铺满拉伸' },
  { value: 'cover', label: '裁剪填充' },
];

export function AspectTab() {
  const { prefs, update, osd } = useCtl();
  const a = prefs.aspect;
  return (
    <div className="sxp-tab">
      <div className="sxp-aspect-grid">
        {ASPECTS.map((o) => (
          <button
            key={o.value}
            className={'sxp-aspect-item' + (a.mode === o.value ? ' active' : '')}
            onClick={() => {
              update({ aspect: { mode: o.value } });
              osd('画幅 ' + o.label);
            }}
          >
            <span className={'sxp-aspect-icon a-' + o.value.replace(':', '-')} />
            {o.label}
          </button>
        ))}
      </div>
      <Row label="缩放">
        <Slider
          value={Math.round(a.zoom * 100)}
          min={50}
          max={150}
          step={5}
          onChange={(v) => update({ aspect: { zoom: v / 100 } })}
          format={pctFmt}
        />
      </Row>
      <button className="sxp-btn sxp-btn-ghost" onClick={() => update({ aspect: { mode: 'auto', zoom: 1 } })}>
        恢复默认
      </button>
    </div>
  );
}
