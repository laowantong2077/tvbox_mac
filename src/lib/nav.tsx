import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Site, Vod } from '../types';
import type { DiscoverItem, HotKind } from './discoverApi';

export type ViewName =
  | 'home'
  | 'hot'
  | 'search'
  | 'browse'
  | 'favorites'
  | 'history'
  | 'sources'
  | 'settings'
  | 'mine'
  | 'detail';

/** 无额外参数的简单页面 */
export type SimpleViewName = Exclude<ViewName, 'detail' | 'hot' | 'search'>;

export interface DetailView {
  name: 'detail';
  vod: Vod;
  site: Site;
}
/** 热播页：kind 区分电影 / 电视 / 综艺，tag 为初始标签 key */
export interface HotView {
  name: 'hot';
  kind: HotKind;
  tag?: string;
}
/** 搜索页：可从别处带入关键词自动搜索 */
export interface SearchView {
  name: 'search';
  keyword?: string;
}
export type View = { name: SimpleViewName } | DetailView | HotView | SearchView;

export interface PlayingState {
  vod: Vod;
  group: number;
  ep: number;
}

interface NavCtx {
  view: View;
  stack: View[];
  navigate: (v: View) => void;
  back: () => void;
  /** 重置导航栈（侧栏一级菜单），可传页面名或完整 View */
  reset: (target: SimpleViewName | 'search' | View) => void;
  openDetail: (vod: Vod, site: Site) => void;
  playing: PlayingState | null;
  play: (vod: Vod, group: number, ep: number) => void;
  closePlayer: () => void;
  /** 资源匹配浮层：点击豆瓣条目后在各站点中搜索可播资源 */
  matching: DiscoverItem | null;
  openMatch: (item: DiscoverItem) => void;
  closeMatch: () => void;
}

const Ctx = createContext<NavCtx>(null as unknown as NavCtx);
export const useNav = () => useContext(Ctx);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<View[]>([{ name: 'home' }]);
  const [playing, setPlaying] = useState<PlayingState | null>(null);
  const [matching, setMatching] = useState<DiscoverItem | null>(null);

  const navigate = useCallback((v: View) => setStack((s) => [...s, v]), []);
  const back = useCallback(
    () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    []
  );
  const reset = useCallback((target: SimpleViewName | 'search' | View) => {
    setStack([typeof target === 'string' ? ({ name: target } as View) : target]);
  }, []);
  const openDetail = useCallback((vod: Vod, site: Site) => {
    setMatching(null);
    setStack((s) => [...s, { name: 'detail', vod, site }]);
  }, []);
  const play = useCallback(
    (vod: Vod, group: number, ep: number) => setPlaying({ vod, group, ep }),
    []
  );
  const closePlayer = useCallback(() => setPlaying(null), []);
  const openMatch = useCallback((item: DiscoverItem) => setMatching(item), []);
  const closeMatch = useCallback(() => setMatching(null), []);

  const view = stack[stack.length - 1];

  const value = useMemo<NavCtx>(
    () => ({
      view,
      stack,
      navigate,
      back,
      reset,
      openDetail,
      playing,
      play,
      closePlayer,
      matching,
      openMatch,
      closeMatch,
    }),
    [view, stack, navigate, back, reset, openDetail, playing, play, closePlayer, matching, openMatch, closeMatch]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
