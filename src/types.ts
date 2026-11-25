export interface Episode {
  name: string;
  url: string;
}
export interface PlayGroup {
  from: string;
  episodes: Episode[];
}
export interface Vod {
  id: string;
  name: string;
  pic: string;
  remarks: string;
  year: string;
  area: string;
  typeName: string;
  score: string;
  actor: string;
  director: string;
  content: string;
  groups: PlayGroup[];
  siteKey?: string;
  siteName?: string;
}
export interface Site {
  key: string;
  name: string;
  type: number;
  api: string;
  ext?: string;
  searchable: number;
  quickSearch?: number;
  group?: string;
  supported: boolean;
  reason?: string;
}
export interface Warehouse {
  name: string;
  url: string;
}
export interface Source {
  id: string;
  name: string;
  url: string;
  kind: 'multi' | 'single';
  addedAt: number;
  warehouses?: Warehouse[];
  stats?: { total: number; supported: number };
}
export interface Fav {
  key: string;
  name: string;
  pic: string;
  siteKey: string;
  siteName: string;
  vodId: string;
  remarks: string;
  year?: string;
  addedAt: number;
  site: Site;
}
export interface Hist {
  key: string;
  name: string;
  pic: string;
  siteKey: string;
  siteName: string;
  vodId: string;
  epName: string;
  epIndex: number;
  groupIndex: number;
  position: number;
  duration: number;
  updatedAt: number;
  site: Site;
  groups: PlayGroup[];
}
export interface Settings {
  showUnsupported: boolean;
  theme: string;
  autoNext: boolean;
}
export interface AppState {
  sources: Source[];
  activeSourceId: string | null;
  activeWarehouseUrl: string | null;
  favorites: Fav[];
  history: Hist[];
  settings: Settings;
}
