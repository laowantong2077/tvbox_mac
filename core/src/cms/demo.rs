//! 内置演示源（type 100，公共测试流），条目与 groups 完全照搬 cms.js
use super::js::encode_uri_component;
use serde_json::{json, Map, Value};

/// 演示源站点类型
pub const DEMO_TYPE: f64 = 100.0;
/// 海报标题首行纵坐标、行距
const TITLE_Y: u32 = 700;
const TITLE_LINE_DY: u32 = 78;

struct Poster {
    bg1: &'static str,
    bg2: &'static str,
    lines: &'static [&'static str],
    sub: &'static str,
}

struct DemoItem {
    id: &'static str,
    name: &'static str,
    poster: Poster,
    remarks: &'static str,
    year: &'static str,
    area: &'static str,
    type_name: &'static str,
    score: &'static str,
    content: &'static str,
    /// (线路名, [(集名, 地址)])
    groups: &'static [(&'static str, &'static [(&'static str, &'static str)])],
}

const DEMO_ITEMS: &[DemoItem] = &[
    DemoItem {
        id: "demo-bbb",
        name: "Big Buck Bunny（大雄兔）",
        poster: Poster { bg1: "#ffce9e", bg2: "#d95f85", lines: &["Big Buck Bunny", "大雄兔"], sub: "Blender 开源动画 · 2008" },
        remarks: "4K 演示",
        year: "2008",
        area: "美国",
        type_name: "动画短片",
        score: "9.0",
        content: "Blender 基金会出品的开源动画短片，用于演示 HLS(m3u8) 播放能力。本片为公共测试流。",
        groups: &[
            ("HLS-720P", &[("正片", "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8")]),
            ("MP4", &[("正片", "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")]),
        ],
    },
    DemoItem {
        id: "demo-sintel",
        name: "Sintel（辛特尔）",
        poster: Poster { bg1: "#8fb6ff", bg2: "#3a3f8f", lines: &["Sintel", "辛特尔"], sub: "Blender 开源动画 · 2010" },
        remarks: "开源动画",
        year: "2010",
        area: "荷兰",
        type_name: "动画短片",
        score: "8.6",
        content: "Blender 基金会第三部开源影片，用于演示多码率自适应 HLS 播放。",
        groups: &[("HLS", &[("正片", "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8")])],
    },
    DemoItem {
        id: "demo-apple",
        name: "Apple BipBop 示例",
        poster: Poster { bg1: "#a7e2ff", bg2: "#2a6fd0", lines: &["Apple", "BipBop 示例"], sub: "HLS · fMP4 · 2016" },
        remarks: "fMP4",
        year: "2016",
        area: "美国",
        type_name: "技术演示",
        score: "—",
        content: "Apple 官方 HLS 示例流（fMP4 封装），用于校验播放内核。",
        groups: &[(
            "fMP4",
            &[("正片", "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8")],
        )],
    },
    DemoItem {
        id: "demo-tos",
        name: "Tears of Steel（钢铁之泪）",
        poster: Poster { bg1: "#6fe7d3", bg2: "#134e57", lines: &["Tears of Steel", "钢铁之泪"], sub: "Blender 科幻短片 · 2012" },
        remarks: "科幻短片",
        year: "2012",
        area: "荷兰",
        type_name: "科幻短片",
        score: "8.2",
        content: "Blender 基金会真人科幻短片，公共 HLS 测试流。",
        groups: &[("HLS", &[("正片", "https://test-streams.mux.dev/tos_ismc/main.m3u8")])],
    },
];

/// SVG 文本转义（& < >）
fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// 用内联 SVG 生成海报 data URI（与 JS 版逐字符一致）
fn poster_data_uri(o: &Poster) -> String {
    let tspans: String = o
        .lines
        .iter()
        .enumerate()
        .map(|(i, ln)| {
            let dy = if i == 0 { 0 } else { TITLE_LINE_DY };
            format!(r#"<tspan x="56" dy="{dy}">{}</tspan>"#, esc(ln))
        })
        .collect();
    let font = "PingFang SC,Helvetica Neue,Arial,sans-serif";
    let svg = format!(
        concat!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="640" height="960" viewBox="0 0 640 960">"#,
            r#"<defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">"#,
            r#"<stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient>"#,
            r#"<radialGradient id="r" cx="0.72" cy="0.16" r="0.85">"#,
            r##"<stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/>"##,
            r##"<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>"##,
            r#"<rect width="640" height="960" fill="url(#g)"/><rect width="640" height="960" fill="url(#r)"/>"#,
            r##"<circle cx="540" cy="170" r="250" fill="#ffffff" opacity="0.07"/>"##,
            r##"<circle cx="80" cy="800" r="220" fill="#000000" opacity="0.14"/>"##,
            r#"<path d="M0 330 L640 150 M0 430 L640 250 M0 530 L640 350 M0 630 L640 450" "#,
            r##"stroke="#ffffff" stroke-width="2" opacity="0.06"/>"##,
            r#"<text x="56" y="{ty}" font-family="{font}" "#,
            r##"font-size="62" font-weight="800" fill="#ffffff">{tspans}</text>"##,
            r#"<text x="58" y="905" font-family="{font}" "#,
            r##"font-size="28" fill="#ffffff" opacity="0.82">{sub}</text></svg>"##,
        ),
        bg1 = o.bg1,
        bg2 = o.bg2,
        ty = TITLE_Y,
        font = font,
        tspans = tspans,
        sub = esc(o.sub),
    );
    format!("data:image/svg+xml;utf8,{}", encode_uri_component(&svg))
}

/// 演示站点描述（/api/bootstrap 的 demoSite）
pub fn demo_site() -> Value {
    json!({
        "key": "__demo__",
        "name": "⭐ 内置演示源（公共测试流）",
        "type": 100,
        "api": "demo://public",
        "searchable": 1,
        "supported": true,
        "group": "推荐",
    })
}

fn groups_value(groups: &[(&str, &[(&str, &str)])]) -> Value {
    let arr: Vec<Value> = groups
        .iter()
        .map(|(from, eps)| {
            let eps: Vec<Value> = eps.iter().map(|(n, u)| json!({ "name": n, "url": u })).collect();
            json!({ "from": from, "episodes": eps })
        })
        .collect();
    Value::Array(arr)
}

/// 演示条目原始对象（字段顺序同 JS：id,name,pic,remarks,year,area,typeName,score,content,groups）
fn item_value(it: &DemoItem) -> Value {
    let mut m = Map::new();
    m.insert("id".into(), it.id.into());
    m.insert("name".into(), it.name.into());
    m.insert("pic".into(), poster_data_uri(&it.poster).into());
    m.insert("remarks".into(), it.remarks.into());
    m.insert("year".into(), it.year.into());
    m.insert("area".into(), it.area.into());
    m.insert("typeName".into(), it.type_name.into());
    m.insert("score".into(), it.score.into());
    m.insert("content".into(), it.content.into());
    m.insert("groups".into(), groups_value(it.groups));
    Value::Object(m)
}

/// 全部演示条目（原始对象）
pub fn demo_items() -> Vec<Value> {
    DEMO_ITEMS.iter().map(item_value).collect()
}

/// 演示分类
pub fn demo_categories() -> Vec<Value> {
    vec![
        json!({ "type_id": "all", "type_name": "全部演示" }),
        json!({ "type_id": "动画短片", "type_name": "动画短片" }),
        json!({ "type_id": "技术演示", "type_name": "技术演示" }),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poster_is_encoded_svg() {
        let p = poster_data_uri(&DEMO_ITEMS[0].poster);
        assert!(p.starts_with("data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org"));
        assert_eq!(4, demo_items().len());
    }
}
