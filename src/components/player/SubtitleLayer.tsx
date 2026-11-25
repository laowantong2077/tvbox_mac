// 自绘字幕层：本地字幕 cue 或 hls 内嵌字幕轨（textTrack 设为 hidden 后读取 activeCues）
import React, { useEffect, useState } from 'react';
import { activeCues, Cue } from './subtitles';
import type { SubPrefs } from './usePlayerPrefs';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  cues: Cue[] | null; // 本地字幕；为 null 时读取内嵌字幕轨
  useTrack: boolean;
  prefs: SubPrefs;
}

const BASE_HEIGHT = 1080;

/** 读取 hls 内嵌字幕轨当前 cue 文本，同时强制为 hidden 避免原生渲染 */
function readTrackText(v: HTMLVideoElement): string {
  const lines: string[] = [];
  for (let i = 0; i < v.textTracks.length; i++) {
    const tt = v.textTracks[i];
    if (tt.mode === 'disabled') continue;
    if (tt.mode === 'showing') tt.mode = 'hidden';
    const ac = tt.activeCues;
    for (let j = 0; ac && j < ac.length; j++) {
      const text = (ac[j] as VTTCue).text || '';
      // hls 分片可能重复追加同一条 cue（或多轨同时 hidden），这里去重
      if (text && !lines.includes(text)) lines.push(text);
    }
  }
  return lines.join('\n').replace(/<[^>]+>/g, '');
}

export function SubtitleLayer({ videoRef, cues, useTrack, prefs }: Props) {
  const [text, setText] = useState('');
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !prefs.on || (!cues && !useTrack)) {
      setText('');
      return;
    }
    let raf = 0;
    let last = '';
    const loop = () => {
      const t = v.currentTime - prefs.offset;
      const next = cues ? activeCues(cues, t).map((c) => c.text).join('\n') : readTrackText(v);
      if (next !== last) setText((last = next));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, cues, useTrack, prefs.on, prefs.offset]);

  if (!text) return null;
  const style: React.CSSProperties = {
    bottom: prefs.bottom + '%',
    fontSize: `calc(${prefs.size} / ${BASE_HEIGHT} * 100vh)`,
    color: prefs.color,
  };
  return (
    <div className="sxp-sub-layer" style={style}>
      {text.split('\n').map((line, i) => (
        <span key={i} className={'sxp-sub-line bg-' + prefs.bg}>
          {line}
        </span>
      ))}
    </div>
  );
}
