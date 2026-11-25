//! /api 路由分组：各模块各自提供 Router，由 server.rs 合并
pub mod core;
pub mod danmaku;
pub mod discover;
pub mod network;

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// 统一错误：500 + { ok:false, error }（对应 Node 版 safe() 包装）
pub struct ApiError(pub StatusCode, pub String);

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, msg.into())
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        let e: anyhow::Error = e.into();
        Self(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "ok": false, "error": self.1 }))).into_response()
    }
}

pub type ApiResult<T = Json<serde_json::Value>> = Result<T, ApiError>;
