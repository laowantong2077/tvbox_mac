import React from 'react';
import { useNav, type View } from '../lib/nav';
import { useStore } from '../lib/store';
import { KIND_LABEL } from '../lib/discoverApi';
import { Icon } from './Icon';

const TITLES: Record<string, string> = {
  home: '推荐',
  search: '搜索',
  browse: '片库',
  favorites: '我的收藏',
  history: '观看记录',
  sources: '源管理',
  settings: '设置',
  mine: '我的',
  detail: '详情',
};

/** 标题随页面变化：热播页按 kind，详情页显示片名 */
function titleOf(view: View): string {
  if (view.name === 'hot') return KIND_LABEL[view.kind];
  if (view.name === 'detail') return view.vod.name || TITLES.detail;
  if (view.name === 'search' && view.keyword) return '搜索：' + view.keyword;
  return TITLES[view.name] || '';
}

export interface TopBarProps {
  /** 右侧预留插槽（如网络模式快捷切换器），渲染在源名称之前 */
  extra?: React.ReactNode;
}

export function TopBar({ extra }: TopBarProps = {}) {
  const { view, stack, back } = useNav();
  const { reloadSites, loadingSites, activeSource, notify } = useStore();
  const canBack = stack.length > 1;

  return (
    <header className="topbar">
      <div className="topbar-left">
        {canBack && (
          <button className="icon-btn topbar-back" onClick={back} title="返回" aria-label="返回">
            <Icon name="back" size={20} />
          </button>
        )}
        <span className="topbar-title">{titleOf(view)}</span>
      </div>
      <div className="topbar-right">
        {extra}
        <span className="topbar-src">
          <Icon name="link" size={14} />
          {activeSource ? activeSource.name : '内置演示源'}
        </span>
        <button
          className={'icon-btn topbar-refresh ' + (loadingSites ? 'spin' : '')}
          title="刷新站点"
          onClick={() => {
            reloadSites();
            notify('正在刷新站点…', 'info');
          }}
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>
    </header>
  );
}
