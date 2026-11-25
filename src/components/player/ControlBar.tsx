// 底部控制栏：进度条 + 播放控制 + 弹幕输入 + 功能按钮
import React, { useState } from 'react';
import { useCtl } from './ctl';
import { PIcon } from './icons';
import { ProgressBar } from './ProgressBar';
import { Swatches } from './ui';
import { fmtTime } from './utils';
import { useCompact } from '../../lib/compact';
import type { DmMode } from './DanmakuEngine';

// k：按钮标识，移动端样式据此收起非核心按钮
function Btn({ icon, title, onClick, active, size = 20, k }: { icon: string; title: string; onClick: () => void; active?: boolean; size?: number; k?: string }) {
  return (
    <button className={'sxp-cbtn' + (active ? ' active' : '')} onClick={onClick} data-tip={title} aria-label={title} data-k={k}>
      <PIcon name={icon} size={size} />
    </button>
  );
}

function Volume() {
  const { prefs, update, osd } = useCtl();
  const v = prefs.muted ? 0 : prefs.volume;
  const icon = v === 0 ? 'mute' : v < 0.5 ? 'volumeLow' : 'volume';
  const set = (x: number) => {
    update({ volume: x, muted: x === 0 });
    osd('音量 ' + Math.round(x * 100) + '%');
  };
  return (
    <div className="sxp-volume">
      <Btn icon={icon} title={prefs.muted ? '取消静音 (M)' : '静音 (M)'} onClick={() => update({ muted: !prefs.muted })} />
      <div className="sxp-volume-slider">
        <input type="range" min={0} max={2} step={0.05} value={v} style={{ ['--p' as any]: (v / 2) * 100 + '%' }} onChange={(e) => set(Number(e.target.value))} />
        <span className={v > 1 ? 'boost' : ''}>{Math.round(v * 100)}%</span>
      </div>
    </div>
  );
}

const MODES: { value: DmMode; label: string }[] = [
  { value: 'scroll', label: '滚动' },
  { value: 'top', label: '顶部' },
  { value: 'bottom', label: '底部' },
];

function DanmakuInput() {
  const { prefs, update, actions, osd } = useCtl();
  const [text, setText] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [mode, setMode] = useState<DmMode>('scroll');
  const [style, setStyle] = useState(false);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    actions.sendDanmaku(t, color, mode);
    setText('');
  };
  const on = prefs.dm.on;
  return (
    <div className="sxp-dm-input" onClick={(e) => e.stopPropagation()}>
      <Btn
        icon={on ? 'danmaku' : 'danmakuOff'}
        title={on ? '关闭弹幕 (D)' : '开启弹幕 (D)'}
        active={on}
        onClick={() => {
          update({ dm: { on: !on } });
          osd(on ? '弹幕已关闭' : '弹幕已开启');
        }}
      />
      <div className="sxp-dm-box">
        <button className="sxp-dm-style" style={{ color }} onClick={() => setStyle((s) => !s)} aria-label="弹幕样式">
          A
        </button>
        <input value={text} maxLength={60} placeholder="发个友善的弹幕见证当下" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="sxp-dm-send" onClick={send}>
          发送
        </button>
        {style && (
          <div className="sxp-pop sxp-dm-stylepop">
            <div className="sxp-pop-title-sm">弹幕类型</div>
            <div className="sxp-seg">
              {MODES.map((m) => (
                <button key={m.value} className={'sxp-seg-item' + (mode === m.value ? ' active' : '')} onClick={() => setMode(m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="sxp-pop-title-sm">颜色</div>
            <Swatches value={color} onChange={setColor} />
          </div>
        )}
      </div>
    </div>
  );
}

function QualityBtn() {
  const { hls, panel, open } = useCtl();
  const { levels, level, playingLevel } = hls.info;
  if (levels.length < 2) return null;
  const label = level < 0 ? '自动' + (levels[playingLevel] ? ' ' + levels[playingLevel].name : '') : levels[level].name;
  return (
    <button className={'sxp-tbtn sxp-quality-btn' + (panel === 'quality' ? ' active' : '')} onClick={() => open(panel === 'quality' ? null : 'quality')}>
      {label}
    </button>
  );
}

export function QualityMenu() {
  const { hls, open, osd } = useCtl();
  const { levels, level } = hls.info;
  const items = [...levels].reverse();
  const pick = (i: number) => {
    hls.setLevel(i);
    osd('清晰度 ' + (i < 0 ? '自动' : levels[i].name));
    open(null);
  };
  return (
    <div className="sxp-pop sxp-menu" onClick={(e) => e.stopPropagation()}>
      {items.map((l) => (
        <button key={l.index} className={'sxp-menu-item' + (level === l.index ? ' active' : '')} onClick={() => pick(l.index)}>
          {l.name}
          <span>{Math.round(l.bitrate / 1000)} kbps</span>
        </button>
      ))}
      <button className={'sxp-menu-item' + (level < 0 ? ' active' : '')} onClick={() => pick(-1)}>
        自动
      </button>
    </div>
  );
}

export function ControlBar({ visible }: { visible: boolean }) {
  const c = useCtl();
  const { media, actions, prefs, panel, open, skip } = c;
  const compact = useCompact();
  const toggleTab = (tab: 'speed' | 'sub' | 'more') => open(panel === 'settings' && c.tab === tab ? null : 'settings', tab);
  // 小屏「更多」：直接打开设置面板的「更多」页（字幕 / 弹幕 / 画面 / 画幅 / 截图 / 画中画等都在面板标签中）
  const onSettings = compact ? () => toggleTab('more') : () => open(panel === 'settings' ? null : 'settings');
  return (
    <div className={'sxp-bottom' + (visible ? '' : ' hide')} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <ProgressBar cur={media.cur} dur={media.dur} buffered={media.buffered} marks={[skip.intro, media.dur - skip.outro]} onSeek={actions.seek} />
      <div className="sxp-ctrl-row">
        <Btn icon="prev" title="上一集 (P)" onClick={actions.prev} size={18} k="prev" />
        <button className="sxp-play" onClick={actions.toggle} aria-label="播放/暂停">
          <PIcon name={media.playing ? 'pause' : 'play'} size={22} />
        </button>
        <Btn icon="next" title="下一集 (N)" onClick={actions.next} size={18} k="next" />
        <Volume />
        <div className="sxp-time">
          {fmtTime(media.cur)} <span>/ {fmtTime(media.dur)}</span>
        </div>
        <DanmakuInput />
        <div className="sxp-spacer" />
        <QualityBtn />
        <button className={'sxp-tbtn' + (panel === 'settings' && c.tab === 'speed' ? ' active' : '')} onClick={() => toggleTab('speed')}>
          {prefs.speed === 1 ? '倍速' : prefs.speed + 'x'}
        </button>
        <Btn icon="subtitle" title="字幕" onClick={() => toggleTab('sub')} active={!!c.sub.cues || c.sub.useTrack} k="sub" />
        <Btn icon="list" title="选集" onClick={() => open(panel === 'eps' ? null : 'eps')} active={panel === 'eps'} />
        <Btn icon={compact ? 'more' : 'settings'} title={compact ? '更多' : '设置'} onClick={onSettings} active={panel === 'settings'} />
        <Btn icon="camera" title="截图 (S)" onClick={actions.screenshot} k="camera" />
        <Btn icon="pip" title="画中画" onClick={actions.pip} k="pip" />
        <Btn icon={actions.isFull ? 'exitFull' : 'full'} title="全屏 (F)" onClick={actions.fullscreen} />
      </div>
    </div>
  );
}
