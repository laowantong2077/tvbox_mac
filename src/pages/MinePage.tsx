// 「我的」页（移动端底部标签栏入口）：收藏 / 观看记录 / 源管理 / 设置 + 当前源与网络模式摘要
import React, { useEffect, useState } from 'react';
import { useNav, type SimpleViewName } from '../lib/nav';
import { useStore } from '../lib/store';
import { MODE_META, NET_EVENT, networkApi, type NetMode, type SettingsResp } from '../lib/networkApi';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';

const APP_VERSION = 'v1.0.1';
const LOGO_SIZE = 52;

interface Entry {
  view: SimpleViewName;
  label: string;
  icon: string;
  desc: (n: { fav: number; hist: number; sites: number }) => string;
}

const ENTRIES: Entry[] = [
  { view: 'favorites', label: '我的收藏', icon: 'heart', desc: (n) => (n.fav ? n.fav + ' 部' : '还没有收藏') },
  { view: 'history', label: '观看记录', icon: 'clock', desc: (n) => (n.hist ? n.hist + ' 条' : '暂无记录') },
  { view: 'sources', label: '源管理', icon: 'folder', desc: (n) => n.sites + ' 个站点' },
  { view: 'settings', label: '设置', icon: 'settings', desc: () => '播放 · 网络 · 关于' },
];

/** 订阅当前网络模式（设置变更时同步刷新） */
function useNetMode(): NetMode | null {
  const [mode, setMode] = useState<NetMode | null>(null);
  useEffect(() => {
    networkApi.getSettings().then((r) => setMode(r.settings.mode)).catch(() => undefined);
    const on = (e: Event) => setMode((e as CustomEvent<SettingsResp>).detail.settings.mode);
    window.addEventListener(NET_EVENT, on);
    return () => window.removeEventListener(NET_EVENT, on);
  }, []);
  return mode;
}

function Summary() {
  const { activeSource, sites, demoSite } = useStore();
  const mode = useNetMode();
  return (
    <div className="mine-summary">
      <div className="mine-brand">
        <Logo size={LOGO_SIZE} className="brand-logo-svg" />
        <div>
          <div className="mine-brand-name">随心看</div>
          <div className="mine-brand-sub">随心所欲，想看就看</div>
        </div>
      </div>
      <div className="mine-stats">
        <div className="mine-stat">
          <span className="mine-stat-label">
            <span className={'src-dot ' + (activeSource ? 'on' : '')} />
            当前源
          </span>
          <span className="mine-stat-value">{activeSource ? activeSource.name : '内置演示源'}</span>
          <span className="mine-stat-sub">
            {sites.length} 个可用站点{demoSite ? '（含演示）' : ''}
          </span>
        </div>
        <div className="mine-stat">
          <span className="mine-stat-label">网络模式</span>
          <span className="mine-stat-value">{mode ? MODE_META[mode].title : '读取中…'}</span>
          <span className="mine-stat-sub">可在顶部快捷切换</span>
        </div>
      </div>
    </div>
  );
}

export function MinePage() {
  const { navigate } = useNav();
  const { state, sites } = useStore();
  const counts = { fav: state.favorites.length, hist: state.history.length, sites: sites.length };
  return (
    <div className="page mine-page">
      <div className="page-inner">
        <Summary />
        <div className="mine-list">
          {ENTRIES.map((e) => (
            <button key={e.view} className="mine-item" onClick={() => navigate({ name: e.view })}>
              <span className="mine-item-icon">
                <Icon name={e.icon} size={20} />
              </span>
              <span className="mine-item-label">{e.label}</span>
              <span className="mine-item-desc">{e.desc(counts)}</span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
        <div className="mine-ver">随心看 {APP_VERSION} · 兼容 TVBox 配置协议</div>
      </div>
    </div>
  );
}
