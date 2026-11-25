import React from 'react';
import { useStore, vodKey } from '../lib/store';
import { useNav } from '../lib/nav';
import { Icon } from '../components/Icon';
import { VideoCard } from '../components/VideoCard';
import { Empty } from '../components/Toasts';
import type { Vod } from '../types';

export function FavoritesPage() {
  const { state, toggleFav } = useStore();
  const { openDetail } = useNav();

  const toVod = (f: any): Vod => ({
    id: f.vodId,
    name: f.name,
    pic: f.pic,
    remarks: f.remarks,
    year: f.year,
    area: '',
    typeName: '',
    score: '',
    actor: '',
    director: '',
    content: '',
    groups: [],
    siteKey: f.siteKey,
    siteName: f.siteName,
  });

  if (state.favorites.length === 0) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-head">
            <h1 className="page-title">我的收藏</h1>
          </div>
          <Empty icon="heart" title="还没有收藏" desc="在详情页点击「收藏」，喜欢的影片会出现在这里" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1 className="page-title">我的收藏</h1>
          <span className="muted">共 {state.favorites.length} 部</span>
        </div>
        <div className="grid">
          {state.favorites.map((f) => {
            const v = toVod(f);
            return (
              <div className="fav-wrap" key={f.key}>
                <VideoCard
                  vod={v}
                  showSite
                  onOpen={() => openDetail(v, f.site)}
                />
                <button
                  className="fav-remove"
                  title="取消收藏"
                  onClick={() => toggleFav(v)}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
