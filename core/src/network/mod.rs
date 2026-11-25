//! 网络层入口（对应 server/lib/network/index.js）
//! 通道 Route：system | direct | proxy；请求类型 Channel：meta | stream
//! 模式 system / direct / proxy / smart：planRoutes 决定尝试顺序，网络错误或 403 时换下一个通道
pub mod clients;
pub mod diagnose;
pub mod doh;
pub mod doh_resolver;
pub mod hosts;
pub mod interfaces;
#[cfg(test)]
mod live_tests;
pub mod plan;
pub mod scutil;
pub mod settings;

use crate::http::{Channel, ReqOpts, DEFAULT_UA};
use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub use plan::{environment, plan_routes, route_available, status, Env};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Route {
    System,
    Direct,
    Proxy,
}

impl Route {
    pub fn as_str(&self) -> &'static str {
        match self {
            Route::System => "system",
            Route::Direct => "direct",
            Route::Proxy => "proxy",
        }
    }
    pub fn parse(s: &str) -> Option<Route> {
        match s {
            "system" => Some(Route::System),
            "direct" => Some(Route::Direct),
            "proxy" => Some(Route::Proxy),
            _ => None,
        }
    }
}

/// open_request 的结果：响应（body 未读）、最终通道、依次尝试过的通道
pub struct Opened {
    pub response: reqwest::Response,
    pub route: Route,
    pub tried: Vec<Route>,
}

const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT_SECS: u64 = 8;
const POOL_IDLE_SECS: u64 = 30;
/// 默认请求头（同 server/lib/http.js；opts.headers 同名时覆盖）
const DEFAULT_HEADERS: [(&str, &str); 3] =
    [("User-Agent", DEFAULT_UA), ("Accept", "*/*"), ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")];
/// 触发回退到下一个通道的状态码
const FALLBACK_STATUS: [u16; 1] = [403];

/// 通用 client 构建参数（各通道共享：容忍坏证书、不读环境代理、最多 5 次重定向）
/// referer(false)：跟随重定向时不自动改写 Referer，保留调用方传入的值（防盗链站点依赖它）
pub fn base_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .referer(false)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .pool_idle_timeout(Duration::from_secs(POOL_IDLE_SECS))
}

/// 按通道取 meta 类请求的 client（按 通道+请求类型+设置版本+物理网卡地址 缓存）
pub fn client_for(route: Route) -> Result<reqwest::Client> {
    clients::get(route, Channel::Meta, &environment())
}

/// 按通道 + 请求类型取 client：stream 类 client 带空闲读超时、无总时限
pub fn client_for_channel(route: Route, channel: Channel) -> Result<reqwest::Client> {
    clients::get(route, channel, &environment())
}

/// 设置变更回调：清空智能路由缓存、DNS 缓存与 client 缓存
pub(crate) fn on_settings_changed() {
    plan::clear_smart_cache();
    doh_resolver::clear_cache();
    clients::clear();
}

/// 合并默认请求头与 opts.headers（同名覆盖而非追加，避免重复 User-Agent 等）
fn merged_headers(opts: &ReqOpts) -> HeaderMap {
    let mut map = HeaderMap::new();
    let pairs = DEFAULT_HEADERS.iter().map(|&(k, v)| (k, v)).chain(opts.headers.iter().map(|(k, v)| (k.as_str(), v.as_str())));
    for (k, v) in pairs {
        if let (Ok(name), Ok(val)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
            map.insert(name, val);
        }
    }
    map
}

/// 用指定 client 发起一次请求（附带默认请求头）
/// - meta：opts.timeout_ms 为整个请求（含 body）总时限
/// - stream：不设总时限（长视频透传），空闲超时由 stream client 的 read_timeout 负责
pub async fn attempt(client: &reqwest::Client, u: &url::Url, opts: &ReqOpts) -> Result<reqwest::Response> {
    let mut rb = client.request(opts.method.clone(), u.clone()).headers(merged_headers(opts));
    if opts.channel == Channel::Meta {
        rb = rb.timeout(Duration::from_millis(opts.timeout_ms));
    }
    if let Some(b) = &opts.body {
        rb = rb.body(b.clone());
    }
    rb.send().await.map_err(|e| anyhow!(describe_error(&e)))
}

/// 把 reqwest 错误转成可读中文
pub fn describe_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        return "请求超时".into();
    }
    let mut msg = e.to_string();
    let mut src = std::error::Error::source(e);
    while let Some(s) = src {
        msg = format!("{msg}: {s}");
        src = s.source();
    }
    msg
}

/// 按通道计划依次尝试（网络错误 / 403 时换下一个通道）；opts.route 强制指定通道时不回退
pub async fn open_request(u: &url::Url, opts: &ReqOpts) -> Result<Opened> {
    let env = environment();
    let host = u.host_str().unwrap_or("").to_string();
    let routes = match opts.route {
        Some(r) => vec![r],
        None => plan_routes(opts.channel, &host, &env),
    };
    let mut last_err = None;
    for (i, &route) in routes.iter().enumerate() {
        let is_last = i == routes.len() - 1;
        let res = match clients::get(route, opts.channel, &env) {
            Ok(client) => attempt(&client, u, opts).await,
            Err(e) => Err(e),
        };
        match res {
            Ok(r) if !is_last && FALLBACK_STATUS.contains(&r.status().as_u16()) => continue,
            Ok(r) => {
                if r.status().as_u16() < 400 {
                    plan::remember(&host, route, &env.settings.mode);
                }
                return Ok(Opened { response: r, route, tried: routes[..=i].to_vec() });
            }
            Err(e) if is_last => return Err(e),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("无可用网络通道")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_override_not_append() {
        let opts = ReqOpts::default().header("user-agent", "X").header("Range", "bytes=0-1");
        let h = merged_headers(&opts);
        assert_eq!(1, h.get_all("user-agent").iter().count());
        assert_eq!("X", h["user-agent"]);
        assert_eq!("*/*", h["accept"]);
        assert_eq!("bytes=0-1", h["range"]);
    }

    #[test]
    fn route_roundtrip() {
        for r in [Route::System, Route::Direct, Route::Proxy] {
            assert_eq!(Some(r), Route::parse(r.as_str()));
        }
        assert_eq!(None, Route::parse("smart"));
    }
}
