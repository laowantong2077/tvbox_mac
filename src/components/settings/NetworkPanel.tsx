/*
 * 设置页「网络与代理」分区：网络模式 + 细项设置 + 网络诊断 + 最近访问域名
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import {
  MODE_META,
  NET_EVENT,
  networkApi,
  type IfaceInfo,
  type NetSettings,
  type SettingsResp,
} from '../../lib/networkApi';
import { NetModeCards } from './NetModeCards';
import { NetOptions } from './NetOptions';
import { NetDiagnose } from './NetDiagnose';
import { NetHosts } from './NetHosts';
import { NetIcon } from './netUi';
import '../../styles/network.css';

/** 与后端 interfaces.js 相同的自动选择规则：优先 en0，其次 en* */
function pickAuto(list: IfaceInfo[]) {
  const rank = (n: string) => (n === 'en0' ? 0 : /^en\d+$/.test(n) ? 1 : 2);
  const c = list.filter((i) => i.physical).sort((a, b) => rank(a.name) - rank(b.name))[0];
  return c ? { name: c.name, address: c.address, manual: false } : null;
}

function sameSettings(a: NetSettings, b: NetSettings) {
  return (Object.keys(a) as (keyof NetSettings)[]).every((k) => a[k] === b[k]);
}

/** 读取设置 + 网卡列表，并监听其它组件（快捷切换）的修改 */
function useNetSettings() {
  const { notify } = useStore();
  const [data, setData] = useState<SettingsResp | null>(null);
  const [ifaces, setIfaces] = useState<IfaceInfo[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([networkApi.getSettings(), networkApi.interfaces()]);
      setData(s);
      setIfaces(i.list);
    } catch (e: any) {
      notify('读取网络设置失败：' + (e?.message || e), 'error');
    }
  }, [notify]);

  useEffect(() => {
    load();
    const on = (e: Event) => setData((e as CustomEvent<SettingsResp>).detail);
    window.addEventListener(NET_EVENT, on);
    return () => window.removeEventListener(NET_EVENT, on);
  }, [load]);

  return { data, ifaces, setData };
}

function StatusLine({ data }: { data: SettingsResp }) {
  const st = data.status;
  if (st.warning) {
    return (
      <div className="net-status warn">
        <NetIcon name="warn" size={15} /> {st.warning}
      </div>
    );
  }
  return (
    <div className="net-status">
      <span className="net-dot" />
      当前：{MODE_META[st.mode].title}
      {st.physical && st.mode !== 'system' && st.mode !== 'proxy' && (
        <span className="muted">
          · 直连网卡 {st.physical.name} ({st.physical.address})
        </span>
      )}
    </div>
  );
}

export function NetworkPanel() {
  const { notify } = useStore();
  const { data, ifaces } = useNetSettings();
  const [draft, setDraft] = useState<NetSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setDraft(data.settings);
  }, [data]);

  const dirty = useMemo(() => !!(data && draft && !sameSettings(data.settings, draft)), [data, draft]);
  const patch = (p: Partial<NetSettings>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await networkApi.saveSettings(draft);
      notify('网络设置已保存：' + MODE_META[r.settings.mode].title, 'success');
      if (r.status.warning) notify(r.status.warning, 'error');
    } catch (e: any) {
      notify('保存失败：' + (e?.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="net-section">
      <div className="net-section-head">
        <div>
          <h2 className="net-section-title">网络与代理</h2>
          <div className="settings-desc">
            开着 VPN 时，部分视频 CDN 会因地域限制返回 403。可在这里选择绕过 VPN 直连或指定代理。
          </div>
        </div>
        {data && <StatusLine data={data} />}
      </div>

      {data && draft ? (
        <div className="card net-card">
          <NetModeCards value={draft.mode} saved={data.settings.mode} onChange={(mode) => patch({ mode })} />
          <NetOptions
            draft={draft}
            providers={data.providers}
            ifaces={ifaces}
            autoIface={pickAuto(ifaces)}
            onPatch={patch}
          />
          <div className="net-save-bar">
            {dirty && <span className="net-dirty">有未保存的修改</span>}
            <button className="btn btn-ghost btn-sm" disabled={!dirty || saving} onClick={() => setDraft(data.settings)}>
              还原
            </button>
            <button className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={save}>
              {saving ? '保存中…' : '保存设置'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card net-card net-loading">
          <span className="net-spinner" /> 正在读取网络设置…
        </div>
      )}

      <NetDiagnose />
      <NetHosts />
    </section>
  );
}

export default NetworkPanel;
