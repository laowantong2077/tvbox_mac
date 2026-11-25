// 播放源加载：hls.js / 原生 HLS / mp4 直链；暴露清晰度、音轨、内嵌字幕轨
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { isDirectPlayable, streamUrl } from '../../lib/api';

export interface TrackItem {
  index: number;
  name: string;
}
export interface LevelItem extends TrackItem {
  height: number;
  bitrate: number;
}
export interface HlsInfo {
  levels: LevelItem[];
  level: number; // -1 = 自动
  playingLevel: number; // 实际播放中的码率
  audioTracks: TrackItem[];
  audioTrack: number;
  subTracks: TrackItem[];
  subTrack: number; // -1 = 关闭
}
const EMPTY: HlsInfo = { levels: [], level: -1, playingLevel: -1, audioTracks: [], audioTrack: -1, subTracks: [], subTrack: -1 };

const HTTP_FORBIDDEN = 403;
export const GEO_HINT = '可能被地域限制，可到 设置 → 网络与代理 切换为『直连/智能』';

export function describeHttpError(code?: number): string {
  if (code === HTTP_FORBIDDEN) return '视频源拒绝访问（HTTP 403），' + GEO_HINT;
  if (code && code >= 400) return `无法加载视频流（HTTP ${code}），请重试或更换线路`;
  return '播放失败：资源无法访问（可能受地域/版权限制），请重试或更换线路';
}

/** 原生播放出错时探测一次 HTTP 状态码，给出更准确的原因 */
async function probeStatus(src: string): Promise<number | undefined> {
  try {
    const r = await fetch(src, { headers: { Range: 'bytes=0-1' } });
    r.body?.cancel().catch(() => {});
    return r.status;
  } catch (e) {
    return undefined;
  }
}

function readInfo(hls: Hls): HlsInfo {
  return {
    levels: hls.levels.map((l, i) => ({
      index: i,
      height: l.height,
      bitrate: l.bitrate,
      name: l.height ? l.height + 'P' : Math.round(l.bitrate / 1000) + 'K',
    })),
    level: hls.autoLevelEnabled ? -1 : hls.currentLevel,
    playingLevel: hls.currentLevel,
    audioTracks: hls.audioTracks.map((t, i) => ({ index: i, name: t.name || t.lang || '音轨 ' + (i + 1) })),
    audioTrack: hls.audioTrack,
    subTracks: hls.subtitleTracks.map((t, i) => ({ index: i, name: t.name || t.lang || '字幕 ' + (i + 1) })),
    subTrack: hls.subtitleTrack,
  };
}

function bindHls(hls: Hls, video: HTMLVideoElement, refresh: () => void, fail: (m: string) => void) {
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    refresh();
    video.play().catch(() => {});
  });
  const evs = [Hls.Events.LEVEL_SWITCHED, Hls.Events.AUDIO_TRACKS_UPDATED, Hls.Events.AUDIO_TRACK_SWITCHED, Hls.Events.SUBTITLE_TRACKS_UPDATED, Hls.Events.SUBTITLE_TRACK_SWITCH];
  evs.forEach((ev) => hls.on(ev, refresh));
  let netRetries = 0;
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (!data.fatal) return;
    const code = (data.response as any)?.code as number | undefined;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && code !== HTTP_FORBIDDEN && netRetries++ < 2) {
      hls.startLoad();
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries++ < 2) {
      hls.recoverMediaError();
      return;
    }
    fail(describeHttpError(code));
  });
}

export function useHls(
  videoRef: React.RefObject<HTMLVideoElement>,
  url: string,
  referer: string,
  reloadKey: number,
  onError: (msg: string) => void
) {
  const hlsRef = useRef<Hls | null>(null);
  const [info, setInfo] = useState<HlsInfo>(EMPTY);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    const src = streamUrl(url, referer);
    const fail = (m: string) => errRef.current(m);
    setInfo(EMPTY);
    const isHls = /m3u8/i.test(url);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 90 });
      hlsRef.current = hls;
      const refresh = () => setInfo(readInfo(hls));
      bindHls(hls, video, refresh, fail);
      hls.subtitleDisplay = false;
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      if (!isHls && !isDirectPlayable(url)) fail('该播放地址需要解析（非直链），请尝试其他线路或站点');
      video.src = src;
      video.play().catch(() => {});
    }
    const onNativeErr = () => {
      if (hlsRef.current) return;
      probeStatus(src).then((code) => fail(describeHttpError(code)));
    };
    video.addEventListener('error', onNativeErr);
    return () => {
      video.removeEventListener('error', onNativeErr);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);

  const apply = useCallback((fn: (h: Hls) => void) => {
    const h = hlsRef.current;
    if (!h) return;
    fn(h);
    setInfo(readInfo(h));
  }, []);

  const setLevel = useCallback((i: number) => apply((h) => (h.currentLevel = i)), [apply]);
  const setAudio = useCallback((i: number) => apply((h) => (h.audioTrack = i)), [apply]);
  const setSubTrack = useCallback(
    (i: number) =>
      apply((h) => {
        h.subtitleTrack = i;
        h.subtitleDisplay = false;
      }),
    [apply]
  );

  return { hlsRef, info, setLevel, setAudio, setSubTrack };
}
