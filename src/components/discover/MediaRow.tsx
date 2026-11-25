import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { DoubanCardSkeleton } from './DoubanCard';
import '../../styles/discover.css';

const SCROLL_RATIO = 0.85;
const EDGE_EPS = 4;

/**
 * 横向滚动推荐行：左右箭头按钮 + 边缘渐隐 + 「查看全部」
 * children 为卡片列表（DoubanCard / VideoCard 均可）
 */
export function MediaRow({
  title,
  sub,
  onMore,
  children,
  loading = false,
}: {
  title: string;
  sub?: string;
  onMore?: () => void;
  children?: React.ReactNode;
  loading?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      left: el.scrollLeft > EDGE_EPS,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_EPS,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children, loading]);

  const scrollBy = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * SCROLL_RATIO, behavior: 'smooth' });
  };

  return (
    <section className="mrow">
      <div className="mrow-head">
        <div className="mrow-titles">
          <h3 className="mrow-title">{title}</h3>
          {sub && <span className="mrow-sub">{sub}</span>}
        </div>
        {onMore && (
          <button className="mrow-more" onClick={onMore}>
            查看全部 <Icon name="chevron" size={14} />
          </button>
        )}
      </div>
      <div
        className={
          'mrow-body ' + (edge.left ? 'fade-left ' : '') + (edge.right ? 'fade-right' : '')
        }
      >
        {edge.left && (
          <button className="mrow-arrow left" onClick={() => scrollBy(-1)} aria-label="向左">
            <Icon name="back" size={20} />
          </button>
        )}
        <div className="mrow-track" ref={ref} onScroll={update}>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <DoubanCardSkeleton key={i} />)
            : children}
        </div>
        {edge.right && (
          <button className="mrow-arrow right" onClick={() => scrollBy(1)} aria-label="向右">
            <Icon name="chevron" size={20} />
          </button>
        )}
      </div>
    </section>
  );
}
