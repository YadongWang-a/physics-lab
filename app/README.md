# physics-lab 桌面应用（G1 walking skeleton）

Electron + Pi Agent SDK（`@earendil-works/pi-coding-agent`）。AI 驱动的物理演示生成器。
当前为 G1：单 Chat + 单 Preview + 标签页，无文件树。架构决定见 `../docs/adr/0001`–`0014` 与 `../CONTEXT.md`。

## 运行

```bash
cd app
# 国内：Electron 二进制走镜像（直连 github 可能超时）
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
npm start
```

首次启动弹配置：填 **Base URL / API Key / 模型名**（OpenAI 兼容 endpoint），选工作目录。
之后输入物理题，Agent 流式输出【问题理解】→【解答】→【演示生成】，写出 HTML 到工作目录，右侧 Preview 自动加载（`fs.watch`）。

## 文件

```
app/
├── package.json
├── src/
│   ├── main.js          # Electron 主进程 + IPC + fs.watch
│   ├── preload.js       # contextBridge 安全 API
│   ├── agent.js         # createAgentSession 接线（provider extension / 工具 / 流式）
│   ├── system-prompt.js # 内联 system prompt（ADR 0010）
│   ├── llm-config.js    # safeStorage 加密的 LLM 配置（ADR 0008）
│   └── workdir.js       # 工作目录选择 + 复制 lib/examples
└── renderer/
    ├── index.html
    ├── app.js
    └── styles.css
```

静态资源（`lib/` 与 4 个示例 `*.html`）在仓库根（`app/` 上级），首次使用时复制到工作目录。

## 已知待验证点（G1 盲写，跑起来按报错迭代）

1. **provider 注册后 model 选取**：`agent.js` 不传 `model`，让 session 取 first-available（仅 `app-openai` 配了 key，应只有它可用）。若启动报"无可用模型"，改为显式 `modelRuntime.getModel('app-openai', llm.model)` 再 `session.setModel(...)`。
2. **modelRuntime 与扩展注册表是否共享**：`ModelRuntime.create()` 默认读 `~/.pi/agent`，而 provider 经 extension factory 注册；两者是否互通需实跑确认。
3. **流式事件形状**：`main.js` 按 `event.type==='message_update' && event.assistantMessageEvent.type==='text_delta'` 取增量、`turn_end` 取结束，依据 SDK 文档。若事件字段名不符，调整 `main.js` 的 subscribe。
4. **工具名**：`read/write/edit/ls/find/grep`（无 `glob`，禁 `bash`）——已对照 `.d.ts` 工具常量确认。

跑出问题把报错贴回来，照 `../docs/adr/` 对应 ADR 改。
