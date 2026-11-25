/*
 * 最近访问的视频流域名 + 一键复制 Clash 分流规则
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { copyText, networkApi, ROUTE_LABEL, type HostRecord } from '../../lib/networkApi';
import { NetBadge, NetIcon, fmtAgo, statusTone } from './netUi';

const MAX_ROWS = 50;

function HostRow({ h }: { h: HostRecord }) {
  return (
    <div className="net-host-row">
      <div className="net-host-main">
        <div className="net-host-name" title={h.host}>
          {h.host}
        </div>
        <div className="net-host-sub">
          规则域名 {h.suffix} · {h.count} 次{h.fails ? ` · 失败 ${h.fails}` : ''} · {fmtAgo(h.lastAt)}
        </div>
      </div>
      {h.lastRoute && <span className="net-host-route">{ROUTE_LABEL[h.lastRoute] || h.lastRoute}</span>}
      <NetBadge tone={statusTone(h.lastStatus, h.lastError)}>
        {h.lastStatus ? h.lastStatus : '错误'}
      </NetBadge>
    </div>
  );
}

export function NetHosts() {
  const { notify } = useStore();
  const [list, setList] = useState<HostRecord[]>([]);
  const [rules, setRules] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await networkApi.hosts();
      setList(d.list);
      setRules(d.rules);
    } catch (e: any) {
      notify('读取域名记录失败：' + (e?.message || e), 'error');
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    if (!rules) return notify('暂无可导出的域名', 'info');
    await copyText(rules);
    notify('已复制 ' + rules.split('\n').length + ' 条 Clash 规则', 'success');
  };

  const clear = async () => {
    await networkApi.clearHosts();
    await load();
    notify('已清空域名记录', 'info');
  };

  return (
    <div className="card net-card">
      <div className="net-card-head">
        <div>
          <div className="net-card-title">
            <NetIcon name="globe" size={17} /> 最近访问的视频域名
            <span className="net-count">{list.length}</span>
          </div>
          <div className="settings-desc">
            想在 VPN 端解决？把规则粘贴到 Clash / mihomo 配置的 <code>rules:</code> 最前面（或覆写脚本），
            这些域名就会直连，无需在本应用切换模式。
          </div>
        </div>
        <div className="net-head-actions">
          <button className="icon-btn" title="刷新" onClick={load}>
            <NetIcon name="refresh" size={16} />
          </button>
          <button className="icon-btn danger" title="清空" onClick={clear} disabled={!list.length}>
            <NetIcon name="trash" size={16} />
          </button>
          <button className="btn btn-sm" onClick={copy} disabled={!list.length}>
            <NetIcon name="copy" size={14} /> 复制 Clash 规则
          </button>
        </div>
      </div>
      {list.length ? (
        <div className="net-host-list">
          {list.slice(0, MAX_ROWS).map((h) => (
            <HostRow key={h.host} h={h} />
          ))}
        </div>
      ) : (
        <div className="net-empty">播放视频后，这里会列出访问过的视频 / 图片域名及最近状态码</div>
      )}
      {!!rules && <pre className="net-rules">{rules.split('\n').slice(0, 6).join('\n') + (rules.split('\n').length > 6 ? '\n…' : '')}</pre>}
    </div>
  );
}
