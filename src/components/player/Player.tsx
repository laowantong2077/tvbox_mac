// 随心看 播放器主组件：组合 hls 加载、画面/画幅、弹幕、字幕、控制栏与各类面板
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIdle, useOsd, useSize } from './playerHooks';
import type { Vod } from '../../types';
import { useStore } from '../../lib/store';
import '../../styles/player.css';
import '../../styles/player-panels.css';
import '../../styles/player-overlays.css';
import '../../styles/player-mobile.css';
import { ControlBar, QualityMenu } from './ControlBar';
import { Ctx, PanelName, PlayerCtl, SettingsTab } from './ctl';
import type { DanmakuEngine } from './DanmakuEngine';
import { DanmakuLayer } from './DanmakuLayer';
import { DanmakuPanel } from './DanmakuPanel';
import { EpisodeDrawer } from './EpisodeDrawer';
import { DropHint, ErrorView, FastHint, HelpPanel, Loading, Osd, StatsPanel, TopBar } from './Overlays';
import { SettingsPanel } from './SettingsPanel';
import { SubtitleLayer } from './SubtitleLayer';
import { parseSubtitle, Cue, SUBTITLE_EXT } from './subtitles';
import { useActions } from './useActions';
import { useFullscreenMode } from './useFullscreenMode';
import { useTouchGestures } from './useTouchGestures';
import { GestureHintView, withBrightness } from './GestureHint';
import { useDanmaku } from './useDanmaku';
import { useHls } from './useHls';
import { useHotkeys } from './useHotkeys';
import { useAudioBoost, useMediaState } from './useMedia';
import { usePlayback } from './usePlayback';
import { loadSkip, saveSkip, SkipPrefs, usePlayerPrefs } from './usePlayerPrefs';
import { videoStyle } from './stage';
import { readFileText } from './utils';

interface Props {
  vod: Vod;
  initialGroup: number;
  initialEp: number;
  onClose: () => void;
}

const CLICK_DELAY_MS = 220;
const WHEEL_STEP = 0.05;

function useEpisodes(vod: Vod, initialGroup: number, initialEp: number) {
  const groups = vod.groups || [];
  const [gi, setGi] = useState(Math.max(0, Math.min(initialGroup, groups.length - 1)));
  const [ei, setEi] = useState(initialEp);
  const group = groups[gi];
  const hasNext = !!group && (ei < group.episodes.length - 1 || gi < groups.length - 1);
  const hasPrev = ei > 0;
  const goNext = useCallback(() => {
    if (!group) return false;
    if (ei < group.episodes.length - 1) setEi(ei + 1);
    else return false;
    return true;
  }, [group, ei]);
  const goPrev = useCallback(() => ei > 0 && (setEi(ei - 1), true), [ei]);
  return { groups, gi, ei, setGi, setEi, group, episode: group?.episodes?.[ei], hasNext, hasPrev, goNext, goPrev };
}

export function Player({ vod, initialGroup, initialEp, onClose }: Props) {
  const { sites, recordHistory, state } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DanmakuEngine | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const { prefs, update } = usePlayerPrefs();
  const { osd, show } = useOsd();
  const idle = useIdle();
  const size = useSize(wrapRef);
  const ep = useEpisodes(vod, initialGroup, initialEp);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<PanelName>(null);
  const [tab, setTab] = useState<SettingsTab>('speed');
  const [showStats, setShowStats] = useState(false);
  const [fast, setFast] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [skip, setSkipState] = useState<SkipPrefs>(() => loadSkip(vod.name));
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [subName, setSubName] = useState('');
  const [useTrack, setUseTrack] = useState(false);

  const url = ep.episode?.url || '';
  const epName = ep.episode?.name || '';
  const site = sites.find((s) => s.key === vod.siteKey);
  const referer = useMemo(() => {
    try {
      return site?.api ? new URL(site.api).origin + '/' : '';
    } catch (e) {
      return '';
    }
  }, [site]);
  const autoNext = prefs.autoNext ?? state.settings.autoNext;

  const media = useMediaState(videoRef, url);
  usePlayback({ videoRef, vod, site, groups: ep.groups, gi: ep.gi, ei: ep.ei, url, history: state.history, recordHistory, skip, loop: prefs.loop, autoNext, goNext: ep.goNext, osd: show });
  const hls = useHls(videoRef, url, referer, reloadKey, setError);
  useAudioBoost(videoRef, prefs.volume, prefs.muted);
  const dm = useDanmaku(vod.name, epName, ep.ei, ep.group?.episodes.length || 0, show);
  const act = useActions({ videoRef, wrapRef, prefs, update, osd: show, title: vod.name + '-' + epName });
  const fs = useFullscreenMode(wrapRef, show);
  const [bright, setBright] = useState(1);
  const fastHold = (on: boolean) => { act.fastHold(on); setFast(on); };
  const gesture = useTouchGestures({
    videoRef, volume: prefs.muted ? 0 : prefs.volume, bright, setBright, seek: act.seek, toggle: act.toggle, fastHold,
    setVolume: (v) => update({ volume: v, muted: v === 0 }),
    onTap: () => (panel ? setPanel(null) : idle.active ? idle.hide() : idle.poke()),
  });

  // 倍速 / 循环 同步到 video
  useEffect(() => {
    const v = videoRef.current;
    if (!v || fast) return;
    v.defaultPlaybackRate = prefs.speed;
    v.playbackRate = prefs.speed;
    v.loop = prefs.loop;
  }, [prefs.speed, prefs.loop, fast, media.dur]);

  useEffect(() => {
    setError('');
    setCues(null);
    setUseTrack(false);
  }, [url]);

  const open = useCallback((p: PanelName, t?: SettingsTab) => {
    setPanel(p);
    if (t) setTab(t);
  }, []);

  const setSkip = (v: SkipPrefs) => {
    setSkipState(v);
    saveSkip(vod.name, v);
  };

  const loadSubFile = async (f: File) => {
    const list = parseSubtitle(await readFileText(f), f.name);
    if (!list.length) return show('字幕解析失败：未识别到有效条目');
    hls.setSubTrack(-1);
    setUseTrack(false);
    setCues(list);
    setSubName(f.name);
    update({ sub: { on: true } });
    show(`已加载字幕 ${f.name}（${list.length} 条）`);
  };

  const sendDanmaku = (text: string, color: string, mode: 'scroll' | 'top' | 'bottom') => {
    const c = dm.send(text, color, mode, videoRef.current?.currentTime || 0);
    if (!prefs.dm.on) update({ dm: { on: true } });
    engineRef.current?.add(c);
    show('弹幕已发送');
  };

  const selectEpisode = (g: number, e: number) => {
    ep.setGi(g);
    ep.setEi(e);
    setPanel(null);
  };

  const actions = {
    toggle: act.toggle,
    seek: act.seek,
    next: () => (ep.goNext() ? undefined : show('已经是最后一集')),
    prev: () => (ep.goPrev() ? undefined : show('已经是第一集')),
    hasNext: ep.hasNext,
    hasPrev: ep.hasPrev,
    fullscreen: fs.toggle,
    isFull: fs.isFull,
    pip: act.pip,
    screenshot: act.screenshot,
    toggleStats: () => setShowStats((s) => !s),
    sendDanmaku,
  };

  const ctl: PlayerCtl = {
    prefs, update, media, osd: show, hls: { info: hls.info, setLevel: hls.setLevel, setAudio: hls.setAudio },
    sub: {
      cues, fileName: subName, useTrack, loadFile: loadSubFile,
      selectTrack: (i) => { setCues(null); hls.setSubTrack(i); setUseTrack(i >= 0); update({ sub: { on: true } }); },
      clear: () => { setCues(null); hls.setSubTrack(-1); setUseTrack(false); },
    },
    dm, skip, setSkip, autoNext, panel, tab, open, showStats, actions,
  };

  useHotkeys({
    toggle: act.toggle, seekBy: act.seekBy, volumeBy: act.volumeBy, fullscreen: fs.toggle, mute: act.mute,
    danmaku: () => { update({ dm: { on: !prefs.dm.on } }); show(prefs.dm.on ? '弹幕已关闭' : '弹幕已开启'); },
    screenshot: act.screenshot, speedStep: act.speedStep, next: actions.next, prev: actions.prev,
    escape: () => (panel ? setPanel(null) : fs.isFull ? fs.toggle() : onClose()),
    help: () => setPanel((p) => (p === 'help' ? null : 'help')), stats: actions.toggleStats, pip: act.pip,
    fastHold,
  });

  const onStageClick = () => {
    if (panel) return setPanel(null);
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(act.toggle, CLICK_DELAY_MS);
  };
  const onStageDbl = () => {
    clearTimeout(clickTimer.current);
    fs.toggle();
  };
  const onWheel = (e: React.WheelEvent) => {
    if (panel) return;
    act.volumeBy(e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach((f) => {
      if (SUBTITLE_EXT.test(f.name)) loadSubFile(f);
      else if (/\.(xml|json)$/i.test(f.name)) dm.importFile(f);
      else show('不支持的文件：' + f.name);
    });
  };

  const visible = idle.active || !!panel || !media.playing;
  const vStyle = withBrightness(videoStyle(prefs.pic, prefs.aspect, size, { w: media.width, h: media.height }), bright);
  const subLine = [epName, ep.group?.from].filter(Boolean).join(' · ');

  return (
    <Ctx.Provider value={ctl}>
      <div
        className={'sxp' + (visible ? '' : ' idle') + (fs.pseudo ? ' sxp-pseudo-full' : '')}
        ref={wrapRef}
        onMouseMove={idle.poke}
        onWheel={onWheel}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={onDrop}
      >
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id="sxp-sharpen">
            <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" />
          </filter>
        </svg>
        <div className="sxp-stage" onClick={onStageClick} onDoubleClick={onStageDbl} {...gesture.handlers}>
          <video ref={videoRef} className="sxp-video" style={vStyle} playsInline />
          <DanmakuLayer videoRef={videoRef} comments={dm.comments} prefs={prefs.dm} engineRef={engineRef} />
          <SubtitleLayer videoRef={videoRef} cues={cues} useTrack={useTrack} prefs={prefs.sub} />
        </div>
        {media.waiting && !error && <Loading text={media.dur ? '' : '正在加载视频…'} />}
        {fast && <FastHint />}
        <GestureHintView hint={gesture.hint} dur={media.dur} />
        <Osd msg={osd.msg} seq={osd.seq} />
        {showStats && <StatsPanel videoRef={videoRef} hlsRef={hls.hlsRef} />}
        <TopBar title={vod.name} sub={subLine} visible={visible} onBack={onClose} />
        <ControlBar visible={visible} />
        {panel === 'settings' && <SettingsPanel />}
        {panel === 'quality' && <QualityMenu />}
        {panel === 'danmaku' && <DanmakuPanel vodName={vod.name} />}
        {panel === 'help' && <HelpPanel />}
        {panel === 'eps' && <EpisodeDrawer title={vod.name} groups={ep.groups} gi={ep.gi} ei={ep.ei} onSelect={selectEpisode} />}
        {error && (
          <ErrorView msg={error} onRetry={() => { setError(''); setReloadKey((k) => k + 1); }} onLines={() => setPanel('eps')} onBack={onClose} />
        )}
        {dragging && <DropHint />}
      </div>
    </Ctx.Provider>
  );
}

export default Player;
