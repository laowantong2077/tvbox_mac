//! 按通道构建并缓存 reqwest::Client（对应 server/lib/network/connector.js + tunnel.js）
//!   system : 系统 DNS + 系统路由（交给 VPN 规则）
//!   direct : 国内 DoH 解析真实 IPv4 + 绑定物理网卡 IPv4（绕过 TUN）
//!   proxy  : http 代理（CONNECT）/ socks5h（目标域名交给代理端解析，避免本地 fake-ip）
//! 缓存键 = (通道, 请求类型, 设置版本, 物理网卡地址)；设置变更或网卡地址变化时自动重建
//! stream 类 client 设 read_timeout（socket 空闲超时，同 Node timeout 语义），不设总时限
use super::plan::Env;
use super::settings::{ProxyConf, ProxyKind};
use super::{base_builder, doh_resolver::DohResolver, Route};
use crate::http::Channel;
use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;

/// stream 通道空闲读超时（同 Node stream.js 的 socket timeout: 30000）
pub const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, PartialEq, Eq, Hash)]
struct Key {
    route: Route,
    channel: Channel,
    version: u64,
    local: Option<IpAddr>,
}

static CLIENTS: Lazy<Mutex<HashMap<Key, reqwest::Client>>> = Lazy::new(Default::default);

pub fn clear() {
    CLIENTS.lock().clear();
}

fn local_addr(env: &Env) -> Option<IpAddr> {
    env.phys.as_ref().and_then(|p| p.address.parse().ok())
}

fn bracket(host: &str) -> String {
    if host.contains(':') {
        format!("[{host}]")
    } else {
        host.to_string()
    }
}

/// 生成 reqwest 代理 URL（socks5 用 socks5h，由代理端解析域名）
pub fn proxy_url(p: &ProxyConf) -> String {
    let host = bracket(&p.host);
    match p.kind {
        ProxyKind::Http => format!("http://{}:{}", host, p.port),
        ProxyKind::Socks5 if p.username.is_empty() && p.password.is_empty() => {
            format!("socks5h://{}:{}", host, p.port)
        }
        ProxyKind::Socks5 => format!(
            "socks5h://{}:{}@{}:{}",
            urlencoding::encode(&p.username),
            urlencoding::encode(&p.password),
            host,
            p.port
        ),
    }
}

fn build_proxy(p: &ProxyConf) -> Result<reqwest::Proxy> {
    let mut proxy = reqwest::Proxy::all(proxy_url(p))?;
    if p.kind == ProxyKind::Http && !(p.username.is_empty() && p.password.is_empty()) {
        proxy = proxy.basic_auth(&p.username, &p.password);
    }
    Ok(proxy)
}

fn build(route: Route, channel: Channel, env: &Env) -> Result<reqwest::Client> {
    let b = match channel {
        Channel::Stream => base_builder().read_timeout(STREAM_IDLE_TIMEOUT),
        Channel::Meta => base_builder(),
    };
    let b = match route {
        Route::System => b,
        Route::Direct => {
            let local = local_addr(env);
            let resolver = DohResolver { provider: env.settings.doh.clone(), local };
            b.local_address(local).dns_resolver(Arc::new(resolver))
        }
        Route::Proxy => {
            let p = env.proxy.as_ref().ok_or_else(|| {
                let reason = if env.proxy_error.is_empty() { "未配置代理地址" } else { &env.proxy_error };
                anyhow!("{reason}")
            })?;
            b.proxy(build_proxy(p)?)
        }
    };
    Ok(b.build()?)
}

/// 取（或构建）指定通道 + 请求类型在当前环境下的 client
pub fn get(route: Route, channel: Channel, env: &Env) -> Result<reqwest::Client> {
    let local = if route == Route::Direct { local_addr(env) } else { None };
    let key = Key { route, channel, version: super::settings::version(), local };
    if let Some(c) = CLIENTS.lock().get(&key) {
        return Ok(c.clone());
    }
    let c = build(route, channel, env)?;
    let mut map = CLIENTS.lock();
    map.retain(|k, _| k.version == key.version);
    map.insert(key, c.clone());
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::settings::parse_proxy_url;

    #[test]
    fn proxy_urls() {
        let p = |s: &str| proxy_url(&parse_proxy_url(s).unwrap().unwrap());
        assert_eq!("http://127.0.0.1:7890", p("http://u:p@127.0.0.1:7890"));
        assert_eq!("socks5h://h:1080", p("socks5://h"));
        assert_eq!("socks5h://a%40b:p@[::1]:1", p("socks://a%40b:p@[::1]:1"));
    }
}
