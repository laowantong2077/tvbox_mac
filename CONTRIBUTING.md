# 贡献指南

感谢你对 **随心看** 的关注！欢迎通过 Issue 反馈问题、通过 Pull Request 贡献代码。

## 行为准则

参与本项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。请保持友善、尊重不同观点。

## 报告问题

- 提交 Issue 前请先搜索是否已有相同问题。
- Bug 报告请使用 Issue 模板，尽量附上：系统版本（macOS 版本、芯片）、随心看版本、复现步骤、期望行为、实际行为、相关日志或截图。
- 请勿在公开 Issue 中提交**安全漏洞细节**，见 [SECURITY.md](SECURITY.md)。
- 请勿在 Issue 中粘贴受版权保护的内容或私人信息。

## 开发环境

- Node.js 18+、Rust 1.80+（macOS 上需 Xcode Command Line Tools）。
- 前端：`npm install` → `npm run build`（构建到 `dist/`，会被嵌入 Rust 二进制）。
- 桌面开发：`npm run tauri dev`；仅后端：`npm run core:dev`（http://127.0.0.1:4174）。
- 打包：`npx tauri build`。

## 提交 Pull Request

1. 从 `main` 拉出特性分支：`git checkout -b feat/your-feature`。
2. 保持改动聚焦，一个 PR 解决一个问题；避免夹带无关格式化。
3. 提交信息遵循 `<type>(scope): <summary>` 约定，常用 type：`feat` / `fix` / `refactor` / `docs` / `test` / `chore`，summary 用中文、动词开头、≤ 50 字、不加句号。
4. 提交前请自测：
   ```bash
   npx tsc --noEmit          # 前端类型检查
   npm run build             # 前端构建
   cargo test -p sxk_core    # 内核单元测试
   ```
5. 在 PR 描述中说明：改了什么、为什么改、如何验证、影响的平台。

## 代码风格

- 前端遵循现有 React + TypeScript 风格，不引入未经讨论的重型依赖。
- Rust 遵循 `cargo fmt` / `cargo clippy` 默认规范。
- 注释优先简体中文，保持简洁清晰。
- 不硬编码密钥、Token 或个人信息。

## 许可证

提交贡献即表示你同意你的贡献以本项目 [MIT License](LICENSE) 授权。
