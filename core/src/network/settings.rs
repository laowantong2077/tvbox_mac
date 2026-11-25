//! 网络设置持久化（对应 server/lib/network/settings.js）
//! 存于 DATA_DIR/network.json（原子写入）：
//!   mode       : system | direct | proxy | smart
//!   streamOnly : direct/proxy 模式下是否仅对视频流生效
//!   doh        : 国内 DoH 服务商 key（见 doh.rs PROVIDERS）
//!   iface      : 手动指定的物理网卡名；空 = 自动探测
//!   proxyUrl   : 自定义代理 http://[用户名:密码@]主机:端口 或 socks5://...
use crate::paths;
use anyhow::{anyhow, bail, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

pub const MODES: [&str; 4] = ["system", "direct", "proxy", "smart"];
pub const DOH_KEYS: [&str; 3] = ["alidns", "dohpub", "dnspod"];
const FILE_NAME: &str = "network.json";
const HTTP_DEFAULT_PORT: u16 = 80;
const SOCKS_DEFAULT_PORT: u16 = 1080;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub mode: String,
    pub stream_only: bool,
    pub doh: String,
    pub iface: String,
    pub proxy_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: "smart".into(),
            stream_only: true,
            doh: "alidns".into(),
            iface: String::new(),
            proxy_url: String::new(),
        }
    }
}

/// 代理类型（仅 http 与 socks5，同 Node 版）
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProxyKind {
    Http,
    Socks5,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProxyConf {
    pub kind: ProxyKind,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

fn decode(s: &str) -> String {
    urlencoding::decode(s).map(|c| c.into_owned()).unwrap_or_else(|_| s.to_string())
}

/// 校验代理地址：空串返回 None，非法时返回与 Node 版一致的中文报错
pub fn parse_proxy_url(s: &str) -> Result<Option<ProxyConf>> {
    if s.is_empty() {
        return Ok(None);
    }
    let u = url::Url::parse(s).map_err(|_| anyhow!("代理地址格式不正确：{s}"))?;
    let kind = match u.scheme().to_lowercase().as_str() {
        "socks" | "socks5" | "socks5h" => ProxyKind::Socks5,
        "http" => ProxyKind::Http,
        _ => bail!("仅支持 http:// 与 socks5:// 代理"),
    };
    let default_port = if kind == ProxyKind::Http { HTTP_DEFAULT_PORT } else { SOCKS_DEFAULT_PORT };
    let port = u.port().unwrap_or(default_port);
    let host = u.host_str().unwrap_or("").trim_start_matches('[').trim_end_matches(']').to_string();
    if host.is_empty() || port == 0 {
        bail!("代理地址缺少主机或端口");
    }
    Ok(Some(ProxyConf {
        kind,
        host,
        port,
        username: decode(u.username()),
        password: decode(u.password().unwrap_or("")),
    }))
}

/// 规范化：在 base 基础上合并 input 中合法的字段（过滤未知字段与非法值）
pub fn normalize(input: &Value, base: &Settings) -> Settings {
    let mut out = base.clone();
    let str_of = |k: &str| input.get(k).and_then(Value::as_str);
    if let Some(m) = str_of("mode").filter(|m| MODES.contains(m)) {
        out.mode = m.to_string();
    }
    if let Some(b) = input.get("streamOnly").and_then(Value::as_bool) {
        out.stream_only = b;
    }
    if let Some(d) = str_of("doh").filter(|d| DOH_KEYS.contains(d)) {
        out.doh = d.to_string();
    }
    if let Some(i) = str_of("iface") {
        out.iface = i.trim().to_string();
    }
    if let Some(p) = str_of("proxyUrl") {
        out.proxy_url = p.trim().to_string();
    }
    out
}

static CACHE: RwLock<Option<Settings>> = RwLock::new(None);
/// 设置版本号：每次更新 +1，用于 client 缓存等失效判断
static VERSION: AtomicU64 = AtomicU64::new(0);

pub fn version() -> u64 {
    VERSION.load(Ordering::SeqCst)
}

fn load_from_disk() -> Settings {
    std::fs::read_to_string(paths::data_file(FILE_NAME))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .map(|v| normalize(&v, &Settings::default()))
        .unwrap_or_default()
}

pub fn get_settings() -> Settings {
    if let Some(s) = CACHE.read().as_ref() {
        return s.clone();
    }
    let s = load_from_disk();
    *CACHE.write() = Some(s.clone());
    s
}

/// 合并更新并原子写入；代理地址非法或代理模式缺地址时报错（不落盘）
pub fn update_settings(patch: &Value) -> Result<Settings> {
    let next = normalize(patch, &get_settings());
    parse_proxy_url(&next.proxy_url)?;
    if next.mode == "proxy" && next.proxy_url.is_empty() {
        bail!("代理模式需要填写代理地址");
    }
    let file = paths::data_file(FILE_NAME);
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&next)?)?;
    std::fs::rename(&tmp, &file)?;
    *CACHE.write() = Some(next.clone());
    VERSION.fetch_add(1, Ordering::SeqCst);
    super::on_settings_changed();
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn proxy_url_ok() {
        let p = parse_proxy_url("socks5h://u%40x:p@127.0.0.1:7891").unwrap().unwrap();
        assert_eq!(ProxyKind::Socks5, p.kind);
        assert_eq!(("127.0.0.1", 7891), (p.host.as_str(), p.port));
        assert_eq!(("u@x", "p"), (p.username.as_str(), p.password.as_str()));
        let h = parse_proxy_url("http://proxy.lan").unwrap().unwrap();
        assert_eq!((ProxyKind::Http, 80), (h.kind, h.port));
        assert_eq!(1080, parse_proxy_url("socks://[::1]").unwrap().unwrap().port);
        assert_eq!("::1", parse_proxy_url("socks://[::1]:1").unwrap().unwrap().host);
        assert!(parse_proxy_url("").unwrap().is_none());
    }

    #[test]
    fn proxy_url_errors() {
        let e = |s: &str| parse_proxy_url(s).unwrap_err().to_string();
        assert_eq!("代理地址格式不正确：127.0.0.1:7890", e("127.0.0.1:7890"));
        assert_eq!("仅支持 http:// 与 socks5:// 代理", e("https://a.com:1"));
        assert_eq!("代理地址缺少主机或端口", e("http://a.com:0"));
    }

    #[test]
    fn normalize_filters() {
        let base = Settings::default();
        let s = normalize(&json!({"mode":"bad","streamOnly":false,"doh":"x","iface":" en1 ","extra":1}), &base);
        assert_eq!(("smart", false, "alidns", "en1"), (s.mode.as_str(), s.stream_only, s.doh.as_str(), s.iface.as_str()));
        let s = normalize(&json!({"mode":"direct","doh":"dnspod","proxyUrl":1}), &base);
        assert_eq!(("direct", "dnspod", ""), (s.mode.as_str(), s.doh.as_str(), s.proxy_url.as_str()));
    }
}
