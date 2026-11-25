import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import type { Source, Warehouse } from '../types';

export function SourcesPage() {
  const { state, saveSource, removeSource, activate, notify } = useStore();
  const { reset } = useNav();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const add = async () => {
    const u = url.trim();
    if (!u) return notify('请填写配置地址', 'error');
    let configUrl = u;
    if (!/^https?:\/\//i.test(configUrl)) configUrl = 'http://' + configUrl;
    setBusy(true);
    try {
      const cfg: any = await api.loadConfig(configUrl);
      if (cfg.kind === 'multi') {
        const src: Source = {
          id: 'src_' + Date.now(),
          name: name.trim() || '多仓配置（' + (cfg.warehouses?.length || 0) + ' 个仓）',
          url: configUrl,
          kind: 'multi',
          addedAt: Date.now(),
          warehouses: cfg.warehouses || [],
        };
        saveSource(src);
      } else {
        const src: Source = {
          id: 'src_' + Date.now(),
          name: name.trim() || '单仓配置',
          url: configUrl,
          kind: 'single',
          addedAt: Date.now(),
          stats: cfg.stats,
        };
        saveSource(src);
        if (cfg.stats && cfg.stats.supported === 0) {
          notify('该配置里的站点多为 JS 爬虫型，暂无可直接浏览的站点', 'info');
        }
      }
      setUrl('');
      setName('');
    } catch (e: any) {
      notify('加载配置失败：' + (e?.message || e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = () => {
    notify('内置演示源已默认启用，无需添加', 'success');
    reset('browse');
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">源管理</h1>
            <p className="page-desc">
              添加影视仓 / TVBox 配置地址（多仓或单仓）。本客户端当前支持 CMS 直链站点（type 0/1）与内置演示源。
            </p>
          </div>
        </div>

        <div className="card add-source">
          <div className="add-source-title">
            <Icon name="plus" size={18} /> 添加配置源
          </div>
          <div className="add-source-row">
            <input
              className="input"
              placeholder="配置名称（可选）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: 200 }}
            />
            <input
              className="input"
              placeholder="配置地址，例如 http://www.xxx.com/api.json 或 https://…/tvboxmuti.json"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <button className="btn btn-primary" disabled={busy} onClick={add}>
              {busy ? '加载中…' : '添加'}
            </button>
          </div>
          <div className="add-source-hint">
            <Icon name="info" size={14} />
            支持多仓（{"{ urls: [...] }"}）与单仓（{"{ sites: [...] }"}）两种格式。
            <button className="link-btn" onClick={loadDemo}>
              使用内置演示源体验 →
            </button>
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 28 }}>
          <Icon name="folder" size={18} /> 已添加的源（{state.sources.length}）
        </div>

        {state.sources.length === 0 && (
          <div className="card empty-mini">
            <Icon name="folder" size={26} />
            <div>还没有添加任何配置源。内置演示源始终可用，可在「浏览」中体验。</div>
          </div>
        )}

        <div className="source-list">
          {state.sources.map((s) => {
            const active = s.id === state.activeSourceId;
            const isExp = expanded === s.id;
            return (
              <div className={'card source-item ' + (active ? 'source-active' : '')} key={s.id}>
                <div className="source-row">
                  <div className={'source-dot ' + (active ? 'on' : '')} />
                  <div className="source-main">
                    <div className="source-name">
                      {s.name}
                      <span className={'tag ' + (s.kind === 'multi' ? 'tag-multi' : 'tag-single')}>
                        {s.kind === 'multi' ? '多仓' : '单仓'}
                      </span>
                      {active && <span className="tag tag-active">当前</span>}
                    </div>
                    <div className="source-url" title={s.url}>
                      {s.url}
                    </div>
                    {s.kind === 'multi' && (
                      <div className="source-wh">
                        {s.warehouses?.length || 0} 个仓库
                        {s.warehouses && s.warehouses.length > 0 && (
                          <button
                            className="link-btn"
                            onClick={() => setExpanded(isExp ? null : s.id)}
                          >
                            {isExp ? '收起' : '查看仓库'}
                          </button>
                        )}
                      </div>
                    )}
                    {s.kind === 'single' && s.stats && (
                      <div className="source-wh">
                        共 {s.stats.total} 个站点 · {s.stats.supported} 个可浏览
                      </div>
                    )}
                  </div>
                  <div className="source-actions">
                    {!active && (
                      <button className="btn btn-sm" onClick={() => activate(s.id, s.kind === 'multi' ? s.warehouses?.[0]?.url || null : null)}>
                        启用
                      </button>
                    )}
                    <button
                      className="icon-btn danger"
                      title="删除"
                      onClick={() => {
                        if (confirm('确定删除该源？')) removeSource(s.id);
                      }}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                </div>
                {isExp && s.warehouses && (
                  <div className="wh-list">
                    {s.warehouses.map((w: Warehouse) => {
                      const whActive = active && state.activeWarehouseUrl === w.url;
                      return (
                        <div className={'wh-item ' + (whActive ? 'wh-active' : '')} key={w.url}>
                          <div className="wh-name">{w.name || '未命名仓'}</div>
                          <div className="wh-url">{w.url}</div>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              activate(s.id, w.url);
                              reset('browse');
                            }}
                          >
                            {whActive ? '使用中' : '切换到此仓'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
