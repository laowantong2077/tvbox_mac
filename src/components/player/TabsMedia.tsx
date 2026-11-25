// 设置面板：字幕 / 弹幕 两个 Tab
import React, { useRef, useState } from 'react';
import { useCtl } from './ctl';
import { PIcon } from './icons';
import { Row, Seg, Slider, Stepper, Swatches, Switch } from './ui';
import type { DmArea, SubBg } from './usePlayerPrefs';
import { SUBTITLE_EXT } from './subtitles';

/** 隐藏的文件选择器 */
function FilePick({ accept, onFile, children }: { accept: string; onFile: (f: File) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="sxp-btn" onClick={() => ref.current?.click()}>
        <PIcon name="upload" size={15} />
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

function SubSource() {
  const { sub, hls } = useCtl();
  const tracks = hls.info.subTracks;
  const cur = sub.cues ? 'file' : sub.useTrack ? 't' + hls.info.subTrack : 'off';
  return (
    <div className="sxp-chips">
      <button className={'sxp-chip' + (cur === 'off' ? ' active' : '')} onClick={sub.clear}>
        关闭
      </button>
      {sub.cues && <button className="sxp-chip active">{sub.fileName}</button>}
      {tracks.map((t) => (
        <button key={t.index} className={'sxp-chip' + (cur === 't' + t.index ? ' active' : '')} onClick={() => sub.selectTrack(t.index)}>
          {t.name}
        </button>
      ))}
    </div>
  );
}

const BGS: { value: SubBg; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'shadow', label: '描边' },
  { value: 'box', label: '底框' },
];

export function SubtitleTab() {
  const { prefs, update, sub, osd } = useCtl();
  const s = prefs.sub;
  const set = (patch: Partial<typeof s>) => update({ sub: patch });
  return (
    <div className="sxp-tab">
      <Row label="字幕显示">
        <Switch on={s.on} onChange={(v) => set({ on: v })} />
      </Row>
      <Row label="字幕来源">
        <SubSource />
      </Row>
      <div className="sxp-row-actions">
        <FilePick accept=".srt,.vtt,.ass,.ssa" onFile={(f) => (SUBTITLE_EXT.test(f.name) ? sub.loadFile(f) : osd('仅支持 srt/vtt/ass/ssa'))}>
          加载本地字幕
        </FilePick>
        <span className="sxp-tip">也可直接把字幕文件拖入播放器</span>
      </div>
      <Row label="字号">
        <Slider value={s.size} min={24} max={80} step={2} onChange={(v) => set({ size: v })} />
      </Row>
      <Row label="颜色">
        <Swatches value={s.color} onChange={(c) => set({ color: c })} colors={['#ffffff', '#ffe066', '#7ee0ff', '#9dff9d', '#ffb3c7']} />
      </Row>
      <Row label="背景">
        <Seg value={s.bg} options={BGS} onChange={(v) => set({ bg: v })} />
      </Row>
      <Row label="底部距离">
        <Slider value={s.bottom} min={2} max={40} step={1} onChange={(v) => set({ bottom: v })} format={(v) => v + '%'} />
      </Row>
      <Row label="时间偏移" hint="正数延后">
        <Stepper
          value={s.offset}
          step={0.5}
          onChange={(v) => {
            set({ offset: v });
            osd(`字幕偏移 ${v > 0 ? '+' : ''}${v.toFixed(1)}s`);
          }}
          format={(v) => (v > 0 ? '+' : '') + v.toFixed(1) + 's'}
        />
      </Row>
    </div>
  );
}

const AREAS: { value: DmArea; label: string }[] = [
  { value: 0.25, label: '1/4' },
  { value: 0.5, label: '半屏' },
  { value: 0.75, label: '3/4' },
  { value: 1, label: '全屏' },
];
const MAXES = [0, 30, 60, 120].map((v) => ({ value: v, label: v ? String(v) : '不限' }));

function BlockWords() {
  const { prefs, update } = useCtl();
  const [kw, setKw] = useState('');
  const add = () => {
    const k = kw.trim();
    if (k && !prefs.dm.block.includes(k)) update({ dm: { block: prefs.dm.block.concat(k) } });
    setKw('');
  };
  return (
    <div className="sxp-block">
      <div className="sxp-block-input">
        <input value={kw} placeholder="添加屏蔽关键词，回车确认" onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="sxp-btn" onClick={add}>
          添加
        </button>
      </div>
      <div className="sxp-chips">
        {prefs.dm.block.map((k) => (
          <button key={k} className="sxp-chip removable" onClick={() => update({ dm: { block: prefs.dm.block.filter((x) => x !== k) } })}>
            {k} ×
          </button>
        ))}
      </div>
    </div>
  );
}

export function DanmakuTab() {
  const { prefs, update, dm, open } = useCtl();
  const d = prefs.dm;
  const set = (patch: Partial<typeof d>) => update({ dm: patch });
  const types: [keyof typeof d, string][] = [['hideScroll', '滚动'], ['hideTop', '顶部'], ['hideBottom', '底部']];
  return (
    <div className="sxp-tab">
      <Row label="弹幕显示" hint={`在线 ${dm.counts.online} · 导入 ${dm.counts.imported} · 本地 ${dm.counts.local}`}>
        <Switch on={d.on} onChange={(v) => set({ on: v })} />
      </Row>
      <div className="sxp-row-actions">
        <button className="sxp-btn sxp-btn-primary" onClick={() => open('danmaku')}>
          <PIcon name="search" size={15} />
          在线弹幕
        </button>
        <FilePick accept=".xml,.json" onFile={dm.importFile}>
          导入 XML/JSON
        </FilePick>
      </div>
      <Row label="不透明度">
        <Slider value={Math.round(d.opacity * 100)} min={10} max={100} step={5} onChange={(v) => set({ opacity: v / 100 })} format={(v) => v + '%'} />
      </Row>
      <Row label="字号">
        <Slider value={d.size} min={14} max={40} step={1} onChange={(v) => set({ size: v })} />
      </Row>
      <Row label="速度">
        <Slider value={d.speed} min={0.5} max={2} step={0.1} onChange={(v) => set({ speed: v })} format={(v) => v.toFixed(1) + 'x'} />
      </Row>
      <Row label="显示区域">
        <Seg value={d.area} options={AREAS} onChange={(v) => set({ area: v })} />
      </Row>
      <Row label="同屏上限">
        <Seg value={d.max} options={MAXES} onChange={(v) => set({ max: v })} />
      </Row>
      <Row label="屏蔽类型">
        <div className="sxp-chips">
          {types.map(([k, label]) => (
            <button key={k} className={'sxp-chip' + (d[k] ? ' blocked' : '')} onClick={() => set({ [k]: !d[k] } as any)}>
              {d[k] ? '已屏蔽' : ''}
              {label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="屏蔽词">
        <BlockWords />
      </Row>
    </div>
  );
}
