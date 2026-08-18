# 桌面应用研究：Physics Skill + Pi Agent + GUI

> 目标：给中学物理老师做一个 Windows 桌面应用 —— 左侧 AI 聊天，右侧实时预览生成的物理演示 HTML；每个 HTML 对应一个独立的 Pi agent session。
> 调查日期：2026-08-18，全部为网络一手信源调查（本地 skill 未检视）。

## 结论摘要

- **Pi agent = pi.dev（`@earendil-works/pi-coding-agent`）**，开源（MIT）、TypeScript、GitHub 92k+ stars。Monorepo `earendil-works/pi` 拆三个包：`pi-agent-core`（agent 运行时）、`pi-ai`（多供应商 LLM API）、`pi-coding-agent`（CLI/TUI + SDK + headless 模式）。
- **Pi 官方提供三种编程式嵌入方式**：Node/TS SDK（进程内 `createAgentSession`）、`pi --mode rpc`（stdin/stdout JSONL 全双工协议）、`pi --mode json`（一次性事件流）。没有 HTTP server 模式。
- **Skills 用开放的 Agent Skills 标准（SKILL.md）**，可把 physics skill 目录直接挂给 Pi：`settings.json` 的 `skills` 数组、`--skill <path>` 参数、或放到 workspace 的 `.pi/skills/`（受项目信任门控）。甚至可以直接指向 `~/.claude/skills`。
- **Session 是 JSONL 树文件，按工作目录(cwd)组织** —— 每个 HTML 一个工作目录，session 持久化天然一一对应，这是"一个 HTML 对应一个 session"的官方原生实现方式。
- **供应商覆盖广，含 DeepSeek、Kimi For Coding、MiniMax、OpenRouter，以及本地 llama.cpp** —— 对中国老师友好（无需海外账号）。
- **关键坑：Windows 上 Pi 需要 bash（Git Bash/Cygwin/MSYS2/WSL）**，通过 `shellPath` 配置。
- **physics-lab-skill 未公开**：所有主流 skill 仓库（anthropics/skills、VoltAgent、skills.sh、LobeHub 等）都没有同名的物理教学演示 skill —— 用户本地这份是私有/未发布的，需要随应用打包。

## 1. Pi agent 是什么

| 项目 | 值 |
|---|---|
| 官网 | https://pi.dev |
| 仓库 | https://github.com/earendil-works/pi（原 badlogic/pi-mono，MIT） |
| npm | `@earendil-works/pi-coding-agent`，最新 0.84.2，周下载 1.4M |
| 定位 | 极简终端 coding harness："让 pi 适应你的工作流"。核心精简，通过扩展/技能/模板/包扩展 |

内建工具：`read` / `write` / `edit` / `bash`（可选 `grep` `find` `ls`）。
运行模式：交互（TUI）、`-p/--print`、`--mode json`、`--mode rpc`、SDK。

## 2. 嵌入方式（这是本项目核心决策）

官方文档 https://pi.dev/docs/latest/sdk 和 /rpc、/json：

**A. SDK（进程内，Node/TS）** — 推荐
```typescript
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  cwd: "<每个HTML的工作目录>",
  sessionManager: SessionManager.create("<工作目录>"), // session 按 cwd 落盘
  modelRuntime,
});
session.subscribe((e) => { /* message_update/text_delta 流式增量，tool_execution_start/end，agent_settled */ });
await session.prompt("生成一个自由落体演示");
```
- `AgentSession` 接口：`prompt()` / `steer()`（流式中插队）/ `followUp()` / `subscribe()` / `abort()` / `setModel()` / `compact()` / `navigateTree()`。
- `createAgentSessionRuntime()` + `AgentSessionRuntime`：`newSession` / `switchSession` / `fork` / `importFromJsonl` —— 交互、print、RPC 模式底层就是这一层。
- 官方 SDK 示例：`packages/coding-agent/examples/sdk/`（01-minimal … 13-session-runtime，含 04-skills、07-context-files、09-api-keys、11-sessions）。
- 多文档并发：多次调用 `createAgentSession()` 各得独立 session，进程内可同时存在多个。

**B. RPC 子进程（任意语言宿主）**
`pi --mode rpc`，stdin/stdout 走 LF 分隔 JSONL；命令含 `prompt` `steer` `follow_up` `abort` `new_session` `get_state` `get_messages` `set_model`。适合不想跑 Node 的宿主（如 Tauri/Rust），事件流式回 stdout。

**C. JSON 模式**：`pi --mode json "prompt"`，一次性输出事件流，适合批处理。

## 3. Skills：如何把 physics skill 挂给 agent

官方文档 https://pi.dev/docs/latest/skills。Pi 实现 Agent Skills 标准（https://agentskills.io/specification）：技能 = 目录 + `SKILL.md`（frontmatter 必填 `name` + `description`，正文渐进式披露，agent 用到时才 read 全文）。

发现位置（按优先级）：
1. 全局：`~/.pi/agent/skills/`、`~/.agents/skills/`
2. 项目：`.pi/skills/`、`.agents/skills/`（cwd 及祖先目录，**需项目被信任**）
3. 包：`package.json` 的 `pi.skills` / `skills/` 目录
4. settings：`{"skills": ["<目录>"]}`（可直接指 `~/.claude/skills` 复用 Claude 技能）
5. CLI：`--skill <path>`（可重复，即使 `--no-skills` 也生效）

**对应用的建议**：把 physics-skill-0807 拷进应用管理的 workspace（如 `<用户数据>/skills/physics-lab/SKILL.md`），通过 settings 的 `skills` 数组或 SDK `DefaultResourceLoader`/`skillsOverride` 注册，再配一条 `APPEND_SYSTEM.md`/system prompt 提示"物理问题一律走 physics-lab skill"（skill 自动触发不稳，官方文档也提示"models don't always do this; use prompting or /skill:name to force it"）。

## 4. Session：一个 HTML = 一个 session

官方文档 https://pi.dev/docs/latest/session-format：
- 文件：`~/.pi/agent/sessions/--<cwd路径>--/<时间戳>_<uuid>.jsonl`，按 cwd 分组。
- 格式：JSONL 树（v3），首行 header（`cwd`、`parentSession`），条目含 `message`（user/assistant/toolResult/bashExecution/…）、`model_change`、`thinking_level_change`。
- 恢复：`SessionManager` 列出/继续；`--session <path>` / `--fork`；SDK `AgentSessionRuntime.switchSession`。
- `PI_CODING_AGENT_DIR` 环境变量可把配置/session 目录整体重定向到应用自己的目录（隔离、可随应用卸载清理）。

**模式**：每个演示文档一个工作目录 `documents/<uuid>/`（里面放 `index.html` + `session.jsonl` 所在），session sidecar JSON 记录 session 路径 → 重开应用即恢复。这正是 Claude Agent SDK 与 opencode 的既有实践（`~/.claude/projects/<encoded-cwd>/`；opencode `~/.local/share/opencode/storage/session`）。

## 5. 供应商 / 模型（对中国老师友好）

官方文档 https://pi.dev/docs/latest/providers：
- API Key 供应商约 30+：Anthropic、OpenAI、Google、**DeepSeek**、Kimi For Coding（`KIMI_API_KEY`）、MiniMax、Groq、xAI、OpenRouter、Hugging Face、Azure 等。
- 订阅 OAuth：Claude Pro/Max、ChatGPT Plus/Pro、GitHub Copilot、Gemini CLI。
- 本地：llama.cpp router（`/login llama.cpp`、`LLAMA_BASE_URL`）—— 可做完全离线。
- 模型选择：`session.setModel()` / CLI `--model <provider>/<model>`；thinking 级别 `--thinking off|minimal|low|medium|high|xhigh`。
- 认证存储 `~/.pi/agent/auth.json`；SDK 可用 `ModelRuntime.create({ authPath, modelsPath })` 指向应用自己的 auth 文件。

**应用层建议**：设置页让老师填 API Key（默认 DeepSeek，国内可访问、便宜），存到应用私有 auth.json；支持切换供应商。

## 6. 桌面应用架构建议

参考：Claude Agent SDK（https://code.claude.com/docs/en/agent-sdk/overview）、opencode serve（https://opencode.ai/docs/server/）、bolt.new（https://github.com/stackblitz/bolt.new）、open-artifacts（https://github.com/13point5/open-artifacts）、Cline webview 模式。

| 方案 | 选型 | 理由 |
|---|---|---|
| 外壳 | **Electron** | Pi SDK 是 Node/TS，单 JS 运行时零 sidecar；预览 pane 用 `<webview>`/iframe + `contextIsolation`。Tauri 更小（<10MB vs 80-150MB），但要 Rust 主进程 + Node sidecar 调 RPC，复杂度不值 |
| 嵌入 | **SDK 进程内** | 官方一等公民；事件流直接 `subscribe`；多文档 = 多 session 并存。RPC 子进程留作备选（进程崩溃隔离） |
| 预览 | webview 加载 `file://` 的 `index.html` | 文件变化自动刷新；沙箱化（nodeIntegration off） |
| 工作区 | `documents/<uuid>/` 每文档一目录 | session 按 cwd 落盘 → 天然一文档一 session；sidecar 记 session 路径 |
| 工具集 | v1 建议 `read,write,edit,grep,find,ls`（禁 bash） | 物理演示生成基本纯写文件，禁 bash 可绕开 Windows 需 bash 的坑，也降低安全面。若 skill 脚本依赖 bash 再评估 |
| 权限 | Pi 无内建沙箱（官方安全文档 https://pi.dev/docs/latest/security） | 工作目录 ACL + 受限工具集 + 可选的容器（Gondolin/Docker/OpenShell） |

## 7. 物理演示 HTML 生态参考（输出质量基准）

- **PhET**（phet.colorado.edu）：金标准，HTML5 + Scenery 渲染；sims 开源 GPL-3.0，但**商用课堂需付费 PhET Studio 授权** —— 参考其交互设计（拖动、滑杆、实时图表、重置），不要抄源码。
- 开源参考：matter-js（MIT 2D 物理引擎，canvas）、myPhysicsLab（Apache-2.0，~50 个单文件 HTML 仿真）、physics-sandbox、p5.js 系。
- 单文件约定（与 skill 输出一致）：**一个自包含 .html，内嵌 JS/CSS，无 CDN 依赖，Canvas 2D 渲染** —— Walter Fendt（57 个）、BU Duffy（214 个）均此形态。
- 国内：NOBOOK 虚拟实验室（HTML5，商业 SaaS）、国家中小学智慧教育平台（部属，浏览器内虚拟实验）。

## 8. 分发与安全

- Windows 安装：electron-builder NSIS 安装包 + `electron-updater` 自动更新（https://www.electron.build/docs/nsis/）。WebView2 在 Win11 预装。
- 安全：预览 pane 沙箱化；agent 无内建沙箱 → 受限工具 + 每文档工作目录；bash 命令若启用需用户确认（Pi 无权限弹窗，需扩展实现或干脆禁 bash）。
- **Windows bash 依赖**：Pi 官方要求 bash（Git Bash/Cygwin/MSYS2/WSL，https://pi.dev/docs/latest/windows）。v1 禁 bash 可规避；若要 bash，需随包捆绑 Git for Windows 或要求老师装。

## 9. 待决策 / 风险

1. **physics-skill-0807 未公开** —— 需用户授权把本地 skill 打包进应用；且其 SKILL.md 是否有 bash 脚本依赖未知（决定禁不禁 bash）。
2. Windows bash 依赖（见上）。
3. 模型成本与 Key：老师自带 Key（DeepSeek 默认）vs 应用统一账号。
4. 预览安全：生成的 HTML 是第三方代码，需沙箱预览（禁网络/禁 node）。

## 主要来源

- Pi 官方：https://pi.dev/docs/latest（SDK / rpc / json / skills / sessions / session-format / providers / settings / windows / security / containerization）
- Pi 仓库：https://github.com/earendil-works/pi · npm：https://www.npmjs.com/package/@earendil-works/pi-coding-agent
- 对比参照：https://code.claude.com/docs/en/agent-sdk/overview · https://opencode.ai/docs/server/ · https://v2.tauri.app/distribute/windows-installer/ · https://www.electron.build/docs/nsis/ · https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- 参考实现：https://github.com/stackblitz/bolt.new · https://github.com/13point5/open-artifacts · https://github.com/f-labs-io/agent-html-skills
- 物理演示：https://phet.colorado.edu/en/about · https://github.com/phetsims/scenery · https://www.myphysicslab.com/ · https://www.walter-fendt.de/html5/phen/ · https://physics.bu.edu/~duffy/HTML5/
