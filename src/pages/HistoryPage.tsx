import React from 'react';
import { useStore, vodKey } from '../lib/store';
import { useNav } from '../lib/nav';
import { Icon } from '../components/Icon';
import { Poster } from '../components/Poster';
import { Empty } from '../components/Toasts';
import type { Hist } from '../types';

function progressPct(h: Hist) {
  if (!h.duration || h.duration <= 0) return 0;
  return Math.max(2, Math.min(100, (h.position / h.duration) * 100));
}
function timeAgo(ts: number) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const day = Math.floor(h / 24);
  if (day < 30) return day + ' 天前';
  return new Date(ts).toLocaleDateString();
}

export function HistoryPage() {
  const { state, clearHistory } = useStore();
  const { openDetail, play } = useNav();

  if (state.history.length === 0) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-head">
            <h1 className="page-title">观看记录</h1>
          </div>
          <Empty icon="clock" title="还没有观看记录" desc="开始观看后，这里会记录你的播放进度，方便继续观看" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1 className="page-title">观看记录</h1>
          <button className="btn btn-sm" onClick={() => confirm('确定清空全部观看记录？') && clearHistory()}>
            <Icon name="trash" size={15} /> 清空
          </button>
        </div>
        <div className="hist-list">
          {state.history.map((h) => {
            const pct = progressPct(h);
            return (
              <div className="hist-item" key={h.key}>
                <div
                  className="hist-poster"
                  onClick={() => {
                    const v: any = {
                      id: h.vodId,
                      name: h.name,
                      pic: h.pic,
                      remarks: '',
                      year: '',
                      area: '',
                      typeName: '',
                      score: '',
                      actor: '',
                      director: '',
                      content: '',
                      groups: h.groups || [],
                      siteKey: h.siteKey,
                      siteName: h.siteName,
                    };
                    openDetail(v, h.site);
                  }}
                >
                  <Poster src={h.pic} alt={h.name} ratio="16 / 9" />
                  <span className="hist-time">{timeAgo(h.updatedAt)}</span>
                  {pct > 0 && (
                    <div className="hist-progress">
                      <span style={{ width: pct + '%' }} />
                    </div>
                  )}
                </div>
                <div className="hist-info">
                  <div className="hist-name">{h.name}</div>
                  <div className="hist-sub">
                    {h.siteName} · {h.epName}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => play({ id: h.vodId, name: h.name, pic: h.pic, groups: h.groups, siteKey: h.siteKey, siteName: h.siteName } as any, h.groupIndex, h.epIndex)}
                  >
                    <Icon name="play" size={14} /> 继续观看
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
