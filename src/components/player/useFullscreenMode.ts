// 全屏模式：优先原生元素全屏；不可用（如 iPhone WKWebView）时退化为 CSS 伪全屏
// 移动端进入全屏时尝试锁定横屏（Android 支持，iOS 不支持则静默忽略），退出时解锁
import React, { useCallback, useEffect, useState } from 'react';
import { platform } from '../../lib/platform';

/** screen.orientation 的 lock/unlock 在部分 TS lib 中缺失，这里做最小声明 */
type LockableOrientation = ScreenOrientation & {
  lock?: (o: 'landscape') => Promise<void>;
  unlock?: () => void;
};

function orientation(): LockableOrientation | undefined {
  return (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
}

/** 是否处于移动 / 窄屏环境（由 lib/compact 维护 html.is-compact） */
function isCompactEnv(): boolean {
  return platform.mobile || document.documentElement.classList.contains('is-compact');
}

/** 尝试锁定横屏；仅移动端执行，任何失败静默 */
function lockLandscape() {
  if (!isCompactEnv()) return;
  try {
    orientation()?.lock?.('landscape').catch(() => undefined);
  } catch {
    /* 不支持方向锁定 */
  }
}

function unlockOrientation() {
  try {
    orientation()?.unlock?.();
  } catch {
    /* 不支持方向锁定 */
  }
}

/** 当前环境能否对元素使用原生全屏 */
function canNativeFullscreen(el: HTMLElement | null): boolean {
  return !!el && typeof el.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
}

export function useFullscreenMode(wrapRef: React.RefObject<HTMLElement>, osd: (m: string) => void) {
  const [native, setNative] = useState(!!document.fullscreenElement);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    const on = () => {
      const full = !!document.fullscreenElement;
      setNative(full);
      if (!full) unlockOrientation();
    };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // 播放器卸载时解除伪全屏遗留的方向锁定
  useEffect(() => () => unlockOrientation(), []);

  const enterPseudo = useCallback(() => {
    setPseudo(true);
    lockLandscape();
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (pseudo) {
      setPseudo(false);
      unlockOrientation();
      return;
    }
    const el = wrapRef.current;
    if (!canNativeFullscreen(el)) return enterPseudo();
    el!.requestFullscreen()
      .then(lockLandscape)
      .catch(() => {
        // 桌面端保持原提示；移动端原生全屏被拒绝时（如 iOS 非视频元素）退化为伪全屏
        if (!isCompactEnv()) return osd('无法进入全屏');
        enterPseudo();
        osd('已切换为网页全屏');
      });
  }, [pseudo, wrapRef, enterPseudo, osd]);

  return { isFull: native || pseudo, pseudo, toggle };
}
