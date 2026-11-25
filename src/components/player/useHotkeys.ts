// 键盘快捷键（含长按 → 临时 3 倍速）
import { useEffect, useRef } from 'react';

export interface HotkeyActions {
  toggle: () => void;
  seekBy: (d: number) => void;
  volumeBy: (d: number) => void;
  fullscreen: () => void;
  mute: () => void;
  danmaku: () => void;
  screenshot: () => void;
  speedStep: (dir: 1 | -1) => void;
  next: () => void;
  prev: () => void;
  escape: () => void;
  help: () => void;
  stats: () => void;
  pip: () => void;
  fastHold: (on: boolean) => void;
}

export const SEEK_STEP = 5;
const VOLUME_STEP = 0.1;
const LONG_PRESS_MS = 350;

export const HOTKEY_HELP: [string, string][] = [
  ['空格', '播放 / 暂停'],
  ['← / →', '后退 / 前进 5 秒'],
  ['长按 →', '临时 3 倍速快进'],
  ['↑ / ↓', '音量 +/- 10%'],
  ['[ / ]', '减速 / 加速'],
  ['F / 双击', '全屏'],
  ['M', '静音'],
  ['D', '弹幕开关'],
  ['S', '截图'],
  ['N / P', '下一集 / 上一集'],
  ['I', '统计信息'],
  ['Shift+P', '画中画'],
  ['?', '快捷键帮助'],
  ['Esc', '关闭面板 / 退出'],
];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/** 字母键映射（不区分大小写） */
function letterAction(a: HotkeyActions, e: KeyboardEvent): (() => void) | null {
  const k = e.key.toLowerCase();
  if (k === 'p' && e.shiftKey) return a.pip;
  const map: Record<string, () => void> = {
    f: a.fullscreen,
    m: a.mute,
    d: a.danmaku,
    s: a.screenshot,
    n: a.next,
    p: a.prev,
    i: a.stats,
    '[': () => a.speedStep(-1),
    ']': () => a.speedStep(1),
    '?': a.help,
  };
  return map[k] || null;
}

export function useHotkeys(actions: HotkeyActions) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let holding = false;
    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      const a = ref.current;
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.repeat || holdTimer) return;
        holdTimer = setTimeout(() => {
          holding = true;
          a.fastHold(true);
        }, LONG_PRESS_MS);
        return;
      }
      const simple: Record<string, () => void> = {
        Space: a.toggle,
        ArrowLeft: () => a.seekBy(-SEEK_STEP),
        ArrowUp: () => a.volumeBy(VOLUME_STEP),
        ArrowDown: () => a.volumeBy(-VOLUME_STEP),
        Escape: a.escape,
      };
      const fn = simple[e.code] || letterAction(a, e);
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowRight') return;
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      if (holding) ref.current.fastHold(false);
      else if (!isTyping(e)) ref.current.seekBy(SEEK_STEP);
      holding = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, []);
}
