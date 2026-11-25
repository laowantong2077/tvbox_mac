// 字幕解析：SRT / WebVTT / ASS / SSA → cue 列表（自绘渲染用）

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** 解析 00:01:02,345 / 01:02.345 / 0:01:02.34 等时间戳 */
export function parseTimestamp(s: string): number {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/.exec(s.trim());
  if (!m) return NaN;
  const h = Number(m[1] || 0);
  const frac = m[4] ? Number(m[4]) / Math.pow(10, m[4].length) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

function cleanHtml(t: string): string {
  return t
    .replace(/<\/?(?:i|b|u|s|font|c|v|lang|ruby|rt)[^>]*>/gi, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** SRT 与 VTT 结构相似：以空行分块，块内含 "-->" 的行为时间轴 */
export function parseSrtVtt(src: string): Cue[] {
  const blocks = src.replace(/\r/g, '').split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const idx = lines.findIndex((l) => l.includes('-->'));
    if (idx < 0) continue;
    const [a, b] = lines[idx].split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    const text = cleanHtml(lines.slice(idx + 1).join('\n'));
    if (isFinite(start) && isFinite(end) && text) cues.push({ start, end, text });
  }
  return cues;
}

/** ASS/SSA：读取 [Events] 中的 Format 与 Dialogue 行 */
export function parseAss(src: string): Cue[] {
  const lines = src.replace(/\r/g, '').split('\n');
  let fields: string[] = [];
  const cues: Cue[] = [];
  for (const line of lines) {
    if (/^Format:/i.test(line) && fields.length === 0 && /Start/i.test(line) && /Text/i.test(line)) {
      fields = line.slice(7).split(',').map((s) => s.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue:/i.test(line)) continue;
    const f = fields.length ? fields : ['layer', 'start', 'end', 'style', 'name', 'ml', 'mr', 'mv', 'effect', 'text'];
    const parts = line.slice(9).split(',');
    const head = parts.slice(0, f.length - 1);
    const text = parts.slice(f.length - 1).join(',');
    const start = parseTimestamp(head[f.indexOf('start')] || '');
    const end = parseTimestamp(head[f.indexOf('end')] || '');
    const clean = cleanHtml(text.replace(/\\N/gi, '\n').replace(/\\h/g, ' '));
    if (isFinite(start) && isFinite(end) && clean) cues.push({ start, end, text: clean });
  }
  return cues;
}

/** 根据扩展名/内容自动识别格式 */
export function parseSubtitle(src: string, filename = ''): Cue[] {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const isAss = ext === 'ass' || ext === 'ssa' || /\[Script Info\]|\[Events\]/i.test(src);
  const cues = isAss ? parseAss(src) : parseSrtVtt(src);
  return cues.sort((x, y) => x.start - y.start);
}

/** 二分查找当前时间命中的 cue（可能多条重叠） */
export function activeCues(cues: Cue[], t: number): Cue[] {
  let lo = 0;
  let hi = cues.length - 1;
  let first = cues.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].end >= t) {
      first = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  const out: Cue[] = [];
  // end 不保证单调，向后扫描少量条目
  for (let i = Math.max(0, first - 20); i < cues.length && cues[i].start <= t; i++) {
    if (cues[i].end >= t && cues[i].start <= t) out.push(cues[i]);
  }
  return out;
}

export const SUBTITLE_EXT = /\.(srt|vtt|ass|ssa)$/i;
