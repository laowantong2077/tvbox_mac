//! TVBox 核心路由（对应 server/index.js）：state / bootstrap / config/load / site/* / stream
use super::{ApiError, ApiResult};
use crate::cms::js::{field, js_str, truthy};
use crate::{cms, config, store, stream};
use axum::body::Bytes;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Map, Value};

pub fn routes() -> Router {
    Router::new()
        .route("/api/state", get(get_state).put(put_state))
        .route("/api/bootstrap", get(bootstrap))
        .route("/api/config/load", post(config_load))
        .route("/api/site/categories", post(site_categories))
        .route("/api/site/list", post(site_list))
        .route("/api/site/search", post(site_search))
        .route("/api/site/detail", post(site_detail))
        .route("/api/stream", get(stream::handle_stream))
}

/// 请求体：同 express.json —— 非 JSON / 空体视为 {}
fn parse_body(body: &Bytes) -> Value {
    serde_json::from_slice::<Value>(body)
        .ok()
        .filter(|v| v.is_object() || v.is_array())
        .unwrap_or_else(|| json!({}))
}

/// 记录错误日志并转为 500（同 Node safe() 包装）
fn fail(e: anyhow::Error) -> ApiError {
    eprintln!("[api] {e}");
    ApiError::from(e)
}

/// { ok: true, ...data }
fn ok_spread(data: Value) -> Json<Value> {
    let mut m = Map::new();
    m.insert("ok".into(), json!(true));
    if let Value::Object(obj) = data {
        m.extend(obj);
    }
    Json(Value::Object(m))
}

/// 给结果列表补上站点标记（siteKey / siteName），便于前端区分来源
fn annotate(mut data: Value, site: &Value) -> Value {
    if let Some(Value::Array(list)) = data.get_mut("list") {
        for item in list.iter_mut() {
            let mut m = item.as_object().cloned().unwrap_or_default();
            if let Some(k) = field(site, "key") {
                m.insert("siteKey".into(), k.clone());
            }
            if let Some(n) = field(site, "name") {
                m.insert("siteName".into(), n.clone());
            }
            *item = Value::Object(m);
        }
    }
    data
}

/// 取 body.site；缺失时抛「缺少 site」
fn require_site(body: &Value) -> Result<Value, ApiError> {
    match field(body, "site") {
        Some(s) if truthy(Some(s)) => Ok(s.clone()),
        _ => Err(fail(anyhow::anyhow!("缺少 site"))),
    }
}

async fn get_state() -> Json<Value> {
    Json(store::read_state())
}

async fn put_state(body: Bytes) -> ApiResult {
    store::write_state(parse_body(&body)).map(Json).map_err(fail)
}

async fn bootstrap() -> Json<Value> {
    Json(json!({ "demoSite": cms::demo_site() }))
}

async fn config_load(body: Bytes) -> ApiResult {
    let body = parse_body(&body);
    let url = field(&body, "url");
    if !truthy(url) {
        return Err(ApiError::bad_request("缺少配置地址"));
    }
    let cfg = config::load_config(&js_str(url)).await.map_err(fail)?;
    Ok(ok_spread(cfg))
}

async fn site_categories(body: Bytes) -> ApiResult {
    let body = parse_body(&body);
    let site = require_site(&body)?;
    let list = cms::categories(&site).await.map_err(fail)?;
    Ok(Json(json!({ "ok": true, "list": list })))
}

async fn site_list(body: Bytes) -> ApiResult {
    let body = parse_body(&body);
    let site = require_site(&body)?;
    let data = cms::list(&site, field(&body, "t"), field(&body, "pg")).await.map_err(fail)?;
    Ok(ok_spread(annotate(data, &site)))
}

async fn site_search(body: Bytes) -> ApiResult {
    let body = parse_body(&body);
    let site = require_site(&body)?;
    let data = cms::search(&site, field(&body, "wd")).await.map_err(fail)?;
    Ok(ok_spread(annotate(data, &site)))
}

async fn site_detail(body: Bytes) -> ApiResult {
    let body = parse_body(&body);
    let site = require_site(&body)?;
    let data = cms::detail(&site, field(&body, "ids")).await.map_err(fail)?;
    Ok(ok_spread(annotate(data, &site)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn annotate_adds_site_marks() {
        let d = annotate(json!({ "list": [{ "id": "1" }], "page": 1 }), &json!({ "key": "k", "name": "站" }));
        assert_eq!("k", d["list"][0]["siteKey"]);
        assert_eq!("站", d["list"][0]["siteName"]);
        assert_eq!(json!({}), parse_body(&Bytes::from_static(b"oops")));
    }
}
