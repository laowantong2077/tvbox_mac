import React from 'react';
import { StoreProvider, useStore } from './lib/store';
import { NavProvider, useNav } from './lib/nav';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NetworkQuickSwitch } from './components/settings/NetworkQuickSwitch';
import { Player } from './components/Player';
import { Toasts } from './components/Toasts';
import { SearchPage } from './pages/SearchPage';
import { BrowsePage } from './pages/BrowsePage';
import { DetailPage } from './pages/DetailPage';
import { SourcesPage } from './pages/SourcesPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { HomePage } from './pages/HomePage';
import { HotPage } from './pages/HotPage';
import { MatchSheet } from './components/discover/MatchSheet';
import { Logo } from './components/Logo';
import { MobileTabBar } from './components/MobileTabBar';
import { MinePage } from './pages/MinePage';
import { useCompact } from './lib/compact';

function Content() {
  const { view } = useNav();
  switch (view.name) {
    case 'home':
      return <HomePage />;
    case 'hot':
      // key 保证切换 kind / 初始标签时重新挂载
      return <HotPage key={view.kind + ':' + (view.tag || '')} kind={view.kind} initialTag={view.tag} />;
    case 'search':
      return <SearchPage key={view.keyword || ''} initialKeyword={view.keyword} />;
    case 'browse':
      return <BrowsePage />;
    case 'favorites':
      return <FavoritesPage />;
    case 'history':
      return <HistoryPage />;
    case 'sources':
      return <SourcesPage />;
    case 'settings':
      return <SettingsPage />;
    case 'mine':
      return <MinePage />;
    case 'detail':
      return <DetailPage />;
    default:
      return <HomePage />;
  }
}

function Shell() {
  const { ready } = useStore();
  const { playing, closePlayer, matching } = useNav();
  const compact = useCompact();

  if (!ready) {
    return (
      <div className="splash">
        <Logo size={84} className="splash-brand-logo" />
        <div className="splash-title">随心看</div>
        <div className="splash-sub">随心所欲，想看就看 · 正在启动…</div>
        <div className="spinner splash-spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      {!compact && <Sidebar />}
      <div className="app-main">
        <TopBar extra={<NetworkQuickSwitch showEgress={!compact} />} />
        <main className="app-content">
          <Content />
        </main>
        {compact && <MobileTabBar />}
      </div>
      {matching && <MatchSheet key={matching.id} item={matching} />}
      {playing && (
        <Player
          key={
            playing.vod.siteKey +
            '::' +
            playing.vod.id +
            '::' +
            playing.group +
            '::' +
            playing.ep
          }
          vod={playing.vod}
          initialGroup={playing.group}
          initialEp={playing.ep}
          onClose={closePlayer}
        />
      )}
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </StoreProvider>
  );
}
