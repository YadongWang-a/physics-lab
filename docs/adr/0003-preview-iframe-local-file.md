# ADR 0003: Preview 用 iframe 加载本地文件

**日期**: 2026-07-31
**状态**: 已接受

## 背景

Agent 生成 HTML 文件后，Preview 面板需要渲染它。HTML 文件依赖相对路径资源（`lib/common.css`、`lib/mathjax.js`）。

## 选项

### A. iframe + Blob URL

把 HTML 字符串转成 `blob:` URL 塞进 iframe。

- 优势：沙箱隔离，不污染主窗口
- 劣势：`blob:` 是内存级的，相对路径（`lib/common.css`）会 404，需要额外处理资源内联

### B. iframe + 本地文件（推荐）

Agent 把 HTML 写到工作目录，iframe 直接加载 `file://` 路径。

- 优势：所有相对路径和字体路径天然工作，Electron 默认允许 `file://`
- 劣势：需要文件先落盘才能预览

### C. Electron `<webview>` 标签

独立进程，功能最全。

- 优势：独立 DevTools、独立 session
- 劣势：API 重，Chromium 在逐步移除 webview

## 决策

**选 B — iframe + 本地文件。**

理由：
1. 简单——HTML 写到哪就从哪加载，相对路径天然工作
2. Electron 里 `file://` 协议默认允许，无需额外配置
3. 所有依赖（`lib/common.css`、MathJax 字体）都正确解析
4. Agent 本身就是写文件到磁盘，本地加载是最直接的预览方式

## 影响

- Agent 必须先写完文件，Preview 才能刷新
- 首次使用时必须确保 `lib/` 已复制到工作目录
