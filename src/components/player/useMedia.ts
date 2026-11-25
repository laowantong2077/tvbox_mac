// 媒体状态订阅 + 音量增强（WebAudio GainNode）
import { useEffect, useRef, useState } from 'react';

export interface MediaState {
  playing: boolean;
  cur: number;
  dur: number;
  buffered: [number, number][];
  waiting: boolean;
  width: number;
  height: number;
}

function readBuffered(v: HTMLVideoElement): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < v.buffered.length; i++) out.push([v.buffered.start(i), v.buffered.end(i)]);
  return out;
}

/** 订阅 video 事件，转为 React 状态 */
export function useMediaState(ref: React.RefObject<HTMLVideoElement>, url: string): MediaState {
  const [s, setS] = useState<MediaState>({ playing: false, cur: 0, dur: 0, buffered: [], waiting: true, width: 0, height: 0 });
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const sync = (patch: Partial<MediaState> = {}) =>
      setS((p) => ({
        ...p,
        playing: !v.paused,
        cur: v.currentTime,
        dur: isFinite(v.duration) ? v.duration : 0,
        buffered: readBuffered(v),
        width: v.videoWidth,
        height: v.videoHeight,
        ...patch,
      }));
    const on: Record<string, () => void> = {
      play: () => sync(),
      pause: () => sync(),
      timeupdate: () => sync(),
      durationchange: () => sync(),
      progress: () => sync(),
      loadedmetadata: () => sync(),
      seeking: () => sync({ waiting: true }),
      seeked: () => sync({ waiting: false }),
      waiting: () => sync({ waiting: true }),
      playing: () => sync({ waiting: false }),
      canplay: () => sync({ waiting: false }),
      loadstart: () => sync({ waiting: true, cur: 0, dur: 0, buffered: [] }),
    };
    Object.entries(on).forEach(([k, fn]) => v.addEventListener(k, fn));
    return () => Object.entries(on).forEach(([k, fn]) => v.removeEventListener(k, fn));
  }, [ref, url]);
  return s;
}

interface AudioGraph {
  ctx: AudioContext;
  gain: GainNode;
}

/** 音量 0~2：≤1 直接设置 video.volume；>1 时惰性创建 WebAudio 增益链（同源流，不会被静音） */
export function useAudioBoost(ref: React.RefObject<HTMLVideoElement>, volume: number, muted: boolean) {
  const graph = useRef<AudioGraph | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    v.volume = Math.min(1, Math.max(0, volume));
    if (volume > 1 && !graph.current) {
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaElementSource(v);
        const gain = ctx.createGain();
        src.connect(gain).connect(ctx.destination);
        graph.current = { ctx, gain };
      } catch (e) {
        /* 不支持则忽略增益 */
      }
    }
    const g = graph.current;
    if (g) {
      g.gain.gain.value = Math.max(1, volume);
      if (g.ctx.state === 'suspended') g.ctx.resume().catch(() => {});
    }
  }, [ref, volume, muted]);
  useEffect(() => () => void graph.current?.ctx.close().catch(() => {}), []);
}
