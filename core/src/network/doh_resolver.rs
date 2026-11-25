//! DoH 实际解析（对应 server/lib/network/doh.js 的请求/缓存部分）
//! - DoH 请求本身用 IP 直连服务器（TLS SNI/Host = 服务商域名），并绑定物理网卡 IPv4
//! - 结果按 TTL 缓存（60s ~ 30min）；同一域名并发解析合并
//! - 首选服务商失败时依次尝试其它服务商
//! - DohResolver 实现 reqwest::dns::Resolve，供 direct 通道的 client 使用
use super::doh::{clamp_ttl, provider_order, DohAnswer, Provider, PROVIDERS};
use anyhow::{anyhow, bail, Result};
use futures_util::future::{BoxFuture, FutureExt, Shared};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, Instant};

const TIMEOUT_MS: u64 = 5000;
const MAX_BODY: usize = 64 * 1024;
const HTTPS_PORT: u16 = 443;

type Pending = Shared<BoxFuture<'static, Result<String, String>>>;

struct CacheEntry {
    ips: Vec<String>,
    expires: Instant,
}

static CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> = Lazy::new(Default::default);
static PENDING: Lazy<Mutex<HashMap<String, Pending>>> = Lazy::new(Default::default);
/// 按绑定地址缓存 DoH 专用 client
static CLIENTS: Lazy<Mutex<HashMap<Option<IpAddr>, reqwest::Client>>> = Lazy::new(Default::default);

/// DoH 专用 client：绑定本地地址，服务商域名固定解析到其 IP（不走系统 DNS）
fn doh_client(local: Option<IpAddr>) -> Result<reqwest::Client> {
    if let Some(c) = CLIENTS.lock().get(&local) {
        return Ok(c.clone());
    }
    let mut b = super::base_builder()
        .local_address(local)
        .timeout(Duration::from_millis(TIMEOUT_MS))
        .connect_timeout(Duration::from_millis(TIMEOUT_MS));
    for p in PROVIDERS.iter().filter(|p| p.https) {
        b = b.resolve(p.servername, SocketAddr::new(IpAddr::V4(p.ip), HTTPS_PORT));
    }
    let c = b.build()?;
    CLIENTS.lock().insert(local, c.clone());
    Ok(c)
}

fn provider_url(p: &Provider, host: &str) -> String {
    let path = (p.path)(host);
    if p.https {
        format!("https://{}{}", p.servername, path)
    } else {
        format!("http://{}{}", p.ip, path)
    }
}

/// 读取响应体，超过 MAX_BODY 报错
async fn read_limited(mut res: reqwest::Response) -> Result<String> {
    let mut buf = Vec::new();
    while let Some(chunk) = res.chunk().await? {
        buf.extend_from_slice(&chunk);
        if buf.len() > MAX_BODY {
            bail!("DoH 响应过大");
        }
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// 直接连服务商 IP 发起 GET，返回文本
async fn fetch_from_ip(p: &Provider, host: &str, local: Option<IpAddr>) -> Result<String> {
    let client = doh_client(local)?;
    let res = client
        .get(provider_url(p, host))
        .header("Accept", "application/dns-json, */*")
        .send()
        .await
        .map_err(|e| if e.is_timeout() { anyhow!("DoH 超时") } else { anyhow!(super::describe_error(&e)) })?;
    read_limited(res).await
}

async fn resolve_uncached(host: String, provider: String, local: Option<IpAddr>) -> Result<DohAnswer> {
    let mut errors = Vec::new();
    for p in provider_order(&provider) {
        match fetch_from_ip(p, &host, local).await {
            Ok(text) => match (p.parse)(&text) {
                Some(a) => return Ok(a),
                None => errors.push(format!("{}: 无 A 记录", p.key)),
            },
            Err(e) => errors.push(format!("{}: {}", p.key, e)),
        }
    }
    bail!("DoH 解析失败 {}（{}）", host, errors.join("；"))
}

fn cached(host: &str) -> Option<String> {
    let cache = CACHE.lock();
    cache.get(host).filter(|e| e.expires > Instant::now()).and_then(|e| e.ips.first().cloned())
}

fn spawn_lookup(host: &str, provider: &str, local: Option<IpAddr>) -> Pending {
    let (h, p) = (host.to_string(), provider.to_string());
    async move {
        let r = resolve_uncached(h.clone(), p, local).await;
        PENDING.lock().remove(&h);
        let a = r.map_err(|e| e.to_string())?;
        let expires = Instant::now() + Duration::from_secs(clamp_ttl(a.ttl));
        let first = a.ips[0].clone();
        CACHE.lock().insert(h, CacheEntry { ips: a.ips, expires });
        Ok(first)
    }
    .boxed()
    .shared()
}

/// 解析域名为首个 IPv4（IP 字面量直接返回）
pub async fn resolve4(host: &str, provider: &str, local: Option<IpAddr>) -> Result<String> {
    if host.parse::<IpAddr>().is_ok() {
        return Ok(host.to_string());
    }
    if let Some(ip) = cached(host) {
        return Ok(ip);
    }
    let fut = {
        let mut pending = PENDING.lock();
        pending.entry(host.to_string()).or_insert_with(|| spawn_lookup(host, provider, local)).clone()
    };
    fut.await.map_err(|e| anyhow!(e))
}

pub fn clear_cache() {
    CACHE.lock().clear();
}

/// reqwest 自定义解析器：direct 通道用国内 DoH 解析真实 IPv4
pub struct DohResolver {
    pub provider: String,
    pub local: Option<IpAddr>,
}

impl Resolve for DohResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let (provider, local) = (self.provider.clone(), self.local);
        let host = name.as_str().to_string();
        Box::pin(async move {
            let ip = resolve4(&host, &provider, local).await.map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                e.to_string().into()
            })?;
            let ip: IpAddr = ip.parse().map_err(|e: std::net::AddrParseError| -> Box<dyn std::error::Error + Send + Sync> {
                Box::new(e)
            })?;
            let addrs: Addrs = Box::new(std::iter::once(SocketAddr::new(ip, 0)));
            Ok(addrs)
        })
    }
}
