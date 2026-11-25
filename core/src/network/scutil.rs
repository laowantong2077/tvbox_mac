//! 系统代理读取（对应 server/lib/network/diagnose.js 的 parseScutil / systemProxy）
//! 仅 macOS：执行 `scutil --proxy`（不拼 shell），解析 HTTP/HTTPS/SOCKS/PAC
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::time::Duration;

const SCUTIL_TIMEOUT: Duration = Duration::from_secs(3);

fn parse_kv(text: &str) -> HashMap<String, String> {
    let re = regex::Regex::new(r"^\s*(\w+)\s*:\s*(.+?)\s*$").unwrap();
    let mut kv = HashMap::new();
    for line in text.split('\n') {
        if let Some(c) = re.captures(line) {
            let k = &c[1];
            if !k.chars().all(|ch| ch.is_ascii_digit()) {
                kv.insert(k.to_string(), c[2].to_string());
            }
        }
    }
    kv
}

/// 解析 scutil --proxy 输出 → { http, https, socks, pac }
pub fn parse_scutil(text: &str) -> Map<String, Value> {
    let kv = parse_kv(text);
    let get = |k: &str| kv.get(k).cloned().unwrap_or_default();
    let item = |p: &str| -> Value {
        if get(&format!("{p}Enable")) != "1" {
            return Value::Null;
        }
        let port = get(&format!("{p}Port")).parse::<u64>().unwrap_or(0);
        json!({ "host": get(&format!("{p}Proxy")), "port": port })
    };
    let pac = if get("ProxyAutoConfigEnable") == "1" { get("ProxyAutoConfigURLString") } else { String::new() };
    let mut m = Map::new();
    m.insert("http".into(), item("HTTP"));
    m.insert("https".into(), item("HTTPS"));
    m.insert("socks".into(), item("SOCKS"));
    m.insert("pac".into(), Value::String(pac));
    m
}

fn run_scutil() -> Result<String, String> {
    let out = std::process::Command::new("scutil").arg("--proxy").output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("scutil 退出码 {}", out.status));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// 系统代理信息：非 macOS → { supported:false }
pub async fn system_proxy() -> Value {
    if !cfg!(target_os = "macos") {
        return json!({ "supported": false });
    }
    let task = tokio::task::spawn_blocking(run_scutil);
    let res = match tokio::time::timeout(SCUTIL_TIMEOUT, task).await {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("scutil 超时".into()),
    };
    match res {
        Ok(text) => {
            // 与 Node 版 Object.assign({ supported: true }, ...) 的字段顺序一致
            let mut m = Map::new();
            m.insert("supported".into(), Value::Bool(true));
            m.extend(parse_scutil(&text));
            Value::Object(m)
        }
        Err(e) => json!({ "supported": true, "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse() {
        let t = "<dictionary> {\n  ExceptionsList : <array> {\n    0 : *.local\n  }\n  HTTPEnable : 1\n  HTTPPort : 7890\n  \
                 HTTPProxy : 127.0.0.1\n  HTTPSEnable : 0\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://x/p.pac\n}";
        let m = parse_scutil(t);
        assert_eq!(json!({"host":"127.0.0.1","port":7890}), m["http"]);
        assert_eq!(Value::Null, m["https"]);
        assert_eq!(Value::Null, m["socks"]);
        assert_eq!("http://x/p.pac", m["pac"]);
    }
}
