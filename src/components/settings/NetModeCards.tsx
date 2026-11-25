/*
 * 网络模式选择：4 张可选卡片（图标 + 标题 + 说明 + 推荐角标）
 */
import React from 'react';
import { MODE_META, type NetMode } from '../../lib/networkApi';
import { NetIcon } from './netUi';

const ORDER: NetMode[] = ['smart', 'system', 'direct', 'proxy'];

export function NetModeCards({
  value,
  saved,
  onChange,
}: {
  value: NetMode;
  saved: NetMode;
  onChange: (m: NetMode) => void;
}) {
  return (
    <div className="net-modes" role="radiogroup" aria-label="网络模式">
      {ORDER.map((m) => {
        const meta = MODE_META[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            className={'net-mode net-mode-' + m + (active ? ' active' : '')}
            onClick={() => onChange(m)}
          >
            {m === 'smart' && <span className="net-mode-rec">推荐</span>}
            <span className="net-mode-icon">
              <NetIcon name={m} size={20} />
            </span>
            <span className="net-mode-title">
              {meta.title}
              {saved === m && <span className="net-mode-cur">当前</span>}
            </span>
            <span className="net-mode-desc">{meta.desc}</span>
            <span className="net-mode-check" aria-hidden="true">
              <NetIcon name="check" size={13} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
