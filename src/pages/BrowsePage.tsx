import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import type { Site, Vod } from '../types';
import { Icon } from '../components/Icon';
import { VideoCard, CardSkeleton } from '../components/VideoCard';
import { Empty, Spinner } from '../components/Toasts';

interface Cat {
  type_id: string;
  type_name: string;
}

export function BrowsePage() {
  const { sites, ready, loadingSites } = useStore();
  const { openDetail } = useNav();
  const supported = useMemo(() => sites.filter((s) => s.supported), [sites]);
  const [siteKey, setSiteKey] = useState<string>('');
  const [cats, setCats] = useState<Cat[]>([]);
  const [type, setType] = useState<string>('');
  const [items, setItems] = useState<Vod[]>([]);
  const [page, setPage] = useState(1);
  const [pagecount, setPagecount] = useState(1);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const site: Site | undefined = supported.find((s) => s.key === siteKey) || supported[0];

  // 默认选中第一个可用站点
  useEffect(() => {
    if (!siteKey && supported.length) setSiteKey(supported[0].key);
    if (siteKey && !supported.some((s) => s.key === siteKey)) setSiteKey(supported[0]?.key || '');
  }, [supported, siteKey]);

  // 加载分类
  useEffect(() => {
    if (!site) return;
    let alive = true;
    setLoadingCats(true);
    setCats([]);
    setError('');
    api
      .categories(site)
      .then((r: any) => {
        if (!alive) return;
        const list: Cat[] = (r.list || []).map((c: any) => ({
          type_id: String(c.type_id ?? ''),
          type_name: c.type_name ?? '',
        }));
        setCats(list);
        setType(list[0]?.type_id ?? '');
      })
      .catch((e) => alive && setError(e?.message || '分类加载失败'))
      .finally(() => alive && setLoadingCats(false));
    return () => {
      alive = false;
    };
  }, [site]);

  const loadList = useCallback(
    async (t: string, pg: number, append: boolean) => {
      if (!site) return;
      const myseq = ++seq.current;
      setLoadingList(true);
      setError('');
      try {
        const r: any = await api.list(site, t, pg);
        if (myseq !== seq.current) return;
        const list: Vod[] = (r.list || []).map((v: any) => ({
          ...v,
          siteKey: site.key,
          siteName: site.name,
        }));
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(r.page) || pg);
        setPagecount(Number(r.pagecount) || 1);
      } catch (e: any) {
        if (myseq === seq.current) setError(e?.message || '加载失败');
      } finally {
        if (myseq === seq.current) setLoadingList(false);
      }
    },
    [site]
  );

  // 分类变化时加载第一页
  useEffect(() => {
    if (!site || !type) return;
    loadList(type, 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.key, type]);

  const head = (
    <div className="browse-head">
      <div className="site-picker">
        <select
          className="select"
          value={site?.key || ''}
          onChange={(e) => setSiteKey(e.target.value)}
        >
          {supported.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="cat-scroll">
        {loadingCats ? (
          <span className="muted">分类加载中…</span>
        ) : (
          cats.map((c) => (
            <button
              key={c.type_id}
              className={'chip ' + (c.type_id === type ? 'chip-active' : '')}
              onClick={() => setType(c.type_id)}
            >
              {c.type_name || '未命名'}
            </button>
          ))
        )}
      </div>
    </div>
  );

  if (!ready || loadingSites) {
    return (
      <div className="page">
        <div className="page-inner">
          <Spinner label="正在加载站点…" />
        </div>
      </div>
    );
  }

  if (supported.length === 0) {
    return (
      <div className="page">
        <div className="page-inner">
          <Empty
            icon="folder"
            title="还没有可用站点"
            desc="请到「源管理」添加影视仓/TVBox 配置地址，或直接使用内置演示源浏览与播放"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {head}
      <div className="page-inner browse-body">
        {error && (
          <div className="inline-error">
            <Icon name="warn" size={16} /> {error}
          </div>
        )}
        {loadingList && items.length === 0 && <CardSkeleton n={12} />}
        {!loadingList && items.length === 0 && !error && (
          <Empty icon="film" title="暂无内容" desc="该分类下暂时没有影片，换个分类试试" />
        )}
        {items.length > 0 && (
          <div className="grid">
            {items.map((v) => (
              <VideoCard
                key={(v.siteKey || '') + '::' + v.id}
                vod={v}
                onOpen={(vod) => site && openDetail(vod, site)}
              />
            ))}
          </div>
        )}
        {items.length > 0 && page < pagecount && (
          <div className="load-more">
            <button
              className="btn"
              disabled={loadingList}
              onClick={() => loadList(type, page + 1, true)}
            >
              {loadingList ? '加载中…' : `加载更多（${page}/${pagecount}）`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
