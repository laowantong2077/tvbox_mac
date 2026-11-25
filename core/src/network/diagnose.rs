//! 网络诊断（对应 server/lib/network/diagnose.js）
//! - 各通道出口 IP 与归属地：myip.ipip.net 与 ip-api.com 并发，优先 ipip 的中文归属地
//! - 物理网卡、TUN 接口、系统代理（scutil --proxy）
//! - 测试 URL 在各通道下的 HTTP 状态码与耗时
use super::interfaces::{detect_tun, list_interfaces};
use super::{environment, hosts, open_request, route_available, scutil, Env, Route};
use crate::http::{get_text, ReqOpts};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Map, Value};
use std::time::Instant;

const EGRESS_TIMEOUT_MS: u64 = 8000;
const PROBE_TIMEOUT_MS: u64 = 12000;
const HTTP_ERROR_MIN: u16 = 400;
const IPIP_URL: &str = "https://myip.ipip.net";
const IPAPI_URL: &str = "http://ip-api.com/json/?lang=zh-CN";

fn route_opts(route: Route, timeout_ms: u64) -> ReqOpts {
    ReqOpts { route: Some(route), timeout_ms, ..Default::default() }
}

/// 解析 ipip 文本：「当前 IP：1.2.3.4  来自于：中国 上海 电信」
pub fn parse_ipip(text: &str) -> Result<Map<String, Value>> {
    let re = regex::Regex::new(r"IP[：:]\s*([\d.]+)\s+来自于[：:]\s*(.+)").unwrap();
    let c = re.captures(text).ok_or_else(|| anyhow!("ipip 返回无法解析"))?;
    let ws = regex::Regex::new(r"\s+").unwrap();
    let loc = ws.replace_all(&c[2], " ").trim().to_string();
    let v = json!({ "ip": &c[1], "location": loc, "source": "myip.ipip.net" });
    Ok(v.as_object().cloned().unwrap_or_default())
}

/// 解析 ip-api JSON
pub fn parse_ip_api(text: &str) -> Result<Map<String, Value>> {
    let j: Value = serde_json::from_str(text)?;
    let s = |k: &str| j.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    if s("status") != "success" {
        let msg = s("message");
        bail!("ip-api: {}", if msg.is_empty() { "失败".to_string() } else { msg });
    }
    let loc: Vec<String> = ["country", "regionName", "city"].iter().map(|k| s(k)).filter(|x| !x.is_empty()).collect();
    let isp = s("isp");
    let location = format!("{}{}", loc.join(" "), if isp.is_empty() { String::new() } else { format!(" · {isp}") });
    let v = json!({ "ip": s("query"), "location": location, "source": "ip-api.com" });
    Ok(v.as_object().cloned().unwrap_or_default())
}

async fn via_ipip(route: Route) -> Result<Map<String, Value>> {
    parse_ipip(&get_text(IPIP_URL, &route_opts(route, EGRESS_TIMEOUT_MS)).await?.text)
}

async fn via_ip_api(route: Route) -> Result<Map<String, Value>> {
    parse_ip_api(&get_text(IPAPI_URL, &route_opts(route, EGRESS_TIMEOUT_MS)).await?.text)
}

/// 成功 → { ok:true, ms, ...v }；失败 → { ok:false, ms, error }（ms 在各自完成时计算，同 Node settle）
async fn settle(fut: impl std::future::Future<Output = Result<Map<String, Value>>>, t0: Instant) -> Map<String, Value> {
    let r = fut.await;
    let mut m = Map::new();
    m.insert("ok".into(), json!(r.is_ok()));
    m.insert("ms".into(), json!(t0.elapsed().as_millis() as u64));
    match r {
        Ok(v) => m.extend(v),
        Err(e) => {
            m.insert("error".into(), json!(e.to_string()));
        }
    }
    m
}

fn is_ok(m: &Map<String, Value>) -> bool {
    m.get("ok").and_then(Value::as_bool).unwrap_or(false)
}

/// 查询某通道的出口 IP（两个服务并发，优先 ipip）；字段顺序同 Node：route, ok, ms, ip, location, source, alt
pub async fn egress(route: Route) -> Value {
    let t0 = Instant::now();
    let (a, b) = tokio::join!(settle(via_ipip(route), t0), settle(via_ip_api(route), t0));
    let (best, alt) = match (is_ok(&a), is_ok(&b)) {
        (true, _) => (a, b),
        (false, true) => (b, a),
        _ => {
            let err = format!("{}；{}", a["error"].as_str().unwrap_or(""), b["error"].as_str().unwrap_or(""));
            let ms = t0.elapsed().as_millis() as u64;
            return json!({ "route": route.as_str(), "ok": false, "error": err, "ms": ms });
        }
    };
    let alt_v = if is_ok(&alt) {
        json!({ "ip": alt["ip"], "location": alt["location"], "source": alt["source"] })
    } else {
        Value::Null
    };
    let mut out = Map::new();
    out.insert("route".into(), json!(route.as_str()));
    out.extend(best);
    out.insert("alt".into(), alt_v);
    Value::Object(out)
}

/// 单通道探测 URL：只读响应头（Range 0-1023），重定向由 client 自动跟随
async fn probe(url: &str, route: Route) -> Value {
    let t0 = Instant::now();
    let res = async {
        let u = url::Url::parse(url).map_err(|_| anyhow!("无效 URL: {url}"))?;
        let opts = route_opts(route, PROBE_TIMEOUT_MS).header("Range", "bytes=0-1023");
        open_request(&u, &opts).await
    }
    .await;
    let ms = t0.elapsed().as_millis() as u64;
    match res {
        Ok(o) => {
            let status = o.response.status().as_u16();
            let final_url = o.response.url().to_string();
            json!({ "route": route.as_str(), "ok": status < HTTP_ERROR_MIN, "ms": ms, "status": status, "finalUrl": final_url })
        }
        Err(e) => json!({ "route": route.as_str(), "ok": false, "status": 0, "ms": ms, "error": e.to_string() }),
    }
}

/// 本次诊断涉及的通道；不可用的通道附带原因
fn routes_to_test(env: &Env) -> Vec<(Route, String)> {
    let mut list = vec![Route::System, Route::Direct];
    if !env.settings.proxy_url.is_empty() {
        list.push(Route::Proxy);
    }
    list.into_iter().map(|r| (r, route_available(r, env))).collect()
}

async fn run_route(route: Route, unavailable: String, url: String) -> Value {
    if !unavailable.is_empty() {
        return json!({ "route": route.as_str(), "unavailable": unavailable });
    }
    let probe_fut = async {
        if url.is_empty() {
            Value::Null
        } else {
            probe(&url, route).await
        }
    };
    let (eg, pr) = tokio::join!(egress(route), probe_fut);
    json!({ "route": route.as_str(), "egress": eg, "probe": pr })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 完整诊断；url 为空时使用最近一次失败的流地址
pub async fn diagnose(url: &str) -> Value {
    let env = environment();
    let url = if url.trim().is_empty() { hosts::last_failed_url() } else { url.trim().to_string() };
    let tasks = routes_to_test(&env).into_iter().map(|(r, un)| run_route(r, un, url.clone()));
    let (routes, proxy) = tokio::join!(futures_util::future::join_all(tasks), scutil::system_proxy());
    json!({
        "at": now_ms(),
        "mode": env.settings.mode,
        "testUrl": url,
        "physical": env.phys,
        "interfaces": list_interfaces(),
        "tun": detect_tun(),
        "systemProxy": proxy,
        "routes": routes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipip() {
        let m = parse_ipip("当前 IP：1.2.3.4  来自于：中国  上海   电信\n").unwrap();
        assert_eq!(("1.2.3.4", "中国 上海 电信"), (m["ip"].as_str().unwrap(), m["location"].as_str().unwrap()));
        assert!(parse_ipip("blocked").is_err());
    }

    #[test]
    fn ip_api() {
        let m = parse_ip_api(r#"{"status":"success","country":"日本","regionName":"东京","city":"","isp":"X","query":"9.9.9.9"}"#).unwrap();
        assert_eq!("日本 东京 · X", m["location"]);
        let e = parse_ip_api(r#"{"status":"fail","message":"quota"}"#).unwrap_err();
        assert_eq!("ip-api: quota", e.to_string());
    }
}
