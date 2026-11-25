/*
 * 「想看」列表：豆瓣条目没有站点信息，无法进入收藏，单独存 localStorage
 */
import { useCallback, useEffect, useState } from 'react';
import type { DiscoverItem } from '../../lib/discoverApi';

const KEY = 'suixinkan.watchlist';
const EVT = 'suixinkan-watchlist';
const MAX = 200;

function read(): DiscoverItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useWatchlist() {
  const [list, setList] = useState<DiscoverItem[]>(read);

  useEffect(() => {
    const on = () => setList(read());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);

  const has = useCallback((id: string) => list.some((x) => x.id === id), [list]);

  /** 切换想看状态，返回切换后是否在列表中 */
  const toggle = useCallback((it: DiscoverItem): boolean => {
    const cur = read();
    const exists = cur.some((x) => x.id === it.id);
    const next = exists ? cur.filter((x) => x.id !== it.id) : [it, ...cur].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVT));
    return !exists;
  }, []);

  return { list, has, toggle };
}
