//! 随心看 本地后端（Rust 版）—— 与 server/ 下 Node 后端 1:1 对应，接口与 JSON 结构保持不变。
pub mod api;
pub mod cms;
pub mod config;
pub mod danmaku;
pub mod douban;
pub mod douban_home;
pub mod http;
pub mod network;
pub mod paths;
pub mod server;
pub mod stream;
pub mod store;

pub use server::{start, CoreOptions};
