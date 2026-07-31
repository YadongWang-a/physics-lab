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
│   ├── common.css          # 全局样式、CSS 变量、暗/亮主题
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
- 使用 `[data-theme="light"]` 支持暗/亮主题切换
- Canvas 使用 `requestAnimationFrame`，支持 `devicePixelRatio > 1`
- 布局：`.grid` 双列（场景 + 控制面板），`.card` 卡片容器

CSS 变量（暗色主题默认）：
- `--bg` / `--panel2` — 背景层级
- `--txt` / `--dim` — 文字层级
- `--cyan` / `--orange` / `--purple` / `--green` — 语义色
- `--line` — 边框

## 桌面应用架构

```
Electron 主进程
├── Pi Agent SDK（createAgentSession, defineTool）
├── 文件管理（工作目录、lib/ 复制）
├── LLM 配置（safeStorage 加密）
└── IPC 桥接 → 渲染进程

渲染进程
├── Chat 面板（流式输出）
├── Preview 面板（iframe file://）
├── 标签栏（Tab = HTML + Session）
└── 文件树（过滤 physics-demo 注释标记）
```

Agent 工具（P0）：
- `read_file` — 读示例、模板、已有 HTML
- `write_file` — 写入生成的 HTML
- `preview` — 通知前端刷新预览

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
| 现有演示长什么样 | `ball-spring.html`, `arc-projectile.html`, etc. |
