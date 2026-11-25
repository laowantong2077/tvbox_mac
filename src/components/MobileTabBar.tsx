// 移动端底部标签栏：替代桌面侧栏的一级导航（推荐 / 热播 / 搜索 / 片库 / 我的）
import React from 'react';
import { useNav, type View } from '../lib/nav';
import { Icon } from './Icon';

interface TabEntry {
  id: string;
  label: string;
  icon: string;
  view: View;
}

const TABS: TabEntry[] = [
  { id: 'home', label: '推荐', icon: 'home', view: { name: 'home' } },
  { id: 'hot', label: '热播', icon: 'flame', view: { name: 'hot', kind: 'movie' } },
  { id: 'search', label: '搜索', icon: 'search', view: { name: 'search' } },
  { id: 'browse', label: '片库', icon: 'grid', view: { name: 'browse' } },
  { id: 'mine', label: '我的', icon: 'user', view: { name: 'mine' } },
];

/** 「我的」下的二级页面：高亮仍落在「我的」标签 */
const MINE_CHILDREN = new Set(['mine', 'favorites', 'history', 'sources', 'settings']);

/** 当前高亮标签：详情页沿用栈中最近的一级页面 */
function activeTab(stack: View[]): string {
  for (let i = stack.length - 1; i >= 0; i--) {
    const name = stack[i].name;
    if (name === 'detail') continue;
    return MINE_CHILDREN.has(name) ? 'mine' : name;
  }
  return 'home';
}

// Icon 组件中没有的图标（火焰 / 用户）在此补充
const EXTRA_ICONS: Record<string, string> = {
  flame: 'M12 22a7 7 0 0 0 7-7c0-3-1.6-5.2-3.4-7.2-.5 2-1.6 3.2-2.9 3.7.4-3.3-.9-6.6-3.7-8.5.1 3-1.6 5-3.3 7A7.6 7.6 0 0 0 5 15a7 7 0 0 0 7 7Z',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM3.5 21a8.5 8.5 0 0 1 17 0',
};
const TAB_ICON_SIZE = 22;

export function TabIcon({ name }: { name: string }) {
  const d = EXTRA_ICONS[name];
  if (!d) return <Icon name={name} size={TAB_ICON_SIZE} />;
  return (
    <svg width={TAB_ICON_SIZE} height={TAB_ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function MobileTabBar() {
  const { stack, reset } = useNav();
  const current = activeTab(stack);
  return (
    <nav className="m-tabbar" aria-label="主导航">
      {TABS.map((t) => {
        const on = current === t.id;
        return (
          <button
            key={t.id}
            className={'m-tab' + (on ? ' active' : '')}
            aria-current={on ? 'page' : undefined}
            onClick={() => reset(t.view)}
          >
            <span className="m-tab-icon">
              <TabIcon name={t.icon} />
            </span>
            <span className="m-tab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
