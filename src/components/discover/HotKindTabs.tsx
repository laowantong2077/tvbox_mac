// 热播页分类切换（仅移动端）：桌面侧栏有三个热播入口，移动端底部只有一个「热播」标签，在页内切换
import React from 'react';
import { KIND_LABEL, type HotKind } from '../../lib/discoverApi';
import { useNav } from '../../lib/nav';
import { useCompact } from '../../lib/compact';

const KINDS: HotKind[] = ['movie', 'tv', 'show'];

export function HotKindTabs({ kind }: { kind: HotKind }) {
  const { reset } = useNav();
  const compact = useCompact();
  if (!compact) return null;
  return (
    <div className="m-kind-tabs" role="tablist">
      {KINDS.map((k) => (
        <button
          key={k}
          role="tab"
          aria-selected={k === kind}
          className={'m-kind-tab' + (k === kind ? ' active' : '')}
          onClick={() => k !== kind && reset({ name: 'hot', kind: k })}
        >
          {KIND_LABEL[k].replace('热播', '')}
        </button>
      ))}
    </div>
  );
}
