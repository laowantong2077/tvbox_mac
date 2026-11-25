/*
 * 资源匹配搜索：并发（限流）在所有可搜索站点中按片名搜索，结果增量返回
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Site, Vod } from '../../types';
import { MATCH_THRESHOLD, matchScore } from './matchUtils';

const CONCURRENCY = 8;
const SITE_TIMEOUT = 15000;
const MAX_PER_SITE = 6;

export interface MatchHit {
  vod: Vod;
  site: Site;
  score: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('超时')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}

export function useMatchSearch(title: string, year: string, sites: Site[]) {
  const [hits, setHits] = useState<MatchHit[]>([]);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const seq = useRef(0);
  const total = sites.length;

  useEffect(() => {
    const my = ++seq.current;
    setHits([]);
    setDone(0);
    setFailed(0);
    if (!title || !sites.length) return;
    const queue = [...sites];

    const runOne = async (site: Site) => {
      try {
        const r: any = await withTimeout(api.search(site, title), SITE_TIMEOUT);
        if (my !== seq.current) return;
        const found = ((r.list || []) as Vod[])
          .map((vod) => ({ vod: { ...vod, siteKey: vod.siteKey || site.key, siteName: vod.siteName || site.name }, site, score: matchScore(vod, title, year) }))
          .filter((h) => h.score >= MATCH_THRESHOLD)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_PER_SITE);
        if (found.length) setHits((prev) => [...prev, ...found].sort((a, b) => b.score - a.score));
      } catch {
        if (my === seq.current) setFailed((n) => n + 1);
      } finally {
        if (my === seq.current) setDone((n) => n + 1);
      }
    };

    const worker = async () => {
      while (queue.length && my === seq.current) await runOne(queue.shift() as Site);
    };
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }).forEach(() => void worker());
    // 卸载 / 条件变化时让在途 worker 停止
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, year, sites.map((s) => s.key).join('|')]);

  return { hits, done, failed, total, finished: done >= total };
}
