//! 豆瓣条目 / 详情规范化（兼容 rexxar 与 search_subjects 两种格式）
use super::js::{field, js_string, ser_num, str_or_empty, to_number, truthy};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;

/// 详情中保留的别名 / 导演 / 演员数量
const AKA_MAX: usize = 4;
const DIRECTORS_MAX: usize = 4;
const ACTORS_MAX: usize = 10;

static POSTER_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"/(s|m)_ratio_poster/").expect("poster regex"));
static YEAR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9]{4}$").expect("year regex"));

/// 列表条目
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub title: String,
    #[serde(serialize_with = "ser_num")]
    pub rating: f64,
    pub cover: String,
    pub subtitle: String,
    pub year: String,
    pub region: String,
    pub genres: Vec<String>,
    pub episodes: String,
    pub is_new: bool,
    pub kind: String,
}

/// 条目详情
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subject {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub original_title: String,
    pub aka: Vec<Value>,
    #[serde(serialize_with = "ser_num")]
    pub rating: f64,
    #[serde(serialize_with = "ser_num")]
    pub rating_count: f64,
    pub cover: String,
    pub year: String,
    pub genres: Vec<Value>,
    pub countries: Vec<Value>,
    pub directors: Vec<Value>,
    pub actors: Vec<Value>,
    pub intro: String,
    pub episodes: String,
    pub durations: Vec<Value>,
    pub pubdate: Vec<Value>,
    pub subtitle: String,
    pub is_show: bool,
}

/// 把 s_/m_ratio_poster 换成更清晰的 l_ratio_poster
pub fn hd_cover(url: &str) -> String {
    POSTER_RE.replacen(url, 1, "/l_ratio_poster/").into_owned()
}

/// 副标题解析结果
#[derive(Debug, Default, PartialEq)]
pub struct SubMeta {
    pub year: String,
    pub region: String,
    pub genres: Vec<String>,
}

/// 解析 "2026 / 中国大陆 / 剧情 古装 / 导演 / 演员"
pub fn parse_subtitle(sub: &str) -> SubMeta {
    let mut parts: Vec<&str> = sub.split(" / ").map(str::trim).collect();
    let mut out = SubMeta::default();
    if YEAR_RE.is_match(parts.first().copied().unwrap_or("")) {
        out.year = parts.remove(0).to_string();
    }
    let at = |i: usize| parts.get(i).copied().unwrap_or("");
    out.region = at(0).split(' ').next().unwrap_or("").to_string();
    out.genres = at(1).split(' ').filter(|s| !s.is_empty()).map(String::from).collect();
    out
}

/// 取封面：pic.large/normal → cover.url → cover 字符串
pub fn pick_cover(it: &Value) -> String {
    let pic = field(it, "pic");
    if truthy(pic) {
        let large = field(pic, "large");
        let v = if truthy(large) { large } else { field(pic, "normal") };
        return str_or_empty(v);
    }
    let cover = field(it, "cover");
    if cover.is_object() || cover.is_array() {
        return str_or_empty(field(cover, "url"));
    }
    str_or_empty(cover)
}

/// JS `a || b`
fn or<'a>(a: &'a Value, b: &'a Value) -> &'a Value {
    if truthy(a) {
        a
    } else {
        b
    }
}

/// 规范化单个列表条目
pub fn normalize_item(it: &Value, fallback_kind: &str) -> Item {
    let subtitle = str_or_empty(or(field(it, "card_subtitle"), field(it, "info")));
    let meta = parse_subtitle(&subtitle);
    let rating_v = field(it, "rating");
    let rating = if rating_v.is_object() || rating_v.is_array() { field(rating_v, "value") } else { field(it, "rate") };
    let kind = match field(it, "type").as_str() {
        Some(t @ ("tv" | "movie")) => t.to_string(),
        _ if fallback_kind == "movie" => "movie".into(),
        _ => "tv".into(),
    };
    let year = str_or_empty(field(it, "year"));
    Item {
        id: str_or_empty(field(it, "id")),
        title: str_or_empty(field(it, "title")),
        rating: to_number(rating),
        cover: hd_cover(&pick_cover(it)),
        year: if year.is_empty() { meta.year } else { year },
        region: meta.region,
        genres: meta.genres,
        episodes: str_or_empty(field(it, "episodes_info")),
        is_new: truthy(field(it, "is_new")),
        kind,
        subtitle,
    }
}

/// 取数组（非数组视为空），并截取前 n 个
fn take_arr(v: &Value, n: usize) -> Vec<Value> {
    v.as_array().map(|a| a.iter().take(n).cloned().collect()).unwrap_or_default()
}

/// 人名列表：前 n 个的 name，过滤空值
fn names(list: &Value, n: usize) -> Vec<Value> {
    take_arr(list, n).iter().map(|p| field(p, "name").clone()).filter(truthy).collect()
}

/// 集数：episodes_info 或 episodes_count + "集"
fn episodes_of(d: &Value) -> String {
    let info = field(d, "episodes_info");
    if truthy(info) {
        return js_string(info);
    }
    let count = field(d, "episodes_count");
    if truthy(count) {
        format!("{}集", js_string(count))
    } else {
        String::new()
    }
}

/// 规范化条目详情
pub fn normalize_subject(d: &Value, kind: &str) -> Subject {
    let rating = field(d, "rating");
    let all = usize::MAX;
    Subject {
        id: js_string(field(d, "id")),
        kind: match field(d, "type").as_str() {
            Some(t @ ("movie" | "tv")) => t.to_string(),
            _ => kind.to_string(),
        },
        title: str_or_empty(field(d, "title")),
        original_title: str_or_empty(field(d, "original_title")),
        aka: take_arr(field(d, "aka"), AKA_MAX),
        rating: to_number(field(rating, "value")),
        rating_count: to_number(field(rating, "count")),
        cover: hd_cover(&pick_cover(d)),
        year: str_or_empty(field(d, "year")),
        genres: take_arr(field(d, "genres"), all),
        countries: take_arr(field(d, "countries"), all),
        directors: names(field(d, "directors"), DIRECTORS_MAX),
        actors: names(field(d, "actors"), ACTORS_MAX),
        intro: str_or_empty(field(d, "intro")).trim().to_string(),
        episodes: episodes_of(d),
        durations: take_arr(field(d, "durations"), all),
        pubdate: take_arr(field(d, "pubdate"), all),
        subtitle: str_or_empty(field(d, "card_subtitle")),
        is_show: truthy(field(d, "is_show")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn subtitle_parsing() {
        let m = parse_subtitle("2026 / 中国大陆 美国 / 剧情 古装 / 导演 / 演员");
        assert_eq!("2026", m.year);
        assert_eq!("中国大陆", m.region);
        assert_eq!(vec!["剧情", "古装"], m.genres);
        let m = parse_subtitle("");
        assert_eq!(SubMeta::default(), m);
    }

    #[test]
    fn cover_hd() {
        let u = "https://img1.doubanio.com/view/photo/m_ratio_poster/public/p1.jpg";
        assert_eq!("https://img1.doubanio.com/view/photo/l_ratio_poster/public/p1.jpg", hd_cover(u));
    }

    #[test]
    fn rexxar_item() {
        let it = json!({"id":"123","title":"T","rating":{"value":7.8},"pic":{"normal":"n.jpg"},
            "card_subtitle":"2025 / 韩国 / 爱情","type":"tv","episodes_info":"更新至3集","is_new":true});
        let n = normalize_item(&it, "movie");
        assert_eq!("tv", n.kind);
        assert_eq!(7.8, n.rating);
        assert_eq!("n.jpg", n.cover);
        assert_eq!("2025", n.year);
        assert_eq!("韩国", n.region);
        assert!(n.is_new);
    }

    #[test]
    fn search_subjects_item() {
        let it = json!({"id":456,"title":"M","rate":"8.1","cover":"https://x/s_ratio_poster/a.jpg","is_new":false});
        let n = normalize_item(&it, "movie");
        assert_eq!("456", n.id);
        assert_eq!(8.1, n.rating);
        assert_eq!("movie", n.kind);
        assert_eq!("https://x/l_ratio_poster/a.jpg", n.cover);
        assert_eq!("", n.year);
    }

    #[test]
    fn subject_detail() {
        let d = json!({"id":"9","type":"movie","title":"S","rating":{"value":9.1,"count":1000},
            "directors":[{"name":"A"},{"name":""}],"episodes_count":12,"intro":"  hi \n","aka":[1,2,3,4,5]});
        let s = normalize_subject(&d, "tv");
        assert_eq!("movie", s.kind);
        assert_eq!(1000.0, s.rating_count);
        assert_eq!(vec![json!("A")], s.directors);
        assert_eq!("12集", s.episodes);
        assert_eq!("hi", s.intro);
        assert_eq!(4, s.aka.len());
    }
}
