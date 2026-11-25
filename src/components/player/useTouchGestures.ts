// 播放器触控手势：单击显隐控制栏 / 双击播放暂停 / 横滑快进快退 / 左侧竖滑亮度 / 右侧竖滑音量 / 长按倍速
// 仅响应 touch 事件，桌面鼠标操作不受影响；在 touchend 中 preventDefault 以屏蔽合成的 click/dblclick
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from './utils';

/** 判定为滑动的最小位移（px） */
const MOVE_THRESHOLD_PX = 12;
/** 长按触发倍速的时长 */
const LONG_PRESS_MS = 500;
/** 两次轻点判定为双击的最大间隔 */
const DOUBLE_TAP_MS = 280;
/** 横向滑满整个播放器宽度对应的跳转秒数上限 */
const SEEK_FULL_WIDTH_S = 120;
/** 竖向滑满播放器高度对应的亮度 / 音量变化量 */
const BRIGHT_FULL_HEIGHT = 1;
const VOLUME_FULL_HEIGHT = 1;
export const BRIGHT_MIN = 0.2;
export const BRIGHT_MAX = 1.5;
/** 手势音量上限：100%（增强音量仍可在控制面板调节） */
const GESTURE_VOLUME_MAX = 1;

export type GestureKind = 'seek' | 'bright' | 'volume' | 'fast';
export interface GestureHint {
  kind: GestureKind;
  /** seek：目标秒数；bright/volume：当前值 */
  value: number;
  /** seek：相对起点的偏移秒数 */
  delta: number;
}

interface Deps {
  videoRef: React.RefObject<HTMLVideoElement>;
  volume: number;
  bright: number;
  setVolume: (v: number) => void;
  setBright: (b: number) => void;
  seek: (t: number) => void;
  toggle: () => void;
  fastHold: (on: boolean) => void;
  onTap: () => void;
}

interface Track {
  x: number;
  y: number;
  w: number;
  h: number;
  left: boolean;
  mode: GestureKind | null;
  t0: number;
  v0: number;
  b0: number;
  target: number;
}

/** 依据起点数据与位移计算当前手势的提示值 */
function computeHint(tr: Track, dx: number, dy: number, dur: number): GestureHint {
  if (tr.mode === 'seek') {
    const range = Math.min(dur || SEEK_FULL_WIDTH_S, SEEK_FULL_WIDTH_S);
    const target = clamp(tr.t0 + (dx / tr.w) * range, 0, dur || Number.MAX_SAFE_INTEGER);
    return { kind: 'seek', value: target, delta: target - tr.t0 };
  }
  if (tr.mode === 'bright') {
    const b = clamp(tr.b0 - (dy / tr.h) * BRIGHT_FULL_HEIGHT, BRIGHT_MIN, BRIGHT_MAX);
    return { kind: 'bright', value: b, delta: 0 };
  }
  const v = clamp(tr.v0 - (dy / tr.h) * VOLUME_FULL_HEIGHT, 0, GESTURE_VOLUME_MAX);
  return { kind: 'volume', value: v, delta: 0 };
}

/** 轻点处理：在间隔内的第二次轻点视为双击 */
function useTapDetector(onTap: () => void, onDouble: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const last = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < DOUBLE_TAP_MS) {
      clearTimeout(timer.current);
      last.current = 0;
      onDouble();
      return;
    }
    last.current = now;
    timer.current = setTimeout(onTap, DOUBLE_TAP_MS);
  }, [onTap, onDouble]);
}

export function useTouchGestures(d: Deps) {
  const dRef = useRef(d);
  dRef.current = d;
  const track = useRef<Track | null>(null);
  const press = useRef<ReturnType<typeof setTimeout>>();
  const [hint, setHint] = useState<GestureHint | null>(null);
  const tap = useTapDetector(
    useCallback(() => dRef.current.onTap(), []),
    useCallback(() => dRef.current.toggle(), [])
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return void (track.current = null);
    const p = e.touches[0];
    const r = e.currentTarget.getBoundingClientRect();
    const { videoRef, volume, bright } = dRef.current;
    track.current = {
      x: p.clientX, y: p.clientY, w: r.width || 1, h: r.height || 1, left: p.clientX - r.left < r.width / 2,
      mode: null, t0: videoRef.current?.currentTime || 0, v0: volume, b0: bright, target: 0,
    };
    clearTimeout(press.current);
    press.current = setTimeout(() => {
      if (!track.current || track.current.mode) return;
      track.current.mode = 'fast';
      dRef.current.fastHold(true);
      setHint({ kind: 'fast', value: 0, delta: 0 });
    }, LONG_PRESS_MS);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const tr = track.current;
    if (!tr || tr.mode === 'fast' || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - tr.x;
    const dy = e.touches[0].clientY - tr.y;
    if (!tr.mode) {
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
      clearTimeout(press.current);
      tr.mode = Math.abs(dx) > Math.abs(dy) ? 'seek' : tr.left ? 'bright' : 'volume';
    }
    const h = computeHint(tr, dx, dy, dRef.current.videoRef.current?.duration || 0);
    if (h.kind === 'seek') tr.target = h.value;
    else if (h.kind === 'bright') dRef.current.setBright(h.value);
    else dRef.current.setVolume(h.value);
    setHint(h);
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    clearTimeout(press.current);
    const tr = track.current;
    track.current = null;
    if (!tr) return;
    // 阻止浏览器随后合成 click / dblclick，避免与桌面点击逻辑重复触发
    if (e.cancelable) e.preventDefault();
    if (tr.mode === 'fast') dRef.current.fastHold(false);
    else if (tr.mode === 'seek') dRef.current.seek(tr.target);
    else if (!tr.mode && e.type === 'touchend') tap();
    setHint(null);
  }, [tap]);

  return { hint, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}
