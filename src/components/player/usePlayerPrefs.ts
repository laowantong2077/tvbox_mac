// 播放器偏好设置（localStorage 持久化，key 前缀 sxk.player.）
import { useCallback, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from './utils';

export const PREFIX = 'sxk.player.';

export type DmArea = 0.25 | 0.5 | 0.75 | 1;
export type AspectMode = 'auto' | '16:9' | '4:3' | '21:9' | '1:1' | 'fill' | 'cover';
export type SubBg = 'none' | 'shadow' | 'box';

export interface SubPrefs {
  on: boolean;
  size: number; // px（以 1080p 高度为基准自适应）
  color: string;
  bg: SubBg;
  bottom: number; // 距底部百分比
  offset: number; // 时间偏移（秒），正数 = 字幕延后
}

export interface DmPrefs {
  on: boolean;
  opacity: number; // 0.1~1
  size: number; // 字号 px
  speed: number; // 速度倍率 0.5~2
  area: DmArea;
  max: number; // 同屏上限，0 = 不限
  block: string[]; // 屏蔽关键词
  hideScroll: boolean;
  hideTop: boolean;
  hideBottom: boolean;
}

export interface PicPrefs {
  brightness: number; // 百分比
  contrast: number;
  saturate: number;
  hue: number; // 度
  flipH: boolean;
  flipV: boolean;
  rotate: 0 | 90 | 180 | 270;
  sharpen: boolean;
}

export interface AspectPrefs {
  mode: AspectMode;
  zoom: number; // 0.5~1.5
}

export interface PlayerPrefs {
  speed: number;
  volume: number; // 0~2（>1 用 WebAudio 增益）
  muted: boolean;
  loop: boolean;
  autoNext: boolean | null; // null = 跟随全局设置
  sub: SubPrefs;
  dm: DmPrefs;
  pic: PicPrefs;
  aspect: AspectPrefs;
}

export const DEFAULT_PIC: PicPrefs = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  flipH: false,
  flipV: false,
  rotate: 0,
  sharpen: false,
};

export const DEFAULT_PREFS: PlayerPrefs = {
  speed: 1,
  volume: 1,
  muted: false,
  loop: false,
  autoNext: null,
  sub: { on: true, size: 42, color: '#ffffff', bg: 'shadow', bottom: 8, offset: 0 },
  dm: {
    on: true,
    opacity: 0.9,
    size: 24,
    speed: 1,
    area: 0.5,
    max: 0,
    block: [],
    hideScroll: false,
    hideTop: false,
    hideBottom: false,
  },
  pic: DEFAULT_PIC,
  aspect: { mode: 'auto', zoom: 1 },
};

const KEY = PREFIX + 'prefs';

/** 与默认值深合并一层，兼容旧版本存储 */
function hydrate(raw: Partial<PlayerPrefs>): PlayerPrefs {
  const d = DEFAULT_PREFS;
  return {
    ...d,
    ...raw,
    sub: { ...d.sub, ...(raw.sub || {}) },
    dm: { ...d.dm, ...(raw.dm || {}) },
    pic: { ...d.pic, ...(raw.pic || {}) },
    aspect: { ...d.aspect, ...(raw.aspect || {}) },
  };
}

export type PrefsPatch = {
  [K in keyof PlayerPrefs]?: PlayerPrefs[K] extends object ? Partial<PlayerPrefs[K]> : PlayerPrefs[K];
};

export function usePlayerPrefs() {
  const [prefs, setPrefs] = useState<PlayerPrefs>(() => hydrate(loadJSON(KEY, {})));
  useEffect(() => {
    const t = setTimeout(() => saveJSON(KEY, prefs), 300);
    return () => clearTimeout(t);
  }, [prefs]);
  /** 局部更新：对象字段做浅合并 */
  const update = useCallback((patch: PrefsPatch) => {
    setPrefs((p) => {
      const next: any = { ...p };
      for (const k of Object.keys(patch) as (keyof PlayerPrefs)[]) {
        const v = (patch as any)[k];
        const cur = (p as any)[k];
        next[k] = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur, ...v } : v;
      }
      return next;
    });
  }, []);
  return { prefs, update, setPrefs };
}

/** 跳过片头片尾：按剧名持久化 */
export interface SkipPrefs {
  intro: number;
  outro: number;
}
export function loadSkip(name: string): SkipPrefs {
  return loadJSON(PREFIX + 'skip.' + name, { intro: 0, outro: 0 });
}
export function saveSkip(name: string, v: SkipPrefs) {
  saveJSON(PREFIX + 'skip.' + name, v);
}
