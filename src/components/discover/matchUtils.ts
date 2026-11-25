/*
 * 资源匹配：片名相似度 + 年份 打分排序
 */
import type { Vod } from '../../types';

/** 归一化片名：去空白、标点、常见后缀（如「第一季」统一为数字） */
export function normTitle(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s·・:：,，.。!！?？'"“”‘’()（）\[\]【】《》<>\-—_~]/g, '')
    .replace(/第([一二三四五六七八九十\d]+)[季部]/g, '$1')
    .replace(/(国语|粤语|中字|高清|hd|tc|蓝光|未删减|完整版)$/g, '');
}

/** 编辑距离（片名长度很短，直接 DP） */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 0~1 的名称相似度：完全一致 1，包含关系 0.85 左右，其余按编辑距离 */
export function titleSimilarity(a: string, b: string): number {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    return 0.7 + 0.2 * (Math.min(x.length, y.length) / Math.max(x.length, y.length));
  }
  return Math.max(0, 1 - levenshtein(x, y) / Math.max(x.length, y.length));
}

export const MATCH_THRESHOLD = 0.45;

/** 综合得分：名称相似度为主，年份一致加分、不一致扣分 */
export function matchScore(vod: Vod, title: string, year?: string): number {
  let s = titleSimilarity(vod.name, title);
  const vy = String(vod.year || '').slice(0, 4);
  if (year && vy) {
    if (vy === year) s += 0.15;
    else if (Math.abs(Number(vy) - Number(year)) <= 1) s += 0.05;
    else s -= 0.15;
  }
  return Math.round(s * 100) / 100;
}
