import React, { useState } from 'react';
import type { DiscoverItem } from '../../lib/discoverApi';
import { doubanImg } from '../../lib/discoverApi';
import { Icon } from '../Icon';
import '../../styles/discover.css';

/** 副标题：优先集数信息，其次 年份 · 地区 · 类型 */
export function itemSubtitle(it: DiscoverItem): string {
  if (it.episodes) return [it.year, it.episodes].filter(Boolean).join(' · ');
  return [it.year, it.region, it.genres && it.genres[0]].filter(Boolean).join(' · ') || '豆瓣热播';
}

export function ratingText(r: number): string {
  return r > 0 ? r.toFixed(1) : '暂无';
}

export function DoubanCard({
  item,
  onOpen,
  rank,
}: {
  item: DiscoverItem;
  onOpen: (it: DiscoverItem) => void;
  rank?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="dcard" onClick={() => onOpen(item)} title={item.title}>
      <div className="dcard-poster">
        {!failed && item.cover ? (
          <img
            src={doubanImg(item.cover)}
            alt={item.title}
            loading="lazy"
            draggable={false}
            className={loaded ? 'is-loaded' : ''}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="dcard-fallback">{item.title.slice(0, 1)}</div>
        )}
        {!loaded && !failed && <div className="dcard-shimmer" />}
        <span className={'dcard-rate ' + (item.rating >= 8 ? 'is-high' : '')}>
          {item.rating > 0 ? '★ ' + ratingText(item.rating) : '暂无评分'}
        </span>
        {item.isNew && <span className="dcard-new">新</span>}
        {rank !== undefined && rank < 10 && <span className="dcard-rank">{rank + 1}</span>}
        <div className="dcard-hover">
          <span className="dcard-play">
            <Icon name="play" size={22} />
          </span>
          <span className="dcard-hover-text">找资源播放</span>
        </div>
      </div>
      <div className="dcard-title">{item.title}</div>
      <div className="dcard-sub">{itemSubtitle(item)}</div>
    </div>
  );
}

export function DoubanCardSkeleton() {
  return (
    <div className="dcard is-skeleton">
      <div className="dcard-poster sk-poster" />
      <div className="sk-line" style={{ width: '78%' }} />
      <div className="sk-line" style={{ width: '46%' }} />
    </div>
  );
}
