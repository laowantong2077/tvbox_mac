import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './styles/mobile-shell.css';
import './styles/mobile-pages.css';

import { setupPlatform } from './lib/platform';
import { setupCompact, setupTouchGuards } from './lib/compact';

// 标记运行平台（桌面 App 给左上角红绿灯让位、Tauri 接管窗口拖拽）
setupPlatform();
// 窄屏 / 移动端 App：切换紧凑布局并屏蔽误触缩放
setupCompact();
setupTouchGuards();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
