// 叠加层：顶部栏、加载、错误态、OSD 轻提示、快捷键帮助、统计信息、拖放提示
import React, { useEffect, useState } from 'react';
import type Hls from 'hls.js';
import { useCtl } from './ctl';
import { PIcon } from './icons';
import { HOTKEY_HELP } from './useHotkeys';

export function TopBar({ title, sub, visible, onBack }: { title: string; sub: string; visible: boolean; onBack: () => void }) {
  const { open, panel } = useCtl();
  return (
    <div className={'sxp-top' + (visible ? '' : ' hide')} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button className="sxp-cbtn" onClick={onBack} aria-label="返回" data-tip="返回 (Esc)">
        <PIcon name="back" size={22} />
      </button>
      <div className="sxp-titles">
        <div className="sxp-title">{title}</div>
        <div className="sxp-subtitle">{sub}</div>
      </div>
      <button className={'sxp-top-btn' + (panel === 'eps' ? ' active' : '')} onClick={() => open(panel === 'eps' ? null : 'eps')}>
        <PIcon name="list" size={16} />
        选集
      </button>
    </div>
  );
}

export function Loading({ text }: { text?: string }) {
  return (
    <div className="sxp-loading">
      <div className="sxp-loader">
        <span />
        <span />
        <span />
      </div>
      {text && <div className="sxp-loading-text">{text}</div>}
    </div>
  );
}

export function ErrorView({ msg, onRetry, onLines, onBack }: { msg: string; onRetry: () => void; onLines: () => void; onBack: () => void }) {
  return (
    <div className="sxp-error" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="sxp-error-icon">
        <PIcon name="warn" size={30} />
      </div>
      <div className="sxp-error-title">播放出错了</div>
      <div className="sxp-error-msg">{msg}</div>
      <div className="sxp-error-actions">
        <button className="sxp-btn sxp-btn-primary" onClick={onRetry}>
          <PIcon name="refresh" size={15} />
          重试
        </button>
        <button className="sxp-btn" onClick={onLines}>
          更换线路
        </button>
        <button className="sxp-btn" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  );
}

export function Osd({ msg, seq }: { msg: string; seq: number }) {
  if (!msg) return null;
  return (
    <div className="sxp-osd" key={seq}>
      {msg}
    </div>
  );
}

export function FastHint() {
  return (
    <div className="sxp-fast">
      <PIcon name="forward" size={18} />
      3x 快进中
    </div>
  );
}

export function DropHint() {
  return (
    <div className="sxp-drop">
      <PIcon name="upload" size={34} />
      <div>松开以加载字幕 / 弹幕文件</div>
      <span>支持 .srt .vtt .ass .ssa 字幕，.xml .json 弹幕</span>
    </div>
  );
}

export function HelpPanel() {
  const { open } = useCtl();
  return (
    <div className="sxp-pop sxp-help" onClick={(e) => e.stopPropagation()}>
      <div className="sxp-pop-head">
        <div className="sxp-pop-title">键盘快捷键</div>
        <button className="sxp-pop-close" onClick={() => open(null)} aria-label="关闭">
          <PIcon name="close" size={16} />
        </button>
      </div>
      <div className="sxp-help-grid">
        {HOTKEY_HELP.map(([k, d]) => (
          <div key={k} className="sxp-help-item">
            <kbd>{k}</kbd>
            <span>{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Stats {
  res: string;
  bitrate: string;
  bw: string;
  buffer: string;
  dropped: string;
  speed: string;
}

function readStats(v: HTMLVideoElement, hls: Hls | null): Stats {
  let ahead = 0;
  for (let i = 0; i < v.buffered.length; i++) {
    if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) ahead = v.buffered.end(i) - v.currentTime;
  }
  const q = v.getVideoPlaybackQuality?.();
  const lv = hls && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
  return {
    res: v.videoWidth ? `${v.videoWidth} × ${v.videoHeight}` : '-',
    bitrate: lv ? Math.round(lv.bitrate / 1000) + ' kbps' + (lv.codecSet ? ' · ' + lv.codecSet : '') : '-',
    bw: hls && hls.bandwidthEstimate ? (hls.bandwidthEstimate / 1e6).toFixed(2) + ' Mbps' : '-',
    buffer: ahead.toFixed(1) + ' s',
    dropped: q ? `${q.droppedVideoFrames} / ${q.totalVideoFrames}` : '-',
    speed: v.playbackRate + 'x',
  };
}

export function StatsPanel({ videoRef, hlsRef }: { videoRef: React.RefObject<HTMLVideoElement>; hlsRef: React.MutableRefObject<Hls | null> }) {
  const [s, setS] = useState<Stats | null>(null);
  const { actions } = useCtl();
  useEffect(() => {
    const tick = () => videoRef.current && setS(readStats(videoRef.current, hlsRef.current));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [videoRef, hlsRef]);
  if (!s) return null;
  const rows: [string, string][] = [
    ['分辨率', s.res],
    ['码率', s.bitrate],
    ['估算带宽', s.bw],
    ['缓冲', s.buffer],
    ['丢帧', s.dropped],
    ['播放速度', s.speed],
  ];
  return (
    <div className="sxp-stats" onClick={(e) => e.stopPropagation()}>
      <div className="sxp-stats-head">
        统计信息
        <button onClick={actions.toggleStats} aria-label="关闭">
          <PIcon name="close" size={13} />
        </button>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="sxp-stats-row">
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}
