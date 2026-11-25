import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import type { Site, Vod } from '../types';
import { Icon } from '../components/Icon';
import { VideoCard, CardSkeleton } from '../components/VideoCard';
import { Empty } from '../components/Toasts';
import { Logo } from '../components/Logo';
import '../styles/discover.css';

interface SiteResult {
  site: Site;
  list: Vod[];
  error?: string;
}

/** initialKeyword：从其它页面（如资源匹配浮层）带入关键词，站点就绪后自动搜索 */
export function SearchPage({ initialKeyword = '' }: { initialKeyword?: string }) {
  const { sites, ready } = useStore();
  const { openDetail } = useNav();
  const [q, setQ] = useState(initialKeyword);
  const [results, setResults] = useState<SiteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const targets = sites.filter((s) => s.supported && s.searchable !== 0);

  const runSearch = useCallback(
    async (keyword: string) => {
      const kw = keyword.trim();
      if (!kw) return;
      const myseq = ++seq.current;
      setLoading(true);
      setSearched(true);
      setFilter('all');
      const rs = await Promise.allSettled(
        targets.map((s) =>
          api.search(s, kw).then((r: any) => ({ site: s, list: (r.list || []) as Vod[] }))
        )
      );
      if (myseq !== seq.current) return;
      const out: SiteResult[] = rs.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { site: targets[i], list: [], error: (r.reason && r.reason.message) || '请求失败' };
      });
      setResults(out);
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sites]
  );

  const autoRan = useRef(false);
  useEffect(() => {
    if (!initialKeyword || autoRan.current || !ready || !targets.length) return;
    autoRan.current = true;
    runSearch(initialKeyword);
  }, [initialKeyword, ready, targets.length, runSearch]);

  const total = results.reduce((n, r) => n + r.list.length, 0);
  const okSites = results.filter((r) => r.list.length > 0);
  const visible = (
    filter === 'all' ? results : results.filter((r) => r.site.key === filter)
  ).flatMap((r) => r.list);

  return (
    <div className="page search-page">
      <div className="search-hero">
        <div className="search-hero-inner">
          <div className="search-brand">
            <Logo size={44} />
            <span className="brand-name">随心看</span>
            <span className="search-brand-sub">随心所欲，想看就看</span>
          </div>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(q);
            }}
          >
            <Icon name="search" size={22} className="search-box-icon" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索电影、电视剧、综艺、动漫…"
              spellCheck={false}
            />
            {q && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setQ('');
                  setResults([]);
                  setSearched(false);
                  inputRef.current?.focus();
                }}
              >
                <Icon name="close" size={18} />
              </button>
            )}
            <button type="submit" className="btn btn-primary search-go">
              搜索
            </button>
          </form>
          <div className="search-hint">
            {ready && targets.length > 0
              ? `将同时在 ${targets.length} 个可用站点中搜索`
              : ready
              ? '当前没有可用站点，请到「源管理」添加配置，或使用内置演示源'
              : '正在加载站点…'}
          </div>
        </div>
      </div>

      <div className="page-inner">
        {!searched && (
          <div className="search-placeholder">
            <div className="ph-cards">
              {['搜索聚合', '多源切换', 'HLS 播放'].map((t, i) => (
                <div className="ph-card" key={i}>
                  <div className="ph-card-icon">
                    <Icon name={['search', 'grid', 'play'][i]} size={22} />
                  </div>
                  <div className="ph-card-title">{t}</div>
                  <div className="ph-card-desc">
                    {[
                      '一次输入，跨站点聚合结果',
                      '按来源分组，挑选最优线路',
                      '自适应码率，支持选集与记忆进度',
                    ][i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && <CardSkeleton n={12} />}

        {!loading && searched && total === 0 && (
          <Empty
            icon="search"
            title="没有找到相关内容"
            desc={`尝试更换关键词，或检查站点是否可用（关键词：${q}）`}
          />
        )}

        {!loading && searched && total > 0 && (
          <>
            <div className="result-bar">
              <div className="result-count">
                共找到 <b>{total}</b> 条结果
              </div>
              <div className="filter-chips">
                <button
                  className={'chip ' + (filter === 'all' ? 'chip-active' : '')}
                  onClick={() => setFilter('all')}
                >
                  全部 {total}
                </button>
                {okSites.map((r) => (
                  <button
                    key={r.site.key}
                    className={'chip ' + (filter === r.site.key ? 'chip-active' : '')}
                    onClick={() => setFilter(r.site.key)}
                    title={r.site.name}
                  >
                    {r.site.name} {r.list.length}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid">
              {visible.map((v) => (
                <VideoCard
                  key={(v.siteKey || '') + '::' + v.id}
                  vod={v}
                  showSite
                  onOpen={(vod) => {
                    const site = sites.find((s) => s.key === vod.siteKey) || targets[0];
                    if (site) openDetail(vod, site);
                  }}
                />
              ))}
            </div>
            {results.some((r) => r.error) && (
              <div className="site-errors">
                {results
                  .filter((r) => r.error)
                  .map((r) => (
                    <div className="site-error" key={r.site.key}>
                      <Icon name="warn" size={14} /> {r.site.name}：{r.error}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
