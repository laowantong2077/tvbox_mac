import React from 'react';
import type { Vod } from '../types';
import { Poster } from './Poster';
import { Icon } from './Icon';

export function VideoCard({
  vod,
  onOpen,
  showSite = false,
  referer = '',
}: {
  vod: Vod;
  onOpen: (v: Vod) => void;
  showSite?: boolean;
  referer?: string;
}) {
  return (
    <div className="vcard" onClick={() => onOpen(vod)} title={vod.name}>
      <div className="vcard-poster">
        <Poster src={vod.pic} alt={vod.name} referer={referer} />
        {vod.remarks && <span className="vcard-remarks">{vod.remarks}</span>}
        {Number(vod.score) > 0 && <span className="vcard-score">★ {vod.score}</span>}
        <div className="vcard-hover">
          <span className="vcard-play">
            <Icon name="play" size={22} />
          </span>
        </div>
      </div>
      <div className="vcard-title">{vod.name}</div>
      <div className="vcard-sub">
        {showSite && vod.siteName ? (
          <span className="vcard-site">{vod.siteName}</span>
        ) : (
          <span>
            {vod.year ? vod.year + ' · ' : ''}
            {vod.typeName || vod.area || '影视'}
          </span>
        )}
      </div>
    </div>
  );
}

export function CardSkeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: n }).map((_, i) => (
        <div className="vcard skeleton" key={i}>
          <div className="vcard-poster sk-poster" />
          <div className="sk-line" style={{ width: '80%' }} />
          <div className="sk-line" style={{ width: '50%' }} />
        </div>
      ))}
    </div>
  );
}
