# CLAUDE.md — physics-lab

## 项目概述

两个部分：
1. **静态物理演示 HTML**（`*.html` + `lib/`）— 4 个独立可运行的物理动画
2. **桌面应用**（Electron + Pi Agent SDK）— AI 驱动的物理演示生成器（开发中）

## 项目结构

```
/
├── *.html                  # 静态物理演示（ball-spring, arc-projectile, etc.）
├── lib/                    # 共享资源
│   ├── common.css          # 全局样式、CSS 变量（浅色）、演示模式 reflow
│   ├── common.js           # 全局 JS 工具
│   └── mathjax.js          # MathJax 渲染
├── docs/
│   └── adr/                # 架构决策记录（5 篇）
├── CONTEXT.md              # 领域术语表
├── README.md               # 项目说明
├── CLAUDE.md               # 本文件
└── AGENTS.md               # Agent 配置
```

## 静态 HTML 约定

每个 HTML 文件：
- 引入 `lib/common.css`（全局样式 + CSS 变量）
- 引入 `lib/common.js`（工具函数）
- 需要公式时引入 `lib/mathjax.js`
- 主题：**浅色唯一**，无 `[data-theme]`、无 🌙 切换按钮（见 [ADR 0006](./docs/adr/0006-light-theme-only.md)）
- 演示模式：HTML 内挂 postMessage 监听器（`{cmd:"present",value}` → `body.present`），无演示按钮；区域结构按 E3（见 [ADR 0007](./docs/adr/0007-present-mode.md)）
- Canvas 使用 `requestAnimationFrame`，支持 `devicePixelRatio > 1`
- 布局：`.grid` 双列（场景 + 控制面板），`.card` 卡片容器；演示态（`.present`）下画布撑满、参数折为底部抽屉、顶栏与 ▶⏸↺ 保留

CSS 变量（浅色）：
- `--bg` / `--panel2` — 背景层级
- `--txt` / `--dim` — 文字层级
- `--cyan` / `--orange` / `--purple` / `--green` — 语义色
- `--line` — 边框

## 桌面应用架构

```
Electron 主进程
├── Pi Agent SDK（createAgentSession, defineTool）
├── 文件管理（工作目录、lib/ 复制）
├── LLM 配置（OpenAI 兼容 endpoint + 密钥 + 模型名，safeStorage 加密，见 ADR 0008）
└── IPC 桥接 → 渲染进程

渲染进程
├── Chat 面板（流式输出）
├── Preview 面板（iframe file://）
├── 标签栏（Tab = HTML + Session）
└── 文件树（过滤 physics-demo 注释标记）
```

Agent 工具（见 ADR 0009）：
- SDK 内置 `read`/`write`/`edit`/`ls`/`find`/`grep`，**禁用 `bash`**，无路径隔离（Pi 无内置沙箱，接受逃逸风险）
- Preview：主进程 `fs.watch` 监听当前演示文件自动刷新 iframe，**不做工具**
- System prompt 应用内联（经 `DefaultResourceLoader({ systemPrompt })`），含示例目录索引 + 输出结构 + 浅色/演示模式约定（见 ADR 0010）

Agent 输出结构：
1. 【问题理解】— 复述物理问题
2. 【解答】— 物理推导和答案
3. 【演示生成】— 说明生成了什么
4. ✅ 文件已更新 — 完成通知

## 关键文件导航

| 想看什么 | 去哪看 |
|---|---|
| 术语定义 | `CONTEXT.md` |
| 为什么选 Electron | `docs/adr/0001-electron-pi-agent-sdk.md` |
| 为什么按需读示例 | `docs/adr/0002-few-shot-on-demand.md` |
| Preview 怎么工作 | `docs/adr/0003-preview-iframe-local-file.md` |
| Tab 和 Session 的关系 | `docs/adr/0004-tab-session-one-to-one.md` |
| 文件怎么识别 | `docs/adr/0005-physics-demo-comment-marker.md` |
| 为什么只有浅色 | `docs/adr/0006-light-theme-only.md` |
| 演示模式怎么工作 | `docs/adr/0007-present-mode.md` |
| LLM 怎么接入 | `docs/adr/0008-llm-openai-compatible.md` |
| Agent 工具与沙箱取舍 | `docs/adr/0009-agent-tools-no-sandbox.md` |
| System prompt 放哪 | `docs/adr/0010-system-prompt-bundled.md` |
| 现有演示长什么样 | `ball-spring.html`, `arc-projectile.html`, etc. |
