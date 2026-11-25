/*
 * 运行平台检测与桌面窗口适配
 *  - Tauri：外壳注入 window.__SXK_PLATFORM__；WKWebView 不支持 app-region，
 *    改为在拖拽区按下鼠标时调用 Tauri 窗口拖拽命令
 */
type Platform = { app: 'tauri' | 'web'; os: string; mobile: boolean };

type TauriInternals = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

declare global {
  interface Window {
    __SXK_PLATFORM__?: { app: 'tauri'; os: string; mobile: boolean };
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export const platform: Platform = (() => {
  if (window.__SXK_PLATFORM__) return window.__SXK_PLATFORM__;
  return { app: 'web', os: '', mobile: false };
})();

/** 桌面 App（有 macOS 红绿灯按钮需要让位） */
export const isDesktopApp = platform.app !== 'web' && !platform.mobile;

/** 可拖动窗口的区域与需要排除的可交互元素 */
const DRAG_ZONES = '.sidebar, .topbar, .sxp-top';
const NO_DRAG = 'button, a, input, select, textarea, label, video, [role="button"], [data-no-drag]';
const PRIMARY_BUTTON = 0;
const DOUBLE_CLICK = 2;

function tauriInvoke(cmd: string): void {
  window.__TAURI_INTERNALS__?.invoke(cmd, { label: 'main' }).catch(() => undefined);
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== PRIMARY_BUTTON) return;
  const t = e.target as Element | null;
  if (!t || !t.closest(DRAG_ZONES) || t.closest(NO_DRAG)) return;
  if (e.detail === DOUBLE_CLICK) tauriInvoke('plugin:window|toggle_maximize');
  else tauriInvoke('plugin:window|start_dragging');
}

/** 启动时调用：标记根节点 class，并在 Tauri 桌面下接管窗口拖拽 */
export function setupPlatform() {
  const root = document.documentElement;
  if (isDesktopApp) root.classList.add('is-desktop');
  if (platform.mobile) root.classList.add('is-mobile');
  root.classList.add('app-' + platform.app);
  if (platform.app === 'tauri' && !platform.mobile) document.addEventListener('mousedown', onMouseDown);
}

export function appTags(): string[] {
  if (platform.app === 'tauri') return ['Tauri 2', 'Rust', 'React', 'hls.js'];
  return ['Web', 'React', 'hls.js'];
}
