// 播放器通用工具函数

const SEC_PER_HOUR = 3600;
const SEC_PER_MIN = 60;

/** 秒 → h:mm:ss / m:ss */
export function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / SEC_PER_HOUR);
  const m = Math.floor((t % SEC_PER_HOUR) / SEC_PER_MIN);
  const s = Math.floor(t % SEC_PER_MIN);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 安全读取 localStorage JSON */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 配额满等情况忽略 */
  }
}

/** 从集名中解析集数，如「第12集」「EP03」「12」；失败返回 0 */
export function parseEpNumber(name: string): number {
  const m = /第\s*(\d+)\s*[集话期]/.exec(name) || /(?:ep|e)\s*(\d+)/i.exec(name) || /(\d+)/.exec(name);
  return m ? Number(m[1]) : 0;
}

/** 读取文件文本（自动处理 UTF-8 BOM，失败再尝试 GBK） */
export async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch (e) {
    return utf8;
  }
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
