import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useStore, vodKey } from '../lib/store';
import { useNav } from '../lib/nav';
import type { DetailView } from '../lib/nav';
import type { Vod } from '../types';
import { Icon } from '../components/Icon';
import { Poster } from '../components/Poster';
import { firstPlayableGroup } from '../lib/api';
import { Spinner } from '../components/Toasts';

function stripHtml(s: string) {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function DetailPage() {
  const { view, back, play } = useNav();
  const dv = view as DetailView;
  const site = dv.site;
  const { isFav, toggleFav, notify } = useStore();
  const [full, setFull] = useState<Vod>(dv.vod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gi, setGi] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .detail(site, dv.vod.id)
      .then((r: any) => {
        if (!alive) return;
        const found: Vod | undefined = (r.list || [])[0];
        if (found) {
          setFull({ ...dv.vod, ...found, siteKey: site.key, siteName: site.name });
          const g = firstPlayableGroup(found);
          setGi(g >= 0 ? g : 0);
        } else {
          setFull({ ...dv.vod, siteKey: site.key, siteName: site.name });
        }
      })
      .catch((e) => alive && setError(e?.message || '详情加载失败'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dv.vod.id, site.key]);

  const groups = full.groups || [];
  const group = groups[gi];
  const fav = isFav(vodKey(full));

  const meta = useMemo(() => {
    const m: string[] = [];
    if (full.year) m.push(full.year);
    if (full.area) m.push(full.area);
    if (full.typeName) m.push(full.typeName);
    if (full.remarks) m.push(full.remarks);
    return m;
  }, [full]);

  const startPlay = (g: number, e: number) => {
    if (!groups[g] || !groups[g].episodes[e]) {
      notify('该线路暂无可播放的剧集', 'error');
      return;
    }
    play(full, g, e);
  };

  return (
    <div className="page detail-page">
      <div className="detail-topbar">
        <button className="btn btn-ghost" onClick={back}>
          <Icon name="back" size={18} /> 返回
        </button>
      </div>

      <div className="detail-hero">
        <div className="detail-poster">
          <Poster src={full.pic} alt={full.name} ratio="2 / 3" />
        </div>
        <div className="detail-info">
          <h1 className="detail-title">{full.name}</h1>
          <div className="detail-meta">
            {full.score && (
              <span className="score-badge">
                <Icon name="star" size={14} /> {full.score}
              </span>
            )}
            {meta.map((t, i) => (
              <span className="meta-chip" key={i}>
                {t}
              </span>
            ))}
            <span className="meta-chip source-chip">
              <Icon name="link" size={12} /> {site.name}
            </span>
          </div>
          {loading ? (
            <div className="detail-loading">
              <Spinner label="正在获取播放地址…" />
            </div>
          ) : (
            <p className="detail-content">{stripHtml(full.content) || '暂无简介'}</p>
          )}
          <div className="detail-actions">
            <button
              className="btn btn-primary btn-lg"
              disabled={groups.length === 0}
              onClick={() => {
                const g = firstPlayableGroup(full);
                startPlay(g >= 0 ? g : 0, 0);
              }}
            >
              <Icon name="play" size={20} /> 立即播放
            </button>
            <button
              className={'btn btn-lg ' + (fav ? 'btn-fav-on' : '')}
              onClick={() => toggleFav(full)}
            >
              <Icon name="heart" size={18} /> {fav ? '已收藏' : '收藏'}
            </button>
          </div>
          {error && (
            <div className="inline-error">
              <Icon name="warn" size={16} /> {error}
            </div>
          )}
        </div>
      </div>

      <div className="detail-player">
        {groups.length === 0 ? (
          <div className="detail-nogroups">
            <Icon name="warn" size={22} />
            <div>
              该站点未返回播放地址。影视仓的多数站点为 JS 解析型，本客户端当前支持 CMS 直链站点与内置演示源。
              请尝试在「源管理」切换其他站点，或使用演示源体验播放。
            </div>
          </div>
        ) : (
          <>
            <div className="section-title">
              <Icon name="grid" size={18} /> 播放源 / 选集
              <span className="muted small">共 {groups.length} 条线路</span>
            </div>
            <div className="source-tabs">
              {groups.map((g, i) => (
                <button
                  key={i}
                  className={'chip ' + (i === gi ? 'chip-active' : '')}
                  onClick={() => setGi(i)}
                >
                  {g.from}（{g.episodes.length}）
                </button>
              ))}
            </div>
            <div className="ep-grid">
              {group?.episodes.map((ep, i) => (
                <button key={i} className="ep-btn" onClick={() => startPlay(gi, i)} title={ep.url}>
                  {ep.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
