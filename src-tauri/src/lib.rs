//! 随心看 Tauri 外壳：启动内嵌 Rust 后端（127.0.0.1 随机端口）→ 主窗口加载该地址
#[cfg(desktop)]
mod menu;
mod migrate;

use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const WIN_WIDTH: f64 = 1320.0;
const WIN_HEIGHT: f64 = 860.0;
const WIN_MIN_WIDTH: f64 = 1000.0;
const WIN_MIN_HEIGHT: f64 = 640.0;
/// 与前端深色主题一致的窗口底色，避免页面加载前白屏闪烁
const BG_COLOR: tauri::window::Color = tauri::window::Color(11, 13, 18, 255);

/// 注入给前端的平台信息（main.tsx 读取 window.__SXK_PLATFORM__）
fn platform_script() -> String {
    let os = std::env::consts::OS;
    let mobile = cfg!(mobile);
    format!("window.__SXK_PLATFORM__ = {{ app: 'tauri', os: '{os}', mobile: {mobile} }};")
}

fn data_dir(app: &tauri::App) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("suixinkan"));
    base.join("data")
}

fn build_window(app: &tauri::App, port: u16) -> tauri::Result<()> {
    let url = format!("http://127.0.0.1:{port}/").parse().expect("valid url");
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .initialization_script(&platform_script())
        .background_color(BG_COLOR);
    #[cfg(desktop)]
    let builder = builder
        .title("随心看")
        .inner_size(WIN_WIDTH, WIN_HEIGHT)
        .min_inner_size(WIN_MIN_WIDTH, WIN_MIN_HEIGHT)
        .theme(Some(tauri::Theme::Dark))
        .center();
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 22.0));
    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .menu(|app| menu::build(app))
        .on_menu_event(|app, e| menu::on_event(app, e.id().as_ref()));
    builder
        .setup(|app| {
            let dir = data_dir(app);
            migrate::from_electron(&dir);
            let opts = sxk_core::CoreOptions { data_dir: dir, static_dir: None, port: 0 };
            let port = tauri::async_runtime::block_on(sxk_core::start(opts))?;
            build_window(app, port)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("随心看启动失败");
}
