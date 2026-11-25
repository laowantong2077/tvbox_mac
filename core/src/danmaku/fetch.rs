//! 弹幕专用的轻量请求工具（对应 server/lib/danmaku/fetch.js）
//! - B 站弹幕接口返回 raw deflate（无 zlib 头），通用解压会失败，
//!   因此关闭 reqwest 自动解压，自己依次尝试 gunzip / inflate / inflateRaw
//! - 与 Node 版一致：直连（不走网络模式）、容忍坏证书、最多 4 次重定向、15 秒超时
use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use reqwest::header::HeaderMap;
use std::io::Read;
use std::time::Duration;

pub const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TIMEOUT: Duration = Duration::from_millis(15_000);
const MAX_REDIRECTS: usize = 4;
/// HTTP 错误状态码下限
const HTTP_ERROR_MIN: u16 = 400;
/// brotli 解码缓冲区大小
const BROTLI_BUF: usize = 4096;

static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .no_proxy()
        .no_gzip()
        .no_deflate()
        .no_brotli()
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .timeout(TIMEOUT)
        .build()
        .expect("build danmaku client")
});

/// 响应：状态码、响应头、已解压的 body
pub struct FetchResp {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

fn gunzip(buf: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(buf).read_to_end(&mut out)?;
    Ok(out)
}

fn inflate(buf: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::ZlibDecoder::new(buf).read_to_end(&mut out)?;
    Ok(out)
}

fn inflate_raw(buf: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::DeflateDecoder::new(buf).read_to_end(&mut out)?;
    Ok(out)
}

fn brotli(buf: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut out = Vec::new();
    brotli_decompressor::Decompressor::new(buf, BROTLI_BUF).read_to_end(&mut out)?;
    Ok(out)
}

type Decoder = fn(&[u8]) -> std::io::Result<Vec<u8>>;

/// 解压任意编码的响应体，全部失败则原样返回
pub fn decompress(buf: &[u8], enc: &str) -> Vec<u8> {
    let tries: &[Decoder] = match enc {
        "gzip" => &[gunzip],
        "deflate" => &[inflate, inflate_raw],
        "br" => &[brotli],
        _ => &[],
    };
    tries.iter().find_map(|f| f(buf).ok()).unwrap_or_else(|| buf.to_vec())
}

/// GET 请求，headers 覆盖默认 UA/Accept/Accept-Encoding
pub async fn fetch_buffer(url: &str, headers: &[(&str, String)]) -> Result<FetchResp> {
    let mut rb = CLIENT
        .get(url)
        .header("User-Agent", UA)
        .header("Accept", "*/*")
        .header("Accept-Encoding", "gzip, deflate");
    for (k, v) in headers {
        rb = rb.header(*k, v.as_str());
    }
    let res = rb.send().await.map_err(|e| anyhow!(describe(&e)))?;
    let status = res.status().as_u16();
    let headers = res.headers().clone();
    let raw = res.bytes().await.map_err(|e| anyhow!(describe(&e)))?;
    let enc = headers
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    Ok(FetchResp { status, headers, body: decompress(&raw, &enc) })
}

fn describe(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "请求超时".into()
    } else {
        crate::network::describe_error(e)
    }
}

async fn fetch_ok(url: &str, headers: &[(&str, String)]) -> Result<Vec<u8>> {
    let r = fetch_buffer(url, headers).await?;
    if r.status >= HTTP_ERROR_MIN {
        return Err(anyhow!("HTTP {}", r.status));
    }
    Ok(r.body)
}

pub async fn fetch_json(url: &str, headers: &[(&str, String)]) -> Result<serde_json::Value> {
    let body = fetch_ok(url, headers).await?;
    serde_json::from_slice(&body).map_err(|e| anyhow!("{e}"))
}

pub async fn fetch_text(url: &str, headers: &[(&str, String)]) -> Result<String> {
    let body = fetch_ok(url, headers).await?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::DeflateEncoder;
    use flate2::Compression;
    use std::io::Write;

    #[test]
    fn raw_deflate_fallback() {
        let mut enc = DeflateEncoder::new(Vec::new(), Compression::default());
        enc.write_all(b"<i><d p=\"1\">x</d></i>").unwrap();
        let raw = enc.finish().unwrap();
        assert_eq!(b"<i><d p=\"1\">x</d></i>".to_vec(), decompress(&raw, "deflate"));
        assert_eq!(b"plain".to_vec(), decompress(b"plain", "gzip"));
    }
}
