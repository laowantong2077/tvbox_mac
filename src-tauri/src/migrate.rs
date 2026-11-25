//! 首次启动时从 Electron 版（~/Library/Application Support/随心看/data）迁移用户数据
use std::path::Path;

const FILES: [&str; 2] = ["state.json", "network.json"];
const LEGACY_DIRS: [&str; 3] = ["随心看", "影视仓 Mac", "影视仓"];

pub fn from_electron(target: &Path) {
    if target.join("state.json").exists() {
        return;
    }
    let Some(home) = std::env::var_os("HOME") else { return };
    let support = Path::new(&home).join("Library/Application Support");
    for name in LEGACY_DIRS {
        let src = support.join(name).join("data");
        if !src.join("state.json").exists() {
            continue;
        }
        let _ = std::fs::create_dir_all(target);
        for f in FILES {
            let _ = std::fs::copy(src.join(f), target.join(f));
        }
        return;
    }
}
