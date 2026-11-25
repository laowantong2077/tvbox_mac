import React, { useState } from 'react';
import { img } from '../lib/api';

export function Poster({
  src,
  alt,
  referer = '',
  className = '',
  ratio = '2 / 3',
}: {
  src?: string;
  alt?: string;
  referer?: string;
  className?: string;
  ratio?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = img(src, referer);
  const showFallback = !url || failed;
  return (
    <div className={'poster ' + className} style={{ aspectRatio: ratio }}>
      {!showFallback && (
        <img
          src={url}
          alt={alt || ''}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
      {showFallback && (
        <div className="poster-fallback">
          <span>{(alt || '影').slice(0, 1)}</span>
        </div>
      )}
    </div>
  );
}
