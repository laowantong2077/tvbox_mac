//! 影片条目标准化与播放串解析（对应 cms.js 的 splitPlay / normalizeVod / normalizeList）
use super::js::{field, js_str, truthy};
use serde_json::{json, Map, Value};

/// 线路分隔、剧集分隔、名称与地址分隔
const GROUP_SEP: &str = "$$$";
const EPISODE_SEP: char = '#';
const NAME_SEP: char = '$';

/// 依次取第一个非 null/undefined 字段（JS `a ?? b ?? default`）
fn coalesce(v: &Value, keys: &[&str], default: &str) -> Value {
    keys.iter()
        .filter_map(|k| field(v, k))
        .find(|x| !x.is_null())
        .cloned()
        .unwrap_or_else(|| Value::String(default.into()))
}

/// 依次取第一个真值字段（JS `a || b || default`）
fn first_truthy(v: &Value, keys: &[&str], default: &str) -> Value {
    keys.iter()
        .filter_map(|k| field(v, k))
        .find(|x| truthy(Some(x)))
        .cloned()
        .unwrap_or_else(|| Value::String(default.into()))
}

/// 解析一条线路内的剧集：`名称$地址#名称$地址`
fn split_episodes(group: &str) -> Vec<Value> {
    let mut episodes: Vec<Value> = Vec::new();
    for seg in group.split(EPISODE_SEP).filter(|s| !s.is_empty()) {
        let (name, url) = match seg.find(NAME_SEP) {
            None => (format!("第{}集", episodes.len() + 1), seg),
            Some(idx) => (seg[..idx].to_string(), &seg[idx + NAME_SEP.len_utf8()..]),
        };
        if url.is_empty() {
            continue;
        }
        let name = if name.is_empty() { "播放".to_string() } else { name };
        episodes.push(json!({ "name": name, "url": super::js::js_trim(url) }));
    }
    episodes
}

/// 播放串解析：线路名 `$$$` 分隔，对应地址串同样 `$$$` 分隔
pub fn split_play(play_from: &str, play_url: &str) -> Vec<Value> {
    let froms: Vec<&str> = play_from.split(GROUP_SEP).collect();
    let mut groups = Vec::new();
    for (i, g) in play_url.split(GROUP_SEP).enumerate() {
        let episodes = split_episodes(g);
        if episodes.is_empty() {
            continue;
        }
        let from = match froms.get(i) {
            Some(f) if !f.is_empty() => f.to_string(),
            _ => format!("线路{}", i + 1),
        };
        groups.push(json!({ "from": from, "episodes": episodes }));
    }
    groups
}

/// 标准化单个影片条目（字段与 Node 版 normalizeVod 一致）
pub fn normalize_vod(v: &Value) -> Value {
    let from = js_str(Some(&coalesce(v, &["vod_play_from", "play_from"], "")));
    let purl = js_str(Some(&coalesce(v, &["vod_play_url", "play_url"], "")));
    let mut m = Map::new();
    m.insert("id".into(), Value::String(js_str(Some(&coalesce(v, &["vod_id", "id"], "")))));
    m.insert("name".into(), coalesce(v, &["vod_name", "name"], ""));
    m.insert("pic".into(), first_truthy(v, &["vod_pic", "vod_pic_thumb", "vod_pic_slide", "pic"], ""));
    m.insert("remarks".into(), coalesce(v, &["vod_remarks", "remarks"], ""));
    m.insert("year".into(), coalesce(v, &["vod_year", "year"], ""));
    m.insert("area".into(), coalesce(v, &["vod_area", "area"], ""));
    m.insert("typeName".into(), coalesce(v, &["type_name", "typeName"], ""));
    m.insert("score".into(), first_truthy(v, &["vod_douban_score", "vod_score", "score"], ""));
    m.insert("actor".into(), coalesce(v, &["vod_actor", "actor"], ""));
    m.insert("director".into(), coalesce(v, &["vod_director", "director"], ""));
    m.insert("content".into(), coalesce(v, &["vod_content", "vod_blurb", "content"], ""));
    m.insert("groups".into(), Value::Array(split_play(&from, &purl)));
    Value::Object(m)
}

/// 标准化列表：取 json.list || json.data，非数组视为空
pub fn normalize_list(json: &Value) -> Vec<Value> {
    let list = super::js::or(field(json, "list"), field(json, "data"));
    match list {
        Some(Value::Array(a)) => a.iter().map(normalize_vod).collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn play_string() {
        let g = split_play("线路A$$$$$$线路C", "第1集$u1#第2集$u2$$$x$$$noname#$#名$ u3 ");
        assert_eq!(3, g.len());
        assert_eq!("线路A", g[0]["from"]);
        assert_eq!("u2", g[0]["episodes"][1]["url"]);
        assert_eq!("线路2", g[1]["from"]);
        assert_eq!("第1集", g[1]["episodes"][0]["name"]);
        assert_eq!("线路C", g[2]["from"]);
        assert_eq!("noname", g[2]["episodes"][0]["url"]);
        assert_eq!("u3", g[2]["episodes"][1]["url"]);
        assert_eq!(2, g[2]["episodes"].as_array().unwrap().len());
    }

    #[test]
    fn empty_name_becomes_play() {
        let g = split_play("", "$u1");
        assert_eq!("播放", g[0]["episodes"][0]["name"]);
        assert_eq!("线路1", g[0]["from"]);
    }

    #[test]
    fn normalize_fields() {
        let v = json!({ "vod_id": 12, "vod_name": "片", "vod_pic": "", "vod_pic_thumb": "p",
            "vod_score": "7.1", "vod_blurb": "简介", "vod_play_from": "a", "vod_play_url": "1$x" });
        let n = normalize_vod(&v);
        assert_eq!("12", n["id"]);
        assert_eq!("p", n["pic"]);
        assert_eq!("7.1", n["score"]);
        assert_eq!("简介", n["content"]);
        assert_eq!("", n["actor"]);
        assert_eq!("x", n["groups"][0]["episodes"][0]["url"]);
        // 与 JS 一致：空数组为真值，不会回退到 data
        assert_eq!(0, normalize_list(&json!({ "list": [], "data": [v.clone()] })).len());
        assert_eq!(1, normalize_list(&json!({ "list": null, "data": [v] })).len());
    }
}
