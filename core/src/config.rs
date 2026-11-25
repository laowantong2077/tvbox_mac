//! 源配置加载（对应 server/lib/config.js），支持：
//!  - 多仓配置 { urls: [{ name, url }] }
//!  - 单仓配置 { sites: [...], lives, parses, ... }
//!  - 直接是站点数组 [ ... ]
use crate::cms::ensure_http;
use crate::cms::js::{field, js_number, js_str, js_trim, num_to_string, num_value, or, truthy};
use crate::http::{self, ReqOpts};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Map, Value};

/// 配置下载超时
const CONFIG_TIMEOUT_MS: u64 = 25_000;
/// 解析失败时错误信息里展示的前若干字符
const ERR_HEAD_CHARS: usize = 80;
/// 字符串哈希乘数与进制（同 JS hashCode）
const HASH_MUL: i32 = 31;
const HASH_RADIX: u32 = 36;
/// HTTP 错误状态起点
const HTTP_ERROR_MIN: u16 = 400;
const UNSUPPORTED_REASON: &str = "JS 爬虫/内置解析型站点，暂未内置运行时";

/// Java 风格字符串哈希（按 UTF-16 码元），取绝对值后转 36 进制
pub fn hash_code(s: &str) -> String {
    let h = s.encode_utf16().fold(0i32, |h, c| h.wrapping_mul(HASH_MUL).wrapping_add(i32::from(c)));
    to_radix(i64::from(h).unsigned_abs(), HASH_RADIX)
}

fn to_radix(mut n: u64, radix: u32) -> String {
    if n == 0 {
        return "0".into();
    }
    let mut digits = Vec::new();
    while n > 0 {
        let d = (n % u64::from(radix)) as u32;
        digits.push(std::char::from_digit(d, radix).unwrap_or('0'));
        n /= u64::from(radix);
    }
    digits.iter().rev().collect()
}

/// Number(x == null ? default : x)
fn number_default(v: Option<&Value>, default: f64) -> f64 {
    match v {
        None | Some(Value::Null) => default,
        _ => js_number(v),
    }
}

/// a || b || default（保留原值类型）
fn first_truthy(vals: &[Option<&Value>], default: &str) -> Value {
    vals.iter().find(|v| truthy(**v)).and_then(|v| v.cloned()).unwrap_or_else(|| json!(default))
}

/// 存在（非 undefined）时才写入字段，模拟 JSON.stringify 丢弃 undefined
fn put_opt(m: &mut Map<String, Value>, k: &str, v: Option<&Value>) {
    if let Some(v) = v {
        m.insert(k.into(), v.clone());
    }
}

/// 站点标准化（字段与 Node 版 normalizeSite 一致）
pub fn normalize_site(s: &Value, base: &str) -> Value {
    let ty = number_default(field(s, "type"), 0.0);
    let api_v = field(s, "api");
    let api = if truthy(api_v) { ensure_http(&js_str(api_v), Some(base)) } else { String::new() };
    let name = first_truthy(&[field(s, "name"), field(s, "key")], "未命名站点");
    let key = if truthy(field(s, "key")) {
        field(s, "key").cloned().unwrap_or(Value::Null)
    } else {
        let seed = format!("{}|{}|{}", js_str(Some(&name)), num_to_string(ty), api);
        json!(format!("site_{}", hash_code(&seed)))
    };
    let supported = ty == 0.0 || ty == 1.0 || ty == 100.0;
    let mut m = Map::new();
    m.insert("key".into(), key);
    m.insert("name".into(), name);
    m.insert("type".into(), num_value(ty));
    m.insert("api".into(), json!(api));
    put_opt(&mut m, "ext", field(s, "ext"));
    m.insert("searchable".into(), num_value(number_default(field(s, "searchable"), 1.0)));
    m.insert("quickSearch".into(), num_value(number_default(field(s, "quickSearch"), 0.0)));
    put_opt(&mut m, "playerType", field(s, "playerType"));
    m.insert("group".into(), first_truthy(&[field(s, "group"), field(s, "cate")], ""));
    m.insert("supported".into(), json!(supported));
    m.insert("reason".into(), json!(if supported { "" } else { UNSUPPORTED_REASON }));
    Value::Object(m)
}

/// 配置所在目录（origin + 去掉最后一段的 pathname）；无法解析时原样返回
pub fn site_base(url: &str) -> String {
    match url::Url::parse(url) {
        Ok(u) => {
            let path = u.path();
            let dir = &path[..path.rfind('/').map_or(0, |i| i + 1)];
            format!("{}{}", u.origin().ascii_serialization(), dir)
        }
        Err(_) => url.to_string(),
    }
}

/// 解析配置文本：先整体 JSON.parse，失败则截取首个 { 到末个 }
pub fn parse_config_text(raw: &str) -> Result<Value> {
    let text = js_trim(raw).trim_start_matches('\u{feff}');
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        return Ok(v);
    }
    match (text.find('{'), text.rfind('}')) {
        (Some(s), Some(e)) if e > s => serde_json::from_str(&text[s..=e]).map_err(|_| {
            let head: String = text.chars().take(ERR_HEAD_CHARS).collect();
            anyhow!("配置内容不是合法 JSON（前 80 字：{head}）")
        }),
        _ => bail!("配置内容不是合法 JSON"),
    }
}

/// 多仓：warehouses = urls.map({ name: w.name || w.url, url: ensureHttp(w.url, base) })
fn multi_config(urls: &[Value], base: &str, origin: &str) -> Value {
    let warehouses: Vec<Value> = urls
        .iter()
        .map(|w| {
            let mut m = Map::new();
            let url_v = field(w, "url");
            put_opt(&mut m, "name", or(field(w, "name"), url_v));
            let url = if truthy(url_v) { Some(json!(ensure_http(&js_str(url_v), Some(base)))) } else { url_v.cloned() };
            put_opt(&mut m, "url", url.as_ref());
            Value::Object(m)
        })
        .collect();
    json!({ "kind": "multi", "warehouses": warehouses, "origin": origin })
}

/// 数组字段：非数组时为 []
fn array_or_empty(json: &Value, key: &str) -> Value {
    match field(json, key) {
        Some(v @ Value::Array(_)) => v.clone(),
        _ => json!([]),
    }
}

/// 单仓：站点标准化 + meta + stats
fn single_config(json: &Value, raw_sites: &[Value], base: &str) -> Value {
    let sites: Vec<Value> = raw_sites.iter().map(|s| normalize_site(s, base)).collect();
    let supported = sites.iter().filter(|s| s["supported"] == true).count();
    json!({
        "kind": "single",
        "sites": sites,
        "meta": {
            "lives": array_or_empty(json, "lives"),
            "parses": array_or_empty(json, "parses"),
            "flags": array_or_empty(json, "flags"),
            "wallpaper": first_truthy(&[field(json, "wallpaper")], ""),
            "spider": first_truthy(&[field(json, "spider")], ""),
        },
        "stats": { "total": sites.len(), "supported": supported },
    })
}

/// 按已解析 JSON 识别多仓/单仓
pub fn build_config(json: &Value, base: &str, origin: &str) -> Result<Value> {
    if let Some(Value::Array(urls)) = field(json, "urls") {
        return Ok(multi_config(urls, base, origin));
    }
    let raw_sites = match json {
        Value::Array(a) => Some(a),
        _ => field(json, "sites").and_then(Value::as_array),
    };
    match raw_sites {
        Some(sites) => Ok(single_config(json, sites, base)),
        None => bail!("无法识别的配置格式（缺少 sites 或 urls 字段）"),
    }
}

/// 下载并解析配置
pub async fn load_config(url: &str) -> Result<Value> {
    let r = http::get_text(url, &ReqOpts::default().timeout(CONFIG_TIMEOUT_MS)).await?;
    if r.status >= HTTP_ERROR_MIN {
        bail!("配置下载失败 HTTP {}", r.status);
    }
    let json = parse_config_text(&r.text)?;
    let final_url = if r.final_url.is_empty() { url } else { r.final_url.as_str() };
    build_config(&json, &site_base(final_url), url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_site_cases() {
        let s = normalize_site(&json!({ "key": "k", "name": "无尽", "type": 1, "api": "./api.php" }), "http://h/c/");
        assert_eq!("http://h/c/api.php", s["api"]);
        assert_eq!(true, s["supported"]);
        assert_eq!(1, s["searchable"]);
        assert_eq!(0, s["quickSearch"]);
        assert!(s.get("ext").is_none());
        let js = normalize_site(&json!({ "name": "爬虫", "type": 3, "api": "csp_X", "ext": null }), "http://h/");
        assert_eq!(false, js["supported"]);
        assert_eq!(UNSUPPORTED_REASON, js["reason"]);
        assert_eq!(Value::Null, js["ext"]);
        assert!(js["key"].as_str().unwrap().starts_with("site_"));
        assert_eq!("未命名站点", normalize_site(&json!({}), "")["name"]);
    }

    #[test]
    fn hash_matches_js() {
        // JS: hashCode("a|0|") —— 'a'=97,'|'=124,'0'=48 → ((97*31+124)*31+48)*31+124
        assert_eq!(to_radix(((97 * 31 + 124) * 31 + 48) * 31 + 124, HASH_RADIX), hash_code("a|0|"));
        assert_eq!("0", hash_code(""));
    }

    #[test]
    fn base_and_parse() {
        assert_eq!("https://raw.x.com/a/b/", site_base("https://raw.x.com/a/b/c.json?x=1"));
        assert_eq!("bad", site_base("bad"));
        assert_eq!(2, parse_config_text("//注释\n{\"a\":2}").unwrap()["a"]);
        assert!(parse_config_text("oops").unwrap_err().to_string().contains("不是合法 JSON"));
        let multi = build_config(&json!({ "urls": [{ "url": "x.json" }] }), "http://h/", "o").unwrap();
        assert_eq!("http://h/x.json", multi["warehouses"][0]["url"]);
        assert_eq!("x.json", multi["warehouses"][0]["name"]);
    }
}
