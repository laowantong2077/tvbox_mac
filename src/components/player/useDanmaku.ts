// 弹幕数据管理：本地发送 + 文件导入 + 在线匹配（记住匹配关系，换集自动加载）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DmComment, DmMode } from './DanmakuEngine';
import {
  dmApi,
  DmEpisode,
  DmMatch,
  DmSearchItem,
  loadLocalDanmaku,
  loadMatch,
  parseDanmakuFile,
  saveLocalDanmaku,
  saveMatch,
} from './danmakuIO';
import { parseEpNumber, readFileText } from './utils';

export interface DmStatus {
  state: 'idle' | 'loading' | 'ok' | 'error';
  msg: string;
}

/** 根据当前集选择在线剧集：优先按集名中的数字，其次按序号 */
export function pickEpisode(eps: DmEpisode[], epIndex: number, epName: string, total: number): DmEpisode | null {
  if (!eps.length) return null;
  if (eps.length === 1) return eps[0];
  const n = parseEpNumber(epName);
  const byNum = n > 0 && eps.find((e) => parseEpNumber(e.title) === n);
  if (byNum) return byNum;
  if (total === eps.length || epIndex < eps.length) return eps[Math.min(epIndex, eps.length - 1)];
  return null;
}

const cleanTitle = (s: string) => s.replace(/[\s·:：\-_（）()【】\[\]]/g, '').toLowerCase();

export function useDanmaku(vodName: string, epName: string, epIndex: number, epTotal: number, notify: (m: string) => void) {
  const [online, setOnline] = useState<DmComment[]>([]);
  const [imported, setImported] = useState<DmComment[]>([]);
  const [local, setLocal] = useState<DmComment[]>([]);
  const [status, setStatus] = useState<DmStatus>({ state: 'idle', msg: '' });
  const [match, setMatch] = useState<DmMatch | null>(() => loadMatch(vodName));
  const [episodes, setEpisodes] = useState<DmEpisode[]>([]);
  const [current, setCurrent] = useState<DmEpisode | null>(null);
  const [results, setResults] = useState<DmSearchItem[]>([]);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const loadComments = useCallback(async (source: string, ep: DmEpisode) => {
    setStatus({ state: 'loading', msg: '正在加载弹幕…' });
    try {
      const list = await dmApi.comments(source, ep.id);
      setOnline(list);
      setCurrent(ep);
      setStatus({ state: 'ok', msg: `已加载 ${list.length} 条在线弹幕` });
      notifyRef.current(`弹幕已加载 ${list.length} 条`);
    } catch (e: any) {
      setStatus({ state: 'error', msg: '在线弹幕加载失败：' + (e?.message || e) + '（本地弹幕仍可用）' });
    }
  }, []);

  /** 应用匹配：拉取剧集并按当前集选择 */
  const applyMatch = useCallback(
    async (m: DmMatch) => {
      setStatus({ state: 'loading', msg: '正在获取剧集…' });
      try {
        const eps = await dmApi.episodes(m.source, m.id);
        setEpisodes(eps);
        const ep = pickEpisode(eps, epIndex, epName, epTotal);
        if (ep) await loadComments(m.source, ep);
        else setStatus({ state: 'error', msg: '未找到对应集数，请手动选择' });
      } catch (e: any) {
        setStatus({ state: 'error', msg: '获取剧集失败：' + (e?.message || e) });
      }
    },
    [epIndex, epName, epTotal, loadComments]
  );

  const search = useCallback(async (kw: string) => {
    setStatus({ state: 'loading', msg: '正在搜索在线弹幕…' });
    try {
      const list = await dmApi.search(kw);
      setResults(list);
      setStatus({ state: list.length ? 'idle' : 'error', msg: list.length ? '' : '没有找到匹配的在线弹幕' });
      return list;
    } catch (e: any) {
      setStatus({ state: 'error', msg: '搜索失败：' + (e?.message || e) + '（本地弹幕仍可用）' });
      return [];
    }
  }, []);

  const choose = useCallback(
    (item: DmSearchItem) => {
      const m = { source: item.source, id: item.id, title: item.title };
      setMatch(m);
      saveMatch(vodName, m);
      return applyMatch(m);
    },
    [vodName, applyMatch]
  );

  const unmatch = useCallback(() => {
    setMatch(null);
    saveMatch(vodName, null);
    setOnline([]);
    setEpisodes([]);
    setCurrent(null);
    setStatus({ state: 'idle', msg: '' });
  }, [vodName]);

  // 换集：加载本地弹幕 + 自动在线匹配
  useEffect(() => {
    setLocal(loadLocalDanmaku(vodName, epName));
    setImported([]);
    setOnline([]);
    const m = loadMatch(vodName);
    if (m) {
      applyMatch(m);
      return;
    }
    // 无记忆时静默搜索：仅当标题完全一致时自动采用
    let alive = true;
    dmApi
      .search(vodName)
      .then((list) => {
        if (!alive) return;
        setResults(list);
        const exact = list.find((x) => cleanTitle(x.title) === cleanTitle(vodName));
        if (exact) choose(exact);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vodName, epName]);

  const importFile = useCallback(async (file: File) => {
    try {
      const list = parseDanmakuFile(await readFileText(file), file.name);
      setImported((p) => p.concat(list));
      notifyRef.current(`已导入 ${list.length} 条弹幕`);
    } catch (e: any) {
      notifyRef.current('弹幕文件解析失败：' + (e?.message || e));
    }
  }, []);

  const send = useCallback(
    (text: string, color: string, mode: DmMode, time: number) => {
      const c: DmComment = { text, color, mode, time, self: true };
      saveLocalDanmaku(vodName, epName, c);
      setLocal((p) => p.concat(c));
      return c;
    },
    [vodName, epName]
  );

  // 注意：发送的弹幕已由引擎 add() 即时显示，这里合并后用于后续 seek 回看
  const comments = useMemo(() => online.concat(imported, local), [online, imported, local]);

  return {
    comments,
    counts: { online: online.length, imported: imported.length, local: local.length },
    status,
    match,
    episodes,
    current,
    results,
    search,
    choose,
    unmatch,
    loadComments,
    importFile,
    send,
  };
}

export type DanmakuCtl = ReturnType<typeof useDanmaku>;
