// 播放源加载：hls.js / 原生 HLS / mp4 直链；暴露清晰度、音轨、内嵌字幕轨
import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { isDirectPlayable, streamUrl } from '../../lib/api';
import { platform } from '../../lib/platform';
import { PlaybackSession } from './playbackSession';
import { bindNativeTracks, nativeTrackInfo, setNativeAudio, setNativeSubtitle } from './nativeTracks';
export { GEO_HINT, describeHttpError } from './playbackSupport';

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

function bindInfo(hls: Hls, refresh: () => void) {
  const events = [Hls.Events.MANIFEST_PARSED, Hls.Events.LEVEL_SWITCHED, Hls.Events.AUDIO_TRACKS_UPDATED,
    Hls.Events.AUDIO_TRACK_SWITCHED, Hls.Events.SUBTITLE_TRACKS_UPDATED, Hls.Events.SUBTITLE_TRACK_SWITCH];
  events.forEach((event) => hls.on(event, refresh));
}

function preferNativeHls(): boolean {
  if (platform.os === 'macos' || platform.os === 'ios') return true;
  return /AppleWebKit/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(navigator.userAgent);
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
    setInfo(EMPTY);
    const isHls = /m3u8/i.test(url);
    if (!isHls && !isDirectPlayable(url)) {
      errRef.current('该播放地址需要解析（非直链），请尝试其他线路或站点');
      return;
    }
    const refresh = () => setInfo(hlsRef.current ? readInfo(hlsRef.current) : { ...EMPTY, ...nativeTrackInfo(video) });
    const unbindTracks = bindNativeTracks(video, refresh);
    const session = new PlaybackSession({
      video, src: streamUrl(url, referer), isHls, preferNative: preferNativeHls(),
      onError: (message) => errRef.current(message),
      onHls: (hls) => {
        hlsRef.current = hls;
        if (hls) bindInfo(hls, refresh);
        refresh();
      },
    });
    session.start();
    return () => { unbindTracks(); session.destroy(); };
  }, [videoRef, url, referer, reloadKey]);

  const apply = useCallback((fn: (h: Hls) => void) => {
    const h = hlsRef.current;
    if (!h) return;
    fn(h);
    setInfo(readInfo(h));
  }, []);

  const setLevel = useCallback((i: number) => apply((h) => (h.currentLevel = i)), [apply]);
  const setAudio = useCallback((i: number) => {
    if (hlsRef.current) apply((h) => { h.audioTrack = i; });
    else if (videoRef.current) {
      setNativeAudio(videoRef.current, i);
      setInfo((old) => ({ ...old, ...nativeTrackInfo(videoRef.current!) }));
    }
  }, [apply, videoRef]);
  const setSubTrack = useCallback((i: number) => {
    if (hlsRef.current) apply((h) => { h.subtitleTrack = i; h.subtitleDisplay = false; });
    else if (videoRef.current) {
      setNativeSubtitle(videoRef.current, i);
      setInfo((old) => ({ ...old, ...nativeTrackInfo(videoRef.current!) }));
    }
  }, [apply, videoRef]);

  return { hlsRef, info, setLevel, setAudio, setSubTrack };
}
