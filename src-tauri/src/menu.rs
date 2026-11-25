//! 中文应用菜单（桌面端）
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

const RELOAD_ID: &str = "reload";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadata { version: Some(app.package_info().version.to_string()), ..Default::default() };
    let app_menu = Submenu::with_items(app, "随心看", true, &[
        &PredefinedMenuItem::about(app, Some("关于随心看"), Some(about))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::hide(app, Some("隐藏随心看"))?,
        &PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?,
        &PredefinedMenuItem::show_all(app, Some("全部显示"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::quit(app, Some("退出随心看"))?,
    ])?;
    let edit = Submenu::with_items(app, "编辑", true, &[
        &PredefinedMenuItem::undo(app, Some("撤销"))?,
        &PredefinedMenuItem::redo(app, Some("重做"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, Some("剪切"))?,
        &PredefinedMenuItem::copy(app, Some("拷贝"))?,
        &PredefinedMenuItem::paste(app, Some("粘贴"))?,
        &PredefinedMenuItem::select_all(app, Some("全选"))?,
    ])?;
    let reload = MenuItem::with_id(app, RELOAD_ID, "重新加载", true, Some("CmdOrCtrl+R"))?;
    let view = Submenu::with_items(app, "视图", true, &[
        &reload,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::fullscreen(app, Some("切换全屏"))?,
    ])?;
    let window = Submenu::with_items(app, "窗口", true, &[
        &PredefinedMenuItem::minimize(app, Some("最小化"))?,
        &PredefinedMenuItem::maximize(app, Some("缩放"))?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::close_window(app, Some("关闭窗口"))?,
    ])?;
    Menu::with_items(app, &[&app_menu, &edit, &view, &window])
}

/// 菜单事件：重新加载页面
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id == RELOAD_ID {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.eval("location.reload()");
        }
    }
}
