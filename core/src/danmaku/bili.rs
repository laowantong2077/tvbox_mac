//! B 站弹幕源（对应 server/lib/danmaku/bili.js）
//! - 搜索：/x/web-interface/search/type  search_type = media_bangumi（番剧）/ media_ft（影视）/ video（普通视频）
//! - 剧集：番剧/影视用 /pgc/view/web/season?season_id=，普通视频用 /x/web-interface/view?bvid=
//! - 弹幕：https://comment.bilibili.com/<cid>.xml（raw deflate），失败回退 /x/v1/dm/list.so?oid=
use super::fetch::{fetch_buffer, fetch_json, fetch_text};
use super::map::{map_episode, map_media, map_page, map_video, Episode, SearchHit};
use super::parse::{parse_bili_xml, Comment};
use crate::douban::js::{field, js_string, truthy};
use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::Value;
use std::time::{Duration, Instant};

const COOKIE_TTL: Duration = Duration::from_secs(6 * 3600);
const MAX_VIDEO_RESULTS: usize = 8;
const MAX_MEDIA_RESULTS: usize = 10;
const REFERER: &str = "https://www.bilibili.com/";
const HOME_URL: &str = "https://www.bilibili.com/";
const API: &str = "https://api.bilibili.com";

/// 匿名 Cookie 缓存：(值, 获取时间)
static COOKIE: Lazy<Mutex<(String, Option<Instant>)>> = Lazy::new(|| Mutex::new((String::new(), None)));

/// 获取匿名 buvid3 Cookie（搜索接口需要）
async fn get_cookie() -> String {
    {
        let c = COOKIE.lock();
        if !c.0.is_empty() && c.1.map(|at| at.elapsed() < COOKIE_TTL).unwrap_or(false) {
            return c.0.clone();
        }
    }
    let value = match fetch_buffer(HOME_URL, &[]).await {
        Ok(r) => r
            .headers
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .map(|s| s.split(';').next().unwrap_or("").to_string())
            .collect::<Vec<_>>()
            .join("; "),
        Err(_) => String::new(),
    };
    *COOKIE.lock() = (value.clone(), Some(Instant::now()));
    value
}

async fn headers() -> Vec<(&'static str, String)> {
    vec![("Cookie", get_cookie().await), ("Referer", REFERER.to_string())]
}

/// B 站接口 code 非 0 时报错（优先使用接口 message）
fn check_code(d: &Value, def: &str) -> Result<()> {
    let code = field(d, "code");
    if code.as_f64() == Some(0.0) {
        return Ok(());
    }
    let msg = field(d, "message");
    Err(anyhow!(if truthy(msg) { js_string(msg) } else { def.to_string() }))
}

async fn search_type(kind: &str, keyword: &str) -> Result<Vec<Value>> {
    let url = format!("{API}/x/web-interface/search/type?search_type={kind}&keyword={}", urlencoding::encode(keyword));
    let d = fetch_json(&url, &headers().await).await?;
    check_code(&d, "B站搜索失败")?;
    Ok(field(field(&d, "data"), "result").as_array().cloned().unwrap_or_default())
}

/// 搜索番剧 + 影视 + 普通视频，合并结果（单类失败视为空）
pub async fn search(keyword: &str) -> Result<Vec<SearchHit>> {
    let (bangumi, ft, video) = tokio::join!(
        search_type("media_bangumi", keyword),
        search_type("media_ft", keyword),
        search_type("video", keyword)
    );
    let media = bangumi.unwrap_or_default().into_iter().chain(ft.unwrap_or_default());
    let mut out: Vec<SearchHit> = media.take(MAX_MEDIA_RESULTS).map(|x| map_media(&x)).collect();
    out.extend(video.unwrap_or_default().iter().take(MAX_VIDEO_RESULTS).map(map_video));
    Ok(out)
}

/// 番剧 / 影视：season 下的全部剧集
async fn season_episodes(season_id: &str) -> Result<Vec<Episode>> {
    let url = format!("{API}/pgc/view/web/season?season_id={season_id}");
    let d = fetch_json(&url, &headers().await).await?;
    check_code(&d, "获取剧集失败")?;
    let list = field(field(&d, "result"), "episodes").as_array().cloned().unwrap_or_default();
    Ok(list.iter().enumerate().map(|(i, e)| map_episode(e, i)).collect())
}

/// 普通视频：分 P 列表
async fn video_pages(bvid: &str) -> Result<Vec<Episode>> {
    let url = format!("{API}/x/web-interface/view?bvid={}", urlencoding::encode(bvid));
    let d = fetch_json(&url, &headers().await).await?;
    check_code(&d, "获取分P失败")?;
    let list = field(field(&d, "data"), "pages").as_array().cloned().unwrap_or_default();
    Ok(list.iter().map(map_page).collect())
}

/// 是否为 ss<数字> 形式的 season id
fn season_id(id: &str) -> Option<&str> {
    id.strip_prefix("ss").filter(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()))
}

/// 获取剧集列表 [{id:cid, title}]
pub async fn episodes(id: &str) -> Result<Vec<Episode>> {
    match season_id(id) {
        Some(sid) => season_episodes(sid).await,
        None => video_pages(id).await,
    }
}

/// 获取弹幕：先 comment.bilibili.com，再回退 dm/list.so
pub async fn comments(cid: &str) -> Result<Vec<Comment>> {
    let urls = [format!("https://comment.bilibili.com/{cid}.xml"), format!("{API}/x/v1/dm/list.so?oid={cid}")];
    let mut last_err = None;
    for u in &urls {
        match fetch_text(u, &[("Referer", REFERER.to_string())]).await {
            Ok(xml) if xml.contains("<d ") || xml.contains("<i>") => return Ok(parse_bili_xml(&xml)),
            Ok(_) => {}
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("弹幕获取失败")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn season_id_detect() {
        assert_eq!(Some("123"), season_id("ss123"));
        assert_eq!(None, season_id("ss"));
        assert_eq!(None, season_id("BV1xx"));
    }

    #[test]
    fn code_check() {
        assert!(check_code(&json!({"code":0}), "x").is_ok());
        assert_eq!("bad", check_code(&json!({"code":-1,"message":"bad"}), "x").unwrap_err().to_string());
        assert_eq!("x", check_code(&json!({"code":-1}), "x").unwrap_err().to_string());
    }
}
