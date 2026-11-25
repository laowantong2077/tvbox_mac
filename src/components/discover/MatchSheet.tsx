import React, { useEffect, useMemo, useState } from 'react';
import type { DiscoverItem, Subject } from '../../lib/discoverApi';
import { discoverApi, doubanImg } from '../../lib/discoverApi';
import { useNav } from '../../lib/nav';
import { useStore } from '../../lib/store';
import { Icon } from '../Icon';
import { Poster } from '../Poster';
import { ratingText } from './DoubanCard';
import { useMatchSearch, type MatchHit } from './useMatchSearch';
import '../../styles/discover.css';

/** 资源匹配浮层：左侧豆瓣信息，右侧各站点匹配结果 */
export function MatchSheet({ item }: { item: DiscoverItem }) {
  const { closeMatch, openDetail, reset } = useNav();
  const { sites } = useStore();
  const [subject, setSubject] = useState<Subject | null>(null);
  const targets = useMemo(() => sites.filter((s) => s.supported && s.searchable !== 0), [sites]);
  const year = subject?.year || item.year;
  const { hits, done, total, finished, failed } = useMatchSearch(item.title, year, targets);

  useEffect(() => {
    let alive = true;
    discoverApi
      .subject(item.id, item.kind)
      .then((s) => alive && setSubject(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [item.id, item.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMatch();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeMatch]);

  const goto = (target: Parameters<typeof reset>[0]) => {
    closeMatch();
    reset(target);
  };

  return (
    <div className="msheet-mask" onMouseDown={(e) => e.target === e.currentTarget && closeMatch()}>
      <div className="msheet" role="dialog" aria-label="选择播放源">
        <div className="msheet-bg" style={{ backgroundImage: `url("${doubanImg(item.cover)}")` }} />
        <button className="msheet-close icon-btn" onClick={closeMatch} title="关闭 (Esc)">
          <Icon name="close" size={18} />
        </button>
        <InfoPane item={item} subject={subject} />
        <div className="msheet-right">
          <div className="msheet-head">
            <div>
              <div className="msheet-title">选择播放源</div>
              <div className="msheet-progress">
                {total === 0
                  ? '暂无可搜索的站点'
                  : finished
                  ? `已搜索 ${total} 个站点，找到 ${hits.length} 个匹配${failed ? `（${failed} 个站点失败）` : ''}`
                  : `正在 ${total} 个站点中搜索「${item.title}」… ${done}/${total}`}
              </div>
            </div>
            {!finished && total > 0 && <div className="spinner msheet-spin" />}
          </div>
          {total > 0 && (
            <div className="msheet-bar">
              <i style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
            </div>
          )}
          <div className="msheet-list">
            {hits.map((h, i) => (
              <HitRow key={h.site.key + '::' + h.vod.id + '::' + i} hit={h} onOpen={() => openDetail(h.vod, h.site)} />
            ))}
            {!finished && hits.length < 3 && total > 0 &&
              Array.from({ length: 3 - hits.length }).map((_, i) => <div className="mhit is-skeleton" key={'sk' + i} />)}
            {finished && hits.length === 0 && (
              <MatchEmpty
                noSites={total === 0}
                title={item.title}
                onSources={() => goto('sources')}
                onSearch={() => goto({ name: 'search', keyword: item.title })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoPane({ item, subject }: { item: DiscoverItem; subject: Subject | null }) {
  const s = subject;
  const meta = [s?.year || item.year, (s?.countries || [item.region]).filter(Boolean).join(' / '), (s?.genres || item.genres || []).join(' / ')].filter(Boolean);
  return (
    <div className="msheet-left">
      <div className="msheet-poster">
        <Poster src={item.cover} alt={item.title} referer="https://movie.douban.com/" />
      </div>
      <div className="msheet-name">{item.title}</div>
      {s?.originalTitle && s.originalTitle !== item.title && <div className="msheet-orig">{s.originalTitle}</div>}
      <div className="msheet-rating">
        <span className={'msheet-score ' + ((s?.rating ?? item.rating) > 0 ? '' : 'is-none')}>
          {(s?.rating ?? item.rating) > 0 ? ratingText(s?.rating ?? item.rating) : '暂无评分'}
        </span>
        <span className="msheet-stars">
          <Stars value={s?.rating ?? item.rating} />
          <em>{s?.ratingCount ? `${s.ratingCount.toLocaleString()} 人评价` : '豆瓣评分'}</em>
        </span>
      </div>
      <div className="msheet-meta">{meta.join(' · ')}</div>
      {(s?.episodes || item.episodes) && <div className="msheet-meta">{s?.episodes || item.episodes}</div>}
      {s ? (
        <>
          {s.directors.length > 0 && <InfoLine label="导演" value={s.directors.join(' / ')} />}
          {s.actors.length > 0 && <InfoLine label="主演" value={s.actors.slice(0, 6).join(' / ')} />}
          {s.intro && <p className="msheet-intro">{s.intro}</p>}
        </>
      ) : (
        <div className="msheet-intro-sk">
          <div className="sk-line" style={{ width: '90%' }} />
          <div className="sk-line" style={{ width: '75%' }} />
          <div className="sk-line" style={{ width: '82%' }} />
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="msheet-line">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 10));
  return (
    <span className="stars" aria-hidden>
      <span className="stars-base">★★★★★</span>
      <span className="stars-fill" style={{ width: pct + '%' }}>★★★★★</span>
    </span>
  );
}

function HitRow({ hit, onOpen }: { hit: MatchHit; onOpen: () => void }) {
  const { vod, site, score } = hit;
  const level = score >= 0.95 ? 'best' : score >= 0.75 ? 'good' : 'fair';
  return (
    <button className="mhit" onClick={onOpen}>
      <div className="mhit-poster">
        <Poster src={vod.pic} alt={vod.name} />
      </div>
      <div className="mhit-body">
        <div className="mhit-name">{vod.name}</div>
        <div className="mhit-sub">
          {[vod.year, vod.typeName, vod.area].filter(Boolean).join(' · ') || '影视资源'}
        </div>
        <div className="mhit-tags">
          <span className="mhit-site">{site.name}</span>
          {vod.remarks && <span className="mhit-remark">{vod.remarks}</span>}
        </div>
      </div>
      <span className={'mhit-score ' + level}>
        {level === 'best' ? '精确匹配' : level === 'good' ? '高度相似' : '可能相关'}
      </span>
      <span className="mhit-go">
        <Icon name="play" size={16} />
      </span>
    </button>
  );
}

function MatchEmpty({
  noSites,
  title,
  onSources,
  onSearch,
}: {
  noSites: boolean;
  title: string;
  onSources: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="mempty">
      <div className="mempty-art">
        <span className="mempty-ring" />
        <span className="mempty-ring r2" />
        <Icon name={noSites ? 'folder' : 'search'} size={34} />
      </div>
      <div className="mempty-title">{noSites ? '还没有可用的播放源' : `暂未找到「${title}」的资源`}</div>
      <div className="mempty-desc">
        {noSites
          ? '添加一个 TVBox 配置地址后，即可在各站点中自动匹配播放资源。'
          : '当前源里的站点没有收录这部作品。可以添加更多配置源，或换个关键词手动搜索。'}
      </div>
      <div className="mempty-actions">
        <button className="btn btn-primary" onClick={onSources}>
          <Icon name="plus" size={16} /> 去源管理添加源
        </button>
        {!noSites && (
          <button className="btn btn-ghost" onClick={onSearch}>
            <Icon name="search" size={16} /> 手动搜索
          </button>
        )}
      </div>
    </div>
  );
}
