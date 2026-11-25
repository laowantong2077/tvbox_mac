//! 国内 DoH / HTTPDNS 服务商与响应解析（对应 server/lib/network/doh.js 的纯逻辑部分）
//! 实际请求、缓存与 reqwest 解析器见 doh_resolver.rs
use serde::Serialize;
use serde_json::Value;
use std::net::Ipv4Addr;

/// TTL 下限（秒）；无 TTL 时也用它
pub const MIN_TTL: u64 = 60;
/// TTL 上限（秒）
pub const MAX_TTL: u64 = 1800;

/// 解析结果：IPv4 列表 + TTL（秒）
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DohAnswer {
    pub ips: Vec<String>,
    pub ttl: u64,
}

pub struct Provider {
    pub key: &'static str,
    pub label: &'static str,
    pub https: bool,
    pub ip: Ipv4Addr,
    /// TLS SNI / Host；空 = 直接用 IP
    pub servername: &'static str,
    pub path: fn(&str) -> String,
    pub parse: fn(&str) -> Option<DohAnswer>,
}

fn enc(h: &str) -> String {
    urlencoding::encode(h).into_owned()
}

pub static PROVIDERS: [Provider; 3] = [
    Provider {
        key: "alidns",
        label: "阿里 DNS（223.5.5.5）",
        https: true,
        ip: Ipv4Addr::new(223, 5, 5, 5),
        servername: "dns.alidns.com",
        path: |h| format!("/resolve?name={}&type=1", enc(h)),
        parse: parse_json_answer,
    },
    Provider {
        key: "dohpub",
        label: "腾讯 DoH（doh.pub / 1.12.12.12）",
        https: true,
        ip: Ipv4Addr::new(1, 12, 12, 12),
        servername: "doh.pub",
        path: |h| format!("/resolve?name={}&type=A", enc(h)),
        parse: parse_json_answer,
    },
    Provider {
        key: "dnspod",
        label: "腾讯 HTTPDNS（119.29.29.29）",
        https: false,
        ip: Ipv4Addr::new(119, 29, 29, 29),
        servername: "",
        path: |h| format!("/d?dn={}&ttl=1", enc(h)),
        parse: parse_dnspod_text,
    },
];

/// A 记录类型
const DNS_TYPE_A: u64 = 1;

fn is_ipv4(s: &str) -> bool {
    s.parse::<Ipv4Addr>().is_ok()
}

/// 解析 Google 风格 JSON：Answer[] 中 type==1 且为 IPv4 的 data
pub fn parse_json_answer(text: &str) -> Option<DohAnswer> {
    let j: Value = serde_json::from_str(text).ok()?;
    let ans: Vec<&Value> = j
        .get("Answer")
        .and_then(Value::as_array)
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    let ans: Vec<&Value> = ans
        .into_iter()
        .filter(|a| a.get("type").and_then(Value::as_u64) == Some(DNS_TYPE_A))
        .filter(|a| a.get("data").and_then(Value::as_str).is_some_and(is_ipv4))
        .collect();
    if ans.is_empty() {
        return None;
    }
    let ips = ans.iter().filter_map(|a| a["data"].as_str().map(String::from)).collect();
    let ttl = ans
        .iter()
        .map(|a| a.get("TTL").and_then(Value::as_u64).filter(|t| *t > 0).unwrap_or(MIN_TTL))
        .min()
        .unwrap_or(MIN_TTL);
    Some(DohAnswer { ips, ttl })
}

/// 解析 DNSPod 文本：ip1;ip2,ttl
pub fn parse_dnspod_text(text: &str) -> Option<DohAnswer> {
    let mut parts = text.trim().split(',');
    let ip_part = parts.next().unwrap_or("");
    let ttl_part = parts.next().unwrap_or("");
    let ips: Vec<String> = ip_part.split(';').filter(|x| is_ipv4(x)).map(String::from).collect();
    if ips.is_empty() {
        return None;
    }
    let ttl = ttl_part.trim().parse::<u64>().ok().filter(|t| *t > 0).unwrap_or(MIN_TTL);
    Some(DohAnswer { ips, ttl })
}

/// 首选服务商在前，其余按定义顺序
pub fn provider_order(preferred: &str) -> Vec<&'static Provider> {
    let first = PROVIDERS.iter().filter(|p| p.key == preferred);
    first.chain(PROVIDERS.iter().filter(|p| p.key != preferred)).collect()
}

/// TTL 夹到 [MIN_TTL, MAX_TTL]
pub fn clamp_ttl(ttl: u64) -> u64 {
    ttl.clamp(MIN_TTL, MAX_TTL)
}

#[derive(Serialize)]
pub struct ProviderInfo {
    pub key: &'static str,
    pub label: &'static str,
}

pub fn list_providers() -> Vec<ProviderInfo> {
    PROVIDERS.iter().map(|p| ProviderInfo { key: p.key, label: p.label }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_answer() {
        let t = r#"{"Status":0,"Answer":[{"name":"a.com.","type":5,"TTL":30,"data":"b.com."},
            {"name":"b.com.","type":1,"TTL":120,"data":"1.2.3.4"},{"type":1,"TTL":90,"data":"5.6.7.8"}]}"#;
        let a = parse_json_answer(t).unwrap();
        assert_eq!(vec!["1.2.3.4", "5.6.7.8"], a.ips);
        assert_eq!(90, a.ttl);
        assert!(parse_json_answer(r#"{"Status":3}"#).is_none());
        assert!(parse_json_answer("not json").is_none());
    }

    #[test]
    fn dnspod_text() {
        let a = parse_dnspod_text("1.1.1.1;2.2.2.2,300\n").unwrap();
        assert_eq!((vec!["1.1.1.1".to_string(), "2.2.2.2".into()], 300), (a.ips, a.ttl));
        assert_eq!(MIN_TTL, parse_dnspod_text("3.3.3.3").unwrap().ttl);
        assert!(parse_dnspod_text("").is_none());
    }

    #[test]
    fn order_and_ttl() {
        let keys: Vec<_> = provider_order("dnspod").iter().map(|p| p.key).collect();
        assert_eq!(vec!["dnspod", "alidns", "dohpub"], keys);
        assert_eq!(3, provider_order("bad").len());
        assert_eq!((MIN_TTL, MAX_TTL, 300), (clamp_ttl(1), clamp_ttl(99999), clamp_ttl(300)));
        assert_eq!("/d?dn=a.b&ttl=1", (PROVIDERS[2].path)("a.b"));
    }
}
