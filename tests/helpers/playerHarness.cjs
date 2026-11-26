const { buildSync } = require('esbuild');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const compiled = buildSync({
  stdin: {
    contents: `export { PlaybackSession } from './src/components/player/playbackSession';
      export * from './src/components/player/playbackSupport';
      export * from './src/components/player/nativeTracks';`,
    resolveDir: resolve(__dirname, '../..'), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', write: false, external: ['hls.js'],
}).outputFiles[0].text;

function ranges(items = []) {
  return { length: items.length, start: (i) => items[i][0], end: (i) => items[i][1] };
}

class Video extends EventTarget {
  constructor(native = true) {
    super();
    Object.assign(this, {
      native, currentTime: 0, duration: 600, paused: true, ended: false, seeking: false,
      playbackRate: 1, defaultPlaybackRate: 1, videoWidth: 640, frames: 0,
      buffered: ranges([[0, 600]]), seekable: ranges([[0, 600]]), error: null,
      playCalls: 0, loads: 0, readyState: 4, src: '',
    });
  }
  canPlayType() { return this.native ? 'probably' : ''; }
  play() { this.playCalls++; this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() {
    this.loads++;
    this.currentTime = 0;
    this.duration = NaN;
    this.playbackRate = this.defaultPlaybackRate;
    this.error = null;
    this.pause();
  }
  ready(duration = 600) {
    this.duration = duration;
    this.dispatchEvent(new Event('loadedmetadata'));
    this.dispatchEvent(new Event('canplay'));
  }
  fail(code) {
    this.error = { code };
    this.pause();
    this.dispatchEvent(new Event('error'));
  }
  getVideoPlaybackQuality() { return { totalVideoFrames: this.frames }; }
}

function harness(options = {}) {
  let now = 0, nextTimer = 0;
  const timers = new Map();
  const schedule = (fn, delay, repeat = false) => {
    const id = ++nextTimer;
    timers.set(id, { fn, at: now + delay, delay, repeat });
    return id;
  };
  const advance = (duration) => {
    const end = now + duration;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else timers.delete(id);
      timer.fn();
    }
    now = end;
  };
  class FakeHls {
    static instances = [];
    static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError', MUX_ERROR: 'muxError' };
    static isSupported() { return options.mse !== false; }
    constructor(config) {
      this.config = config;
      this.handlers = new Map();
      this.recoveries = 0;
      this.starts = 0;
      this.sources = [];
      FakeHls.instances.push(this);
    }
    on(event, callback) { this.handlers.set(event, [...this.handlers.get(event) || [], callback]); }
    emit(event, data) { this.handlers.get(event)?.forEach((callback) => callback(event, data)); }
    loadSource(src) { this.sources.push(src); }
    attachMedia(video) { this.video = video; video.src = 'blob:test'; }
    startLoad(position) { this.starts++; this.position = position; }
    recoverMediaError() { this.recoveries++; this.video.load(); }
    destroy() { this.destroyed = true; this.handlers.clear(); }
    fail(type, code, extra = {}) {
      this.emit('error', { fatal: true, type, details: 'fragLoadError', response: { code }, ...extra });
    }
  }
  const module = { exports: {} };
  const document = { hidden: false };
  let fetchCalls = 0;
  const context = {
    module, exports: module.exports, require: () => FakeHls, document,
    performance: { now: () => now }, AbortController,
    setTimeout: schedule, clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: (id) => timers.delete(id),
    fetch: (...args) => { fetchCalls++; return (options.fetch || (() => Promise.resolve({ status: 200 })))(...args); },
  };
  runInNewContext(compiled, context);
  const video = new Video(options.native !== false);
  const errors = [];
  const session = new module.exports.PlaybackSession({
    video, src: '/api/stream?url=test.m3u8', isHls: true, preferNative: options.preferNative !== false,
    onHls: () => {}, onError: (message) => errors.push(message), ...options.session,
  });
  return {
    ...module.exports, video, errors, session, Hls: FakeHls, document, advance, timers,
    get fetchCalls() { return fetchCalls; },
  };
}

module.exports = { harness, ranges };
