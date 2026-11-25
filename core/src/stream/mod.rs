//! 视频代理（对应 server/lib/stream.js）：解决跨域 / Referer 防盗链 / m3u8 相对路径问题
//!   GET /api/stream?url=<encoded>&referer=<encoded>
//! - m3u8：抓取文本后把子清单/分片/key 的 URI 改写为继续走本代理（相对路径基于最终 URL）
//! - 其它（ts/mp4/key）：字节流透传，支持 Range
//! - 上游请求经网络层（Channel::Stream，含智能回退），响应头 X-Net-Route 标明实际通道，并记录访问域名
pub mod m3u8;

use crate::http::{self, ReqOpts};
use crate::network::hosts::{record_host, HostInfo};
use axum::body::Body;
use axum::extract::Query;
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use std::collections::HashMap;
use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use std::io::ErrorKind;
use std::time::{Duration, Instant};

/// 上游超时（同 Node socket 超时语义：等待响应头 / 两次数据之间的最长空闲）
const STREAM_TIMEOUT_MS: u64 = 30_000;
/// 传给网络层的总时限：reqwest 的 timeout 覆盖整个 body 读取，长视频透传不能用 30s 总时限，
/// 这里放宽到 24 小时，实际超时由本模块的首包/空闲超时控制
const STREAM_TOTAL_DEADLINE_MS: u64 = 24 * 60 * 60 * 1000;
/// 透传的上游响应头
const PASS_HEADERS: [&str; 6] = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];
const M3U8_CONTENT_TYPE: &str = "application/vnd.apple.mpegurl; charset=utf-8";
const NET_ROUTE_HEADER: &str = "x-net-route";

/// 纯文本短响应（同 Express res.status(n).end(text)，不带 content-type）
fn plain(status: StatusCode, text: String) -> Response {
    let mut res = Response::new(Body::from(text));
    *res.status_mut() = status;
    res
}

fn idle() -> Duration {
    Duration::from_millis(STREAM_TIMEOUT_MS)
}

/// 上游 body 流：两次数据间空闲超过 STREAM_TIMEOUT_MS 即报错终止（hyper 随即断开下游）
fn idle_stream(res: reqwest::Response) -> impl Stream<Item = Result<Bytes, std::io::Error>> {
    let inner = Box::pin(res.bytes_stream());
    futures_util::stream::unfold(Some(inner), |state| async move {
        let mut s = state?;
        match tokio::time::timeout(idle(), s.next()).await {
            Ok(Some(Ok(b))) => Some((Ok(b), Some(s))),
            Ok(Some(Err(e))) => Some((Err(std::io::Error::other(e)), None)),
            Ok(None) => None,
            Err(_) => Some((Err(std::io::Error::new(ErrorKind::TimedOut, "upstream idle timeout")), None)),
        }
    })
}

fn elapsed_ms(t0: Instant) -> u64 {
    u64::try_from(t0.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn status_of(code: u16) -> StatusCode {
    StatusCode::from_u16(code).unwrap_or(StatusCode::BAD_GATEWAY)
}

/// 上游请求头：Accept-Encoding identity + 可选 Referer / Range（UA、Accept 由网络层统一附带）
fn build_opts(req_headers: &HeaderMap, referer: &str) -> ReqOpts {
    let mut opts = ReqOpts::stream().timeout(STREAM_TOTAL_DEADLINE_MS).header("Accept-Encoding", "identity");
    if !referer.is_empty() {
        opts = opts.header("Referer", referer);
    }
    if let Some(range) = req_headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        opts = opts.header("Range", range);
    }
    opts
}

/// GET /api/stream
pub async fn handle_stream(Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    let target = q.get("url").map(String::as_str).unwrap_or("");
    let referer = q.get("referer").map(String::as_str).unwrap_or("");
    if target.is_empty() {
        return plain(StatusCode::BAD_REQUEST, "missing url".into());
    }
    let Ok(u) = url::Url::parse(target) else {
        return plain(StatusCode::BAD_REQUEST, "bad url".into());
    };
    let t0 = Instant::now();
    let sent = tokio::time::timeout(idle(), http::send(u.as_str(), &build_opts(&headers, referer)))
        .await
        .unwrap_or_else(|_| Err(anyhow::anyhow!("请求超时")));
    match sent {
        Ok((res, route)) => {
            let info = HostInfo {
                status: res.status().as_u16(),
                route: route.as_str().into(),
                ms: elapsed_ms(t0),
                ..Default::default()
            };
            record_host(u.as_str(), info);
            let mut out = respond(res, referer).await;
            if let Ok(v) = HeaderValue::from_str(route.as_str()) {
                out.headers_mut().insert(NET_ROUTE_HEADER, v);
            }
            out
        }
        Err(e) => {
            record_host(u.as_str(), HostInfo { error: e.to_string(), ms: elapsed_ms(t0), ..Default::default() });
            plain(StatusCode::BAD_GATEWAY, format!("proxy error: {e}"))
        }
    }
}

/// 根据上游状态分派：重定向 / 错误 / m3u8 / 二进制
async fn respond(res: reqwest::Response, referer: &str) -> Response {
    let status = res.status().as_u16();
    let final_url = res.url().to_string();
    let location = res.headers().get(header::LOCATION).and_then(|v| v.to_str().ok()).map(str::to_string);
    if res.status().is_redirection() {
        if let Some(loc) = location {
            return redirect(&loc, &final_url, referer);
        }
    }
    if status >= StatusCode::BAD_REQUEST.as_u16() {
        return plain(status_of(status), format!("upstream status {status}"));
    }
    if m3u8::is_m3u8(&final_url, &http::content_type(res.headers())) {
        return send_m3u8(res, &final_url, referer).await;
    }
    send_binary(res, status)
}

/// 上游重定向：改写为继续走本代理
fn redirect(location: &str, base: &str, referer: &str) -> Response {
    let next = url::Url::parse(base).and_then(|b| b.join(location));
    let Ok(next) = next else {
        return plain(StatusCode::BAD_GATEWAY, "bad redirect".into());
    };
    let target = m3u8::stream_api(next.as_str(), referer);
    let mut res = plain(StatusCode::FOUND, format!("Found. Redirecting to {target}"));
    if let Ok(v) = HeaderValue::from_str(&target) {
        res.headers_mut().insert(header::LOCATION, v);
    }
    res
}

/// m3u8：读完整文本后改写 URI
async fn send_m3u8(res: reqwest::Response, base: &str, referer: &str) -> Response {
    let Ok(Ok(bytes)) = tokio::time::timeout(idle(), res.bytes()).await else {
        return plain(StatusCode::BAD_GATEWAY, "upstream err".into());
    };
    let text = m3u8::rewrite_m3u8(&String::from_utf8_lossy(&bytes), base, referer);
    let mut out = plain(StatusCode::OK, text);
    let h = out.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(M3U8_CONTENT_TYPE));
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    out
}

/// ts / mp4 / key / 图片：字节流透传（支持 Range）
fn send_binary(res: reqwest::Response, status: u16) -> Response {
    let up = res.headers().clone();
    // reqwest 可能已自动解压：此时上游 content-length 与实际字节数不符，不能转发
    let decoded = up.contains_key(header::CONTENT_ENCODING);
    let mut out = Response::new(Body::from_stream(idle_stream(res)));
    *out.status_mut() = status_of(status);
    let h = out.headers_mut();
    for name in PASS_HEADERS {
        if decoded && name == "content-length" {
            continue;
        }
        if let Some(v) = up.get(name) {
            h.insert(name, v.clone());
        }
    }
    if !up.contains_key(header::CONTENT_TYPE) {
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/octet-stream"));
    }
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    out
}
