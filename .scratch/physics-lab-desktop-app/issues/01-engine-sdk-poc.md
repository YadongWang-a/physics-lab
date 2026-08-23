# 01 — 工程骨架与 Pi SDK 技术验证

**What to build:** 建立 electron-vite 三端工程（主进程/预加载/渲染层）；在主进程中集成 Pi SDK（创建 agent 会话、订阅事件流），用环境变量提供的真实 Key 跑通一次完整会话；确认 Pi SDK 在 Electron 主进程内可用（消除最大技术风险，spec「风险 1」）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] `npm run dev` 能启动应用（窗口出现，三端构建正常）
- [x] 主进程用环境变量 Key 创建 agent 会话并完成一次 prompt，事件流（文本增量/工具调用）被订阅并输出
- [x] 会话 JSONL 落盘且可恢复（继续会话能带上历史）
- [x] Pi SDK 与 Electron 的 Node 运行时兼容（无原生模块/ABI 冲突）

## Comments

实现于 commit 96dc3e6。验证记录：
- SDK 层测试（真实 Key，vitest）3/3：事件流（text_delta + agent_settled）、会话落盘于 `.pi-sessions/`、恢复后保留历史并继续 —— 通过
- `--smoke-agent`：Electron 主进程内 SDK 会话 PASS（agent_settled + deltas + 会话文件路径）
- `--smoke-window`：沙箱 preload（CJS）真实加载，`api.ping` → pong —— 通过
- code-review 修复：preload 输出 .cjs（sandbox 要求）、load-env CRLF 兼容、smoke executeJavaScript 纯 JS
