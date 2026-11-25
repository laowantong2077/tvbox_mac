//! B 站接口数据 → 前端结构的映射（搜索结果、剧集 / 分 P）
use crate::douban::js::{field, js_string, str_or_empty, truthy};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;

const SOURCE: &str = "bilibili";

static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").expect("tag regex"));
static SCHEME_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^https?:").expect("scheme regex"));

/// 搜索结果条目
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub source: &'static str,
    pub id: String,
    pub title: String,
    pub kind: String,
    pub ep_count: Value,
    pub cover: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<Value>,
}

/// 剧集 / 分 P
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Episode {
    pub id: String,
    pub title: String,
}

/// 去掉搜索高亮标签并还原 &amp; / &quot;
pub fn strip_tags(s: &str) -> String {
    TAG_RE.replace_all(s, "").replace("&amp;", "&").replace("&quot;", "\"")
}

/// 封面统一为 https:
fn https_cover(v: &Value) -> String {
    if !truthy(v) {
        return String::new();
    }
    format!("https:{}", SCHEME_RE.replace(&js_string(v), ""))
}

fn title_of(x: &Value) -> String {
    strip_tags(&str_or_empty(field(x, "title")))
}

/// 番剧 / 影视结果
pub fn map_media(x: &Value) -> SearchHit {
    let kind = field(x, "season_type_name");
    let ep_size = field(x, "ep_size");
    let ep_count = if truthy(ep_size) {
        ep_size.clone()
    } else {
        Value::from(field(x, "eps").as_array().map(Vec::len).unwrap_or(0))
    };
    SearchHit {
        source: SOURCE,
        id: format!("ss{}", js_string(field(x, "season_id"))),
        title: title_of(x),
        kind: if truthy(kind) { js_string(kind) } else { "影视".into() },
        ep_count,
        cover: https_cover(field(x, "cover")),
        author: None,
    }
}

/// 普通视频结果
pub fn map_video(x: &Value) -> SearchHit {
    let author = field(x, "author");
    SearchHit {
        source: SOURCE,
        id: str_or_empty(field(x, "bvid")),
        title: title_of(x),
        kind: "视频".into(),
        ep_count: Value::from(0),
        cover: https_cover(field(x, "pic")),
        author: if author.is_null() { None } else { Some(author.clone()) },
    }
}

/// 番剧剧集：标题 = title + long_title，均为空时用「第 N 集」
pub fn map_episode(e: &Value, index: usize) -> Episode {
    let parts: Vec<String> =
        [field(e, "title"), field(e, "long_title")].into_iter().filter(|v| truthy(v)).map(js_string).collect();
    let title = parts.join(" ");
    Episode {
        id: js_string(field(e, "cid")),
        title: if title.is_empty() { format!("第{}集", index + 1) } else { title },
    }
}

/// 普通视频分 P：标题 = part，为空时用 P<page>
pub fn map_page(p: &Value) -> Episode {
    let part = field(p, "part");
    Episode {
        id: js_string(field(p, "cid")),
        title: if truthy(part) { js_string(part) } else { format!("P{}", js_string(field(p, "page"))) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn media_and_video() {
        let m = map_media(&json!({"season_id":42,"title":"<em class=\"keyword\">流浪</em>地球","ep_size":0,
            "eps":[{},{}],"cover":"http://i0.hdslb.com/a.jpg"}));
        assert_eq!("ss42", m.id);
        assert_eq!("流浪地球", m.title);
        assert_eq!("影视", m.kind);
        assert_eq!(json!(2), m.ep_count);
        assert_eq!("https://i0.hdslb.com/a.jpg", m.cover);
        let v = map_video(&json!({"bvid":"BV1","title":"a&amp;b","pic":"//i1.hdslb.com/b.jpg","author":"up"}));
        assert_eq!("a&b", v.title);
        assert_eq!("https://i1.hdslb.com/b.jpg", v.cover);
        assert_eq!(Some(json!("up")), v.author);
    }

    #[test]
    fn episodes() {
        assert_eq!("1 开端", map_episode(&json!({"cid":7,"title":"1","long_title":"开端"}), 0).title);
        assert_eq!("第3集", map_episode(&json!({"cid":7}), 2).title);
        assert_eq!("7", map_episode(&json!({"cid":7}), 0).id);
        assert_eq!("P2", map_page(&json!({"cid":8,"page":2,"part":""})).title);
    }
}
