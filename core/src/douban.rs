//! 豆瓣发现数据源（对应 server/lib/douban.js）
//!  - 统一请求（浏览器 UA + Referer）与内存缓存（默认 10 分钟）
//!  - 规范化条目：{ id, title, rating, cover, subtitle, year, isNew, kind, episodes, region, genres }
//!  - 标签 / 排序映射：recent_hot（热度）与 search_subjects（时间 / 评分）
pub mod cache;
pub mod js;
pub mod normalize;
pub mod tags;

use crate::http::{get_json, ReqOpts};
use anyhow::{anyhow, Result};
use cache::TtlCache;
use js::{field, ser_num, to_number, truthy};
use normalize::{normalize_item, normalize_subject, Item, Subject};
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tags::Tag;

pub use tags::get_tags;

pub const REFERER: &str = "https://movie.douban.com/";
const REXXAR: &str = "https://m.douban.com/rexxar/api/v2";
const CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const CACHE_MAX: usize = 300;
const TIMEOUT_MS: u64 = 12_000;
/// search_subjects 无总数时的占位值
const TOTAL_UNKNOWN: f64 = -1.0;

/// 列表原始结果（缓存单元）
#[derive(Clone)]
struct HotRaw {
    items: Vec<Item>,
    total: f64,
}

static HOT_CACHE: Lazy<TtlCache<HotRaw>> = Lazy::new(|| TtlCache::new(CACHE_TTL, CACHE_MAX));
static COL_CACHE: Lazy<TtlCache<Vec<Item>>> = Lazy::new(|| TtlCache::new(CACHE_TTL, CACHE_MAX));
static SUBJECT_CACHE: Lazy<TtlCache<Subject>> = Lazy::new(|| TtlCache::new(CACHE_TTL, CACHE_MAX));

/// 热播列表接口结果
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotResult {
    pub kind: &'static str,
    pub tag: &'static str,
    pub sort: &'static str,
    pub start: i64,
    pub limit: i64,
    #[serde(serialize_with = "ser_num")]
    pub total: f64,
    pub has_more: bool,
    pub items: Vec<Item>,
}

/// 热播列表查询参数（均为原始字符串，与 req.query 一致）
#[derive(Default, Debug)]
pub struct HotQuery<'a> {
    pub kind: Option<&'a str>,
    pub tag: Option<&'a str>,
    pub sort: Option<&'a str>,
    pub start: Option<&'a str>,
    pub limit: Option<&'a str>,
}

/// 统一请求：失败时抛出友好中文错误
async fn fetch_douban(url: &str) -> Result<Value> {
    let opts = ReqOpts::default()
        .header("Referer", REFERER)
        .header("Accept", "application/json")
        .timeout(TIMEOUT_MS);
    let data = get_json(url, &opts)
        .await
        .map_err(|e| anyhow!("豆瓣数据暂时无法访问（{}）", non_empty(e.to_string(), "网络错误")))?;
    let msg = field(&data, "msg");
    if truthy(field(&data, "code")) && truthy(msg) {
        return Err(anyhow!("豆瓣接口返回错误：{}", js::js_string(msg)));
    }
    Ok(data)
}

fn non_empty(s: String, def: &str) -> String {
    if s.is_empty() {
        def.to_string()
    } else {
        s
    }
}

/// 把数组字段逐项规范化
fn map_items(list: &Value, kind: &str) -> Vec<Item> {
    list.as_array().map(|a| a.iter().map(|it| normalize_item(it, kind)).collect()).unwrap_or_default()
}

/// recent_hot：热度排序，带副标题/年份/集数信息
async fn recent_hot(kind: &str, tag: &Tag, start: i64, limit: i64) -> Result<HotRaw> {
    let path = if kind == "movie" { "movie" } else { "tv" };
    let url = format!(
        "{REXXAR}/subject/recent_hot/{path}?start={start}&limit={limit}&category={}&type={}",
        urlencoding::encode(tag.cat),
        urlencoding::encode(tag.kind_type)
    );
    let d = fetch_douban(&url).await?;
    let items = map_items(field(&d, "items"), path);
    let total = to_number(field(&d, "total"));
    let total = if total != 0.0 { total } else { items.len() as f64 };
    Ok(HotRaw { items, total })
}

/// search_subjects：支持 time / rank 排序（无总数，以返回条数判断是否还有更多）
async fn search_subjects(kind: &str, tag: &Tag, sort: &str, start: i64, limit: i64) -> Result<HotRaw> {
    let kind_type = if kind == "movie" { "movie" } else { "tv" };
    let url = format!(
        "https://movie.douban.com/j/search_subjects?type={kind_type}&tag={}&sort={sort}&page_limit={limit}&page_start={start}",
        urlencoding::encode(tag.ss.unwrap_or_default())
    );
    let d = fetch_douban(&url).await?;
    Ok(HotRaw { items: map_items(field(&d, "subjects"), kind_type), total: TOTAL_UNKNOWN })
}

pub async fn get_hot(q: &HotQuery<'_>) -> Result<HotResult> {
    let k = tags::norm_kind(q.kind);
    let t = tags::find_tag(k, q.tag);
    let s = tags::norm_sort(q.sort, t);
    let st = tags::norm_start(q.start);
    let lim = tags::clamp_limit(q.limit);
    let key = format!("hot|{k}|{}|{s}|{st}|{lim}", t.key);
    let r = HOT_CACHE
        .get_or_load(&key, || async move {
            if s == "hot" {
                recent_hot(k, t, st, lim).await
            } else {
                search_subjects(k, t, s, st, lim).await
            }
        })
        .await?;
    let len = r.items.len() as i64;
    let has_more = if r.total >= 0.0 { ((st + len) as f64) < r.total } else { len >= lim };
    Ok(HotResult { kind: k, tag: t.key, sort: s, start: st, limit: lim, total: r.total, has_more, items: r.items })
}

/// 片单集合（如一周口碑榜）
pub async fn get_collection(name: &str, count: usize) -> Result<Vec<Item>> {
    let key = format!("col|{name}|{count}");
    COL_CACHE
        .get_or_load(&key, || async move {
            let url = format!("{REXXAR}/subject_collection/{name}/items?start=0&count={count}");
            let d = fetch_douban(&url).await?;
            Ok(map_items(field(&d, "subject_collection_items"), "tv"))
        })
        .await
}

/// 条目详情：按 kind 优先顺序依次尝试 movie / tv
pub async fn get_subject(id: Option<&str>, kind: Option<&str>) -> Result<Subject> {
    let sid: String = id.unwrap_or("").chars().filter(|c| c.is_ascii_digit()).collect();
    if sid.is_empty() {
        return Err(anyhow!("缺少条目 id"));
    }
    let order = if kind == Some("movie") { ["movie", "tv"] } else { ["tv", "movie"] };
    let key = format!("subject|{sid}");
    SUBJECT_CACHE
        .get_or_load(&key, || async move {
            let mut last_err = None;
            for k in order {
                match fetch_douban(&format!("{REXXAR}/{k}/{sid}")).await {
                    Ok(d) if truthy(field(&d, "id")) => return Ok(normalize_subject(&d, k)),
                    Ok(_) => {}
                    Err(e) => last_err = Some(e),
                }
            }
            Err(last_err.unwrap_or_else(|| anyhow!("未找到该条目")))
        })
        .await
}
