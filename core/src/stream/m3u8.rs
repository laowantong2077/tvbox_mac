//! m3u8 识别与改写（对应 stream.js 的 isM3u8 / absolutize / rewriteM3u8 / streamApi）
use crate::cms::js::encode_uri_component;
use once_cell::sync::Lazy;
use regex::{Captures, Regex};

static MPEGURL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)mpegurl").unwrap());
static M3U8_PATH_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\.m3u8$").unwrap());
static M3U8_URL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\.m3u8(\?|$)").unwrap());
static URI_ATTR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"URI="([^"]+)""#).unwrap());
static LINE_SPLIT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\r?\n").unwrap());

/// 生成走本代理的地址：/api/stream?url=…[&referer=…]
pub fn stream_api(url: &str, referer: &str) -> String {
    let mut q = format!("/api/stream?url={}", encode_uri_component(url));
    if !referer.is_empty() {
        q.push_str("&referer=");
        q.push_str(&encode_uri_component(referer));
    }
    q
}

/// 是否为 m3u8：content-type 含 mpegurl，或路径/URL 以 .m3u8 结尾
pub fn is_m3u8(url: &str, content_type: &str) -> bool {
    if MPEGURL_RE.is_match(content_type) {
        return true;
    }
    if let Ok(u) = url::Url::parse(url) {
        if M3U8_PATH_RE.is_match(u.path()) {
            return true;
        }
    }
    M3U8_URL_RE.is_match(url)
}

/// 相对地址基于 base 解析为绝对地址；失败原样返回
pub fn absolutize(u: &str, base: &str) -> String {
    url::Url::parse(base)
        .and_then(|b| b.join(u))
        .map(|x| x.to_string())
        .unwrap_or_else(|_| u.to_string())
}

/// 改写 m3u8：子清单/分片行与标签内 URI="…" 均改为走本代理
pub fn rewrite_m3u8(text: &str, base: &str, referer: &str) -> String {
    let out: Vec<String> = LINE_SPLIT_RE
        .split(text)
        .map(|raw| {
            if crate::cms::js::js_trim(raw).is_empty() {
                return raw.to_string();
            }
            if raw.starts_with('#') {
                return URI_ATTR_RE
                    .replace_all(raw, |c: &Captures| {
                        format!("URI=\"{}\"", stream_api(&absolutize(&c[1], base), referer))
                    })
                    .into_owned();
            }
            stream_api(&absolutize(crate::cms::js::js_trim(raw), base), referer)
        })
        .collect();
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://cdn.x.com/v/1/index.m3u8?t=1";

    #[test]
    fn detect() {
        assert!(is_m3u8("http://a/b", "application/vnd.apple.mpegURL"));
        assert!(is_m3u8("http://a/b.M3U8", ""));
        assert!(is_m3u8("http://a/b.m3u8?x=1", "text/plain"));
        assert!(!is_m3u8("http://a/b.ts", "video/mp2t"));
    }

    #[test]
    fn rewrite() {
        let src = "#EXTM3U\r\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\r\n\r\n#EXTINF:10,\r\nseg 1.ts\n/abs/2.ts\nhttps://o.com/3.ts\n";
        let out = rewrite_m3u8(src, BASE, "https://r.com/");
        let lines: Vec<&str> = out.split('\n').collect();
        assert_eq!("#EXTM3U", lines[0]);
        assert_eq!(
            "#EXT-X-KEY:METHOD=AES-128,URI=\"/api/stream?url=https%3A%2F%2Fcdn.x.com%2Fv%2F1%2Fkey.bin&referer=https%3A%2F%2Fr.com%2F\"",
            lines[1]
        );
        assert_eq!("", lines[2]);
        assert_eq!("/api/stream?url=https%3A%2F%2Fcdn.x.com%2Fv%2F1%2Fseg%25201.ts&referer=https%3A%2F%2Fr.com%2F", lines[4]);
        assert_eq!("/api/stream?url=https%3A%2F%2Fcdn.x.com%2Fabs%2F2.ts&referer=https%3A%2F%2Fr.com%2F", lines[5]);
        assert_eq!("/api/stream?url=https%3A%2F%2Fo.com%2F3.ts&referer=https%3A%2F%2Fr.com%2F", lines[6]);
        assert_eq!("", lines[7]);
    }

    #[test]
    fn no_referer() {
        assert_eq!("/api/stream?url=a", stream_api("a", ""));
    }
}
