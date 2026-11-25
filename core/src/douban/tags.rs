//! 标签 / 排序定义与参数归一化
//! cat/type 用于 recent_hot（热度）；ss 映射到 search_subjects 的 tag（时间 / 评分排序）
use super::js::parse_int;
use serde::Serialize;

/// 列表默认条数与上限
const DEFAULT_LIMIT: i64 = 24;
const MAX_LIMIT: i64 = 50;

#[derive(Debug, PartialEq)]
pub struct Tag {
    pub key: &'static str,
    pub label: &'static str,
    pub cat: &'static str,
    pub kind_type: &'static str,
    /// search_subjects 的 tag；为空表示不支持时间/评分排序
    pub ss: Option<&'static str>,
}

const fn tag(
    key: &'static str,
    label: &'static str,
    cat: &'static str,
    kind_type: &'static str,
    ss: Option<&'static str>,
) -> Tag {
    Tag { key, label, cat, kind_type, ss }
}

const MOVIE_TAGS: &[Tag] = &[
    tag("hot", "热门", "热门", "全部", Some("热门")),
    tag("latest", "最新", "最新", "全部", Some("最新")),
    tag("top", "豆瓣高分", "豆瓣高分", "全部", Some("豆瓣高分")),
    tag("niche", "冷门佳片", "冷门佳片", "全部", Some("冷门佳片")),
    tag("cn", "华语", "热门", "华语", Some("华语")),
    tag("west", "欧美", "热门", "欧美", Some("欧美")),
    tag("kr", "韩国", "热门", "韩国", Some("韩国")),
    tag("jp", "日本", "热门", "日本", Some("日本")),
];

const TV_TAGS: &[Tag] = &[
    tag("all", "综合", "tv", "tv", Some("热门")),
    tag("cn", "国产剧", "tv", "tv_domestic", Some("国产剧")),
    tag("us", "欧美剧", "tv", "tv_american", Some("美剧")),
    tag("jp", "日剧", "tv", "tv_japanese", Some("日剧")),
    tag("kr", "韩剧", "tv", "tv_korean", Some("韩剧")),
    tag("anime", "动画", "tv", "tv_animation", Some("日本动画")),
    tag("doc", "纪录片", "tv", "tv_documentary", Some("纪录片")),
];

const SHOW_TAGS: &[Tag] = &[
    tag("all", "综合", "show", "show", Some("综艺")),
    tag("cn", "国内", "show", "show_domestic", None),
    tag("intl", "国外", "show", "show_foreign", None),
];

#[derive(Clone, Debug, Serialize)]
pub struct SortOpt {
    pub key: &'static str,
    pub label: &'static str,
}

pub const SORTS: &[SortOpt] = &[
    SortOpt { key: "hot", label: "近期热度" },
    SortOpt { key: "time", label: "最新上线" },
    SortOpt { key: "rank", label: "评分最高" },
];

#[derive(Debug, Serialize)]
pub struct TagOpt {
    pub key: &'static str,
    pub label: &'static str,
    pub sortable: bool,
}

#[derive(Debug, Serialize)]
pub struct TagsResult {
    pub kind: &'static str,
    pub tags: Vec<TagOpt>,
    pub sorts: Vec<SortOpt>,
}

/// kind 归一化：tv / show，其余均为 movie
pub fn norm_kind(kind: Option<&str>) -> &'static str {
    match kind {
        Some("tv") => "tv",
        Some("show") => "show",
        _ => "movie",
    }
}

fn tags_of(kind: &str) -> &'static [Tag] {
    match kind {
        "tv" => TV_TAGS,
        "show" => SHOW_TAGS,
        _ => MOVIE_TAGS,
    }
}

pub fn get_tags(kind: Option<&str>) -> TagsResult {
    let k = norm_kind(kind);
    let tags = tags_of(k).iter().map(|t| TagOpt { key: t.key, label: t.label, sortable: t.ss.is_some() }).collect();
    TagsResult { kind: k, tags, sorts: SORTS.to_vec() }
}

/// 按 key 或 label 查找标签，找不到取第一个
pub fn find_tag(kind: &str, tag_key: Option<&str>) -> &'static Tag {
    let list = tags_of(kind);
    tag_key.and_then(|k| list.iter().find(|t| t.key == k || t.label == k)).unwrap_or(&list[0])
}

/// 排序归一化：仅可排序标签支持 time/rank
pub fn norm_sort(sort: Option<&str>, tag: &Tag) -> &'static str {
    match SORTS.iter().find(|s| Some(s.key) == sort) {
        Some(s) if tag.ss.is_some() => s.key,
        _ => "hot",
    }
}

/// 起始偏移：parseInt 后不小于 0
pub fn norm_start(start: Option<&str>) -> i64 {
    parse_int(start).unwrap_or(0).max(0)
}

/// 每页条数：非法或 ≤0 取默认值，最多 MAX_LIMIT
pub fn clamp_limit(limit: Option<&str>) -> i64 {
    match parse_int(limit) {
        Some(n) if n > 0 => n.min(MAX_LIMIT),
        _ => DEFAULT_LIMIT,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_lookup() {
        assert_eq!("cn", find_tag("tv", Some("国产剧")).key);
        assert_eq!("hot", find_tag("movie", Some("nope")).key);
        assert_eq!("all", find_tag("show", None).key);
    }

    #[test]
    fn sort_and_paging() {
        assert_eq!("hot", norm_sort(Some("rank"), find_tag("show", Some("cn"))));
        assert_eq!("rank", norm_sort(Some("rank"), find_tag("tv", Some("cn"))));
        assert_eq!(24, clamp_limit(Some("0")));
        assert_eq!(50, clamp_limit(Some("999")));
        assert_eq!(0, norm_start(Some("-5")));
        assert_eq!("movie", norm_kind(Some("x")));
    }

    #[test]
    fn tags_sortable() {
        let t = get_tags(Some("show"));
        assert_eq!(vec![true, false, false], t.tags.iter().map(|t| t.sortable).collect::<Vec<_>>());
    }
}
