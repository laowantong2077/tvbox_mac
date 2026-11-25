// 在线弹幕面板：按片名搜索 → 选择候选 → 按集加载；记住匹配关系
import React, { useEffect, useState } from 'react';
import { useCtl } from './ctl';
import { PIcon } from './icons';

function Status() {
  const { dm } = useCtl();
  const s = dm.status;
  if (!s.msg) return null;
  return (
    <div className={'sxp-dm-status ' + s.state}>
      {s.state === 'loading' && <span className="sxp-mini-spin" />}
      {s.msg}
    </div>
  );
}

function MatchInfo() {
  const { dm } = useCtl();
  if (!dm.match) return null;
  return (
    <div className="sxp-dm-match">
      <div className="sxp-dm-match-head">
        <div>
          <div className="sxp-dm-match-label">当前匹配 · B站</div>
          <div className="sxp-dm-match-title">{dm.match.title}</div>
        </div>
        <button className="sxp-btn sxp-btn-sm" onClick={dm.unmatch}>
          取消匹配
        </button>
      </div>
      {dm.episodes.length > 1 && (
        <div className="sxp-dm-eps">
          {dm.episodes.map((ep) => (
            <button
              key={ep.id}
              className={'sxp-chip' + (dm.current?.id === ep.id ? ' active' : '')}
              title={ep.title}
              onClick={() => dm.loadComments(dm.match!.source, ep)}
            >
              {ep.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DanmakuPanel({ vodName }: { vodName: string }) {
  const { dm, open } = useCtl();
  const [kw, setKw] = useState(vodName);

  // 打开面板时若还没有候选，按片名自动搜索
  useEffect(() => {
    if (!dm.results.length && !dm.match) dm.search(vodName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sxp-pop sxp-dm-panel" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="sxp-pop-head">
        <div className="sxp-pop-title">在线弹幕</div>
        <button className="sxp-pop-close" onClick={() => open(null)} aria-label="关闭">
          <PIcon name="close" size={16} />
        </button>
      </div>
      <div className="sxp-pop-body">
        <div className="sxp-block-input">
          <input value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && dm.search(kw)} placeholder="输入片名搜索" />
          <button className="sxp-btn sxp-btn-primary" onClick={() => dm.search(kw)}>
            <PIcon name="search" size={15} />
            搜索
          </button>
        </div>
        <Status />
        <MatchInfo />
        <div className="sxp-dm-results">
          {dm.results.map((r) => (
            <button key={r.id} className={'sxp-dm-result' + (dm.match?.id === r.id ? ' active' : '')} onClick={() => dm.choose(r)}>
              <span className={'sxp-dm-kind k-' + (r.kind === '视频' ? 'video' : 'media')}>{r.kind}</span>
              <span className="sxp-dm-rtitle">{r.title}</span>
              <span className="sxp-dm-rmeta">{r.epCount ? r.epCount + ' 集' : r.author || ''}</span>
            </button>
          ))}
        </div>
        <div className="sxp-tip">数据来源：B 站公开弹幕。匹配关系按片名记忆，切换集数会自动加载对应集弹幕。</div>
      </div>
    </div>
  );
}
