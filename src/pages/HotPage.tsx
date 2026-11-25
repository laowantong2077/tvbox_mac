import React, { useCallback, useEffect, useRef, useState } from 'react';
import { discoverApi, KIND_LABEL, loadFallback, type DiscoverItem, type HotKind, type TagsData, type FallbackResult } from '../lib/discoverApi';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import type { Vod } from '../types';
import { DoubanCard, DoubanCardSkeleton } from '../components/discover/DoubanCard';
import { StateView, FallbackNotice } from '../components/discover/StateView';
import { VideoCard, CardSkeleton } from '../components/VideoCard';
import { Icon } from '../components/Icon';
import { HotKindTabs } from '../components/discover/HotKindTabs';
import '../styles/discover.css';

const PAGE = 30;
const SKELETON_N = 18;
const DESC: Record<HotKind, string> = {
  movie: '院线新片、口碑佳作与冷门宝藏，一网打尽',
  tv: '正在热播的国产剧、美剧、日韩剧与动画',
  show: '真人秀、脱口秀、音乐竞演，轻松解压',
};

/** 热播页（电影 / 电视 / 综艺）：标签 + 排序 + 无限滚动 */
export function HotPage({ kind, initialTag }: { kind: HotKind; initialTag?: string }) {
  const { openMatch } = useNav();
  const [tags, setTags] = useState<TagsData | null>(null);
  const [tag, setTag] = useState(initialTag || '');
  const [sort, setSort] = useState('hot');
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    discoverApi.tags(kind).then(setTags).catch(() => undefined);
  }, [kind]);

  const curTag = tags?.tags.find((t) => t.key === tag) || tags?.tags[0];
  const sortable = !!curTag?.sortable;

  const loadPage = useCallback(
    async (start: number) => {
      const my = ++seq.current;
      setLoading(true);
      setError('');
      try {
        const d = await discoverApi.hot({ kind, tag, sort, start, limit: PAGE });
        if (my !== seq.current) return;
        setItems((prev) => {
          const base = start === 0 ? [] : prev;
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...d.items.filter((x) => !seen.has(x.id))];
        });
        setHasMore(d.hasMore && d.items.length > 0);
      } catch (e: any) {
        if (my === seq.current) setError(e.message || '加载失败');
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [kind, tag, sort]
  );

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    loadPage(0);
  }, [loadPage]);

  const sentinel = useInfinite(() => {
    if (!loading && hasMore && !error) loadPage(items.length);
  }, items.length + (loading ? 0.5 : 0));

  const failedFirst = !!error && items.length === 0;

  return (
    <div className="page discover-page hot-page">
      <div className="hot-head">
        <div className="hot-head-inner">
          <HotKindTabs kind={kind} />
          <div className="hot-titles">
            <h1 className="hot-title">{KIND_LABEL[kind]}</h1>
            <div className="hot-desc">{DESC[kind]} · 数据来自豆瓣</div>
          </div>
          {!failedFirst && (
            <div className="hot-controls">
              <div className="hot-chips">
                {(tags?.tags || []).map((t) => (
                  <button key={t.key} className={'chip ' + (curTag?.key === t.key ? 'chip-active' : '')} onClick={() => setTag(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {sortable && tags && (
                <div className="seg">
                  {tags.sorts.map((s) => (
                    <button key={s.key} className={'seg-item ' + (sort === s.key ? 'active' : '')} onClick={() => setSort(s.key)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="page-inner hot-body">
        {failedFirst ? (
          <HotFallback kind={kind} error={error} onRetry={() => loadPage(0)} />
        ) : (
          <>
            <div className="dgrid">
              {items.map((it) => (
                <DoubanCard key={it.id} item={it} onOpen={openMatch} />
              ))}
              {loading && Array.from({ length: items.length ? 6 : SKELETON_N }).map((_, i) => <DoubanCardSkeleton key={'sk' + i} />)}
            </div>
            {!loading && items.length === 0 && !error && <StateView icon="film" title="这个分类暂时没有内容" desc="换个标签看看吧" />}
            <div ref={sentinel} className="load-more">
              {error ? (
                <button className="btn btn-ghost" onClick={() => loadPage(items.length)}>
                  <Icon name="refresh" size={16} /> 加载失败，点击重试
                </button>
              ) : hasMore ? (
                !loading && items.length > 0 && (
                  <button className="btn btn-ghost" onClick={() => loadPage(items.length)}>加载更多</button>
                )
              ) : (
                items.length > 0 && <span className="load-end">— 已经到底啦，共 {items.length} 部 —</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 滚动到底部时触发回调（IntersectionObserver） */
function useInfinite(cb: () => void, version: number) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && cbRef.current(), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [version]); // 每次加载完成后重新观察，若哨兵仍在视口内会立即再次触发
  return ref;
}

/** 豆瓣不可用：回退为当前源中第一个支持站点的对应分类最新列表 */
function HotFallback({ kind, error, onRetry }: { kind: HotKind; error: string; onRetry: () => void }) {
  const { sites, ready } = useStore();
  const { openDetail } = useNav();
  const [res, setRes] = useState<FallbackResult | null | undefined>(undefined);
  const [list, setList] = useState<Vod[]>([]);
  const [pg, setPg] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    loadFallback(sites, kind)
      .then((r) => {
        if (!alive) return;
        setRes(r);
        setList(r ? r.list : []);
      })
      .catch(() => alive && setRes(null));
    return () => {
      alive = false;
    };
  }, [sites, kind, ready]);

  const more = async () => {
    if (!res || busy) return;
    setBusy(true);
    try {
      const r = await loadFallback(sites, kind, pg + 1, { siteKey: res.site.key, typeId: res.typeId, name: res.category });
      if (r) {
        setList((l) => [...l, ...r.list]);
        setRes({ ...res, hasMore: r.hasMore });
        setPg(pg + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  if (res === undefined) return <CardSkeleton n={SKELETON_N} />;
  if (res === null) {
    return (
      <StateView icon="warn" tone="error" title="豆瓣数据暂时无法访问" desc={`${error}。当前源中也没有找到「${KIND_LABEL[kind].slice(2)}」分类可供回退。`}>
        <button className="btn btn-primary" onClick={onRetry}>
          <Icon name="refresh" size={16} /> 重新加载
        </button>
      </StateView>
    );
  }
  return (
    <>
      <FallbackNotice text={`豆瓣暂不可用，已切换为「${res.site.name}」的「${res.category}」最新列表`} onRetry={onRetry} />
      <div className="grid">
        {list.map((v, i) => (
          <VideoCard key={v.id + '::' + i} vod={v} onOpen={(vod) => openDetail(vod, res.site)} />
        ))}
      </div>
      {res.hasMore && (
        <div className="load-more">
          <button className="btn btn-ghost" disabled={busy} onClick={more}>
            {busy ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}
    </>
  );
}
