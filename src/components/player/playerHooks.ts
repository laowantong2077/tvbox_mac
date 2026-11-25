// 播放器通用小 hook：OSD 轻提示 / 元素尺寸订阅 / 控制栏自动隐藏（自 Player.tsx 拆出）
import React, { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY_MS = 3000;
const OSD_MS = 1500;

/** OSD 轻提示 */
export function useOsd() {
  const [osd, setOsd] = useState({ msg: '', seq: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setOsd((o) => ({ msg, seq: o.seq + 1 }));
    timer.current = setTimeout(() => setOsd((o) => ({ ...o, msg: '' })), OSD_MS);
  }, []);
  return { osd, show };
}

/** 元素尺寸订阅 */
export function useSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 鼠标静止自动隐藏控制栏；hide 供触屏单击主动收起 */
export function useIdle() {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), HIDE_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setActive(false);
  }, []);
  useEffect(() => {
    poke();
    return () => clearTimeout(timer.current);
  }, [poke]);
  return { active, poke, hide };
}
