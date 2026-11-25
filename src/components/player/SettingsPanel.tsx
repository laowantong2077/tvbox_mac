// 设置面板：毛玻璃弹出层，分 Tab（倍速 / 字幕 / 弹幕 / 画面 / 画幅 / 更多）
import React from 'react';
import { SettingsTab, useCtl } from './ctl';
import { PIcon } from './icons';
import { AspectTab, PictureTab, SpeedTab } from './TabsBasic';
import { DanmakuTab, SubtitleTab } from './TabsMedia';
import { Row, Seg, Stepper, Switch } from './ui';
import { fmtTime } from './utils';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'speed', label: '倍速' },
  { key: 'sub', label: '字幕' },
  { key: 'dm', label: '弹幕' },
  { key: 'pic', label: '画面' },
  { key: 'aspect', label: '画幅' },
  { key: 'more', label: '更多' },
];

function TrackSelect() {
  const { hls, osd } = useCtl();
  const { levels, level, audioTracks, audioTrack } = hls.info;
  return (
    <>
      {levels.length > 1 && (
        <Row label="清晰度">
          <Seg
            value={level}
            options={[{ value: -1, label: '自动' }, ...levels.map((l) => ({ value: l.index, label: l.name }))].reverse()}
            onChange={(v) => {
              hls.setLevel(v);
              osd('清晰度 ' + (v < 0 ? '自动' : levels[v].name));
            }}
          />
        </Row>
      )}
      {audioTracks.length > 1 && (
        <Row label="音轨">
          <Seg value={audioTrack} options={audioTracks.map((t) => ({ value: t.index, label: t.name }))} onChange={hls.setAudio} />
        </Row>
      )}
    </>
  );
}

function SkipRows() {
  const { skip, setSkip, media, osd } = useCtl();
  const fmt = (v: number) => (v > 0 ? fmtTime(v) : '关闭');
  const clampSet = (patch: Partial<typeof skip>) => setSkip({ ...skip, ...patch });
  return (
    <>
      <Row label="跳过片头" hint="按剧集记忆">
        <Stepper value={skip.intro} step={5} format={fmt} onChange={(v) => clampSet({ intro: Math.max(0, v) })} />
        <button
          className="sxp-btn sxp-btn-sm"
          onClick={() => {
            clampSet({ intro: Math.floor(media.cur) });
            osd('片头设为 ' + fmtTime(media.cur));
          }}
        >
          设为当前
        </button>
      </Row>
      <Row label="跳过片尾">
        <Stepper value={skip.outro} step={5} format={fmt} onChange={(v) => clampSet({ outro: Math.max(0, v) })} />
        <button
          className="sxp-btn sxp-btn-sm"
          onClick={() => {
            const left = Math.max(0, Math.floor(media.dur - media.cur));
            clampSet({ outro: left });
            osd('片尾设为 剩余 ' + fmtTime(left));
          }}
        >
          设为当前
        </button>
      </Row>
    </>
  );
}

function MoreTab() {
  const { prefs, update, autoNext, actions, open, showStats } = useCtl();
  return (
    <div className="sxp-tab">
      <TrackSelect />
      <div className="sxp-row-inline">
        <label>
          自动下一集 <Switch on={autoNext} onChange={(v) => update({ autoNext: v })} />
        </label>
        <label>
          循环播放 <Switch on={prefs.loop} onChange={(v) => update({ loop: v })} />
        </label>
        <label>
          统计信息 <Switch on={showStats} onChange={actions.toggleStats} />
        </label>
      </div>
      <SkipRows />
      <div className="sxp-row-actions">
        <button className="sxp-btn" onClick={actions.pip}>
          <PIcon name="pip" size={15} />
          画中画
        </button>
        <button className="sxp-btn" onClick={actions.screenshot}>
          <PIcon name="camera" size={15} />
          截图
        </button>
        <button className="sxp-btn" onClick={() => open('help')}>
          <PIcon name="keyboard" size={15} />
          快捷键
        </button>
      </div>
    </div>
  );
}

const BODY: Record<SettingsTab, React.FC> = {
  speed: SpeedTab,
  sub: SubtitleTab,
  dm: DanmakuTab,
  pic: PictureTab,
  aspect: AspectTab,
  more: MoreTab,
};

export function SettingsPanel() {
  const { tab, open } = useCtl();
  const Body = BODY[tab];
  return (
    <div className="sxp-pop sxp-settings" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="sxp-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'sxp-tab-btn' + (t.key === tab ? ' active' : '')} onClick={() => open('settings', t.key)}>
            {t.label}
          </button>
        ))}
        <button className="sxp-pop-close" onClick={() => open(null)} aria-label="关闭">
          <PIcon name="close" size={16} />
        </button>
      </div>
      <div className="sxp-pop-body">
        <Body />
      </div>
    </div>
  );
}
