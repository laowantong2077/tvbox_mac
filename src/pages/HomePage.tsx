import React, { useCallback, useEffect, useState } from 'react';
import { discoverApi, loadFallback, KIND_LABEL, type HomeData, type HotKind, type FallbackResult } from '../lib/discoverApi';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { HeroCarousel, HeroSkeleton } from '../components/discover/HeroCarousel';
import { MediaRow } from '../components/discover/MediaRow';
import { DoubanCard } from '../components/discover/DoubanCard';
import { StateView, FallbackNotice } from '../components/discover/StateView';
import { VideoCard } from '../components/VideoCard';
import '../styles/discover.css';

const SKELETON_ROWS = 3;
const FALLBACK_KINDS: HotKind[] = ['movie', 'tv', 'show'];
// 首页数据缓存在模块内，切换页面返回时不闪烁（后端另有 10 分钟缓存）
let homeCache: HomeData | null = null;

/** 推荐首页：Hero 轮播 + 多行横向推荐 */
export function HomePage() {
  const { openMatch, navigate } = useNav();
  const [data, setData] = useState<HomeData | null>(homeCache);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!homeCache);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    discoverApi
      .home()
      .then((d) => {
        homeCache = d;
        setData(d);
      })
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!homeCache) load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="page discover-page">
        <HeroSkeleton />
        <div className="discover-rows">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <MediaRow key={i} title="正在加载…" loading />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) return <HomeFallback error={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="page discover-page">
      <HeroCarousel items={data.banner} onOpen={openMatch} />
      <div className="discover-rows">
        {data.rows.map((row) => (
          <MediaRow
            key={row.key}
            title={row.title}
            sub={row.sub}
            onMore={() => navigate({ name: 'hot', kind: row.link.kind, tag: row.link.tag })}
          >
            {row.items.map((it, i) => (
              <DoubanCard key={it.id} item={it} rank={row.key === 'weekly' || row.key === 'tv_cn_weekly' ? i : undefined} onOpen={openMatch} />
            ))}
          </MediaRow>
        ))}
        <div className="discover-foot">数据来自豆瓣 · 点击任意影片即可在已添加的源中匹配播放资源</div>
      </div>
    </div>
  );
}

/** 豆瓣不可用时：用当前源第一个支持站点的分类最新列表兜底 */
function HomeFallback({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { sites, ready } = useStore();
  const { openDetail, navigate } = useNav();
  const [rows, setRows] = useState<(FallbackResult & { kind: HotKind })[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    Promise.all(
      FALLBACK_KINDS.map((k) => loadFallback(sites, k).then((r) => (r ? { ...r, kind: k } : null)).catch(() => null))
    ).then((rs) => alive && setRows(rs.filter(Boolean) as (FallbackResult & { kind: HotKind })[]));
    return () => {
      alive = false;
    };
  }, [sites, ready]);

  const notice = <FallbackNotice text={`豆瓣推荐暂时无法加载（${error}），已为你展示当前源的最新内容`} onRetry={onRetry} />;

  if (rows && rows.length === 0) {
    return (
      <div className="page discover-page">
        <div className="page-inner">
          <StateView icon="warn" tone="error" title="推荐内容加载失败" desc={error + '。当前源中也没有可用的电影 / 剧集 / 综艺分类。'}>
            <button className="btn btn-primary" onClick={onRetry}>重新加载</button>
          </StateView>
        </div>
      </div>
    );
  }

  return (
    <div className="page discover-page">
      <div className="discover-rows is-fallback">
        {notice}
        {!rows && Array.from({ length: SKELETON_ROWS }).map((_, i) => <MediaRow key={i} title="正在加载站点内容…" loading />)}
        {rows?.map((r) => (
          <MediaRow
            key={r.kind}
            title={KIND_LABEL[r.kind]}
            sub={`${r.site.name} · ${r.category}`}
            onMore={() => navigate({ name: 'hot', kind: r.kind })}
          >
            {r.list.slice(0, 18).map((v) => (
              <div className="mrow-vcard" key={v.id}>
                <VideoCard vod={v} onOpen={(vod) => openDetail(vod, r.site)} />
              </div>
            ))}
          </MediaRow>
        ))}
      </div>
    </div>
  );
}
