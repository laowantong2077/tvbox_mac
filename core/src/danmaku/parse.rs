//! 弹幕格式解析（对应 server/lib/danmaku/parse.js）
//! 统一输出 { time, mode:'scroll'|'top'|'bottom', color:'#rrggbb', text, size? }
use crate::douban::js::{js_number, ser_num, ser_opt_num};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

const MODE_BOTTOM: f64 = 4.0;
const MODE_TOP: f64 = 5.0;
const SIZE_NORMAL: f64 = 25.0;
const DEFAULT_COLOR: &str = "#ffffff";
/// 颜色取低 24 位
const COLOR_MASK: i64 = 0xff_ffff;
/// JS 位运算先转 32 位整数
const INT32_RANGE: i64 = 1 << 32;
/// String.fromCharCode 取 16 位
const CHAR_CODE_RANGE: u64 = 1 << 16;

static D_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<d\s+p="([^"]+)"[^>]*>([\s\S]*?)</d>"#).expect("danmaku regex"));
static ENTITY_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"&#(\d+);").expect("entity regex"));

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Comment {
    #[serde(serialize_with = "ser_num")]
    pub time: f64,
    pub mode: &'static str,
    pub color: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none", serialize_with = "ser_opt_num")]
    pub size: Option<f64>,
}

pub fn mode_of(n: f64) -> &'static str {
    if n == MODE_BOTTOM {
        "bottom"
    } else if n == MODE_TOP {
        "top"
    } else {
        "scroll"
    }
}

/// 十进制颜色值 → #rrggbb（非法或负数为白色）
pub fn color_of(s: Option<&str>) -> String {
    let v = js_number(s);
    if !v.is_finite() || v < 0.0 {
        return DEFAULT_COLOR.into();
    }
    let n = (v.trunc() as i64).rem_euclid(INT32_RANGE) & COLOR_MASK;
    format!("#{n:06x}")
}

/// &#NNN; → 字符（按 JS fromCharCode 取 16 位，代理项用替换字符）
fn char_from_code(d: &str) -> String {
    let code = d.parse::<u64>().map(|n| n % CHAR_CODE_RANGE).unwrap_or(0);
    char::from_u32(code as u32).unwrap_or('\u{fffd}').to_string()
}

pub fn unescape_xml(s: &str) -> String {
    let s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'");
    let s = ENTITY_RE.replace_all(&s, |c: &regex::Captures| char_from_code(&c[1]));
    s.replace("&amp;", "&")
}

/// JS `Number(x) || def`
fn num_or(s: Option<&str>, def: f64) -> f64 {
    let n = js_number(s);
    if n.is_nan() || n == 0.0 {
        def
    } else {
        n
    }
}

/// 解析 B 站 XML：<d p="time,mode,size,color,...">text</d>，按时间排序
pub fn parse_bili_xml(xml: &str) -> Vec<Comment> {
    let mut out: Vec<Comment> = D_RE
        .captures_iter(xml)
        .filter_map(|m| {
            let p: Vec<&str> = m[1].split(',').collect();
            let text = unescape_xml(&m[2]).trim().to_string();
            if text.is_empty() {
                return None;
            }
            let size = num_or(p.get(2).copied(), SIZE_NORMAL);
            Some(Comment {
                time: num_or(p.first().copied(), 0.0),
                mode: mode_of(js_number(p.get(1).copied())),
                color: color_of(p.get(3).copied()),
                text,
                size: if size == SIZE_NORMAL { None } else { Some(size) },
            })
        })
        .collect();
    out.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0"?><i><chatserver>x</chatserver>
<d p="12.5,1,25,16777215,0,0,0,0">第二条</d>
<d p="3.2,5,18,255">顶部 &lt;b&gt; &amp;amp; &#65;</d>
<d p="7,4,25,-1">  </d>
<d p="1,4,36,16711680">底部</d></i>"#;

    #[test]
    fn parses_and_sorts() {
        let list = parse_bili_xml(XML);
        assert_eq!(3, list.len());
        assert_eq!(Comment { time: 1.0, mode: "bottom", color: "#ff0000".into(), text: "底部".into(), size: Some(36.0) }, list[0]);
        assert_eq!("top", list[1].mode);
        assert_eq!("#0000ff", list[1].color);
        assert_eq!("顶部 <b> &amp; A", list[1].text);
        assert_eq!(Some(18.0), list[1].size);
        assert_eq!(None, list[2].size);
        assert_eq!("scroll", list[2].mode);
    }

    #[test]
    fn colors() {
        assert_eq!("#ffffff", color_of(Some("-1")));
        assert_eq!("#ffffff", color_of(Some("abc")));
        assert_eq!("#ffffff", color_of(None));
        assert_eq!("#00ff00", color_of(Some("65280")));
        assert_eq!("#000000", color_of(Some("")));
    }

    #[test]
    fn json_shape() {
        let c = Comment { time: 3.0, mode: "scroll", color: "#ffffff".into(), text: "a".into(), size: None };
        assert_eq!(r##"{"time":3,"mode":"scroll","color":"#ffffff","text":"a"}"##, serde_json::to_string(&c).unwrap());
    }
}
