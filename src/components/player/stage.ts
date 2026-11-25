// 画面 / 画幅计算：根据容器尺寸、视频尺寸、旋转、缩放与比例模式得到 video 的内联样式
import type React from 'react';
import type { AspectPrefs, PicPrefs } from './usePlayerPrefs';

const RATIOS: Record<string, number> = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '1:1': 1 };
const FALLBACK_RATIO = 16 / 9;

/** 在 aw×ah 内按比例 r 放置的最大矩形 */
function fit(aw: number, ah: number, r: number): [number, number] {
  return aw / ah > r ? [ah * r, ah] : [aw, aw / r];
}

export function cssFilter(p: PicPrefs): string {
  const parts: string[] = [];
  if (p.brightness !== 100) parts.push(`brightness(${p.brightness}%)`);
  if (p.contrast !== 100) parts.push(`contrast(${p.contrast}%)`);
  if (p.saturate !== 100) parts.push(`saturate(${p.saturate}%)`);
  if (p.hue !== 0) parts.push(`hue-rotate(${p.hue}deg)`);
  if (p.sharpen) parts.push('url(#sxp-sharpen)');
  return parts.join(' ') || 'none';
}

export function videoStyle(
  pic: PicPrefs,
  aspect: AspectPrefs,
  box: { w: number; h: number },
  video: { w: number; h: number }
): React.CSSProperties {
  const rotated = pic.rotate === 90 || pic.rotate === 270;
  const aw = rotated ? box.h : box.w;
  const ah = rotated ? box.w : box.h;
  let w = aw;
  let h = ah;
  let objectFit: React.CSSProperties['objectFit'] = 'contain';
  const r = RATIOS[aspect.mode];
  if (r) {
    [w, h] = fit(aw, ah, r);
    objectFit = 'fill';
  } else if (aspect.mode === 'fill') objectFit = 'fill';
  else if (aspect.mode === 'cover') objectFit = 'cover';
  else if (video.w && video.h) [w, h] = fit(aw, ah, video.w / video.h || FALLBACK_RATIO);
  const sx = aspect.zoom * (pic.flipH ? -1 : 1);
  const sy = aspect.zoom * (pic.flipV ? -1 : 1);
  return {
    width: Math.round(w),
    height: Math.round(h),
    objectFit,
    transform: `translate(-50%, -50%) rotate(${pic.rotate}deg) scale(${sx}, ${sy})`,
    filter: cssFilter(pic),
  };
}
