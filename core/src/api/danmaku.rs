//! 在线弹幕路由（对应 server/routes/danmaku.js）
//!   GET /api/danmaku/search?keyword=        → { ok, list:[{source,id,title,kind,epCount,cover,author?}] }
//!   GET /api/danmaku/episodes?source=&id=   → { ok, list:[{id,title}] }
//!   GET /api/danmaku/comments?source=&id=   → { ok, list:[{time,mode,color,text,size?}] }
//! 与 Node 版一致：失败也返回 HTTP 200 { ok:false, error, list:[] }
use crate::danmaku::bili;
use crate::douban::cache::TtlCache;
use anyhow::{anyhow, Result};
use axum::extract::Query;
use axum::routing::get;
use axum::{Json, Router};
use once_cell::sync::Lazy;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::time::Duration;

type Q = Query<HashMap<String, String>>;

const CACHE_MAX: usize = 40;
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const DEFAULT_SOURCE: &str = "bilibili";

/// 简易 LRU 缓存，避免重复拉取大体积弹幕
static CACHE: Lazy<TtlCache<Value>> = Lazy::new(|| TtlCache::new(CACHE_TTL, CACHE_MAX));

/// 缓存包装：结果序列化为 JSON 后缓存
async fn cached<T, F, Fut>(key: String, load: F) -> Result<Value>
where
    T: Serialize,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T>>,
{
    CACHE
        .get_or_load(&key, || async move { Ok(serde_json::to_value(load().await?)?) })
        .await
}

/// 校验弹幕来源（目前仅 bilibili）
fn pick_source(q: &HashMap<String, String>) -> Result<()> {
    match q.get("source").map(String::as_str).unwrap_or(DEFAULT_SOURCE) {
        DEFAULT_SOURCE => Ok(()),
        _ => Err(anyhow!("不支持的弹幕来源")),
    }
}

fn respond(r: Result<Value>) -> Json<Value> {
    match r {
        Ok(list) => Json(json!({ "ok": true, "list": list })),
        Err(e) => Json(json!({ "ok": false, "error": e.to_string(), "list": [] })),
    }
}

fn id_of(q: &HashMap<String, String>) -> String {
    q.get("id").cloned().unwrap_or_default()
}

async fn search(Query(q): Q) -> Json<Value> {
    let kw = q.get("keyword").map(|s| s.trim().to_string()).unwrap_or_default();
    let r = async {
        if kw.is_empty() {
            return Err(anyhow!("缺少关键词"));
        }
        cached(format!("s:{kw}"), || bili::search(&kw)).await
    };
    respond(r.await)
}

async fn episodes(Query(q): Q) -> Json<Value> {
    let id = id_of(&q);
    let r = async {
        pick_source(&q)?;
        cached(format!("e:{id}"), || bili::episodes(&id)).await
    };
    respond(r.await)
}

async fn comments(Query(q): Q) -> Json<Value> {
    let id = id_of(&q);
    let r = async {
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
            return Err(anyhow!("无效的弹幕 ID"));
        }
        pick_source(&q)?;
        cached(format!("c:{id}"), || bili::comments(&id)).await
    };
    respond(r.await)
}

pub fn routes() -> Router {
    Router::new()
        .route("/api/danmaku/search", get(search))
        .route("/api/danmaku/episodes", get(episodes))
        .route("/api/danmaku/comments", get(comments))
}
