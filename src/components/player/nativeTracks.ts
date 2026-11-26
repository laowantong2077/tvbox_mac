// WebKit 原生 HLS 的音轨与字幕轨，沿用播放器现有的选择入口
import type { HlsInfo, TrackItem } from './useHls';

interface AudioTrack {
  label: string;
  language: string;
  enabled: boolean;
}
type AudioTrackList = ArrayLike<AudioTrack> & EventTarget;
type NativeVideo = HTMLVideoElement & { audioTracks?: AudioTrackList };

function subtitleTracks(video: HTMLVideoElement): (TrackItem & { track: TextTrack })[] {
  return Array.from(video.textTracks)
    .map((track, index) => ({ index, name: track.label || track.language || '字幕 ' + (index + 1), track }))
    .filter(({ track }) => track.kind === 'subtitles' || track.kind === 'captions');
}

export function nativeTrackInfo(video: NativeVideo): Pick<HlsInfo, 'audioTracks' | 'audioTrack' | 'subTracks' | 'subTrack'> {
  const audio = Array.from(video.audioTracks || []);
  const subs = subtitleTracks(video);
  return {
    audioTracks: audio.map((track, index) => ({ index, name: track.label || track.language || '音轨 ' + (index + 1) })),
    audioTrack: audio.findIndex((track) => track.enabled),
    subTracks: subs.map(({ index, name }) => ({ index, name })),
    subTrack: subs.find(({ track }) => track.mode !== 'disabled')?.index ?? -1,
  };
}

export function setNativeAudio(video: NativeVideo, index: number) {
  const tracks = Array.from(video.audioTracks || []);
  if (!tracks[index]) return;
  tracks.forEach((track, i) => { track.enabled = i === index; });
}

export function setNativeSubtitle(video: HTMLVideoElement, index: number) {
  subtitleTracks(video).forEach(({ track, index: i }) => {
    // 字幕由现有自绘层显示，避免原生字幕重复叠加。
    track.mode = i === index ? 'hidden' : 'disabled';
  });
}

export function bindNativeTracks(video: NativeVideo, refresh: () => void): () => void {
  const lists = [video.textTracks, video.audioTracks].filter((list): list is TextTrackList | AudioTrackList => !!list);
  const events = ['addtrack', 'removetrack', 'change'];
  const onChange = () => {
    subtitleTracks(video).forEach(({ track }) => {
      if (track.mode === 'showing') track.mode = 'hidden';
    });
    refresh();
  };
  lists.forEach((list) => events.forEach((event) => list.addEventListener(event, onChange)));
  video.addEventListener('loadedmetadata', onChange);
  return () => {
    lists.forEach((list) => events.forEach((event) => list.removeEventListener(event, onChange)));
    video.removeEventListener('loadedmetadata', onChange);
  };
}
