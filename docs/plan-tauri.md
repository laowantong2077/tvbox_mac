# 随心看 v3：Tauri 2 + Rust 迁移计划（路线 A）

## 目标
- 阶段 1：macOS 版由 Electron（276MB）迁到 Tauri 2（目标 ≤ 20MB），功能与 v2 对齐。
- 阶段 2：同一代码出 Android APK 与 iOS 包，移动端 UI 适配。

## 架构
```
core/        Rust 库 sxk_core（由旧 Node 版后端 1:1 移植，接口与 JSON 结构不变）
  src/server.rs     axum 路由，挂载 /api/*，静态资源内嵌 dist（rust-embed）
  src/http.rs       出网客户端（reqwest + rustls，容忍坏证书、GBK、JSONP）
  src/network/      system / direct（DoH + 绑定物理网卡）/ proxy（http/socks5）/ smart
  src/cms.rs config.rs store.rs stream.rs douban*.rs danmaku/
  src/bin/sxk-server.rs  独立二进制：开发/调试时可单独运行后端
src-tauri/   Tauri 2 外壳：启动 core（127.0.0.1 随机端口）→ 窗口加载该地址
src/         React 前端（基本不改；仅窗口拖拽/红绿灯/平台检测做适配）
```
- 前端仍走同源 `/api`，因此桌面与移动端共享同一套前端与后端逻辑。
- 移动端：iOS 无法绕过系统 VPN → 只提供 system/proxy；Android 支持 direct（绑定网络）。

## 风险
- WKWebView：`-webkit-app-region` 无效 → 用 `data-tauri-drag-region`；元素全屏、自动播放策略需验证。
- rustls 不支持部分老旧 TLS 站点 → 记录失败站点，必要时回退。
- Tauri 加载 http://127.0.0.1 远程页时，IPC 需 capability `remote.urls` 授权。

## 验证
- `cargo test`、`sxk-server` 启动并对 `/api/*` 主要接口返回 JSON 做快照校验。
- `tsc --noEmit`、`vite build`、agent-browser E2E（搜索→详情→播放）。
- 打包 .app/.dmg，记录体积；移动端用模拟器/真机启动截图。
