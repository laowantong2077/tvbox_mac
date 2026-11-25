//! 在线弹幕（对应 server/lib/danmaku/）
//! 探测结论：弹弹play 开放 API 需 AppId 签名；目前仅接入实测可用的 B 站（番剧/影视/普通视频）
pub mod bili;
pub mod fetch;
pub mod map;
pub mod parse;
