// 弹幕画布层：挂载引擎，同步弹幕列表 / 设置 / 尺寸变化
import React, { useEffect, useRef } from 'react';
import { DanmakuEngine, DmComment } from './DanmakuEngine';
import type { DmPrefs } from './usePlayerPrefs';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  comments: DmComment[];
  prefs: DmPrefs;
  engineRef: React.MutableRefObject<DanmakuEngine | null>;
}

export function DanmakuLayer({ videoRef, comments, prefs, engineRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 创建 / 销毁引擎
  useEffect(() => {
    const c = canvasRef.current;
    const v = videoRef.current;
    if (!c || !v) return;
    const eng = new DanmakuEngine(c, v, prefs);
    engineRef.current = eng;
    const ro = new ResizeObserver(() => eng.resize());
    ro.observe(c);
    return () => {
      ro.disconnect();
      eng.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setComments(comments);
  }, [comments, engineRef]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setOptions(prefs);
    if (prefs.on) eng.start();
    else eng.stop();
  }, [prefs, engineRef]);

  return <canvas ref={canvasRef} className={'sxp-dm-layer' + (prefs.on ? '' : ' off')} />;
}
