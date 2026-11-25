//! 最近访问域名记录（/api/stream 上游）+ 导出 Clash 分流规则（对应 server/lib/network/hosts.js）
//! - 仅保存在内存中，最多 MAX_HOSTS 个（按最近访问淘汰）
//! - 记录最近一次失败的流地址，作为网络诊断的默认测试 URL
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;

const MAX_HOSTS: usize = 200;
const HTTP_ERROR_MIN: u16 = 400;

/// 常见二级公共后缀，用于推导可注册域名（DOMAIN-SUFFIX）
const SECOND_LEVEL: [&str; 15] = [
    "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn", "com.hk", "com.tw", "com.sg", "com.au", "co.uk",
    "co.jp", "co.kr", "ne.jp", "or.jp",
];

/// 一次上游访问的结果（stream 模块调用 record_host 时传入）
#[derive(Clone, Debug, Default)]
pub struct HostInfo {
    pub status: u16,
    pub route: String,
    pub error: String,
    pub ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRecord {
    pub host: String,
    pub count: u64,
    pub fails: u64,
    pub first_at: u64,
    pub last_status: u16,
    pub last_error: String,
    pub last_route: String,
    pub last_ms: u64,
    pub last_at: u64,
    pub suffix: String,
    /// 访问序号（淘汰与排序用，不输出）
    #[serde(skip)]
    seq: u64,
}

#[derive(Default)]
struct State {
    hosts: HashMap<String, HostRecord>,
    seq: u64,
    last_failed_url: String,
    last_url: String,
}

static STATE: Lazy<Mutex<State>> = Lazy::new(Default::default);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 推导可注册域名：a.b.example.com -> example.com；IP 原样返回
pub fn suffix_of(host: &str) -> String {
    if host.is_empty() || host.parse::<IpAddr>().is_ok() {
        return host.to_string();
    }
    let lower = host.to_lowercase();
    let parts: Vec<&str> = lower.split('.').filter(|p| !p.is_empty()).collect();
    if parts.len() <= 2 {
        return parts.join(".");
    }
    let last2 = parts[parts.len() - 2..].join(".");
    let n = if SECOND_LEVEL.contains(&last2.as_str()) { 3 } else { 2 };
    parts[parts.len() - n..].join(".")
}

fn new_record(host: &str) -> HostRecord {
    HostRecord {
        host: host.to_string(),
        count: 0,
        fails: 0,
        first_at: now_ms(),
        last_status: 0,
        last_error: String::new(),
        last_route: String::new(),
        last_ms: 0,
        last_at: 0,
        suffix: String::new(),
        seq: 0,
    }
}

/// 记录一次上游访问结果
pub fn record_host(url: &str, info: HostInfo) {
    let Some(host) = url::Url::parse(url).ok().and_then(|u| u.host_str().map(String::from)) else {
        return;
    };
    let ok = info.error.is_empty() && info.status > 0 && info.status < HTTP_ERROR_MIN;
    let mut st = STATE.lock();
    st.seq += 1;
    let seq = st.seq;
    let rec = st.hosts.entry(host.clone()).or_insert_with(|| new_record(&host));
    rec.count += 1;
    rec.fails += u64::from(!ok);
    rec.last_status = info.status;
    rec.last_error = info.error;
    rec.last_route = info.route;
    rec.last_ms = info.ms;
    rec.last_at = now_ms();
    rec.suffix = suffix_of(&host);
    rec.seq = seq;
    if st.hosts.len() > MAX_HOSTS {
        let oldest = st.hosts.values().min_by_key(|r| r.seq).map(|r| r.host.clone());
        if let Some(h) = oldest {
            st.hosts.remove(&h);
        }
    }
    st.last_url = url.to_string();
    if !ok {
        st.last_failed_url = url.to_string();
    }
}

/// 按最近访问倒序列出
pub fn list_hosts() -> Vec<HostRecord> {
    let mut list: Vec<HostRecord> = STATE.lock().hosts.values().cloned().collect();
    list.sort_by_key(|r| std::cmp::Reverse(r.seq));
    list
}

/// 生成 Clash 规则文本（按可注册域名去重；IP 用 IP-CIDR）
pub fn clash_rules(list: &[HostRecord]) -> String {
    let mut seen = HashSet::new();
    let mut lines = Vec::new();
    for h in list {
        let s = if h.suffix.is_empty() { suffix_of(&h.host) } else { h.suffix.clone() };
        if s.is_empty() || !seen.insert(s.clone()) {
            continue;
        }
        if s.parse::<IpAddr>().is_ok() {
            lines.push(format!("IP-CIDR,{s}/32,DIRECT,no-resolve"));
        } else {
            lines.push(format!("DOMAIN-SUFFIX,{s},DIRECT"));
        }
    }
    lines.join("\n")
}

pub fn clear_hosts() {
    let mut st = STATE.lock();
    st.hosts.clear();
    st.last_failed_url.clear();
}

/// 最近一次失败的流地址；没有失败则返回最近访问的地址
pub fn last_failed_url() -> String {
    let st = STATE.lock();
    if st.last_failed_url.is_empty() {
        st.last_url.clone()
    } else {
        st.last_failed_url.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suffix_rules() {
        assert_eq!("example.com", suffix_of("a.b.Example.com"));
        assert_eq!("x.com.cn", suffix_of("cdn.x.com.cn"));
        assert_eq!("a.com", suffix_of("a.com"));
        assert_eq!("1.2.3.4", suffix_of("1.2.3.4"));
    }

    #[test]
    fn rules_dedupe() {
        let mut a = new_record("v1.cdn.com");
        a.suffix = suffix_of(&a.host);
        let mut b = new_record("v2.cdn.com");
        b.suffix = suffix_of(&b.host);
        let c = new_record("10.0.0.1");
        assert_eq!("DOMAIN-SUFFIX,cdn.com,DIRECT\nIP-CIDR,10.0.0.1/32,DIRECT,no-resolve", clash_rules(&[a, b, c]));
    }
}
