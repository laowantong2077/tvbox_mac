// 弹幕数据读写：文件导入解析 / 本地发送存储 / 在线接口
import type { DmComment, DmMode } from './DanmakuEngine';
import { PREFIX } from './usePlayerPrefs';
import { loadJSON, saveJSON } from './utils';

const MODE_BOTTOM = 4;
const MODE_TOP = 5;
const MAX_LOCAL = 2000;

function biliMode(n: number): DmMode {
  if (n === MODE_BOTTOM) return 'bottom';
  if (n === MODE_TOP) return 'top';
  return 'scroll';
}

function normColor(v: unknown): string {
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith('#') ? v : '#' + v;
  const n = Number(v);
  if (isFinite(n) && n >= 0) return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
  return '#ffffff';
}

function normMode(v: unknown): DmMode {
  if (v === 'top' || v === 'bottom' || v === 'scroll') return v;
  return biliMode(Number(v));
}

/** B 站 XML：<d p="time,mode,size,color,...">text</d> */
export function parseBiliXml(xml: string): DmComment[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const out: DmComment[] = [];
  doc.querySelectorAll('d').forEach((d) => {
    const p = (d.getAttribute('p') || '').split(',');
    const text = (d.textContent || '').trim();
    if (!text) return;
    out.push({ time: Number(p[0]) || 0, mode: biliMode(Number(p[1])), size: Number(p[2]) || undefined, color: normColor(p[3]), text });
  });
  return out;
}

/** JSON：支持 [{time,mode,color,text}]、弹弹play {comments:[{p:"t,mode,color",m}]}、[[t,mode,color,..,text]] */
export function parseDanmakuJson(src: string): DmComment[] {
  const data = JSON.parse(src);
  const arr: any[] = Array.isArray(data) ? data : data.comments || data.list || data.danmuku || data.data || [];
  const out: DmComment[] = [];
  for (const x of arr) {
    if (Array.isArray(x)) {
      out.push({ time: Number(x[0]) || 0, mode: normMode(x[1]), color: normColor(x[2]), text: String(x[4] ?? x[3] ?? '') });
    } else if (x && typeof x.p === 'string') {
      const p = x.p.split(',');
      out.push({ time: Number(p[0]) || 0, mode: biliMode(Number(p[1])), color: normColor(p[2]), text: String(x.m || '') });
    } else if (x) {
      out.push({ time: Number(x.time ?? x.t) || 0, mode: normMode(x.mode ?? x.type), color: normColor(x.color), text: String(x.text ?? x.content ?? '') });
    }
  }
  return out.filter((c) => c.text);
}

export function parseDanmakuFile(text: string, name: string): DmComment[] {
  const t = text.trim();
  if (/\.json$/i.test(name) || t.startsWith('[') || t.startsWith('{')) return parseDanmakuJson(t);
  return parseBiliXml(t);
}

/* ---------- 本地发送的弹幕：按 片名::集名 存储 ---------- */
const localKey = (vod: string, ep: string) => PREFIX + 'dm.' + vod + '::' + ep;

export function loadLocalDanmaku(vod: string, ep: string): DmComment[] {
  return loadJSON<DmComment[]>(localKey(vod, ep), []).map((c) => ({ ...c, self: true }));
}

export function saveLocalDanmaku(vod: string, ep: string, c: DmComment) {
  const list = loadJSON<DmComment[]>(localKey(vod, ep), []);
  list.push({ time: c.time, mode: c.mode, color: c.color, text: c.text });
  saveJSON(localKey(vod, ep), list.slice(-MAX_LOCAL));
}

/* ---------- 在线弹幕匹配关系：按片名记忆 ---------- */
export interface DmMatch {
  source: string;
  id: string;
  title: string;
}
const matchKey = (vod: string) => PREFIX + 'dmmatch.' + vod;
export const loadMatch = (vod: string) => loadJSON<DmMatch | null>(matchKey(vod), null);
export const saveMatch = (vod: string, m: DmMatch | null) => saveJSON(matchKey(vod), m);

/* ---------- 在线接口 ---------- */
export interface DmSearchItem {
  source: string;
  id: string;
  title: string;
  kind: string;
  epCount: number;
  cover?: string;
  author?: string;
}
export interface DmEpisode {
  id: string;
  title: string;
}

async function getList<T>(path: string): Promise<T[]> {
  const r = await fetch(path);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || '请求失败');
  return d.list as T[];
}

export const dmApi = {
  search: (kw: string) => getList<DmSearchItem>('/api/danmaku/search?keyword=' + encodeURIComponent(kw)),
  episodes: (source: string, id: string) =>
    getList<DmEpisode>(`/api/danmaku/episodes?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`),
  comments: (source: string, id: string) =>
    getList<DmComment>(`/api/danmaku/comments?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`),
};
