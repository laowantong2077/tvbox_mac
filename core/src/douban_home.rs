//! 推荐首页聚合（对应 server/lib/doubanHome.js）：Banner + 多个推荐行，一次返回
//!  - 各行并发拉取，单行失败不影响整体（全部失败才报错）
//!  - Banner 取热播电影/剧集/综艺头部，补充豆瓣详情中的简介/类型
use crate::douban::cache::TtlCache;
use crate::douban::js::{js_string, now_ms, truthy};
use crate::douban::normalize::{Item, Subject};
use crate::douban::{self, HotQuery};
use anyhow::{anyhow, Result};
use futures_util::future::join_all;
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

const ROW_LIMIT: usize = 18;
const BANNER_SIZE: usize = 7;
const HOME_TTL: Duration = Duration::from_secs(10 * 60);
const HOME_CACHE_MAX: usize = 1;
/// Banner 入选的最低评分
const BANNER_MIN_RATING: f64 = 6.0;
/// Banner 中保留的演员数
const BANNER_ACTORS: usize = 4;
/// Banner 候选行
const BANNER_POOLS: [&str; 3] = ["movie_hot", "tv_hot", "show_hot"];

static HOME_CACHE: Lazy<TtlCache<Home>> = Lazy::new(|| TtlCache::new(HOME_TTL, HOME_CACHE_MAX));

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Link {
    pub kind: &'static str,
    pub tag: &'static str,
}

/// 推荐行定义：collection 有值时拉片单，否则拉热播列表
struct RowDef {
    key: &'static str,
    title: &'static str,
    sub: &'static str,
    kind: &'static str,
    tag: &'static str,
    collection: Option<&'static str>,
    link: Link,
}

const fn row(key: &'static str, title: &'static str, sub: &'static str, src: (&'static str, &'static str, Option<&'static str>), link: Link) -> RowDef {
    RowDef { key, title, sub, kind: src.0, tag: src.1, collection: src.2, link }
}

const fn link(kind: &'static str, tag: &'static str) -> Link {
    Link { kind, tag }
}

// link 用于前端「查看全部」跳转到热播页
const ROWS: &[RowDef] = &[
    row("movie_hot", "热播电影", "近期大家都在看", ("movie", "hot", None), link("movie", "hot")),
    row("tv_hot", "热播剧集", "追剧不停歇", ("tv", "all", None), link("tv", "all")),
    row("show_hot", "热门综艺", "下饭好选择", ("show", "all", None), link("show", "all")),
    row("movie_top", "豆瓣高分", "口碑之选", ("movie", "top", None), link("movie", "top")),
    row("weekly", "一周口碑电影榜", "每周五更新", ("", "", Some("movie_weekly_best")), link("movie", "top")),
    row("tv_cn_weekly", "华语口碑剧集", "本周榜单", ("", "", Some("tv_chinese_best_weekly")), link("tv", "cn")),
    row("anime", "热门动漫", "二次元补番", ("tv", "anime", None), link("tv", "anime")),
    row("doc", "纪录片", "看见更大的世界", ("tv", "doc", None), link("tv", "doc")),
];

#[derive(Clone, Debug, Serialize)]
pub struct Row {
    pub key: &'static str,
    pub title: &'static str,
    pub sub: &'static str,
    pub link: Link,
    pub items: Vec<Item>,
}

/// Banner 条目：列表条目 + 详情补充字段
#[derive(Clone, Debug, Serialize)]
pub struct BannerItem {
    #[serde(flatten)]
    pub item: Item,
    pub intro: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directors: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actors: Option<Vec<Value>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Home {
    pub banner: Vec<BannerItem>,
    pub rows: Vec<Row>,
    pub updated_at: u64,
}

async fn load_row(r: &RowDef) -> Result<Row> {
    let items = match r.collection {
        Some(name) => douban::get_collection(name, ROW_LIMIT).await?,
        None => {
            let limit = ROW_LIMIT.to_string();
            let q = HotQuery { kind: Some(r.kind), tag: Some(r.tag), sort: Some("hot"), start: Some("0"), limit: Some(&limit) };
            douban::get_hot(&q).await?.items
        }
    };
    Ok(Row { key: r.key, title: r.title, sub: r.sub, link: r.link, items })
}

/// 从各行头部交替挑选有评分、有封面的条目作为 Banner
pub fn pick_banner(rows: &[Row]) -> Vec<Item> {
    let pools: Vec<Vec<&Item>> = BANNER_POOLS
        .iter()
        .filter_map(|k| rows.iter().find(|r| r.key == *k))
        .map(|r| r.items.iter().filter(|it| !it.cover.is_empty() && it.rating >= BANNER_MIN_RATING).collect())
        .collect();
    let mut out: Vec<Item> = Vec::new();
    let mut seen = HashSet::new();
    for i in 0..ROW_LIMIT {
        if out.len() >= BANNER_SIZE {
            break;
        }
        for it in pools.iter().filter_map(|p| p.get(i)) {
            if out.len() < BANNER_SIZE && seen.insert(it.id.clone()) {
                out.push((*it).clone());
            }
        }
    }
    out
}

/// 用详情补充单个 Banner 条目
fn merge_subject(it: Item, s: Subject) -> BannerItem {
    let mut item = it;
    if !s.genres.is_empty() {
        item.genres = s.genres.iter().map(js_string).collect();
    }
    if let Some(c) = s.countries.first().filter(|c| truthy(c)) {
        item.region = js_string(c);
    }
    if !s.year.is_empty() {
        item.year = s.year;
    }
    let actors = s.actors.into_iter().take(BANNER_ACTORS).collect();
    BannerItem { item, intro: s.intro, directors: Some(s.directors), actors: Some(actors) }
}

/// 为 Banner 补充简介等信息，详情失败则保留原条目
async fn enrich_banner(items: Vec<Item>) -> Vec<BannerItem> {
    let tasks = items.iter().map(|it| douban::get_subject(Some(&it.id), Some(&it.kind)));
    let rs = join_all(tasks).await;
    items
        .into_iter()
        .zip(rs)
        .map(|(it, r)| match r {
            Ok(s) => merge_subject(it, s),
            Err(_) => BannerItem { item: it, intro: String::new(), directors: None, actors: None },
        })
        .collect()
}

async fn build_home() -> Result<Home> {
    let rs = join_all(ROWS.iter().map(load_row)).await;
    let first_err = rs.iter().find_map(|r| r.as_ref().err().map(|e| e.to_string()));
    let rows: Vec<Row> = rs.into_iter().filter_map(Result::ok).filter(|r| !r.items.is_empty()).collect();
    if rows.is_empty() {
        let msg = first_err.filter(|m| !m.is_empty()).unwrap_or_else(|| "豆瓣推荐数据为空".into());
        return Err(anyhow!(msg));
    }
    let banner = enrich_banner(pick_banner(&rows)).await;
    Ok(Home { banner, rows, updated_at: now_ms() })
}

pub async fn get_home() -> Result<Home> {
    HOME_CACHE.get_or_load("home", build_home).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, rating: f64, cover: &str) -> Item {
        Item {
            id: id.into(), title: id.into(), rating, cover: cover.into(), subtitle: String::new(),
            year: String::new(), region: String::new(), genres: vec![], episodes: String::new(),
            is_new: false, kind: "tv".into(),
        }
    }

    fn row_of(key: &'static str, items: Vec<Item>) -> Row {
        Row { key, title: "", sub: "", link: link("tv", "all"), items }
    }

    #[test]
    fn banner_alternates_and_dedups() {
        let rows = vec![
            row_of("movie_hot", vec![item("m1", 7.0, "c"), item("m2", 5.0, "c"), item("m3", 8.0, "c")]),
            row_of("tv_hot", vec![item("m1", 7.0, "c"), item("t2", 9.0, "")]),
            row_of("show_hot", vec![item("s1", 6.0, "c")]),
        ];
        let ids: Vec<String> = pick_banner(&rows).into_iter().map(|i| i.id).collect();
        assert_eq!(vec!["m1", "s1", "m3"], ids);
    }
}
