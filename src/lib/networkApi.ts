/*
 * 网络模式 / 诊断 / 域名记录 API 客户端（同源 /api/network/*）
 */

export type NetMode = 'system' | 'direct' | 'proxy' | 'smart';
export type NetRoute = 'system' | 'direct' | 'proxy';

export interface NetSettings {
  mode: NetMode;
  streamOnly: boolean;
  doh: string;
  iface: string;
  proxyUrl: string;
}

export interface PhysicalIface {
  name: string;
  address: string;
  manual: boolean;
}

export interface NetStatus {
  mode: NetMode;
  effectiveStreamRoute: NetRoute | 'smart';
  physical: PhysicalIface | null;
  proxyValid: boolean;
  warning: string;
  smartCacheSize: number;
}

export interface DohProvider {
  key: string;
  label: string;
}

export interface SettingsResp {
  settings: NetSettings;
  status: NetStatus;
  providers: DohProvider[];
}

export interface IfaceInfo {
  name: string;
  address: string;
  internal: boolean;
  tun: boolean;
  physical: boolean;
}

export interface EgressInfo {
  route: NetRoute;
  ok: boolean;
  ms: number;
  ip?: string;
  location?: string;
  source?: string;
  error?: string;
  alt?: { ip: string; location: string; source: string } | null;
}

export interface ProbeInfo {
  route: NetRoute;
  ok: boolean;
  status: number;
  ms: number;
  finalUrl?: string;
  error?: string;
}

export interface RouteDiag {
  route: NetRoute;
  unavailable?: string;
  egress?: EgressInfo;
  probe?: ProbeInfo | null;
}

export interface ProxyItem {
  host: string;
  port: number;
}

export interface DiagnoseResult {
  at: number;
  mode: NetMode;
  testUrl: string;
  physical: PhysicalIface | null;
  interfaces: IfaceInfo[];
  tun: IfaceInfo[];
  systemProxy: {
    supported: boolean;
    error?: string;
    http?: ProxyItem | null;
    https?: ProxyItem | null;
    socks?: ProxyItem | null;
    pac?: string;
  };
  routes: RouteDiag[];
}

export interface HostRecord {
  host: string;
  suffix: string;
  count: number;
  fails: number;
  lastStatus: number;
  lastError: string;
  lastRoute: string;
  lastMs: number;
  lastAt: number;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('服务端返回异常（HTTP ' + r.status + '）');
  const d = await r.json();
  if (d && d.ok === false) throw new Error(d.error || '请求失败');
  return d as T;
}

/** 设置变更广播：NetworkPanel 与 NetworkQuickSwitch 之间同步 */
export const NET_EVENT = 'net-settings-changed';

function broadcast(d: SettingsResp) {
  window.dispatchEvent(new CustomEvent<SettingsResp>(NET_EVENT, { detail: d }));
  return d;
}

export const networkApi = {
  getSettings: () => req<SettingsResp>('/api/network/settings'),
  saveSettings: (p: Partial<NetSettings>) =>
    req<SettingsResp>('/api/network/settings', { method: 'PUT', body: JSON.stringify(p) }).then(broadcast),
  interfaces: () =>
    req<{ list: IfaceInfo[]; physical: PhysicalIface | null; tun: IfaceInfo[] }>('/api/network/interfaces'),
  egress: (refresh = false) =>
    req<{ mode: NetMode; route: NetRoute; egress: EgressInfo }>(
      '/api/network/egress' + (refresh ? '?refresh=1' : '')
    ),
  diagnose: (url = '') =>
    req<DiagnoseResult>('/api/network/diagnose', { method: 'POST', body: JSON.stringify({ url }) }),
  hosts: () => req<{ list: HostRecord[]; rules: string }>('/api/network/hosts'),
  clearHosts: () => req<{ ok: true }>('/api/network/hosts', { method: 'DELETE' }),
};

export const MODE_META: Record<NetMode, { title: string; short: string; desc: string; icon: string }> = {
  smart: {
    title: '智能',
    short: '智能',
    desc: '视频流优先直连，失败或 403 自动回退系统网络，并记住每个域名的可用线路',
    icon: 'magic',
  },
  system: {
    title: '跟随系统',
    short: '系统',
    desc: '全部交给系统网络 / VPN 规则处理（默认）',
    icon: 'settings',
  },
  direct: {
    title: '直连',
    short: '直连',
    desc: '国内 DoH 解析 + 绑定物理网卡，绕过 VPN 访问有地域限制的 CDN',
    icon: 'link',
  },
  proxy: {
    title: '自定义代理',
    short: '代理',
    desc: '通过指定的 HTTP / SOCKS5 代理（如国内服务器或 Clash 指定端口）',
    icon: 'grid',
  },
};

export const ROUTE_LABEL: Record<string, string> = {
  system: '系统网络',
  direct: '直连',
  proxy: '自定义代理',
  smart: '智能',
};

/** 复制文本到剪贴板（兼容 file:// 等非安全上下文） */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (e) {
    /* 回退到 execCommand */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
