/*
 * 网络诊断：各通道出口 IP / 归属地、测试 URL 状态码与耗时、网卡 / TUN / 系统代理
 */
import React, { useState } from 'react';
import { useStore } from '../../lib/store';
import { networkApi, ROUTE_LABEL, type DiagnoseResult, type RouteDiag } from '../../lib/networkApi';
import { NetBadge, NetIcon, fmtMs, statusTone } from './netUi';

function EgressBlock({ d }: { d: RouteDiag }) {
  const eg = d.egress;
  if (!eg) return null;
  if (!eg.ok) return <div className="net-diag-err">出口查询失败：{eg.error}</div>;
  const diff = eg.alt && eg.alt.ip !== eg.ip;
  return (
    <div className="net-egress">
      <div className="net-egress-ip">{eg.ip}</div>
      <div className="net-egress-loc">{eg.location}</div>
      {diff && (
        <div className="net-egress-alt" title="规则模式下，不同网站的出口可能不同">
          另测（{eg.alt!.source}）：{eg.alt!.ip} · {eg.alt!.location}
        </div>
      )}
    </div>
  );
}

function ProbeBlock({ d }: { d: RouteDiag }) {
  const p = d.probe;
  if (!p) return <div className="net-probe muted">未提供测试地址</div>;
  return (
    <div className="net-probe">
      <span className="muted">测试地址</span>
      <NetBadge tone={statusTone(p.status, p.error)}>{p.status ? 'HTTP ' + p.status : '失败'}</NetBadge>
      <span className="net-probe-ms">{fmtMs(p.ms)}</span>
      {p.error && <div className="net-diag-err">{p.error}</div>}
    </div>
  );
}

function RouteCard({ d }: { d: RouteDiag }) {
  const ok = !d.unavailable && d.egress?.ok && (!d.probe || d.probe.ok);
  const tone = d.unavailable ? 'idle' : ok ? 'ok' : 'fail';
  return (
    <div className={'net-route-card tone-' + tone}>
      <div className="net-route-head">
        <span className="net-route-name">
          <NetIcon name={d.route} size={16} />
          {ROUTE_LABEL[d.route]}
        </span>
        <NetBadge tone={tone}>{d.unavailable ? '不可用' : ok ? '正常' : '异常'}</NetBadge>
      </div>
      {d.unavailable ? (
        <div className="net-diag-err">{d.unavailable}</div>
      ) : (
        <>
          <EgressBlock d={d} />
          <ProbeBlock d={d} />
          {d.egress?.ok && <div className="net-route-ms">出口查询 {fmtMs(d.egress.ms)}</div>}
        </>
      )}
    </div>
  );
}

function proxyText(r: DiagnoseResult) {
  const sp = r.systemProxy;
  if (!sp.supported) return '不支持检测';
  if (sp.error) return '读取失败';
  const items = [
    sp.http && 'HTTP ' + sp.http.host + ':' + sp.http.port,
    sp.https && 'HTTPS ' + sp.https.host + ':' + sp.https.port,
    sp.socks && 'SOCKS ' + sp.socks.host + ':' + sp.socks.port,
    sp.pac && 'PAC',
  ].filter(Boolean);
  return items.length ? items.join(' · ') : '未开启';
}

function EnvSummary({ r }: { r: DiagnoseResult }) {
  return (
    <div className="net-env">
      <div className="net-env-item">
        <NetIcon name="chip" size={16} />
        <span className="muted">物理网卡</span>
        <b>{r.physical ? `${r.physical.name} · ${r.physical.address}` : '未检测到'}</b>
      </div>
      <div className="net-env-item">
        <NetIcon name="shield" size={16} />
        <span className="muted">VPN / TUN</span>
        <b>{r.tun.length ? r.tun.map((t) => `${t.name} (${t.address})`).join('、') : '未检测到'}</b>
      </div>
      <div className="net-env-item">
        <NetIcon name="globe" size={16} />
        <span className="muted">系统代理</span>
        <b>{proxyText(r)}</b>
      </div>
    </div>
  );
}

export function NetDiagnose() {
  const { notify } = useStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await networkApi.diagnose(url.trim()));
    } catch (e: any) {
      notify('诊断失败：' + (e?.message || e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card net-card">
      <div className="net-card-head">
        <div>
          <div className="net-card-title">
            <NetIcon name="pulse" size={17} /> 网络诊断
          </div>
          <div className="settings-desc">对比各通道的出口 IP 与归属地，并测试某个地址能否访问</div>
        </div>
      </div>
      <div className="net-diag-bar">
        <input
          className="input net-input-grow"
          placeholder="测试地址（留空 = 最近一次失败的视频流地址）"
          value={url}
          spellCheck={false}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && run()}
        />
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? <span className="net-spinner" /> : <NetIcon name="pulse" size={16} />}
          {busy ? '诊断中…' : '开始诊断'}
        </button>
      </div>
      {result && (
        <>
          <EnvSummary r={result} />
          {result.testUrl && (
            <div className="net-test-url" title={result.testUrl}>
              测试地址：{result.testUrl}
            </div>
          )}
          <div className="net-route-grid">
            {result.routes.map((d) => (
              <RouteCard key={d.route} d={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
