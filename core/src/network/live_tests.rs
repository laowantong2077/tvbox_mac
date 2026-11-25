//! 实网测试（默认忽略）：`cargo test -p sxk_core live_ -- --ignored --nocapture --test-threads=1`
//! 依赖本机网络环境（Clash TUN + 物理网卡），用于验证 direct 通道与 smart 回退
use super::*;
use crate::http::{get_text, Channel};

fn init() {
    crate::paths::init_data_dir(std::env::temp_dir().join("sxk-net-live"));
    let _ = std::fs::remove_file(crate::paths::data_file("network.json"));
    settings::update_settings(&serde_json::json!({"mode":"smart","proxyUrl":""})).unwrap();
}

async fn open(url: &str, route: Option<Route>) -> anyhow::Result<Opened> {
    let opts = ReqOpts { channel: Channel::Stream, route, timeout_ms: 8000, ..Default::default() };
    open_request(&url::Url::parse(url).unwrap(), &opts).await
}

#[tokio::test]
#[ignore]
async fn live_direct_and_smart() {
    init();
    // direct 出口：ip-api 看到的应为国内运营商（system 走 Clash 规则可能是境外）
    for r in [Route::System, Route::Direct] {
        let opts = ReqOpts { route: Some(r), ..Default::default() };
        let t = get_text("http://ip-api.com/json/?lang=zh-CN", &opts).await.map(|t| t.text);
        println!("egress {:?}: {:?}", r, t);
    }
    let ip = doh_resolver::resolve4("v1.ppqrrs.com", "alidns", None).await;
    println!("doh v1.ppqrrs.com = {ip:?}");
    // smart + 403：direct 403 → 回退 system
    let o = open("https://v1.ppqrrs.com/", None).await.unwrap();
    println!("ppqrrs: route={:?} tried={:?} status={}", o.route, o.tried, o.response.status());
    // smart + 网络错误：google 直连不通 → 回退 system，并记住 system
    let o = open("https://www.google.com/generate_204", None).await;
    match o {
        Ok(o) => println!("google: route={:?} tried={:?} status={}", o.route, o.tried, o.response.status()),
        Err(e) => println!("google err: {e}"),
    }
    let env = environment();
    println!("google plan after: {:?}", plan_routes(Channel::Stream, "www.google.com", &env));
    let o = open("https://www.baidu.com/", None).await.unwrap();
    println!("baidu: route={:?} tried={:?} status={}", o.route, o.tried, o.response.status());
    println!("baidu plan after: {:?}", plan_routes(Channel::Stream, "www.baidu.com", &env));
}
