import React from 'react';
import { useStore } from '../lib/store';
import { Icon } from './Icon';

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div className={'toast toast-' + t.type} key={t.id} onClick={() => dismissToast(t.id)}>
          <Icon
            name={t.type === 'error' ? 'warn' : t.type === 'success' ? 'check' : 'info'}
            size={18}
          />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({
  icon = 'film',
  title,
  desc,
  children,
}: {
  icon?: string;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={40} />
      </div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label && <div className="spinner-label">{label}</div>}
    </div>
  );
}
