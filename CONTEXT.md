# CONTEXT — 物理教学演示桌面应用

## 产品

一款 Electron 桌面应用。物理老师通过 Chat 与 AI（Pi Agent）对话，输入物理题目或演示需求，AI 自动生成交互式 HTML 动画（参考本仓库现有示例风格），并在右侧 Preview 面板实时预览。

## 术语表

| 术语 | 定义 |
|---|---|
| **工作目录** | 用户选择的本地文件夹，存放生成的 HTML、`lib/`、`examples/` |
| **标签页 (Tab)** | 一个独立的工作单元 = 一个 HTML 文件 + 一个对话上下文。顶部标签栏排列，可新建/关闭 |
| **Chat 面板** | 左侧对话区，流式显示 Agent 输出。可折叠/展开/拖拽调整宽度 |
| **Preview 面板** | 右侧预览区，用 `<iframe>` 加载本地 `file://` HTML。Agent 本轮完成后自动刷新 |
| **演示模式 (present mode)** | 生成的 HTML 的一种布局态：画布撑大、参数滑块折为底部抽屉、临界状态栏与 ▶⏸↺ 保留，便于老师投屏演示。由应用工具栏"演示"按钮经 postMessage 触发（HTML 内只挂监听器、不放按钮），CSS 在 `lib/common.css`。与主题正交 |
| **Session** | Pi Agent SDK 的一个 `AgentSession`。与标签页 1:1 对应，持久化到磁盘 |
| **支持的文件** | 工作目录中包含 `<!-- physics-demo: xxx -->` 注释标记的 `.html` 文件 |
| **文件标题** | 取自注释中 `<!-- physics-demo: 中文标题 -->` 的中文标题。文件名用英文 slug |
| **Agent 输出结构** | 【问题理解】→【解答】→【演示生成】→ ✅ 文件已更新 |
| **LLM 配置** | 用户首次启动配置：API Endpoint、API Key、Model。用 Electron `safeStorage` 加密存储 |
| **lib/** | 应用打包自带的共享资源：`common.css`、`common.js`、`mathjax.js`。首次使用时复制到工作目录 |
| **examples/** | 4 个现有参考 HTML（弹簧、平抛、等时圆、斜面挡板），只读，供 Agent 按需读取学习 |

## 架构决策

见 `docs/adr/`：

- [0001-electron-pi-agent-sdk.md](./docs/adr/0001-electron-pi-agent-sdk.md) — 选 Electron + Pi Agent SDK 而非 Tauri + RPC
- [0002-few-shot-on-demand.md](./docs/adr/0002-few-shot-on-demand.md) — Few-shot 示例按需读取而非全量塞入 system prompt
- [0003-preview-iframe-local-file.md](./docs/adr/0003-preview-iframe-local-file.md) — Preview 用 iframe 加载本地文件
- [0004-tab-session-one-to-one.md](./docs/adr/0004-tab-session-one-to-one.md) — 标签页与 Pi Agent Session 1:1
- [0005-physics-demo-comment-marker.md](./docs/adr/0005-physics-demo-comment-marker.md) — 用 HTML 注释标记识别支持的演示文件
- [0006-light-theme-only.md](./docs/adr/0006-light-theme-only.md) — 砍深色主题，浅色唯一
- [0007-present-mode.md](./docs/adr/0007-present-mode.md) — 演示模式架构（住 HTML、单向 postMessage、E3 布局、Chat 隐藏）
- [0008-llm-openai-compatible.md](./docs/adr/0008-llm-openai-compatible.md) — LLM 接入：OpenAI 兼容 endpoint，运行时 provider extension
- [0009-agent-tools-no-sandbox.md](./docs/adr/0009-agent-tools-no-sandbox.md) — Agent 工具集与沙箱取舍（内置工具、禁 bash、接受逃逸风险）
- [0010-system-prompt-bundled.md](./docs/adr/0010-system-prompt-bundled.md) — System prompt 应用内联，不写 AGENTS.md 到工作目录
