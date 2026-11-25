//! 路由决策（对应 server/lib/network/index.js 的 environment / planRoutes / status）
//! 智能模式：stream 优先 direct，出错或 403 回退 system，并按 host 缓存成功通道约 10 分钟
use super::interfaces::{pick_physical, Physical};
use super::settings::{get_settings, parse_proxy_url, ProxyConf, Settings};
use super::Route;
use crate::http::Channel;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const SMART_TTL: Duration = Duration::from_secs(10 * 60);

/// 当前网络环境快照：设置、物理网卡、代理配置及不可用原因
#[derive(Clone, Debug)]
pub struct Env {
    pub settings: Settings,
    pub phys: Option<Physical>,
    pub proxy: Option<ProxyConf>,
    pub proxy_error: String,
}

pub fn environment_with(settings: Settings) -> Env {
    let phys = pick_physical(&settings.iface);
    let (proxy, proxy_error) = match parse_proxy_url(&settings.proxy_url) {
        Ok(p) => (p, String::new()),
        Err(e) => (None, e.to_string()),
    };
    Env { settings, phys, proxy, proxy_error }
}

pub fn environment() -> Env {
    environment_with(get_settings())
}

/// 某通道当前是否可用；不可用时返回原因，可用返回空串
pub fn route_available(route: Route, env: &Env) -> String {
    match route {
        Route::Direct if env.phys.is_none() => "未找到物理网卡，已回退为跟随系统".into(),
        Route::Proxy if env.proxy.is_none() => {
            if env.proxy_error.is_empty() {
                "未配置代理地址，已回退为跟随系统".into()
            } else {
                env.proxy_error.clone()
            }
        }
        _ => String::new(),
    }
}

struct SmartHit {
    route: Route,
    expires: Instant,
}

static SMART_CACHE: Lazy<Mutex<HashMap<String, SmartHit>>> = Lazy::new(Default::default);

fn smart_lookup(host: &str) -> Option<Route> {
    let c = SMART_CACHE.lock();
    c.get(host).filter(|h| h.expires > Instant::now()).map(|h| h.route)
}

/// 智能模式下记住 host 的成功通道
pub fn remember(host: &str, route: Route, mode: &str) {
    if mode != "smart" {
        return;
    }
    SMART_CACHE.lock().insert(host.to_string(), SmartHit { route, expires: Instant::now() + SMART_TTL });
}

pub fn clear_smart_cache() {
    SMART_CACHE.lock().clear();
}

pub fn smart_cache_size() -> usize {
    SMART_CACHE.lock().len()
}

/// 未过滤可用性的原始计划；smart 命中缓存时由 hit 给出
pub fn raw_plan(channel: Channel, s: &Settings, hit: Option<Route>) -> Vec<Route> {
    let is_stream = channel == Channel::Stream;
    match s.mode.as_str() {
        "direct" | "proxy" => {
            let r = Route::parse(&s.mode).unwrap_or(Route::System);
            vec![if is_stream || !s.stream_only { r } else { Route::System }]
        }
        "smart" if !is_stream => vec![Route::System],
        "smart" => match hit {
            Some(Route::Direct) => vec![Route::Direct, Route::System],
            Some(r) => vec![r, Route::Direct],
            None => vec![Route::Direct, Route::System],
        },
        _ => vec![Route::System],
    }
}

/// 计算本次请求的尝试顺序（剔除不可用通道并去重，至少保留 system）
pub fn plan_routes(channel: Channel, host: &str, env: &Env) -> Vec<Route> {
    let hit = if env.settings.mode == "smart" { smart_lookup(host) } else { None };
    let mut out: Vec<Route> = Vec::new();
    for r in raw_plan(channel, &env.settings, hit) {
        if route_available(r, env).is_empty() && !out.contains(&r) {
            out.push(r);
        }
    }
    if out.is_empty() {
        out.push(Route::System);
    }
    out
}

/// 供前端展示的网络状态摘要
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub mode: String,
    pub effective_stream_route: String,
    pub physical: Option<Physical>,
    pub proxy_valid: bool,
    pub warning: String,
    pub smart_cache_size: usize,
}

pub fn status() -> Status {
    let env = environment();
    let s = &env.settings;
    let effective = if s.mode == "smart" {
        "smart".to_string()
    } else {
        plan_routes(Channel::Stream, "", &env)[0].as_str().to_string()
    };
    let warning = match s.mode.as_str() {
        "system" => String::new(),
        "smart" => route_available(Route::Direct, &env),
        m => Route::parse(m).map(|r| route_available(r, &env)).unwrap_or_default(),
    };
    Status {
        mode: s.mode.clone(),
        effective_stream_route: effective,
        physical: env.phys.clone(),
        proxy_valid: env.proxy.is_some(),
        warning,
        smart_cache_size: smart_cache_size(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(mode: &str, stream_only: bool) -> Settings {
        Settings { mode: mode.into(), stream_only, ..Default::default() }
    }

    fn env(mode: &str, phys: bool, proxy: bool) -> Env {
        let p = Physical { name: "en0".into(), address: "192.168.1.2".into(), manual: false };
        let conf = super::super::settings::parse_proxy_url("http://127.0.0.1:7890").unwrap();
        Env { settings: settings(mode, true), phys: phys.then_some(p), proxy: if proxy { conf } else { None }, proxy_error: String::new() }
    }

    #[test]
    fn raw_plan_rules() {
        use Channel::*;
        use Route::*;
        assert_eq!(vec![System], raw_plan(Meta, &settings("direct", true), None));
        assert_eq!(vec![Direct], raw_plan(Meta, &settings("direct", false), None));
        assert_eq!(vec![Proxy], raw_plan(Stream, &settings("proxy", true), None));
        assert_eq!(vec![System], raw_plan(Meta, &settings("smart", true), None));
        assert_eq!(vec![Direct, System], raw_plan(Stream, &settings("smart", true), None));
        assert_eq!(vec![System, Direct], raw_plan(Stream, &settings("smart", true), Some(System)));
        assert_eq!(vec![System], raw_plan(Stream, &settings("system", false), None));
    }

    #[test]
    fn plan_filters_unavailable() {
        assert_eq!(vec![Route::System], plan_routes(Channel::Stream, "x.unit", &env("direct", false, false)));
        assert_eq!(vec![Route::Direct], plan_routes(Channel::Stream, "x.unit", &env("direct", true, false)));
        assert_eq!(vec![Route::System], plan_routes(Channel::Stream, "x.unit", &env("proxy", true, false)));
        assert_eq!(vec![Route::Proxy], plan_routes(Channel::Stream, "x.unit", &env("proxy", false, true)));
        assert_eq!(vec![Route::Direct, Route::System], plan_routes(Channel::Stream, "y.unit", &env("smart", true, false)));
    }

    #[test]
    fn availability_reasons() {
        let e = env("smart", false, false);
        assert_eq!("未找到物理网卡，已回退为跟随系统", route_available(Route::Direct, &e));
        assert_eq!("未配置代理地址，已回退为跟随系统", route_available(Route::Proxy, &e));
        assert!(route_available(Route::System, &e).is_empty());
    }
}
