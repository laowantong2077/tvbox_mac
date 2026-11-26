// 播放故障分类、恢复进度与视频帧健康检查
export const HTTP_FORBIDDEN = 403;
export const MEDIA_ABORTED = 1;
export const MEDIA_NETWORK = 2;
export const MEDIA_DECODE = 3;
export const MEDIA_UNSUPPORTED = 4;
export const GEO_HINT = '可能被地域限制，可到 设置 → 网络与代理 切换为『直连/智能』';

export function describeHttpError(code?: number): string {
  if (code === HTTP_FORBIDDEN) return '视频源拒绝访问（HTTP 403），' + GEO_HINT;
  if (code && code >= 400) return `无法加载视频流（HTTP ${code}），请重试或更换线路`;
  return '播放失败：资源无法访问（可能受地域/版权限制），请重试或更换线路';
}

export function describeMediaError(code = MEDIA_DECODE): string {
  return code === MEDIA_UNSUPPORTED
    ? '当前视频格式或编码不受支持，请更换线路'
    : '视频解码异常，自动恢复未成功，请重试或更换线路';
}

export interface PlaybackSnapshot {
  time: number;
  playing: boolean;
  rate: number;
  defaultRate: number;
}

export function capturePlayback(video: HTMLVideoElement, playing: boolean): PlaybackSnapshot {
  return { time: video.currentTime, playing, rate: video.playbackRate, defaultRate: video.defaultPlaybackRate };
}

const END_MARGIN_SEC = 0.1;

/** 直播只在 seekable 窗口确定后恢复，避免跳回已过期的分片。 */
export function restorePlayback(video: HTMLVideoElement, snapshot: PlaybackSnapshot): boolean {
  video.defaultPlaybackRate = snapshot.defaultRate;
  video.playbackRate = snapshot.rate;
  if (snapshot.time <= 0) return true;
  let target = snapshot.time;
  if (Number.isFinite(video.duration) && video.duration > 0) {
    target = Math.min(target, Math.max(0, video.duration - END_MARGIN_SEC));
  } else {
    const ranges = video.seekable;
    if (!ranges.length) return false;
    const last = ranges.length - 1;
    target = Math.min(Math.max(target, ranges.start(0)), ranges.end(last) - END_MARGIN_SEC);
    for (let i = 0; i < last && target > ranges.end(i); i++) {
      if (target < ranges.start(i + 1)) target = ranges.start(i + 1);
    }
  }
  try {
    video.currentTime = target;
    return true;
  } catch {
    return false;
  }
}

const HEALTH_INTERVAL_MS = 2000;
const FRAME_STALL_MS = 10000;
const MIN_BUFFER_SEC = 2;

type VideoWithFrameCount = HTMLVideoElement & { webkitDecodedFrameCount?: number };

function frameProgress(video: VideoWithFrameCount): number {
  if (video.getVideoPlaybackQuality) return video.getVideoPlaybackQuality().totalVideoFrames;
  return video.webkitDecodedFrameCount ?? video.currentTime;
}

function hasBuffer(video: HTMLVideoElement): boolean {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) - video.currentTime > MIN_BUFFER_SEC) return true;
  }
  return false;
}

/** 只恢复「有缓冲却不再输出视频帧」；暂停、拖动、后台与正常等网均不触发。 */
export function watchVideoFrames(video: HTMLVideoElement, recover: () => void): () => void {
  let progress = frameProgress(video);
  let since = performance.now();
  const reset = () => { progress = frameProgress(video); since = performance.now(); };
  const check = () => {
    const next = frameProgress(video);
    if (document.hidden || video.paused || video.ended || video.seeking || !video.videoWidth || !hasBuffer(video) || next !== progress) {
      reset();
      return;
    }
    if (performance.now() - since < FRAME_STALL_MS) return;
    reset();
    recover();
  };
  const events = ['playing', 'seeking', 'seeked', 'loadedmetadata'];
  events.forEach((event) => video.addEventListener(event, reset));
  const timer = setInterval(check, HEALTH_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    events.forEach((event) => video.removeEventListener(event, reset));
  };
}
