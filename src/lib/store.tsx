import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from './api';
import type { AppState, Fav, Hist, Site, Source, Vod } from '../types';

const DEFAULT_STATE: AppState = {
  sources: [],
  activeSourceId: null,
  activeWarehouseUrl: null,
  favorites: [],
  history: [],
  settings: { showUnsupported: false, theme: 'dark', autoNext: true },
};

interface ToastItem {
  id: number;
  msg: string;
  type: 'info' | 'error' | 'success';
}

interface StoreCtx {
  ready: boolean;
  state: AppState;
  demoSite: Site | null;
  sites: Site[];
  loadedSites: Site[];
  activeSource: Source | null;
  activeWarehouse: string | null;
  loadingSites: boolean;
  sitesError: string;
  setState: (updater: (s: AppState) => AppState) => void;
  saveSource: (src: Source) => void;
  removeSource: (id: string) => void;
  activate: (sourceId: string, warehouseUrl?: string | null) => void;
  reloadSites: () => Promise<void>;
  notify: (msg: string, type?: 'info' | 'error' | 'success') => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
  toggleFav: (vod: Vod) => void;
  isFav: (key: string) => boolean;
  recordHistory: (h: Omit<Hist, 'updatedAt'>) => void;
  clearHistory: () => void;
}

const Ctx = createContext<StoreCtx>(null as unknown as StoreCtx);
export const useStore = () => useContext(Ctx);

export function vodKey(vod: Vod): string {
  return (vod.siteKey || '') + '::' + vod.id;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [demoSite, setDemoSite] = useState<Site | null>(null);
  const [loadedSites, setLoadedSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [sitesError, setSitesError] = useState('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setState = useCallback((updater: (s: AppState) => AppState) => {
    setStateRaw((prev) => updater(prev));
  }, []);

  const notify = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // 初次加载
  useEffect(() => {
    (async () => {
      try {
        const [bs, st] = await Promise.all([api.bootstrap(), api.getState()]);
        setDemoSite(bs.demoSite);
        setStateRaw({
          ...DEFAULT_STATE,
          ...st,
          settings: { ...DEFAULT_STATE.settings, ...(st.settings || {}) },
          sources: st.sources || [],
          favorites: st.favorites || [],
          history: st.history || [],
        });
      } catch (e: any) {
        notify('初始化失败：' + (e?.message || e), 'error');
      } finally {
        setReady(true);
      }
    })();
  }, [notify]);

  // 持久化（跳过首个渲染）
  const firstSave = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const t = setTimeout(() => {
      api.putState(state).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [state, ready]);

  const reloadSites = useCallback(async () => {
    const s = stateRef.current;
    if (!s.activeSourceId) {
      setLoadedSites([]);
      return;
    }
    const src = s.sources.find((x) => x.id === s.activeSourceId);
    if (!src) {
      setLoadedSites([]);
      return;
    }
    setLoadingSites(true);
    setSitesError('');
    try {
      let loadUrl = src.url;
      if (src.kind === 'multi') {
        const wh =
          (src.warehouses || []).find((w) => w.url === s.activeWarehouseUrl) ||
          (src.warehouses || [])[0];
        if (wh) loadUrl = wh.url;
      }
      let cfg = await api.loadConfig(loadUrl);
      if (cfg.kind === 'single') {
        setLoadedSites(cfg.sites || []);
      } else if (cfg.kind === 'multi' && cfg.warehouses?.length) {
        const cfg2 = await api.loadConfig(cfg.warehouses[0].url);
        setLoadedSites(cfg2.sites || []);
      } else {
        setLoadedSites([]);
      }
    } catch (e: any) {
      setSitesError(e?.message || String(e));
      setLoadedSites([]);
    } finally {
      setLoadingSites(false);
    }
  }, []);

  // active source / sources 变化时重载站点
  useEffect(() => {
    if (!ready) return;
    reloadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.activeSourceId, state.activeWarehouseUrl, state.sources.length]);

  const sites = useMemo(() => {
    return demoSite ? [demoSite, ...loadedSites] : loadedSites;
  }, [demoSite, loadedSites]);

  const activeSource = useMemo(
    () => state.sources.find((s) => s.id === state.activeSourceId) || null,
    [state.sources, state.activeSourceId]
  );

  const saveSource = useCallback(
    (src: Source) => {
      setState((s) => {
        const exists = s.sources.some((x) => x.id === src.id);
        const sources = exists
          ? s.sources.map((x) => (x.id === src.id ? src : x))
          : [src, ...s.sources];
        return {
          ...s,
          sources,
          activeSourceId: src.id,
          activeWarehouseUrl:
            src.kind === 'multi' ? src.warehouses?.[0]?.url || null : null,
        };
      });
      notify('已添加源：' + src.name, 'success');
    },
    [notify, setState]
  );

  const removeSource = useCallback(
    (id: string) => {
      setState((s) => {
        const removingActive = s.activeSourceId === id;
        return {
          ...s,
          sources: s.sources.filter((x) => x.id !== id),
          activeSourceId: removingActive ? null : s.activeSourceId,
          activeWarehouseUrl: removingActive ? null : s.activeWarehouseUrl,
        };
      });
      notify('已删除源', 'info');
    },
    [notify, setState]
  );

  const activate = useCallback(
    (sourceId: string, warehouseUrl: string | null = null) => {
      setState((s) => ({
        ...s,
        activeSourceId: sourceId,
        activeWarehouseUrl: warehouseUrl,
      }));
    },
    [setState]
  );

  const sitesMap = useMemo(() => {
    const m: Record<string, Site> = {};
    for (const st of sites) m[st.key] = st;
    return m;
  }, [sites]);

  const toggleFav = useCallback(
    (vod: Vod) => {
      setState((s) => {
        const key = vodKey(vod);
        const exists = s.favorites.some((f) => f.key === key);
        if (exists) return { ...s, favorites: s.favorites.filter((f) => f.key !== key) };
        const site = sitesMap[vod.siteKey || ''] || ({} as Site);
        const fav: Fav = {
          key,
          name: vod.name,
          pic: vod.pic,
          siteKey: vod.siteKey || '',
          siteName: vod.siteName || site.name || '',
          vodId: vod.id,
          remarks: vod.remarks,
          year: vod.year,
          addedAt: Date.now(),
          site,
        };
        return { ...s, favorites: [fav, ...s.favorites] };
      });
    },
    [setState, sitesMap]
  );

  const isFav = useCallback(
    (key: string) => state.favorites.some((f) => f.key === key),
    [state.favorites]
  );

  const recordHistory = useCallback(
    (h: Omit<Hist, 'updatedAt'>) => {
      setState((s) => {
        const rest = s.history.filter((x) => x.key !== h.key);
        const entry: Hist = { ...h, updatedAt: Date.now() };
        return { ...s, history: [entry, ...rest].slice(0, 120) };
      });
    },
    [setState]
  );

  const clearHistory = useCallback(() => {
    setState((s) => ({ ...s, history: [] }));
    notify('已清空观看记录', 'info');
  }, [setState, notify]);

  const value: StoreCtx = {
    ready,
    state,
    demoSite,
    sites,
    loadedSites,
    activeSource,
    activeWarehouse: state.activeWarehouseUrl,
    loadingSites,
    sitesError,
    setState,
    saveSource,
    removeSource,
    activate,
    reloadSites,
    notify,
    toasts,
    dismissToast,
    toggleFav,
    isFav,
    recordHistory,
    clearHistory,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
