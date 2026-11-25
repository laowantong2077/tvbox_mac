/*
 * 网络模式的细项设置：仅视频流开关、DoH 服务器、物理网卡、代理地址
 */
import React from 'react';
import type { DohProvider, IfaceInfo, NetSettings, PhysicalIface } from '../../lib/networkApi';
import { NetToggle } from './netUi';

interface Props {
  draft: NetSettings;
  providers: DohProvider[];
  ifaces: IfaceInfo[];
  autoIface: PhysicalIface | null;
  onPatch: (p: Partial<NetSettings>) => void;
}

function Row({ label, desc, children }: { label: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-label">{label}</div>
        <div className="settings-desc">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function IfaceSelect({ draft, ifaces, autoIface, onPatch }: Omit<Props, 'providers'>) {
  const autoText = autoIface ? `自动（${autoIface.name} · ${autoIface.address}）` : '自动（未检测到物理网卡）';
  const options = ifaces.filter((i) => !i.internal);
  return (
    <select className="select net-select" value={draft.iface} onChange={(e) => onPatch({ iface: e.target.value })}>
      <option value="">{autoText}</option>
      {options.map((i) => (
        <option key={i.name + i.address} value={i.name}>
          {i.name} · {i.address}
          {i.tun ? '（VPN / TUN）' : ''}
        </option>
      ))}
    </select>
  );
}

export function NetOptions(props: Props) {
  const { draft, providers, onPatch } = props;
  const usesDirect = draft.mode === 'direct' || draft.mode === 'smart';
  const scoped = draft.mode === 'direct' || draft.mode === 'proxy';
  return (
    <div className="net-options">
      {(draft.mode === 'proxy' || draft.proxyUrl) && (
        <Row
          label="代理地址"
          desc="支持 http://host:port 与 socks5://host:port；需要认证时在主机前加「用户名:密码」并用 @ 连接"
        >
          <input
            className="input net-input"
            placeholder="socks5://127.0.0.1:1080"
            value={draft.proxyUrl}
            spellCheck={false}
            onChange={(e) => onPatch({ proxyUrl: e.target.value })}
          />
        </Row>
      )}
      <Row
        label="仅对视频流生效"
        desc={scoped ? '开启后，配置 / 搜索等元数据请求仍走系统网络，只有播放与图片走所选通道' : '仅「直连」与「自定义代理」模式下可用'}
      >
        <NetToggle on={draft.streamOnly} disabled={!scoped} onChange={(v) => onPatch({ streamOnly: v })} />
      </Row>
      {usesDirect && (
        <Row label="DoH 解析服务器" desc="直连时使用国内 DNS 获取真实 IP，避开 VPN 的 fake-ip；失败会自动尝试其它服务器">
          <select className="select net-select" value={draft.doh} onChange={(e) => onPatch({ doh: e.target.value })}>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>
      )}
      {usesDirect && (
        <Row label="出口网卡" desc="直连流量绑定到该网卡发出；一般保持自动（优先 en0，Wi-Fi / 有线）">
          <IfaceSelect {...props} />
        </Row>
      )}
    </div>
  );
}
