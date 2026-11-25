//! CMS 采集站适配层（对应 server/lib/cms.js）
//! TVBox type 0 = XML / type 1 = JSON（苹果 CMS provide/vod 接口）：
//!   ac=list → 分类；ac=videolist&t=&pg= → 分类分页；ac=videolist&wd= → 搜索；ac=detail&ids= → 详情
//! 另内置 type 100 演示源（公共测试流）。
pub mod demo;
pub mod js;
pub mod vod;
pub mod xml;

use crate::http::{self, ReqOpts};
use anyhow::{anyhow, Result};
use js::{field, js_str, num_value, number_or, or};
use serde_json::{json, Value};

pub use demo::demo_site;

/// XML 站点类型
const XML_TYPE: f64 = 0.0;
/// 默认页码
const DEFAULT_PAGE: &str = "1";

/// 补全为绝对 http(s) 地址（对应 JS ensureHttp，入参为非空字符串）
pub fn ensure_http(u: &str, base: Option<&str>) -> String {
    let u = js::js_trim(u);
    let lower = u.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return u.to_string();
    }
    if u.starts_with("//") {
        return format!("https:{u}");
    }
    if let Some(joined) = base.and_then(|b| url::Url::parse(b).ok()).and_then(|b| b.join(u).ok()) {
        return joined.to_string();
    }
    format!("http://{u}")
}

/// 按 URLSearchParams 语义设置查询参数：值为 undefined/null/'' 时删除，否则替换首个并去重
pub fn set_params(api: Option<&Value>, params: &[(&str, Option<&Value>)]) -> Result<String> {
    let api_s = js_str(api);
    let mut u = url::Url::parse(&api_s).map_err(|_| anyhow!("无效的站点 API：{api_s}"))?;
    let mut pairs: Vec<(String, String)> = u.query_pairs().into_owned().collect();
    for (k, v) in params {
        let val = match v {
            None | Some(Value::Null) => None,
            Some(x) => Some(js_str(Some(x))).filter(|s| !s.is_empty()),
        };
        let Some(val) = val else {
            pairs.retain(|p| p.0 != *k);
            continue;
        };
        match pairs.iter().position(|p| p.0 == *k) {
            Some(pos) => {
                pairs[pos].1 = val;
                let mut idx = 0;
                pairs.retain(|p| {
                    idx += 1;
                    p.0 != *k || idx - 1 == pos
                });
            }
            None => pairs.push((k.to_string(), val)),
        }
    }
    if pairs.is_empty() {
        u.set_query(None);
    } else {
        u.query_pairs_mut().clear().extend_pairs(pairs.iter());
    }
    Ok(u.to_string())
}

/// site.type === n（严格数字比较）
fn is_type(site: &Value, n: f64) -> bool {
    field(site, "type").and_then(Value::as_f64) == Some(n)
}

async fn fetch_text(url: &str) -> Result<String> {
    Ok(http::get_text(url, &ReqOpts::default()).await?.text)
}

async fn fetch_json(url: &str) -> Result<Value> {
    http::get_json(url, &ReqOpts::default()).await
}

/// 分类列表
pub async fn categories(site: &Value) -> Result<Vec<Value>> {
    if is_type(site, demo::DEMO_TYPE) {
        return Ok(demo::demo_categories());
    }
    let ac = json!("list");
    let url = set_params(field(site, "api"), &[("ac", Some(&ac))])?;
    if is_type(site, XML_TYPE) {
        return Ok(xml::parse_xml_categories(&fetch_text(&url).await?));
    }
    let json = fetch_json(&url).await?;
    let cls = match or(field(&json, "class"), field(&json, "categories")) {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    Ok(cls
        .iter()
        .map(|c| {
            let id = js::nullish(field(c, "type_id"), field(c, "id"));
            let name = js::nullish(field(c, "type_name"), field(c, "name"));
            json!({ "type_id": js_str(Some(id.unwrap_or(&json!("")))), "type_name": js::owned(name, "") })
        })
        .collect())
}

/// 演示源分类列表
fn demo_list(t: &str) -> Value {
    let items: Vec<Value> = demo::demo_items()
        .into_iter()
        .filter(|v| t.is_empty() || t == "all" || v["typeName"] == t)
        .collect();
    let list: Vec<Value> = items.iter().map(vod::normalize_vod).collect();
    json!({ "list": list, "page": 1, "pagecount": 1, "total": items.len() })
}

/// 分类分页列表；t 缺省 ''，pg 缺省 '1'
pub async fn list(site: &Value, t: Option<&Value>, pg: Option<&Value>) -> Result<Value> {
    let empty = json!("");
    let first = json!(DEFAULT_PAGE);
    let t = t.unwrap_or(&empty);
    let pg = pg.unwrap_or(&first);
    if is_type(site, demo::DEMO_TYPE) {
        let t_s = if js::truthy(Some(t)) { js_str(Some(t)) } else { String::new() };
        return Ok(demo_list(&t_s));
    }
    let ac = json!("videolist");
    let url = set_params(field(site, "api"), &[("ac", Some(&ac)), ("t", Some(t)), ("pg", Some(pg))])?;
    if is_type(site, XML_TYPE) {
        return Ok(xml::parse_xml_vod(&fetch_text(&url).await?));
    }
    let json = fetch_json(&url).await?;
    let one = json!(1);
    let pagecount = or(or(field(&json, "pagecount"), field(&json, "page_count")), Some(&one));
    let total = or(field(&json, "total"), field(&json, "recordcount"));
    Ok(json!({
        "list": vod::normalize_list(&json),
        "page": num_value(number_or(or(field(&json, "page"), Some(pg)), 1.0)),
        "pagecount": num_value(number_or(pagecount, 1.0)),
        "total": num_value(number_or(total, 0.0)),
    }))
}

/// 搜索
pub async fn search(site: &Value, wd: Option<&Value>) -> Result<Value> {
    if is_type(site, demo::DEMO_TYPE) {
        let kw = if js::truthy(wd) { js_str(wd).to_lowercase() } else { String::new() };
        let list: Vec<Value> = demo::demo_items()
            .iter()
            .filter(|v| kw.is_empty() || v["name"].as_str().unwrap_or("").to_lowercase().contains(&kw))
            .map(vod::normalize_vod)
            .collect();
        return Ok(json!({ "list": list }));
    }
    let videolist = json!("videolist");
    let url = set_params(field(site, "api"), &[("ac", Some(&videolist)), ("wd", wd)])?;
    if is_type(site, XML_TYPE) {
        return Ok(xml::parse_xml_vod(&fetch_text(&url).await?));
    }
    // 先用 videolist 搜索；无结果或失败时回退 ac=detail
    if let Ok(json) = fetch_json(&url).await {
        let norm = vod::normalize_list(&json);
        if !norm.is_empty() {
            return Ok(json!({ "list": norm }));
        }
    }
    let ac_detail = json!("detail");
    let url2 = set_params(field(site, "api"), &[("ac", Some(&ac_detail)), ("wd", wd)])?;
    Ok(json!({ "list": vod::normalize_list(&fetch_json(&url2).await?) }))
}

/// 详情（含播放地址）
pub async fn detail(site: &Value, ids: Option<&Value>) -> Result<Value> {
    if is_type(site, demo::DEMO_TYPE) {
        let want = js_str(ids);
        let list: Vec<Value> = demo::demo_items().into_iter().filter(|v| js_str(Some(&v["id"])) == want).take(1).collect();
        return Ok(json!({ "list": list }));
    }
    let ac = json!(if is_type(site, XML_TYPE) { "videolist" } else { "detail" });
    let url = set_params(field(site, "api"), &[("ac", Some(&ac)), ("ids", ids)])?;
    if is_type(site, XML_TYPE) {
        return Ok(xml::parse_xml_vod(&fetch_text(&url).await?));
    }
    Ok(json!({ "list": vod::normalize_list(&fetch_json(&url).await?) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn params_like_url_search_params() {
        let api = json!("http://a.com/api.php/provide/vod/?ac=x&wd=1&wd=2&b=a+b");
        let t = json!("");
        let wd = json!("流浪 地球");
        let u = set_params(Some(&api), &[("ac", Some(&json!("videolist"))), ("t", Some(&t)), ("wd", Some(&wd))]).unwrap();
        assert_eq!("http://a.com/api.php/provide/vod/?ac=videolist&wd=%E6%B5%81%E6%B5%AA+%E5%9C%B0%E7%90%83&b=a+b", u);
        assert!(set_params(None, &[]).unwrap_err().to_string().contains("无效的站点 API：undefined"));
    }

    #[test]
    fn ensure_http_cases() {
        assert_eq!("https://x.com/a", ensure_http("//x.com/a", None));
        assert_eq!("http://h/cfg/b.json", ensure_http("./b.json", Some("http://h/cfg/")));
        assert_eq!("http://x.com", ensure_http(" x.com", None));
    }
}
