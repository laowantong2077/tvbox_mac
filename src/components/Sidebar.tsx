import React from 'react';
import { useNav, type View } from '../lib/nav';
import { useStore } from '../lib/store';
import { Icon } from './Icon';
import { Logo } from './Logo';
import '../styles/discover.css';

interface NavEntry {
  id: string;
  label: string;
  icon: string;
  view: View;
}

// 发现类菜单（推荐 + 热播）与工具类菜单分两组展示
const DISCOVER: NavEntry[] = [
  { id: 'home', label: '推荐', icon: 'home', view: { name: 'home' } },
  { id: 'hot:movie', label: '热播电影', icon: 'film', view: { name: 'hot', kind: 'movie' } },
  { id: 'hot:tv', label: '热播电视', icon: 'tv', view: { name: 'hot', kind: 'tv' } },
  { id: 'hot:show', label: '热播综艺', icon: 'mic', view: { name: 'hot', kind: 'show' } },
];
const TOOLS: NavEntry[] = [
  { id: 'search', label: '搜索', icon: 'search', view: { name: 'search' } },
  { id: 'browse', label: '片库', icon: 'grid', view: { name: 'browse' } },
  { id: 'favorites', label: '收藏', icon: 'heart', view: { name: 'favorites' } },
  { id: 'history', label: '观看记录', icon: 'clock', view: { name: 'history' } },
  { id: 'sources', label: '源管理', icon: 'folder', view: { name: 'sources' } },
  { id: 'settings', label: '设置', icon: 'settings', view: { name: 'settings' } },
];

/** 当前高亮的菜单 id：详情页等子页面沿用栈中最近的一级页面 */
function activeId(stack: View[]): string {
  for (let i = stack.length - 1; i >= 0; i--) {
    const v = stack[i];
    if (v.name === 'detail') continue;
    return v.name === 'hot' ? 'hot:' + v.kind : v.name;
  }
  return 'home';
}

export function Sidebar() {
  const { stack, reset } = useNav();
  const { activeSource, sites, demoSite } = useStore();
  const current = activeId(stack);

  const renderItem = (n: NavEntry) => (
    <button
      key={n.id}
      className={'nav-item ' + (current === n.id ? 'active' : '')}
      onClick={() => reset(n.view)}
    >
      <NavIcon name={n.icon} />
      <span>{n.label}</span>
      {current === n.id && <span className="nav-dot" />}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Logo size={40} className="brand-logo-svg" />
        <div className="brand-text">
          <div className="brand-name">随心看</div>
          <div className="brand-sub">随心所欲，想看就看</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-group-label">发现</div>
        {DISCOVER.map(renderItem)}
        <div className="nav-group-label">我的</div>
        {TOOLS.map(renderItem)}
      </nav>

      <div className="sidebar-foot">
        <div className="src-status">
          <div className="src-status-head">
            <span className={'src-dot ' + (activeSource ? 'on' : '')} />
            当前源
          </div>
          <div className="src-status-name">{activeSource ? activeSource.name : '内置演示源'}</div>
          <div className="src-status-sub">
            {sites.length} 个可用站点{demoSite ? '（含演示）' : ''}
          </div>
        </div>
        <div className="sidebar-ver">随心看 v1.0.1</div>
      </div>
    </aside>
  );
}

// Icon 组件中没有的图标在此补充（电视 / 麦克风）
const EXTRA_ICONS: Record<string, string> = {
  tv: 'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM8 3l4 4 4-4M8 22h8',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
};

function NavIcon({ name }: { name: string }) {
  const d = EXTRA_ICONS[name];
  if (!d) return <Icon name={name} size={20} />;
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
