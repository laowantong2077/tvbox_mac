import React from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { useNav } from '../lib/nav';
import { NetworkPanel } from '../components/settings/NetworkPanel';
import { appTags } from '../lib/platform';

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={'toggle ' + (on ? 'on' : '')}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function SettingsPage() {
  const { state, setState, clearHistory, notify } = useStore();
  const { reset } = useNav();
  const s = state.settings;

  const patch = (p: Partial<typeof s>) =>
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...p } }));

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1 className="page-title">设置</h1>
        </div>

        {/* 网络与代理：网络模式 / 诊断 / 域名规则 */}
        <NetworkPanel />

        <h2 className="net-section-title" style={{ margin: '4px 0 14px' }}>
          通用
        </h2>

        <div className="card settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-label">播完自动下一集</div>
              <div className="settings-desc">当前视频播放结束后自动播放下一集</div>
            </div>
            <Toggle on={s.autoNext} onChange={(v) => patch({ autoNext: v })} />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">显示暂不支持的站点</div>
              <div className="settings-desc">
                在源管理中显示 JS 解析型站点（本客户端暂无法播放，仅作信息展示）
              </div>
            </div>
            <Toggle on={s.showUnsupported} onChange={(v) => patch({ showUnsupported: v })} />
          </div>
        </div>

        <div className="card settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-label">清空观看记录</div>
              <div className="settings-desc">将删除所有本地观看进度（{state.history.length} 条）</div>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (confirm('确定清空全部观看记录？')) {
                  clearHistory();
                  notify('已清空观看记录', 'success');
                }
              }}
            >
              清空
            </button>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-label">数据存储位置</div>
              <div className="settings-desc">收藏、历史与源配置保存在本机应用数据目录（data/state.json）</div>
            </div>
          </div>
        </div>

        <div className="card about-card">
          <div className="about-logo">随</div>
          <div className="about-body">
            <div className="about-title">随心看</div>
            <div className="about-ver">v1.0.1 · 兼容 TVBox 配置协议</div>
            <div className="about-desc">
              随心看是一款跨平台影视客户端：支持添加多仓/单仓配置源、聚合搜索、分类浏览、HLS 在线播放、
              收藏与观看记录。内置演示源（公共测试流）用于体验播放能力。
            </div>
            <div className="about-tags">
              {appTags().map((t) => (
                <span className="tag" key={t}>{t}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="link-btn" onClick={() => reset('search')}>
            <Icon name="home" size={14} /> 返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
