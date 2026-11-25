//! 独立运行的本地后端（开发 / 与 Node 版对比用）
//! 环境变量：PORT（默认 4174）、DATA_DIR（默认 ./data-rust）、STATIC_DIR（可选）
use sxk_core::{start, CoreOptions};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(4174);
    let data_dir = std::env::var("DATA_DIR").unwrap_or_else(|_| "data-rust".into());
    let static_dir = std::env::var("STATIC_DIR").ok().map(Into::into);
    let port = start(CoreOptions { data_dir: data_dir.into(), static_dir, port }).await?;
    println!("[sxk-server] listening on http://127.0.0.1:{port}");
    tokio::signal::ctrl_c().await?;
    Ok(())
}
