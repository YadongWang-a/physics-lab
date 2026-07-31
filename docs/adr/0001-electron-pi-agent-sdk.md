# ADR 0001: Electron + Pi Agent SDK

**日期**: 2026-07-31
**状态**: 已接受

## 背景

需要选择桌面应用框架来集成 Pi Agent。Pi Agent 是 TypeScript 库（`@earendil-works/pi-coding-agent`），核心 API 包括 `createAgentSession()`、`AgentSession`、`defineTool()` 等。

## 选项

### A. Electron（推荐）

- **主进程**：Node.js，直接 `import` Pi Agent SDK，零 IPC 开销
- **渲染进程**：Chromium，Chat UI + Preview 面板天然是 Web 技术
- **打包体积**：~150MB
- **社区参考**：PI-Desktop（Electron + Rust host core + Pi Agent sidecar）
- **转 Web 应用**：渲染进程代码直接复用，主进程逻辑迁移到 Node 后端

### B. Tauri (Rust + WebView)

- **前端**：Lit/TypeScript，WebView 渲染
- **Pi Agent 集成**：必须走 RPC 模式（JSONL over stdin/stdout），多一层序列化
- **打包体积**：~10MB
- **社区参考**：pi-desktop（Tauri + Lit）
- **代价**：RPC 调试复杂度，额外序列化开销

### C. 纯 Web 前端 + Pi RPC

- 不做桌面壳，浏览器直接跑
- 通过 RPC 调本地 Pi 进程
- 最轻量但体验不像桌面应用

## 决策

**选 A — Electron。**

理由：
1. Pi Agent SDK 是 TypeScript 库，Electron 主进程直接 `import`，零 IPC 开销
2. 渲染进程就是 Chromium，Chat + Preview 天然复用 Web 代码
3. 转 Web 应用成本低：主进程逻辑迁移到 Node 后端，渲染进程直接复用
4. 我们不需要与 Rust 共享内存或极致性能——重点在 Agent 和 UI，不在资源消耗

## 影响

- 打包体积较大，但物理老师场景不敏感（不是移动端或嵌入式）
- Windows 上 Electron 体验成熟可靠
- `safeStorage` 内置支持，API Key 加密存储开箱即用
