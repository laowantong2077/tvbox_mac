// 同一个 video 元素上的播放会话：Apple 原生 HLS、hls.js 与有限次数故障恢复
import Hls, { type ErrorData } from 'hls.js';
import {
  capturePlayback, describeHttpError, describeMediaError, HTTP_FORBIDDEN,
  MEDIA_ABORTED, MEDIA_DECODE, MEDIA_NETWORK, MEDIA_UNSUPPORTED,
  restorePlayback, watchVideoFrames, type PlaybackSnapshot,
} from './playbackSupport';

const MAX_NETWORK_RETRIES = 2;
const MAX_MEDIA_RETRIES = 2;
const MAX_NATIVE_RELOADS = 1;
const RETRY_DELAY_MS = 1000;
const PROBE_TIMEOUT_MS = 5000;
const BACK_BUFFER_SEC = 30;
const FORWARD_BUFFER_SEC = 60;

type Engine = 'native' | 'hls';
interface SessionOptions {
  video: HTMLVideoElement;
  src: string;
  isHls: boolean;
  preferNative: boolean;
  onHls: (hls: Hls | null) => void;
  onError: (message: string) => void;
}

export class PlaybackSession {
  private hls: Hls | null = null;
  private active = true;
  private switching = false;
  private started = false;
  private wantsPlay = true;
  private triedNative = false;
  private triedHls = false;
  private networkRetries = 0;
  private mediaRetries = 0;
  private nativeReloads = 0;
  private resume: PlaybackSnapshot | null = null;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private probe?: AbortController;
  private stopWatch?: () => void;

  constructor(private options: SessionOptions) {}

  private get video() { return this.options.video; }
  private get canNative() { return !!this.video.canPlayType('application/vnd.apple.mpegurl'); }

  start() {
    this.video.addEventListener('error', this.onNativeError);
    this.video.addEventListener('play', this.onPlay);
    this.video.addEventListener('pause', this.onPause);
    this.video.addEventListener('loadedmetadata', this.onReady);
    this.video.addEventListener('canplay', this.onReady);
    this.stopWatch = watchVideoFrames(this.video, () => this.recoverMedia());
    const useHls = this.options.isHls && Hls.isSupported() && !(this.options.preferNative && this.canNative);
    this.switchTo(useHls ? 'hls' : 'native');
  }

  destroy() {
    if (!this.active) return;
    this.active = false;
    this.stopWatch?.();
    this.video.removeEventListener('error', this.onNativeError);
    this.video.removeEventListener('play', this.onPlay);
    this.video.removeEventListener('pause', this.onPause);
    this.video.removeEventListener('loadedmetadata', this.onReady);
    this.video.removeEventListener('canplay', this.onReady);
    this.stopEngine();
  }

  private stopEngine() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.probe?.abort();
    this.probe = undefined;
    const hls = this.hls;
    this.hls = null;
    hls?.destroy();
    this.options.onHls(null);
    this.video.removeAttribute('src');
    this.video.load();
  }

  private remember() {
    // 恢复过程尚未产出新进度时，保留最初快照，避免回退到 0 秒。
    this.resume ??= capturePlayback(this.video, this.wantsPlay && !this.video.ended);
    this.switching = true;
  }

  private switchTo(engine: Engine) {
    if (!this.active) return;
    if (this.started) this.remember();
    this.switching = true;
    this.stopEngine();
    this.started = true;
    if (engine === 'hls') {
      this.startHls();
    } else {
      this.triedNative = true;
      this.video.src = this.options.src;
    }
    if (!this.resume) this.switching = false;
    this.play();
  }

  private startHls() {
    this.triedHls = true;
    const hls = new Hls({ enableWorker: true, backBufferLength: BACK_BUFFER_SEC, maxMaxBufferLength: FORWARD_BUFFER_SEC });
    this.hls = hls;
    this.options.onHls(hls);
    hls.subtitleDisplay = false;
    hls.on(Hls.Events.MANIFEST_PARSED, () => this.play());
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (this.active && this.hls === hls) this.onHlsError(data);
    });
    hls.loadSource(this.options.src);
    hls.attachMedia(this.video);
  }

  private play() {
    if (this.active && this.wantsPlay) this.video.play().catch(() => {});
  }

  private onPlay = () => { if (!this.switching && !this.video.paused) this.wantsPlay = true; };
  private onPause = () => {
    // load() 产生的 pause 可能延迟到再次播放后才到达，以当前状态为准。
    if (!this.switching && this.video.paused && !this.video.error && !this.video.ended) this.wantsPlay = false;
  };
  private onReady = () => {
    if (this.resume) {
      if (!restorePlayback(this.video, this.resume)) return;
      this.wantsPlay = this.resume.playing;
      this.resume = null;
    }
    this.switching = false;
    this.play();
  };

  private onHlsError(data: ErrorData) {
    // 非致命错误由 hls.js 自行恢复，不能在每次缓冲告警时重建解码器。
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      const code = data.response?.code;
      if (code === HTTP_FORBIDDEN) return this.fail(describeHttpError(code));
      this.retryNetwork(() => {
        if (data.details.startsWith('manifest')) this.hls?.loadSource(this.options.src);
        else this.hls?.startLoad(this.video.currentTime || -1);
      }, code);
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR || data.type === Hls.ErrorTypes.MUX_ERROR) {
      this.recoverMedia();
    } else {
      this.fail(describeMediaError(MEDIA_UNSUPPORTED));
    }
  }

  private retryNetwork(retry: () => void, code?: number) {
    if (this.retryTimer) return;
    if (this.networkRetries >= MAX_NETWORK_RETRIES) return this.fail(describeHttpError(code));
    this.networkRetries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.active) retry();
    }, RETRY_DELAY_MS * this.networkRetries);
  }

  private recoverMedia(code = MEDIA_DECODE) {
    if (!this.active) return;
    if (this.hls) {
      if (this.canNative && !this.triedNative) return this.switchTo('native');
      if (this.mediaRetries++ >= MAX_MEDIA_RETRIES) return this.fail(describeMediaError(code));
      this.remember();
      // recoverMediaError 仅用于 video 已处于错误状态的情况；无帧输出需重建会话。
      if (this.video.error) this.hls.recoverMediaError();
      else this.switchTo('hls');
    } else if (code !== MEDIA_UNSUPPORTED && this.nativeReloads++ < MAX_NATIVE_RELOADS) {
      this.switchTo('native');
    } else if (this.options.isHls && !this.triedHls && Hls.isSupported()) {
      this.switchTo('hls');
    } else {
      this.fail(describeMediaError(code));
    }
  }

  private onNativeError = () => {
    if (!this.active || this.hls) return;
    const code = this.video.error?.code;
    if (code === MEDIA_ABORTED) return;
    if (code === MEDIA_DECODE) this.recoverMedia(code);
    else if (code === MEDIA_UNSUPPORTED) {
      if (this.options.isHls && !this.triedHls && Hls.isSupported()) this.recoverMedia(code);
      else void this.probeNetwork(code);
    } else if (code === MEDIA_NETWORK || code === undefined) void this.probeNetwork();
  };

  private async probeNetwork(mediaCode = MEDIA_NETWORK) {
    if (this.probe) return;
    const controller = new AbortController();
    this.probe = controller;
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    let code: number | undefined;
    try {
      const response = await fetch(this.options.src, { headers: { Range: 'bytes=0-1' }, signal: controller.signal });
      void response.body?.cancel().catch(() => {});
      code = response.status;
    } catch { /* 超时或断网也走有上限的网络恢复 */ }
    clearTimeout(timer);
    if (!this.active || this.probe !== controller) return;
    this.probe = undefined;
    if (code === HTTP_FORBIDDEN) this.fail(describeHttpError(code));
    else if (mediaCode === MEDIA_UNSUPPORTED && code && code < 400) this.fail(describeMediaError(mediaCode));
    else this.retryNetwork(() => this.switchTo('native'), code);
  }

  private fail(message: string) {
    this.destroy();
    this.options.onError(message);
  }
}
