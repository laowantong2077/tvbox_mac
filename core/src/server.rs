//! HTTP 服务：/api/* + 前端静态资源（对应 server/index.js）
use crate::{api, paths};
use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use rust_embed::RustEmbed;
use serde_json::json;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};

const BODY_LIMIT: usize = 8 * 1024 * 1024;

/// 前端构建产物（vite build → dist/），编译期内嵌进二进制
#[derive(RustEmbed)]
#[folder = "../dist"]
struct Assets;

#[derive(Clone, Debug, Default)]
pub struct CoreOptions {
    pub data_dir: PathBuf,
    /// 开发用：指定磁盘上的静态目录，优先于内嵌资源
    pub static_dir: Option<PathBuf>,
    /// 0 = 随机端口
    pub port: u16,
}

async fn health() -> Json<serde_json::Value> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Json(json!({ "ok": true, "app": "随心看", "core": "rust", "ts": ts }))
}

fn asset_response(path: &str, bytes: Vec<u8>) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let mut res = Response::new(Body::from(bytes));
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, mime.as_ref().parse().unwrap());
    // index.html 不缓存，带 hash 的资源长缓存
    let cache = if path.ends_with(".html") { "no-cache" } else { "public, max-age=31536000, immutable" };
    h.insert(header::CACHE_CONTROL, cache.parse().unwrap());
    res
}

fn load_asset(static_dir: &Option<PathBuf>, path: &str) -> Option<Vec<u8>> {
    if let Some(dir) = static_dir {
        if let Ok(b) = std::fs::read(dir.join(path)) {
            return Some(b);
        }
    }
    Assets::get(path).map(|f| f.data.into_owned())
}

async fn static_handler(static_dir: Option<PathBuf>, uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.starts_with("api/") {
        return (StatusCode::NOT_FOUND, Json(json!({ "ok": false, "error": "未知接口" }))).into_response();
    }
    let path = if path.is_empty() { "index.html" } else { path };
    if let Some(b) = load_asset(&static_dir, path) {
        return asset_response(path, b);
    }
    // SPA 回退
    match load_asset(&static_dir, "index.html") {
        Some(b) => asset_response("index.html", b),
        None => (StatusCode::NOT_FOUND, "前端资源缺失").into_response(),
    }
}

pub fn router(opts: &CoreOptions) -> Router {
    let static_dir = opts.static_dir.clone();
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    Router::new()
        .route("/api/health", get(health))
        .merge(api::core::routes())
        .merge(api::network::routes())
        .merge(api::discover::routes())
        .merge(api::danmaku::routes())
        .fallback(move |uri: Uri| static_handler(static_dir.clone(), uri))
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .layer(cors)
}

/// 启动服务（绑定 127.0.0.1），返回实际端口；服务在后台 tokio 任务中运行
pub async fn start(opts: CoreOptions) -> anyhow::Result<u16> {
    paths::init_data_dir(opts.data_dir.clone());
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", opts.port)).await?;
    let port = listener.local_addr()?.port();
    let app = router(&opts);
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[core] server error: {e}");
        }
    });
    Ok(port)
}
