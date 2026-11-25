import React from 'react';
import { Icon } from '../Icon';
import '../../styles/discover.css';

/** 插画式空态 / 错误态 */
export function StateView({
  icon = 'film',
  tone = 'normal',
  title,
  desc,
  children,
}: {
  icon?: string;
  tone?: 'normal' | 'error';
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={'dstate ' + (tone === 'error' ? 'is-error' : '')}>
      <div className="dstate-art">
        <span className="dstate-orb" />
        <span className="dstate-card c1" />
        <span className="dstate-card c2" />
        <span className="dstate-icon">
          <Icon name={icon} size={30} />
        </span>
      </div>
      <div className="dstate-title">{title}</div>
      {desc && <div className="dstate-desc">{desc}</div>}
      {children && <div className="dstate-actions">{children}</div>}
    </div>
  );
}

/** 豆瓣不可用、已回退到站点数据时的提示条 */
export function FallbackNotice({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="dnotice">
      <Icon name="info" size={16} />
      <span>{text}</span>
      {onRetry && (
        <button className="dnotice-btn" onClick={onRetry}>
          <Icon name="refresh" size={14} /> 重试豆瓣
        </button>
      )}
    </div>
  );
}
