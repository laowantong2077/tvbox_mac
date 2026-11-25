//! 全局路径：数据目录（state.json / network.json 等）
use once_cell::sync::OnceCell;
use std::path::PathBuf;

static DATA_DIR: OnceCell<PathBuf> = OnceCell::new();

/// 设置数据目录（启动时调用一次）
pub fn init_data_dir(dir: PathBuf) {
    let _ = std::fs::create_dir_all(&dir);
    let _ = DATA_DIR.set(dir);
}

/// 数据目录；未初始化时回退为当前目录下 data/
pub fn data_dir() -> PathBuf {
    DATA_DIR.get().cloned().unwrap_or_else(|| PathBuf::from("data"))
}

/// 数据目录下的文件路径
pub fn data_file(name: &str) -> PathBuf {
    data_dir().join(name)
}
