//! 网络模式 / 诊断 / 域名记录 API（对应 server/routes/network.js）
//!   GET    /api/network/settings     -> { ok, settings, status, providers }
//!   PUT    /api/network/settings     body: Partial<settings> -> 同上
//!   GET    /api/network/interfaces   -> { ok, list, physical, tun }
//!   GET    /api/network/egress       -> { ok, mode, route, egress }（?refresh=1 跳过缓存）
//!   POST   /api/network/diagnose     body: { url? } -> { ok, ...诊断结果 }
//!   GET    /api/network/hosts        -> { ok, list, rules }
//!   DELETE /api/network/hosts        -> { ok }
//! 出错统一 400 + { ok:false, error }（同 Node 版 wrap）
use super::{ApiError, ApiResult};
use crate::http::Channel;
use crate::network::{self, diagnose, doh, hosts, interfaces, settings, Route};
use axum::extract::Query;
use axum::routing::get;
use axum::{Json, Router};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{Duration, Instant};

const EGRESS_CACHE_TTL: Duration = Duration::from_secs(3 * 60);

/// 出口 IP 缓存：按 (通道, 设置版本) 失效
struct EgressCache {
    route: Route,
    version: u64,
    at: Instant,
    data: Value,
}

static EGRESS_CACHE: Lazy<Mutex<Option<EgressCache>>> = Lazy::new(|| Mutex::new(None));

fn settings_payload() -> Value {
    json!({
        "ok": true,
        "settings": settings::get_settings(),
        "status": network::status(),
        "providers": doh::list_providers(),
    })
}

async fn get_settings() -> ApiResult {
    Ok(Json(settings_payload()))
}

async fn put_settings(body: Option<Json<Value>>) -> ApiResult {
    let patch = body.map(|Json(v)| v).unwrap_or(Value::Null);
    settings::update_settings(&patch).map_err(|e| ApiError::bad_request(e.to_string()))?;
    Ok(Json(settings_payload()))
}

async fn get_interfaces() -> ApiResult {
    let s = settings::get_settings();
    Ok(Json(json!({
        "ok": true,
        "list": interfaces::list_interfaces(),
        "physical": interfaces::pick_physical(&s.iface),
        "tun": interfaces::detect_tun(),
    })))
}

fn cached_egress(route: Route, version: u64) -> Option<Value> {
    let c = EGRESS_CACHE.lock();
    c.as_ref()
        .filter(|c| c.route == route && c.version == version && c.at.elapsed() < EGRESS_CACHE_TTL)
        .map(|c| c.data.clone())
}

async fn get_egress(Query(q): Query<HashMap<String, String>>) -> ApiResult {
    let s = settings::get_settings();
    let route = network::plan_routes(Channel::Stream, "", &network::environment())[0];
    let version = settings::version();
    let refresh = q.get("refresh").is_some_and(|v| !v.is_empty());
    let data = match cached_egress(route, version).filter(|_| !refresh) {
        Some(d) => d,
        None => {
            let d = diagnose::egress(route).await;
            *EGRESS_CACHE.lock() = Some(EgressCache { route, version, at: Instant::now(), data: d.clone() });
            d
        }
    };
    Ok(Json(json!({ "ok": true, "mode": s.mode, "route": route.as_str(), "egress": data })))
}

async fn post_diagnose(body: Option<Json<Value>>) -> ApiResult {
    let url = body
        .as_ref()
        .and_then(|Json(v)| v.get("url"))
        .map(|u| match u {
            Value::String(s) => s.clone(),
            Value::Null => String::new(),
            other => other.to_string(),
        })
        .unwrap_or_default();
    let url = url.trim().to_string();
    let lower = url.to_lowercase();
    if !url.is_empty() && !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(ApiError::bad_request("测试地址必须以 http:// 或 https:// 开头"));
    }
    let mut out = diagnose::diagnose(&url).await;
    if let Some(m) = out.as_object_mut() {
        m.insert("ok".into(), json!(true));
    }
    Ok(Json(out))
}

async fn get_hosts() -> ApiResult {
    let list = hosts::list_hosts();
    let rules = hosts::clash_rules(&list);
    Ok(Json(json!({ "ok": true, "list": list, "rules": rules })))
}

async fn delete_hosts() -> ApiResult {
    hosts::clear_hosts();
    Ok(Json(json!({ "ok": true })))
}

pub fn routes() -> Router {
    Router::new()
        .route("/api/network/settings", get(get_settings).put(put_settings))
        .route("/api/network/interfaces", get(get_interfaces))
        .route("/api/network/egress", get(get_egress))
        .route("/api/network/diagnose", axum::routing::post(post_diagnose))
        .route("/api/network/hosts", get(get_hosts).delete(delete_hosts))
}
