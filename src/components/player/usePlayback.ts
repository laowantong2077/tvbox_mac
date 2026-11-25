// 播放流程：进度记忆（recordHistory）、恢复进度、跳过片头片尾、结束后自动下一集 / 循环
import { useCallback, useEffect, useRef } from 'react';
import type { Hist, PlayGroup, Site, Vod } from '../../types';
import { vodKey } from '../../lib/store';
import type { SkipPrefs } from './usePlayerPrefs';
import { fmtTime } from './utils';

const SAVE_INTERVAL_MS = 4000;
const RESUME_MIN_SEC = 5;
const RESUME_TAIL_SEC = 10;

interface Opts {
  videoRef: React.RefObject<HTMLVideoElement>;
  vod: Vod;
  site?: Site;
  groups: PlayGroup[];
  gi: number;
  ei: number;
  url: string;
  history: Hist[];
  recordHistory: (h: Omit<Hist, 'updatedAt'>) => void;
  skip: SkipPrefs;
  loop: boolean;
  autoNext: boolean;
  goNext: () => boolean;
  osd: (m: string) => void;
}

export function usePlayback(o: Opts) {
  const ref = useRef(o);
  ref.current = o;
  const lastSave = useRef(0);
  const outroDone = useRef(false);

  // gi/ei 由调用方在 effect 中捕获，避免换集后把旧进度写到新集上
  const save = useCallback((gi: number, ei: number, pos: number, duration: number, force = false) => {
    const { vod, site, groups, recordHistory } = ref.current;
    const episode = groups[gi]?.episodes?.[ei];
    if (!episode) return;
    const now = Date.now();
    if (!force && now - lastSave.current < SAVE_INTERVAL_MS) return;
    lastSave.current = now;
    recordHistory({
      key: vodKey(vod),
      name: vod.name,
      pic: vod.pic,
      siteKey: vod.siteKey || '',
      siteName: vod.siteName || site?.name || '',
      vodId: vod.id,
      epName: episode.name,
      epIndex: ei,
      groupIndex: gi,
      position: pos,
      duration: duration || 0,
      site: site || ({} as Site),
      groups,
    });
  }, []);

  const onEnded = useCallback(() => {
    const { loop, autoNext, goNext, videoRef, osd } = ref.current;
    const v = videoRef.current;
    if (loop && v) {
      v.currentTime = 0;
      v.play().catch(() => {});
      return;
    }
    if (autoNext && goNext()) osd('自动播放下一集');
  }, []);

  // 恢复进度 / 跳过片头
  useEffect(() => {
    const v = o.videoRef.current;
    if (!v || !o.url) return;
    outroDone.current = false;
    const onMeta = () => {
      const { history, vod, gi, ei, skip, osd } = ref.current;
      const h = history.find((x) => x.key === vodKey(vod));
      const dur = v.duration || 0;
      if (h && h.epIndex === ei && h.groupIndex === gi && h.position > RESUME_MIN_SEC && (!dur || h.position < dur - RESUME_TAIL_SEC)) {
        v.currentTime = h.position;
        osd('已为你恢复到 ' + fmtTime(h.position));
      } else if (skip.intro > 0 && v.currentTime < skip.intro) {
        v.currentTime = skip.intro;
        osd('已跳过片头');
      }
    };
    v.addEventListener('loadedmetadata', onMeta, { once: true });
    return () => v.removeEventListener('loadedmetadata', onMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.url]);

  // 进度保存 / 跳过片尾 / 结束
  useEffect(() => {
    const v = o.videoRef.current;
    if (!v) return;
    const { gi, ei } = o;
    const onTime = () => {
      if (v.currentTime > 0) save(gi, ei, v.currentTime, v.duration);
      const { skip, osd } = ref.current;
      const d = v.duration;
      if (skip.outro > 0 && d && isFinite(d) && !outroDone.current && d - v.currentTime <= skip.outro && v.currentTime > skip.outro) {
        outroDone.current = true;
        osd('已跳过片尾');
        onEnded();
      }
    };
    const onPause = () => v.currentTime > 0 && save(gi, ei, v.currentTime, v.duration, true);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      if (v.currentTime > 0) save(gi, ei, v.currentTime, v.duration, true);
    };
  }, [o.videoRef, o.gi, o.ei, save, onEnded]);
}
