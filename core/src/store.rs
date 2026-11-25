//! 本地状态持久化（对应 server/lib/store.js）：数据目录下 state.json，原子写入
use crate::paths;
use anyhow::Result;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::PathBuf;

const STATE_FILE: &str = "state.json";
const TMP_SUFFIX: &str = ".tmp";

/// Node 单线程同步写不会交错；这里用锁保证 tmp → rename 不被并发打断
static WRITE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn state_path() -> PathBuf {
    paths::data_file(STATE_FILE)
}

/// 默认状态（与 Node 版 defaultState 一致）
pub fn default_state() -> Value {
    json!({
        "version": 1,
        "sources": [],
        "activeSourceId": null,
        "activeWarehouseUrl": null,
        "favorites": [],
        "history": [],
        "settings": { "showUnsupported": false, "theme": "dark", "autoNext": true },
    })
}

/// 读取状态：Object.assign(defaultState(), 已存内容)；读取/解析失败返回默认
pub fn read_state() -> Value {
    let mut state = default_state();
    let saved = std::fs::read_to_string(state_path())
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
    if let (Some(Value::Object(saved)), Some(target)) = (saved, state.as_object_mut()) {
        for (k, v) in saved {
            target.insert(k, v);
        }
    }
    state
}

/// 写入状态（2 空格缩进，先写 .tmp 再 rename），返回写入内容
pub fn write_state(state: Value) -> Result<Value> {
    let _guard = WRITE_LOCK.lock();
    let file = state_path();
    let mut tmp = file.clone().into_os_string();
    tmp.push(TMP_SUFFIX);
    std::fs::write(&tmp, serde_json::to_string_pretty(&state)?)?;
    std::fs::rename(&tmp, &file)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_shape() {
        let s = default_state();
        assert_eq!(1, s["version"]);
        assert_eq!("dark", s["settings"]["theme"]);
        assert!(s["activeSourceId"].is_null());
    }
}
