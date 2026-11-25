//! 网卡探测（对应 server/lib/network/interfaces.js）
//! - 物理网卡：非回环、非 utun/tun/tap/ppp 等虚拟接口、非 198.18.0.0/15（fake-ip / TUN 段）、非 169.254 链路本地
//! - 优先 en0，其次 en*，再其次其它
//! - 每次调用都实时读取（DHCP 地址可能变化）
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::net::IpAddr;

static VIRTUAL_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(utun|tun|tap|ppp|ipsec|gif|stf|awdl|llw|lo|bridge|vmnet|vboxnet|docker|anpi)").unwrap()
});
static TUN_NAME: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^(utun|tun|tap)").unwrap());
static EN_NAME: Lazy<Regex> = Lazy::new(|| Regex::new(r"^en\d+$").unwrap());
const LINK_LOCAL_PREFIX: &str = "169.254.";
const PRIMARY_IFACE: &str = "en0";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct IfaceInfo {
    pub name: String,
    pub address: String,
    pub internal: bool,
    pub tun: bool,
    pub physical: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Physical {
    pub name: String,
    pub address: String,
    pub manual: bool,
}

/// 198.18.0.0/15：Clash/mihomo/Surge 等 TUN / fake-ip 常用网段
pub fn is_fake_ip_range(addr: &str) -> bool {
    addr.starts_with("198.18.") || addr.starts_with("198.19.")
}

/// 对单个接口地址分类
pub fn classify(name: &str, address: &str, internal: bool) -> IfaceInfo {
    let tun = TUN_NAME.is_match(name) || is_fake_ip_range(address);
    let physical = !internal && !tun && !VIRTUAL_NAME.is_match(name) && !address.starts_with(LINK_LOCAL_PREFIX);
    IfaceInfo { name: name.into(), address: address.into(), internal, tun, physical }
}

/// 列出全部 IPv4 接口（附带分类标记）
pub fn list_interfaces() -> Vec<IfaceInfo> {
    let all = if_addrs::get_if_addrs().unwrap_or_default();
    all.iter()
        .filter_map(|i| match i.ip() {
            IpAddr::V4(v4) => Some(classify(&i.name, &v4.to_string(), i.is_loopback())),
            IpAddr::V6(_) => None,
        })
        .collect()
}

fn rank(name: &str) -> u8 {
    if name == PRIMARY_IFACE {
        0
    } else if EN_NAME.is_match(name) {
        1
    } else {
        2
    }
}

/// 从给定列表选物理网卡：手动指定（存在且非回环）优先，否则按 rank 自动选
pub fn pick_from(list: &[IfaceInfo], prefer: &str) -> Option<Physical> {
    if !prefer.is_empty() {
        if let Some(hit) = list.iter().find(|i| i.name == prefer && !i.internal) {
            return Some(Physical { name: hit.name.clone(), address: hit.address.clone(), manual: true });
        }
    }
    let mut cands: Vec<&IfaceInfo> = list.iter().filter(|i| i.physical).collect();
    cands.sort_by_key(|i| rank(&i.name));
    cands
        .first()
        .map(|c| Physical { name: c.name.clone(), address: c.address.clone(), manual: false })
}

pub fn pick_physical(prefer: &str) -> Option<Physical> {
    pick_from(&list_interfaces(), prefer)
}

/// 检测 TUN 接口（VPN 是否开启的强信号）
pub fn detect_tun() -> Vec<IfaceInfo> {
    list_interfaces().into_iter().filter(|i| i.tun && !i.internal).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_and_pick() {
        let list = vec![
            classify("lo0", "127.0.0.1", true),
            classify("utun4", "198.18.0.1", false),
            classify("bridge100", "192.168.2.1", false),
            classify("en5", "10.0.0.2", false),
            classify("en0", "192.168.1.8", false),
        ];
        assert!(list[1].tun && !list[1].physical);
        assert!(!list[2].physical);
        let p = pick_from(&list, "").unwrap();
        assert_eq!(("en0", false), (p.name.as_str(), p.manual));
        let m = pick_from(&list, "bridge100").unwrap();
        assert_eq!(("bridge100", true), (m.name.as_str(), m.manual));
        assert_eq!("en0", pick_from(&list, "nope").unwrap().name);
        assert!(!classify("en0", "169.254.1.1", false).physical);
    }
}
