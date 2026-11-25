// 右侧选集抽屉：线路切换 + 剧集网格（自动滚动到当前集）
import React, { useEffect, useRef, useState } from 'react';
import type { PlayGroup } from '../../types';
import { useCtl } from './ctl';
import { PIcon } from './icons';

interface Props {
  title: string;
  groups: PlayGroup[];
  gi: number;
  ei: number;
  onSelect: (g: number, e: number) => void;
}

export function EpisodeDrawer({ title, groups, gi, ei, onSelect }: Props) {
  const { open } = useCtl();
  const [viewG, setViewG] = useState(gi);
  const listRef = useRef<HTMLDivElement>(null);
  const group = groups[viewG];

  useEffect(() => {
    const el = listRef.current?.querySelector('.active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' });
  }, [viewG]);

  return (
    <div className="sxp-drawer" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="sxp-drawer-head">
        <div>
          <div className="sxp-drawer-title">选集</div>
          <div className="sxp-drawer-sub">
            {title} · 共 {group?.episodes.length || 0} 集
          </div>
        </div>
        <button className="sxp-pop-close" onClick={() => open(null)} aria-label="关闭">
          <PIcon name="close" size={16} />
        </button>
      </div>
      {groups.length > 1 && (
        <div className="sxp-drawer-lines">
          <div className="sxp-drawer-label">线路</div>
          <div className="sxp-chips">
            {groups.map((g, i) => (
              <button key={i} className={'sxp-chip' + (i === viewG ? ' active' : '')} onClick={() => setViewG(i)}>
                {g.from}
                {i === gi && <i className="sxp-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sxp-drawer-list" ref={listRef}>
        {group?.episodes.map((ep, i) => {
          const active = viewG === gi && i === ei;
          return (
            <button key={i} className={'sxp-ep' + (active ? ' active' : '')} title={ep.name} onClick={() => onSelect(viewG, i)}>
              {active && <span className="sxp-ep-bars"><i /><i /><i /></span>}
              {ep.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
