// 高性能 Canvas 弹幕引擎
// - 以 video.currentTime 作为时钟：天然跟随 暂停 / 播放 / 倍速；seek 时自动清屏并重新定位
// - 滚动 / 顶部 / 底部 三种类型，轨道分配防重叠（含追尾检测）
// - 每条弹幕预渲染为离屏位图，逐帧只做 drawImage

export type DmMode = 'scroll' | 'top' | 'bottom';
export interface DmComment {
  time: number;
  mode: DmMode;
  color: string;
  text: string;
  size?: number; // B 站字号（25 为标准）
  self?: boolean; // 自己发送，带描边框
}
export interface DmOptions {
  opacity: number;
  size: number;
  speed: number;
  area: number;
  max: number;
  block: string[];
  hideScroll: boolean;
  hideTop: boolean;
  hideBottom: boolean;
}
interface Live {
  c: DmComment;
  bmp: HTMLCanvasElement;
  w: number;
  h: number;
  track: number;
  start: number;
  dur: number;
}

const SCROLL_SECONDS = 8;
const FIXED_SECONDS = 4;
const TRACK_RATIO = 1.3;
const GAP_PX = 24;
const TOP_MARGIN = 6;
const SEEK_JUMP = 1.5;
const STALE_SECONDS = 1;
const BASE_BILI_SIZE = 25;
const FONT = '"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif';

export class DanmakuEngine {
  private ctx: CanvasRenderingContext2D;
  private list: DmComment[] = [];
  private live: Live[] = [];
  private ptr = 0;
  private lastT = -1;
  private raf = 0;
  private dpr = 1;
  private W = 0;
  private H = 0;
  private dirty = true;
  private opts: DmOptions;

  constructor(private canvas: HTMLCanvasElement, private video: HTMLVideoElement, opts: DmOptions) {
    this.ctx = canvas.getContext('2d')!;
    this.opts = opts;
    this.resize();
  }

  setComments(list: DmComment[]) {
    // 保留屏上弹幕，只重新定位指针（时间 ≤ 当前时间的视为已发射），避免发送后被清屏
    this.list = list.filter((c) => c && c.text).sort((a, b) => a.time - b.time);
    const t = this.video.currentTime;
    let p = this.lowerBound(t);
    while (p < this.list.length && this.list[p].time <= t) p++;
    this.ptr = p;
    this.lastT = t;
    this.dirty = true;
  }

  setOptions(opts: DmOptions) {
    const sizeChanged = opts.size !== this.opts.size;
    this.opts = opts;
    if (sizeChanged) this.live = [];
    this.dirty = true;
  }

  /** 立即发射一条弹幕（发送弹幕时使用） */
  add(c: DmComment) {
    const idx = this.lowerBound(c.time);
    this.list.splice(idx, 0, c);
    if (idx < this.ptr) this.ptr++;
    this.emit(c, this.video.currentTime, true);
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.W = this.canvas.clientWidth;
    this.H = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.dirty = true;
  }

  start() {
    if (this.raf) return;
    const loop = () => {
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.live = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.stop();
    this.list = [];
  }

  get liveCount() {
    return this.live.length;
  }

  private lowerBound(t: number) {
    let lo = 0;
    let hi = this.list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.list[mid].time < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private reset(t: number) {
    this.live = [];
    this.ptr = this.lowerBound(t);
    this.lastT = t;
    this.dirty = true;
  }

  private tick() {
    const t = this.video.currentTime;
    if (t < this.lastT - 0.05 || t > this.lastT + SEEK_JUMP) this.reset(t);
    if (t === this.lastT && !this.dirty) return;
    while (this.ptr < this.list.length && this.list[this.ptr].time <= t) {
      const c = this.list[this.ptr++];
      if (c.time >= t - STALE_SECONDS) this.emit(c, t, false);
    }
    this.lastT = t;
    this.dirty = false;
    this.live = this.live.filter((l) => t - l.start <= l.dur && t >= l.start - 0.05);
    this.draw(t);
  }

  private blocked(c: DmComment) {
    const o = this.opts;
    if ((c.mode === 'scroll' && o.hideScroll) || (c.mode === 'top' && o.hideTop)) return true;
    if (c.mode === 'bottom' && o.hideBottom) return true;
    return o.block.some((k) => k && c.text.includes(k));
  }

  private trackHeight() {
    return this.opts.size * TRACK_RATIO;
  }

  private trackCount() {
    return Math.max(1, Math.floor((this.H * this.opts.area) / this.trackHeight()));
  }

  private emit(c: DmComment, t: number, force: boolean) {
    if (!force && this.blocked(c)) return;
    if (!force && this.opts.max > 0 && this.live.length >= this.opts.max) return;
    const bmp = this.render(c);
    const w = bmp.width / this.dpr;
    const h = bmp.height / this.dpr;
    const scroll = c.mode === 'scroll';
    const dur = scroll ? SCROLL_SECONDS / this.opts.speed : FIXED_SECONDS;
    const item: Live = { c, bmp, w, h, track: -1, start: t, dur };
    item.track = scroll ? this.findScrollTrack(item, t) : this.findFixedTrack(c.mode, t);
    if (item.track < 0) {
      if (!force) return;
      item.track = 0;
    }
    this.live.push(item);
    this.dirty = true;
  }

  /** 滚动轨道：前一条尾部已完全进入，且新弹幕不会在前一条离开前追尾 */
  private findScrollTrack(n: Live, t: number) {
    const count = this.trackCount();
    const vN = (this.W + n.w) / n.dur;
    for (let i = 0; i < count; i++) {
      if (this.topBusy(i, t)) continue; // 顶部弹幕占用的行不再放滚动弹幕，避免重叠
      const prev = this.lastInTrack('scroll', i);
      if (!prev) return i;
      const elapsed = t - prev.start;
      const vP = (this.W + prev.w) / prev.dur;
      const entered = elapsed * vP >= prev.w + GAP_PX;
      const remain = prev.dur - elapsed;
      if (entered && this.W / vN >= remain) return i;
    }
    return -1;
  }

  private topBusy(track: number, t: number) {
    const top = this.lastInTrack('top', track);
    return !!top && t - top.start < top.dur;
  }

  /** 固定弹幕：顶部弹幕优先选择没有滚动弹幕的行，避免与滚动弹幕重叠 */
  private findFixedTrack(mode: DmMode, t: number) {
    const count = this.trackCount();
    let fallback = -1;
    for (let i = 0; i < count; i++) {
      const prev = this.lastInTrack(mode, i);
      if (prev && t - prev.start < prev.dur) continue;
      if (mode !== 'top' || !this.lastInTrack('scroll', i)) return i;
      if (fallback < 0) fallback = i;
    }
    return fallback;
  }

  private lastInTrack(mode: DmMode, track: number): Live | null {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      if (l.track === track && l.c.mode === mode) return l;
    }
    return null;
  }

  /** 预渲染：描边文字 + 自己发送的高亮框 */
  private render(c: DmComment): HTMLCanvasElement {
    const size = Math.round(this.opts.size * ((c.size || BASE_BILI_SIZE) / BASE_BILI_SIZE));
    const font = `600 ${size}px ${FONT}`;
    const m = this.ctx;
    m.font = font;
    const pad = 4;
    const w = Math.ceil(m.measureText(c.text).width) + pad * 2;
    const h = Math.ceil(size * 1.25) + pad;
    const bmp = document.createElement('canvas');
    bmp.width = Math.ceil(w * this.dpr);
    bmp.height = Math.ceil(h * this.dpr);
    const g = bmp.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    g.font = font;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(2, size / 9);
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(c.text, pad, h / 2);
    g.fillStyle = c.color || '#fff';
    g.fillText(c.text, pad, h / 2);
    if (c.self) {
      g.strokeStyle = '#ff7a59';
      g.lineWidth = 1.5;
      g.strokeRect(1, 1, w - 2, h - 2);
    }
    return bmp;
  }

  private draw(t: number) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.globalAlpha = this.opts.opacity;
    const th = this.trackHeight();
    for (const l of this.live) {
      let x: number;
      let y: number;
      if (l.c.mode === 'scroll') {
        x = this.W - ((t - l.start) * (this.W + l.w)) / l.dur;
        y = TOP_MARGIN + l.track * th;
      } else {
        x = (this.W - l.w) / 2;
        y = l.c.mode === 'top' ? TOP_MARGIN + l.track * th : this.H - (l.track + 1) * th - th;
      }
      g.drawImage(l.bmp, Math.round(x * this.dpr), Math.round(y * this.dpr));
    }
    g.globalAlpha = 1;
  }
}
