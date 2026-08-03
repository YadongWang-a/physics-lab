# physics-lab

高中物理互动演示 + AI 驱动的物理教学演示桌面应用。

## 现有演示（静态 HTML）

纯静态 HTML，双击即可离线运行：

- **球与弹簧** — 自由落体 + 弹簧回弹，Velocity Verlet 积分，能量守恒
- **圆弧滑落 + 平抛** — 光滑圆弧最低点脱离，平抛运动，射程 `L=2√(rh)`
- **等时圆** — 伽利略等时性，任意弦滑落时间相等 `t=√(2d/g)`
- **斜面挡板** — 弹性碰撞多视角（主视/俯视/侧视），3D 渲染

## 桌面应用（开发中）

一款 Electron 桌面应用，物理老师通过 Chat 与 AI 对话，输入物理题目或演示需求，AI 自动生成交互式 HTML 动画，右侧 Preview 面板实时预览。

### 架构概览

```
Electron 主进程                     渲染进程
┌──────────────────┐    ┌──────────┬──────────┐
│ Pi Agent SDK     │    │ Chat     │ Preview  │
│ (AgentSession)   │←IPC→│ (流式)    │ (iframe) │
│ + defineTool()   │    │          │          │
│ + 文件管理        │    │ 可折叠    │ 自动刷新  │
└──────────────────┘    └──────────┴──────────┘
```

### 核心决策

| 决策 | 选择 | 原因 |
|---|---|---|
| 桌面框架 | Electron | Pi Agent SDK 直接 `import`，零 IPC 开销 |
| Agent 集成 | Pi Agent SDK stream | 逐 token 流式输出到 Chat |
| Few-shot | 目录索引 + 按需读取 | 省 token，可扩展 |
| Preview | `file://` iframe | 相对路径天然工作 |
| 标签页 | 与 AgentSession 1:1 | 独立上下文，互不干扰 |
| 文件识别 | `<!-- physics-demo: 标题 -->` | 低调，同时标记和标题 |
| 写入校验 | `write_demo`/`edit_demo`/`validate_demo` | 写入过主进程校验拦截，lib/规范/命名不被破坏（ADR 0011） |
| 写作规范 | `CONVENTIONS.md` 文件化 | agent 写前必读，规范与代码解耦（ADR 0012） |
| 会话持久化 | `.piagent/<stem>/` + 恢复 | 隔天重启同一文件接着聊（ADR 0013） |
| 演示形态 | 静态/动态双形态 `demo-mode` | 平衡/受力类不做强行动画（ADR 0014） |
| LLM 配置 | `safeStorage` 加密 | 本地安全存储 API Key |

详见 [`CONTEXT.md`](./CONTEXT.md) 和 [`docs/adr/`](./docs/adr/)。

### MVP v0.1 范围

- Electron 单窗口，Chat + Preview 分栏，可折叠可拖拽
- 首次启动配置 LLM（API key / endpoint / model）
- 选择工作目录，自动复制 `lib/` + `CONVENTIONS.md` + examples
- 顶部标签栏，一个标签页 = 一个 HTML + 一个 AgentSession
- 文件树过滤 `<!-- physics-demo: 标题 -->` 标记
- Chat 流式输出 — 【问题理解】→【解答】→【演示生成】→ ✅ 文件已更新（thinking 只显示前 120 字、完毕即隐藏）
- Agent 写文件过校验拦截（结构/标记/语法硬错误，浅色/形态违规警告）
- 每轮写前自动备份到 `.piagent/<stem>/backups/`（保留 10 版）
- Agent 本轮完成 → Preview 自动刷新；文件改名 → 标签/预览自动跟随
- 打开文件标签恢复历史会话；浅色主题（唯一）
- 演示模式：一键收起 Chat、画布撑满，便于投屏讲解
