/*
 * 网络模式快捷切换（供顶部栏使用）：显示当前模式与视频流出口归属地，点击展开下拉切换
 *   <NetworkQuickSwitch />
 *   props:
 *     className?   附加类名
 *     showEgress?  是否显示出口归属地（默认 true）
 *     align?       下拉菜单对齐方向 'left' | 'right'（默认 'right'）
 *     onChange?    切换成功后的回调 (mode) => void
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import {
  MODE_META,
  NET_EVENT,
  networkApi,
  type EgressInfo,
  type NetMode,
  type SettingsResp,
} from '../../lib/networkApi';
import { NetIcon } from './netUi';
import '../../styles/network.css';

const ORDER: NetMode[] = ['smart', 'system', 'direct', 'proxy'];

export interface NetworkQuickSwitchProps {
  className?: string;
  showEgress?: boolean;
  align?: 'left' | 'right';
  onChange?: (mode: NetMode) => void;
}

/** 归属地精简：「中国 上海 上海 电信」→「上海 电信」 */
function shortLoc(eg: EgressInfo | null) {
  if (!eg || !eg.ok || !eg.location) return '';
  const parts = eg.location.replace(/·.*$/, '').trim().split(/\s+/);
  const uniq = parts.filter((p, i) => p !== parts[i - 1]);
  return (uniq.length > 2 && uniq[0] === '中国' ? uniq.slice(1) : uniq).slice(0, 2).join(' ');
}

function useQuickNet(showEgress: boolean) {
  const [data, setData] = useState<SettingsResp | null>(null);
  const [egress, setEgress] = useState<EgressInfo | null>(null);

  const loadEgress = useCallback(
    (refresh = false) => {
      if (!showEgress) return;
      networkApi
        .egress(refresh)
        .then((r) => setEgress(r.egress))
        .catch(() => setEgress(null));
    },
    [showEgress]
  );

  useEffect(() => {
    networkApi.getSettings().then(setData).catch(() => undefined);
    loadEgress();
    const on = (e: Event) => {
      setData((e as CustomEvent<SettingsResp>).detail);
      setEgress(null);
      loadEgress(true);
    };
    window.addEventListener(NET_EVENT, on);
    return () => window.removeEventListener(NET_EVENT, on);
  }, [loadEgress]);

  return { data, egress };
}

export function NetworkQuickSwitch({ className = '', showEgress = true, align = 'right', onChange }: NetworkQuickSwitchProps) {
  const { notify } = useStore();
  const { data, egress } = useQuickNet(showEgress);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = async (mode: NetMode) => {
    setOpen(false);
    if (!data || mode === data.settings.mode) return;
    try {
      const r = await networkApi.saveSettings({ mode });
      notify('网络模式：' + MODE_META[mode].title, 'success');
      if (r.status.warning) notify(r.status.warning, 'error');
      onChange?.(mode);
    } catch (e: any) {
      notify('切换失败：' + (e?.message || e), 'error');
    }
  };

  const mode = data?.settings.mode || 'system';
  const loc = shortLoc(egress);
  const warn = !!data?.status.warning;
  return (
    <div className={'net-qs ' + className} ref={ref}>
      <button
        className={'net-qs-btn' + (open ? ' open' : '')}
        title={egress?.ok ? `视频流出口 ${egress.ip} · ${egress.location}` : '网络模式'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={'net-qs-dot ' + (warn ? 'warn' : 'mode-' + mode)} />
        <span className="net-qs-mode">{MODE_META[mode].short}</span>
        {showEgress && loc && <span className="net-qs-loc">{loc}</span>}
        <NetIcon name="down" size={13} />
      </button>
      {open && (
        <div className={'net-qs-menu align-' + align} role="menu">
          {ORDER.map((m) => (
            <button
              key={m}
              role="menuitemradio"
              aria-checked={m === mode}
              className={'net-qs-item' + (m === mode ? ' active' : '')}
              onClick={() => pick(m)}
            >
              <span className="net-qs-item-icon">
                <NetIcon name={m} size={15} />
              </span>
              <span className="net-qs-item-body">
                <span className="net-qs-item-title">
                  {MODE_META[m].title}
                  {m === 'smart' && <span className="net-mode-rec inline">推荐</span>}
                </span>
                <span className="net-qs-item-desc">{MODE_META[m].desc}</span>
              </span>
              {m === mode && <NetIcon name="check" size={14} className="net-qs-check" />}
            </button>
          ))}
          {egress?.ok && (
            <div className="net-qs-foot">
              视频流出口：{egress.ip} · {egress.location}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NetworkQuickSwitch;
