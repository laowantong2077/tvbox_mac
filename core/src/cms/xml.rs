//! 极简 XML 解析（type 0 苹果 CMS XML 接口，对应 cms.js 的 parseXmlVod / parseXmlCategories）
use super::js::js_trim;
use super::vod::normalize_vod;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Map, Value};

static LIST_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<list\b[^>]*>([\s\S]*?)</list>").unwrap());
static VIDEO_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<video>([\s\S]*?)</video>").unwrap());
static CDATA_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<!\[CDATA\[([\s\S]*?)\]\]>").unwrap());
static DD_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)<dd\b[^>]*flag="([^"]*)"[^>]*>([\s\S]*?)</dd>"#).unwrap());
static CLASS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<class\b[^>]*>([\s\S]*?)</class>").unwrap());
static ID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<id>([\s\S]*?)</id>").unwrap());
static CLASS_NAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)<name>([\s\S]*?)</name>|<ty>([\s\S]*?)</ty>|<tid>([\s\S]*?)</tid>").unwrap()
});

/// 去掉 CDATA 包裹并 trim
fn strip_cdata(s: &str) -> String {
    js_trim(&CDATA_RE.replace_all(s, "$1")).to_string()
}

/// <list page="" pagecount="" recordcount=""> 属性（在整段 list 匹配文本中查找，同 JS）
fn list_attr(list_text: &str, name: &str) -> String {
    let re = Regex::new(&format!(r#"(?i){}\s*=\s*"([^"]*)""#, regex::escape(name)));
    re.ok()
        .and_then(|r| r.captures(list_text).map(|c| c[1].to_string()))
        .unwrap_or_default()
}

/// 取 <tag>…</tag> 内容
fn tag_field(block: &str, tag: &str) -> String {
    let re = Regex::new(&format!(r"(?i)<{tag}>([\s\S]*?)</{tag}>", tag = regex::escape(tag)));
    re.ok()
        .and_then(|r| r.captures(block).map(|c| strip_cdata(&c[1])))
        .unwrap_or_default()
}

/// 多个候选标签取第一个非空（JS `a || b`）
fn tag_either(block: &str, a: &str, b: &str) -> String {
    let v = tag_field(block, a);
    if v.is_empty() {
        tag_field(block, b)
    } else {
        v
    }
}

/// 解析一个 <video> 块为标准化条目
fn parse_video(block: &str) -> Value {
    let dds: Vec<(String, String)> =
        DD_RE.captures_iter(block).map(|c| (c[1].to_string(), strip_cdata(&c[2]))).collect();
    let flags: Vec<&str> = dds.iter().map(|d| d.0.as_str()).collect();
    let urls: Vec<&str> = dds.iter().map(|d| d.1.as_str()).collect();
    let mut raw = Map::new();
    let mut put = |k: &str, v: String| {
        raw.insert(k.to_string(), Value::String(v));
    };
    put("vod_id", tag_field(block, "id"));
    put("vod_name", tag_field(block, "name"));
    put("vod_pic", tag_field(block, "pic"));
    put("vod_remarks", tag_either(block, "remarks", "state"));
    put("vod_year", tag_field(block, "year"));
    put("vod_area", tag_field(block, "area"));
    put("type_name", tag_either(block, "type", "tid"));
    put("vod_actor", tag_field(block, "actor"));
    put("vod_director", tag_field(block, "director"));
    put("vod_content", tag_either(block, "des", "content"));
    put("vod_play_from", flags.join("$$$"));
    put("vod_play_url", urls.join("$$$"));
    normalize_vod(&Value::Object(raw))
}

/// 解析视频列表 XML：{ list, page, pagecount, total }（分页字段为字符串，同 JS）
pub fn parse_xml_vod(xml: &str) -> Value {
    let list_match = LIST_RE.captures(xml);
    let (list_text, inner) = match &list_match {
        Some(c) => (c.get(0).map_or("", |m| m.as_str()), c.get(1).map_or("", |m| m.as_str())),
        None => ("", xml),
    };
    let or_default = |v: String, d: &str| if v.is_empty() { d.to_string() } else { v };
    let records: Vec<Value> = VIDEO_RE.captures_iter(inner).map(|c| parse_video(&c[1])).collect();
    json!({
        "list": records,
        "page": or_default(list_attr(list_text, "page"), "1"),
        "pagecount": or_default(list_attr(list_text, "pagecount"), "1"),
        "total": list_attr(list_text, "recordcount"),
    })
}

/// 解析分类 XML：[{ type_id, type_name }]
pub fn parse_xml_categories(xml: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for c in CLASS_RE.captures_iter(xml) {
        let body = &c[1];
        let Some(name_m) = CLASS_NAME_RE.captures(body) else { continue };
        let name = (1..=3).find_map(|i| name_m.get(i).map(|m| m.as_str())).unwrap_or("");
        let id = ID_RE.captures(body).map(|m| js_trim(&m[1]).to_string()).unwrap_or_default();
        out.push(json!({ "type_id": id, "type_name": js_trim(name) }));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0"?><rss><list page="2" pagecount="9" recordcount="170">
<video><id>7</id><name><![CDATA[流浪地球]]></name><pic>http://p/1.jpg</pic><state>HD</state>
<type>科幻</type><des><![CDATA[ 简介 ]]></des><dl><dd flag="m3u8"><![CDATA[正片$http://a/1.m3u8]]></dd>
<dd flag="yun">第1集$http://b#第2集$http://c</dd></dl></video></list>
<class><ty id="1">电影</ty></class></rss>"#;

    #[test]
    fn video_list() {
        let v = parse_xml_vod(XML);
        assert_eq!("2", v["page"]);
        assert_eq!("9", v["pagecount"]);
        assert_eq!("170", v["total"]);
        let it = &v["list"][0];
        assert_eq!("7", it["id"]);
        assert_eq!("流浪地球", it["name"]);
        assert_eq!("HD", it["remarks"]);
        assert_eq!("科幻", it["typeName"]);
        assert_eq!("简介", it["content"]);
        assert_eq!("m3u8", it["groups"][0]["from"]);
        assert_eq!("http://c", it["groups"][1]["episodes"][1]["url"]);
    }

    #[test]
    fn no_list_defaults() {
        let v = parse_xml_vod("<video><id>1</id></video>");
        assert_eq!("1", v["page"]);
        assert_eq!("", v["total"]);
        assert_eq!(1, v["list"].as_array().unwrap().len());
    }

    #[test]
    fn categories() {
        let c = parse_xml_categories("<class><id> 3 </id><name>剧集</name></class><class><x/></class>");
        assert_eq!(1, c.len());
        assert_eq!("3", c[0]["type_id"]);
        assert_eq!("剧集", c[0]["type_name"]);
    }
}
