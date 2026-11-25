// 播放器动作集合：播放控制、全屏、画中画、截图、倍速、音量等
import { useEffect, useState } from 'react';
import { SPEEDS } from './ctl';
import type { PlayerPrefs, PrefsPatch } from './usePlayerPrefs';
import { clamp, downloadBlob, fmtTime, round2 } from './utils';

interface Deps {
  videoRef: React.RefObject<HTMLVideoElement>;
  wrapRef: React.RefObject<HTMLDivElement>;
  prefs: PlayerPrefs;
  update: (p: PrefsPatch) => void;
  osd: (m: string) => void;
  title: string;
}

const MAX_VOLUME = 2;

/** 全屏状态订阅 */
export function useFullscreen() {
  const [isFull, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return isFull;
}

/** 截图：将当前帧（含画面滤镜）绘制到 canvas 导出 PNG */
async function captureFrame(v: HTMLVideoElement, filter: string): Promise<Blob | null> {
  if (!v.videoWidth) return null;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const g = c.getContext('2d')!;
  if (filter && filter !== 'none') g.filter = filter.replace(/url\([^)]*\)/g, '').trim() || 'none';
  g.drawImage(v, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export function useActions(d: Deps) {
  const { videoRef, wrapRef, prefs, update, osd, title } = d;
  const v = () => videoRef.current;

  const toggle = () => {
    const el = v();
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const seek = (t: number) => {
    const el = v();
    if (el && isFinite(t)) el.currentTime = clamp(t, 0, el.duration || t);
  };
  const seekBy = (delta: number) => {
    const el = v();
    if (!el) return;
    seek(el.currentTime + delta);
    osd(`${delta > 0 ? '快进' : '快退'} ${Math.abs(delta)} 秒 · ${fmtTime(el.currentTime)}`);
  };
  const volumeBy = (delta: number) => {
    const next = round2(clamp((prefs.muted ? 0 : prefs.volume) + delta, 0, MAX_VOLUME));
    update({ volume: next, muted: next === 0 });
    osd('音量 ' + Math.round(next * 100) + '%' + (next > 1 ? '（增强）' : ''));
  };
  const mute = () => {
    update({ muted: !prefs.muted });
    osd(prefs.muted ? '取消静音' : '已静音');
  };
  const speedStep = (dir: 1 | -1) => {
    const cur = prefs.speed;
    const up = SPEEDS.find((s) => s > cur);
    const down = [...SPEEDS].reverse().find((s) => s < cur);
    const next = (dir > 0 ? up : down) ?? cur;
    update({ speed: next });
    osd(`倍速 ${next}x`);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => osd('无法进入全屏'));
  };
  const pip = async () => {
    const el = v();
    if (!el) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
    } catch (e) {
      osd('画中画不可用');
    }
  };
  const screenshot = async () => {
    const el = v();
    if (!el) return;
    try {
      const blob = await captureFrame(el, el.style.filter);
      if (!blob) return osd('视频尚未就绪，无法截图');
      const name = `${title}-${fmtTime(el.currentTime).replace(/:/g, '-')}.png`;
      downloadBlob(blob, name);
      osd('已截图 · ' + name);
    } catch (e) {
      osd('截图失败（视频源跨域受限）');
    }
  };
  const fastHold = (on: boolean) => {
    const el = v();
    if (!el) return;
    el.playbackRate = on ? 3 : prefs.speed;
    if (on && el.paused) el.play().catch(() => {});
  };
  return { toggle, seek, seekBy, volumeBy, mute, speedStep, fullscreen, pip, screenshot, fastHold };
}
