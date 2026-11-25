import React, { useCallback, useEffect, useState } from 'react';
import type { DiscoverItem } from '../../lib/discoverApi';
import { doubanImg } from '../../lib/discoverApi';
import { useStore } from '../../lib/store';
import { Icon } from '../Icon';
import { ratingText } from './DoubanCard';
import { useWatchlist } from './watchlist';
import '../../styles/discover.css';

const INTERVAL = 6500;

function metaOf(it: DiscoverItem): string[] {
  return [
    it.year,
    it.region,
    (it.genres || []).slice(0, 3).join(' / '),
    it.episodes,
  ].filter(Boolean) as string[];
}

/** 首页 Hero 轮播：自动轮播 + 指示器 + 左右切换，悬停暂停 */
export function HeroCarousel({
  items,
  onOpen,
}: {
  items: DiscoverItem[];
  onOpen: (it: DiscoverItem) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const { has, toggle } = useWatchlist();
  const { notify } = useStore();
  const n = items.length;

  const go = useCallback((d: number) => setIdx((i) => (i + d + n) % n), [n]);

  useEffect(() => {
    if (paused || n < 2) return;
    const t = setTimeout(() => go(1), INTERVAL);
    return () => clearTimeout(t);
  }, [idx, paused, n, go]);

  if (!n) return null;
  const cur = items[idx];
  const wished = has(cur.id);

  return (
    <div
      className={'hero ' + (paused ? 'is-paused' : '')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((it, i) => (
        <div key={it.id} className={'hero-bg ' + (i === idx ? 'active' : '')} aria-hidden>
          <div className="hero-bg-img" style={{ backgroundImage: `url("${doubanImg(it.cover)}")` }} />
        </div>
      ))}
      <div className="hero-shade" />

      <div className="hero-content" key={cur.id}>
        <div className="hero-text">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            豆瓣热播 · {cur.kind === 'movie' ? '电影' : '剧集 / 综艺'}
            {cur.isNew && <span className="hero-new">NEW</span>}
          </div>
          <h1 className="hero-title">{cur.title}</h1>
          <div className="hero-meta">
            <span className="hero-score">
              <Icon name="star" size={15} /> {ratingText(cur.rating)}
            </span>
            {metaOf(cur).map((m, i) => (
              <span key={i} className="hero-meta-item">
                {m}
              </span>
            ))}
          </div>
          {cur.intro && <p className="hero-intro">{cur.intro}</p>}
          {!!(cur.actors && cur.actors.length) && (
            <div className="hero-cast">主演：{cur.actors.join(' / ')}</div>
          )}
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg hero-play" onClick={() => onOpen(cur)}>
              <Icon name="play" size={18} /> 立即观看
            </button>
            <button
              className={'btn btn-lg hero-glass ' + (wished ? 'is-on' : '')}
              onClick={() => {
                const on = toggle(cur);
                notify(on ? `已加入想看：${cur.title}` : `已移出想看：${cur.title}`, 'success');
              }}
            >
              <Icon name={wished ? 'check' : 'plus'} size={18} /> {wished ? '已想看' : '想看'}
            </button>
          </div>
        </div>
        <div className="hero-poster" onClick={() => onOpen(cur)}>
          <img src={doubanImg(cur.cover)} alt={cur.title} draggable={false} />
        </div>
      </div>

      {n > 1 && (
        <>
          <button className="hero-arrow left" onClick={() => go(-1)} aria-label="上一部">
            <Icon name="back" size={22} />
          </button>
          <button className="hero-arrow right" onClick={() => go(1)} aria-label="下一部">
            <Icon name="chevron" size={22} />
          </button>
          <div className="hero-dots">
            {items.map((it, i) => (
              <button
                key={it.id}
                className={'hero-dot ' + (i === idx ? 'active' : '')}
                onClick={() => setIdx(i)}
                aria-label={it.title}
              >
                <i style={{ animationDuration: INTERVAL + 'ms' }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="hero hero-skeleton">
      <div className="hero-content">
        <div className="hero-text">
          <div className="sk-line" style={{ width: 140, height: 22 }} />
          <div className="sk-line" style={{ width: 360, height: 46, marginTop: 18 }} />
          <div className="sk-line" style={{ width: 280, height: 14, marginTop: 18 }} />
          <div className="sk-line" style={{ width: '80%', height: 12, marginTop: 18 }} />
          <div className="sk-line" style={{ width: '70%', height: 12 }} />
        </div>
        <div className="hero-poster sk-poster" />
      </div>
    </div>
  );
}
