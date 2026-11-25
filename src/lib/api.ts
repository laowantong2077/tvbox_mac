import type { AppState, PlayGroup, Site, Vod } from '../types';

async function J(path: string, opts: RequestInit = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const t = await r.text();
    throw new Error('服务端返回异常: ' + t.slice(0, 120));
  }
  const d = await r.json();
  if (d && d.ok === false && d.error) throw new Error(d.error);
  return d;
}

export const api = {
  bootstrap: () => J('/api/bootstrap'),
  getState: (): Promise<AppState> => J('/api/state'),
  putState: (s: AppState) =>
    J('/api/state', { method: 'PUT', body: JSON.stringify(s) }),
  loadConfig: (url: string) =>
    J('/api/config/load', { method: 'POST', body: JSON.stringify({ url }) }),
  categories: (site: Site) =>
    J('/api/site/categories', { method: 'POST', body: JSON.stringify({ site }) }),
  list: (site: Site, t: string, pg: number) =>
    J('/api/site/list', { method: 'POST', body: JSON.stringify({ site, t, pg }) }),
  search: (site: Site, wd: string) =>
    J('/api/site/search', { method: 'POST', body: JSON.stringify({ site, wd }) }),
  detail: (site: Site, ids: string) =>
    J('/api/site/detail', { method: 'POST', body: JSON.stringify({ site, ids }) }),
};

/** 代理图片（解决防盗链/混合内容），走本地 /api/stream */
export function img(url?: string, referer = ''): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  let u = url;
  if (u.startsWith('//')) u = 'https:' + u;
  return (
    '/api/stream?url=' +
    encodeURIComponent(u) +
    (referer ? '&referer=' + encodeURIComponent(referer) : '')
  );
}

/** 播放地址代理 */
export function streamUrl(url: string, referer = ''): string {
  return (
    '/api/stream?url=' +
    encodeURIComponent(url) +
    (referer ? '&referer=' + encodeURIComponent(referer) : '')
  );
}

/** 判断是否直链可播 */
export function isDirectPlayable(url: string): boolean {
  if (!url) return false;
  return /\.(m3u8|mp4|flv|mkv|mov|ts)(\?|#|$)/i.test(url);
}

export function firstPlayableGroup(vod: Vod): number {
  if (!vod.groups || !vod.groups.length) return -1;
  for (let i = 0; i < vod.groups.length; i++) {
    if (vod.groups[i].episodes.some((e) => isDirectPlayable(e.url))) return i;
  }
  return 0;
}

export function splitGroups(groups: PlayGroup[]) {
  return groups || [];
}
