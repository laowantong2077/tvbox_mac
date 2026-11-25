//! 出网 HTTP 客户端（对应 server/lib/http.js）
//! - 经 network 层按「网络模式」选择 system / direct / proxy 通道（含智能回退）
//! - 容忍坏证书、自动解压、GBK 等中文编码、JSONP / 杂质 JSON
use crate::network::{self, Route};
use anyhow::{anyhow, Result};
use bytes::Bytes;
use reqwest::header::HeaderMap;
use reqwest::Method;

pub const DEFAULT_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS: u64 = 20_000;

/// 请求类型：meta = 配置/搜索等元数据；stream = 视频流/图片
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Channel {
    Meta,
    Stream,
}

#[derive(Clone, Debug)]
pub struct ReqOpts {
    pub method: Method,
    /// 额外请求头（覆盖默认 UA/Accept 等）
    pub headers: Vec<(String, String)>,
    pub timeout_ms: u64,
    pub body: Option<Vec<u8>>,
    pub channel: Channel,
    /// 强制指定通道（诊断用），此时不回退
    pub route: Option<Route>,
}

impl Default for ReqOpts {
    fn default() -> Self {
        Self {
            method: Method::GET,
            headers: Vec::new(),
            timeout_ms: DEFAULT_TIMEOUT_MS,
            body: None,
            channel: Channel::Meta,
            route: None,
        }
    }
}

impl ReqOpts {
    pub fn stream() -> Self {
        Self { channel: Channel::Stream, ..Default::default() }
    }
    pub fn header(mut self, k: &str, v: &str) -> Self {
        self.headers.push((k.to_string(), v.to_string()));
        self
    }
    pub fn timeout(mut self, ms: u64) -> Self {
        self.timeout_ms = ms;
        self
    }
}

/// 已缓冲的完整响应
pub struct Resp {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Bytes,
    pub final_url: String,
    pub route: Route,
}

/// 文本响应（已按 charset 解码）
pub struct TextResp {
    pub status: u16,
    pub headers: HeaderMap,
    pub final_url: String,
    pub bytes: Bytes,
    pub text: String,
}

/// 发起请求，返回未读取 body 的响应（流式转发用）及实际通道
pub async fn send(url: &str, opts: &ReqOpts) -> Result<(reqwest::Response, Route)> {
    let u = url::Url::parse(url).map_err(|_| anyhow!("无效 URL: {url}"))?;
    let out = network::open_request(&u, opts).await?;
    Ok((out.response, out.route))
}

pub async fn raw_request(url: &str, opts: &ReqOpts) -> Result<Resp> {
    let (res, route) = send(url, opts).await?;
    let status = res.status().as_u16();
    let headers = res.headers().clone();
    let final_url = res.url().to_string();
    let body = res.bytes().await.map_err(|e| anyhow!("读取响应失败：{e}"))?;
    Ok(Resp { status, headers, body, final_url, route })
}

/// 按 content-type 的 charset 解码（gbk/gb2312/gb18030 走 GBK）
pub fn decode_body(buf: &[u8], content_type: &str) -> String {
    let label = regex::Regex::new(r"(?i)charset=([\w-]+)")
        .ok()
        .and_then(|re| re.captures(content_type).map(|c| c[1].to_lowercase()))
        .unwrap_or_else(|| "utf-8".into());
    let label = if matches!(label.as_str(), "gbk" | "gb2312" | "gb18030") { "gbk".to_string() } else { label };
    match encoding_rs::Encoding::for_label(label.as_bytes()) {
        Some(enc) => enc.decode(buf).0.into_owned(),
        None => String::from_utf8_lossy(buf).into_owned(),
    }
}

pub fn content_type(headers: &HeaderMap) -> String {
    headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string()
}

pub async fn get_text(url: &str, opts: &ReqOpts) -> Result<TextResp> {
    let r = raw_request(url, opts).await?;
    let text = decode_body(&r.body, &content_type(&r.headers));
    Ok(TextResp { status: r.status, headers: r.headers, final_url: r.final_url, bytes: r.body, text })
}

/// 宽松 JSON 解析：去 BOM、JSONP 包裹、截取首个 { 到末个 }
pub fn parse_loose_json(raw: &str) -> Result<serde_json::Value> {
    let mut text = raw.trim().trim_start_matches('\u{feff}').to_string();
    if let Ok(re) = regex::Regex::new(r"(?s)^[\w$.]+\((.*)\)\s*;?\s*$") {
        if let Some(c) = re.captures(&text) {
            text = c[1].to_string();
        }
    }
    if !text.is_empty() && !text.starts_with('{') && !text.starts_with('[') {
        if let (Some(s), Some(e)) = (text.find('{'), text.rfind('}')) {
            if e > s {
                text = text[s..=e].to_string();
            }
        }
    }
    serde_json::from_str(&text).map_err(|_| {
        let head: String = text.chars().take(120).collect();
        anyhow!("返回内容不是合法 JSON：{head}")
    })
}

pub async fn get_json(url: &str, opts: &ReqOpts) -> Result<serde_json::Value> {
    let r = get_text(url, opts).await?;
    parse_loose_json(&r.text)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loose_json() {
        assert_eq!(parse_loose_json("cb({\"a\":1});").unwrap()["a"], 1);
        assert_eq!(parse_loose_json("\u{feff}xx{\"a\":2}yy").unwrap()["a"], 2);
    }
    #[test]
    fn gbk() {
        let (b, _, _) = encoding_rs::GBK.encode("中文");
        assert_eq!(decode_body(&b, "text/html; charset=GB2312"), "中文");
    }
}
