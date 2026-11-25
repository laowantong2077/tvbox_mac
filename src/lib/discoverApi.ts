/*
 * 发现（豆瓣）前端接口与类型
 * 后端：core/src/api/discover.rs；豆瓣图片需 Referer，统一用 doubanImg() 走代理
 */
import { api, img } from './api';
import type { Site, Vod } from '../types';

export type HotKind = 'movie' | 'tv' | 'show';

/** 规范化后的豆瓣条目 */
export interface DiscoverItem {
  id: string;
  title: string;
  rating: number;
  cover: string;
  subtitle: string;
  year: string;
  region: string;
  genres: string[];
  episodes: string;
  isNew: boolean;
  kind: 'movie' | 'tv';
  /** 仅 Banner 条目带有 */
  intro?: string;
  directors?: string[];
  actors?: string[];
}

export interface DiscoverRow {
  key: string;
  title: string;
  sub: string;
  link: { kind: HotKind; tag: string };
  items: DiscoverItem[];
}

export interface HomeData {
  banner: DiscoverItem[];
  rows: DiscoverRow[];
  updatedAt: number;
}

export interface TagOption {
  key: string;
  label: string;
  sortable: boolean;
}
export interface TagsData {
  kind: HotKind;
  tags: TagOption[];
  sorts: { key: string; label: string }[];
}

export interface HotData {
  kind: HotKind;
  tag: string;
  sort: string;
  start: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: DiscoverItem[];
}

export interface Subject {
  id: string;
  kind: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  aka: string[];
  rating: number;
  ratingCount: number;
  cover: string;
  year: string;
  genres: string[];
  countries: string[];
  directors: string[];
  actors: string[];
  intro: string;
  episodes: string;
  durations: string[];
  pubdate: string[];
  subtitle: string;
  isShow: boolean;
}

export const DOUBAN_REFERER = 'https://movie.douban.com/';

export function doubanImg(url?: string): string {
  return img(url, DOUBAN_REFERER);
}

async function G<T>(path: string): Promise<T> {
  const r = await fetch(path);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error('服务端返回异常（' + r.status + '）');
  const d = await r.json();
  if (!d || d.ok === false) throw new Error((d && d.error) || '请求失败');
  return d as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
    .join('&');
}

export const discoverApi = {
  home: () => G<HomeData>('/api/discover/home'),
  tags: (kind: HotKind) => G<TagsData>('/api/discover/tags?' + qs({ kind })),
  hot: (p: { kind: HotKind; tag?: string; sort?: string; start?: number; limit?: number }) =>
    G<HotData>('/api/discover/hot?' + qs(p)),
  subject: (id: string, kind?: string) =>
    G<{ subject: Subject }>('/api/discover/subject?' + qs({ id, kind })).then((d) => d.subject),
};

export const KIND_LABEL: Record<HotKind, string> = {
  movie: '热播电影',
  tv: '热播电视',
  show: '热播综艺',
};

/* ---------------- 豆瓣不可用时的兜底：站点分类最新列表 ---------------- */
// 一级匹配为大类；很多采集站大类本身没有数据，再用二级规则匹配子类（排除伦理等）
const FALLBACK_MATCH: Record<HotKind, RegExp[]> = {
  movie: [/^(电影|影片)$/, /电影|影片|movie/i, /^(动作|喜剧|剧情|科幻|爱情|战争|恐怖)片$/],
  tv: [/^(电视剧|连续剧|剧集)$/, /电视|连续剧|剧集|tv/i, /^(国产|大陆|内地|港台|欧美|日韩|韩国|日本)剧$/],
  show: [/^综艺$/, /综艺|真人秀|show/i, /晚会|脱口秀/],
};
const MAX_CAT_TRY = 4;

/** 按规则优先级挑出候选分类（去重，最多 MAX_CAT_TRY 个） */
function pickCats(cats: { id: string; name: string }[], kind: HotKind) {
  const out: { id: string; name: string }[] = [];
  for (const re of FALLBACK_MATCH[kind]) {
    for (const c of cats) if (re.test(c.name) && !out.includes(c) && !/伦理|福利/.test(c.name)) out.push(c);
  }
  return out.slice(0, MAX_CAT_TRY);
}

const FALLBACK_TRY = 8;

export interface FallbackResult {
  site: Site;
  category: string;
  list: Vod[];
  hasMore: boolean;
  typeId: string;
}

/** 在可浏览站点中找第一个含匹配分类的站点，返回该分类第 pg 页 */
export async function loadFallback(
  sites: Site[],
  kind: HotKind,
  pg = 1,
  prefer?: { siteKey: string; typeId: string; name?: string }
): Promise<FallbackResult | null> {
  // 跳过分隔符等无 API 的占位站点
  const candidates = sites.filter((s) => s.supported && /^https?:\/\//i.test(s.api || ''));
  if (prefer) {
    const site = candidates.find((s) => s.key === prefer.siteKey);
    if (site) return fetchFallbackPage(site, prefer.typeId, prefer.name || '', pg);
  }
  for (const site of candidates.slice(0, FALLBACK_TRY)) {
    try {
      const r: any = await api.categories(site);
      const cats: { id: string; name: string }[] = (r.list || []).map((c: any) => ({
        id: String(c.id ?? c.type_id ?? ''),
        name: String(c.name ?? c.type_name ?? ''),
      }));
      for (const cat of pickCats(cats, kind)) {
        const res = await fetchFallbackPage(site, cat.id, cat.name, pg);
        if (res.list.length) return res;
      }
    } catch {
      /* 尝试下一个站点 */
    }
  }
  return null;
}

async function fetchFallbackPage(site: Site, typeId: string, name: string, pg: number) {
  const r: any = await api.list(site, typeId, pg);
  const list = (r.list || []) as Vod[];
  const pagecount = Number(r.pagecount || 0);
  return { site, category: name, list, typeId, hasMore: pagecount ? pg < pagecount : list.length > 0 };
}
