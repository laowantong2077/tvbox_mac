// 桌面入口（release 下不弹出终端窗口）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    suixinkan_lib::run()
}
