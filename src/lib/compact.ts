/*
 * 紧凑（移动端）布局判定：窄屏视口或 Tauri 移动端 App
 *  - 在 <html> 上切换 `is-compact` 类，所有移动端样式统一以 `html.is-compact` 为前缀，
 *    保证桌面端（≥ 900px）DOM 与样式完全不受影响
 *  - useCompact() 供组件按需渲染移动端专属结构（底部标签栏、我的页等）
 */
import { useEffect, useState } from 'react';
import { platform } from './platform';

/** 窄屏断点：小于等于该宽度视为手机布局 */
// 窄屏，或「粗指针 + 矮视口」（手机横屏，宽度可能 > 760px）；桌面鼠标设备不会命中第二条
export const COMPACT_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';
const COMPACT_CLASS = 'is-compact';
const CHANGE_EVENT = 'sxk-compact-change';

function mql(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : null;
}

/** 当前是否紧凑布局 */
export function isCompactNow(): boolean {
  return platform.mobile || !!mql()?.matches;
}

function apply() {
  document.documentElement.classList.toggle(COMPACT_CLASS, isCompactNow());
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 启动时调用一次：同步 html 类名并监听视口变化 */
export function setupCompact() {
  apply();
  mql()?.addEventListener('change', apply);
}

/**
 * App 内（Tauri 移动端）屏蔽双指缩放手势，避免误触把整个界面放大；
 * 普通浏览器保留系统缩放能力（无障碍），双击缩放由 CSS touch-action 消除
 */
export function setupTouchGuards() {
  if (!platform.mobile) return;
  const block = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
}

/** 订阅紧凑布局状态 */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(isCompactNow);
  useEffect(() => {
    const on = () => setCompact(isCompactNow());
    window.addEventListener(CHANGE_EVENT, on);
    on();
    return () => window.removeEventListener(CHANGE_EVENT, on);
  }, []);
  return compact;
}
