//! 发现（豆瓣）路由（对应 server/routes/discover.js）
//!  GET /api/discover/home                                 首页 Banner + 推荐行
//!  GET /api/discover/hot?kind=&tag=&sort=&start=&limit=   热播列表
//!  GET /api/discover/tags?kind=                           标签与排序选项
//!  GET /api/discover/subject?id=&kind=                    条目详情
//! 失败统一返回 { ok:false, error }（HTTP 502），前端据此回退到站点数据
use super::{ApiError, ApiResult};
use crate::{douban, douban_home};
use axum::extract::Query;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;

type Q = Query<HashMap<String, String>>;

const DEFAULT_ERROR: &str = "豆瓣数据获取失败";

/// 成功：{ ok:true, ...data }；失败：502 { ok:false, error }
fn respond<T: Serialize>(r: anyhow::Result<T>) -> ApiResult {
    match r {
        Ok(data) => {
            let mut v = serde_json::to_value(data).map_err(anyhow::Error::from)?;
            match v.as_object_mut() {
                Some(obj) => {
                    obj.insert("ok".into(), Value::Bool(true));
                }
                None => v = json!({ "ok": true }),
            }
            Ok(Json(v))
        }
        Err(e) => {
            let msg = e.to_string();
            eprintln!("[discover] {msg}");
            let msg = if msg.is_empty() { DEFAULT_ERROR.to_string() } else { msg };
            Err(ApiError(StatusCode::BAD_GATEWAY, msg))
        }
    }
}

fn param<'a>(q: &'a HashMap<String, String>, k: &str) -> Option<&'a str> {
    q.get(k).map(String::as_str)
}

async fn home() -> ApiResult {
    respond(douban_home::get_home().await)
}

async fn tags(Query(q): Q) -> ApiResult {
    respond(Ok(douban::get_tags(param(&q, "kind"))))
}

async fn hot(Query(q): Q) -> ApiResult {
    let hq = douban::HotQuery {
        kind: param(&q, "kind"),
        tag: param(&q, "tag"),
        sort: param(&q, "sort"),
        start: param(&q, "start"),
        limit: param(&q, "limit"),
    };
    respond(douban::get_hot(&hq).await)
}

async fn subject(Query(q): Q) -> ApiResult {
    let r = douban::get_subject(param(&q, "id"), param(&q, "kind")).await;
    respond(r.map(|s| json!({ "subject": s })))
}

pub fn routes() -> Router {
    Router::new()
        .route("/api/discover/home", get(home))
        .route("/api/discover/tags", get(tags))
        .route("/api/discover/hot", get(hot))
        .route("/api/discover/subject", get(subject))
}
