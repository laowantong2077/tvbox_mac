// 播放器控制上下文：在子组件间共享状态与动作，避免层层传参
import { createContext, useContext } from 'react';
import type { HlsInfo } from './useHls';
import type { PlayerPrefs, PrefsPatch, SkipPrefs } from './usePlayerPrefs';
import type { Cue } from './subtitles';
import type { DanmakuCtl } from './useDanmaku';
import type { MediaState } from './useMedia';

export type PanelName = null | 'settings' | 'eps' | 'danmaku' | 'help' | 'quality';
export type SettingsTab = 'speed' | 'sub' | 'dm' | 'pic' | 'aspect' | 'more';

export interface SubCtl {
  cues: Cue[] | null;
  fileName: string;
  useTrack: boolean;
  loadFile: (f: File) => void;
  selectTrack: (i: number) => void; // -1 关闭内嵌字幕
  clear: () => void;
}

export interface PlayerCtl {
  prefs: PlayerPrefs;
  update: (p: PrefsPatch) => void;
  media: MediaState;
  osd: (msg: string) => void;
  hls: { info: HlsInfo; setLevel: (i: number) => void; setAudio: (i: number) => void };
  sub: SubCtl;
  dm: DanmakuCtl;
  skip: SkipPrefs;
  setSkip: (v: SkipPrefs) => void;
  autoNext: boolean;
  panel: PanelName;
  tab: SettingsTab;
  open: (p: PanelName, tab?: SettingsTab) => void;
  showStats: boolean;
  actions: {
    toggle: () => void;
    seek: (t: number) => void;
    next: () => void;
    prev: () => void;
    hasNext: boolean;
    hasPrev: boolean;
    fullscreen: () => void;
    isFull: boolean;
    pip: () => void;
    screenshot: () => void;
    toggleStats: () => void;
    sendDanmaku: (text: string, color: string, mode: 'scroll' | 'top' | 'bottom') => void;
  };
}

export const Ctx = createContext<PlayerCtl | null>(null);

export function useCtl(): PlayerCtl {
  const c = useContext(Ctx);
  if (!c) throw new Error('PlayerCtl 未提供');
  return c;
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
