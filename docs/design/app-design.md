# 设计分析：物理演示生成桌面应用

> 状态：待用户确认（2026-08-18，分析已交付，未开始编码）
> 前置调研见 `docs/research/pi-physics-desktop-app.md`；skill 内容已复制到 `resources/`。

## 1. 需求定界

| 项 | 内容 |
|---|---|
| 用户 | 中学物理老师（非技术人员） |
| 核心功能 | 输入物理题/物理过程文字（可附图），对话式生成、修改交互演示 HTML |
| 界面 | 左：AI 聊天；右：实时预览生成的 HTML |
| 会话模型 | 一个演示文档 = 一个 Pi agent session |
| 已有资产 | physics-lab-skill（7 步生成流程 + 2D/3D 模板 + lib 三件套 + 9 个回归 demo），已复制到 `resources/physics-lab-skill/` 与 `resources/demos/`（lib 三件套两处 md5 一致） |

## 2. 技术选型

| 决策点 | 选择 | 理由 |
|---|---|---|
| 外壳 | **Electron** | Pi SDK 是 Node/TS，主进程进程内直接 `createAgentSession()`，零 sidecar；Tauri 需 Rust + Node sidecar + RPC 协议，v1 不值 |
| agent 嵌入 | **Pi SDK 进程内** | 官方一等公民：每文档一个 session 实例、`subscribe()` 流式事件、`customTools` 注册检查 tool；崩溃隔离用模块化 + JSONL 恢复兜底 |
| 渲染层 | **React + electron-vite** | 聊天流/图片附件/设置页状态管理省一半代码；electron-vite 统一三端构建 |
| 预览 | `<webview>` 沙箱 | 生成的 HTML 是不可信代码：sandbox + contextIsolation + nodeIntegration off；`fs.watch` 文档目录自动刷新；**该 webview 同时是 check_demo tool 的运行时** |

## 3. 架构

```
┌─ Electron 主进程 (Node) ──────────────────────────────┐
│  AgentManager（Pi SDK）                                │
│    ├─ doc A → createAgentSession({cwd: docA, ...})     │
│    ├─ doc B → createAgentSession({cwd: docB, ...})     │
│    ├─ customTools: [check_demo]                        │
│    └─ subscribe(events) ──转发──► IPC ──► 渲染层        │
│  OCR 通道（GLM-4V-Flash 等，HTTP）                      │
│  DocumentManager（documents/<uuid>/ 工作区）            │
│  设置存储（auth.json + settings.json，userData 私有）   │
└───────────────────────────────────────────────────────┘
        ▲ IPC (contextBridge)          ▲ IPC
┌─ 渲染层 (React, 沙箱) ───────────────┐
│ 左：聊天流 | 文档列表 | 设置          │
│ 右：<webview> 预览（沙箱隔离）       │
└─────────────────────────────────────┘
```

数据流：
1. 老师发消息 → IPC → `session.prompt(text)`
2. agent 按 skill 流程：读 SKILL.md → 推导 → 拷 lib → 模板填空写 index.html → `check_demo` 自检 → 修复重跑
3. 事件流（text_delta / tool_execution / agent_settled）→ 聊天区流式渲染
4. `fs.watch` 发现 index.html 变化 → 预览自动刷新

## 4. Skill 集成

### 4.1 加载（skill 带 `disable-model-invocation: true`，需强制触发）

1. `systemPromptOverride` 追加指令："用户输入物理题时，必须加载 physics-lab-skill 并严格按其 7 步流程执行"
2. settings `skills` 数组注册（指向 `resources/physics-lab-skill`）
3. asar 打包，首次运行解压到 userData，路径写入配置

### 4.2 check_demo tool（自检工具化，消灭 bash 依赖）

skill 第 7 步自检原本依赖 bash `node --check`；工具化后全部由 tool 完成，且符合 skill"程序化断言、不截图"的意图：

| 检查 | 实现 |
|---|---|
| `<script>` 语法 | 最后一个 script 块 → `new Function()` 编译（替代 node --check） |
| `$('id')` ↔ `id=` | 正则交叉核对 |
| 骨架标记 | 断言含 startLoop/setupScene、无手写 requestAnimationFrame |
| JS 运行时错误 | 沙箱 webview 加载 → 收集 console.error / window.onerror |
| S 状态发散 | 跑 N 帧 → 检查 S 无 NaN/Infinity |
| 画布非空白 | getImageData 像素采样 |
| 自定义断言 | 接受 JS 片段参数在页面上下文执行（能量守恒漂移<1% 等物理断言） |

返回 `{ok, issues[]}` → agent"失败→修复→重跑"闭环。

## 5. OCR 通道

DeepSeek API 纯文本（已确认）。双层：
1. 当前模型支持视觉 → 图片 base64 直通 `session.prompt({images})`（Pi 原生）
2. 文本模型（DeepSeek 默认）→ 应用层拦截：图片 → HTTP 调视觉模型 OCR（默认 GLM-4V-Flash 免费；备选 Qwen-VL/Kimi/ERNIE-VL）→ 文本进对话

本地 OCR（PaddleOCR/tesseract.js）数学符号识别差，留远期。

## 6. 持久化

```
<userData>/documents/<docId>/
  index.html       ← agent 产出（预览/检查目标）
  meta.json        ← {docId, 标题, 创建时间, sessionFile}
  session.jsonl    ← Pi 按 cwd 自动落盘（一个 HTML 一个 session）
```

恢复：读 meta.json → `sessionManager.continue()`。导出：HTML + lib 打包文件夹，双击离线运行。

## 7. 设置与认证

- 供应商 + 模型 + API Key（默认 DeepSeek）+ OCR 模型/Key
- `ModelRuntime.create({authPath: userData/auth.json})`，不碰 `~/.pi/`
- `session.setModel()` 实时切换；模型列表从 pi-ai ModelRegistry 动态取

## 8. 风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | Pi SDK 在 Electron 主进程兼容性（未实测） | 高 | P0 先跑最小 SDK 冒烟 |
| 2 | Windows 无 bash | 中 | v1 工具集禁 bash（read/write/edit/grep/find/ls）+ check_demo 替代 node --check |
| 3 | 模型 Key 来源 | 高 | 老师自带；OCR 用免费 GLM-4V-Flash |
| 4 | 生成 HTML 不可信 | 中 | 预览/检查 webview 全沙箱 |
| 5 | mathjax 2.1MB 每文档拷贝 | 低 | skill 设计要求（离线可用） |
| 6 | DeepSeek 模型 id 运行时确认 | 低 | 设置页动态列模型 |

## 9. 实施阶段

| 阶段 | 内容 | 验证 |
|---|---|---|
| P0 技术验证 | 最小 Electron + Pi SDK（createAgentSession → prompt → 事件流），无 UI 优先 | 控制台跑通一次 DeepSeek 调用（需一个 key） |
| P1 骨架 | 三端构建 + 左聊天右预览布局 + 文档列表 | `npm run dev` 界面出现 |
| P2 agent 集成 | skill 注册 + check_demo + 预览自动刷新 | 输入物理题 → 生成 → 预览 → 自检通过 |
| P3 OCR | 图片附件 → OCR → 对话 | 贴题照正确识别 |
| P4 分发 | 设置页、导出、NSIS 安装包 | 干净机器安装测试 |

P0 需要一个 DeepSeek API Key 端到端验证（本地环境变量，不进代码）。
