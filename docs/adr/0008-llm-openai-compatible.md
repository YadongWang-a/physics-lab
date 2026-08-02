# ADR 0008: LLM 接入 — OpenAI 兼容 endpoint，运行时 provider extension

**日期**: 2026-08-01
**状态**: 已接受

## 背景

应用要连 LLM 生成演示。目标用户在国内，常用 OpenAI 兼容 endpoint（代理、DeepSeek 等）。Pi SDK 默认鉴权与模型定义走 `~/.pi/agent/auth.json` + `models.json`。需决定怎么把用户的 endpoint/密钥/模型喂给 SDK，以及这套配置存哪。

## 选项

### A. 运行时 provider extension（推荐）

`createAgentSession` 内联传 `extensionFactories`，调 `pi.registerProvider(createProvider({ baseUrl, api: openAICompletionsApi(), models:[{id, contextWindow, maxTokens}], auth:{ apiKey:{ resolve: async () => ({ auth:{ apiKey } }) } } }))`（`createProvider`/`openAICompletionsApi` 来自 `@earendil-works/pi-ai`）。baseUrl/模型名/密钥从应用 safeStorage 取，经 `resolve` 运行时注入，不落盘。

### B. models.json 落 agentDir

把 provider/模型写进 `<agentDir>/models.json`。坏处：agentDir=工作目录，配置就变每工作目录一份，与"LLM 配置全局"冲突。

### C. 官方 provider

直连 Anthropic/OpenAI 官方。国内网络/合规不一定通，且用户明确要"提供 URL + key"的自定义 endpoint。

## 决策

**选 A —— 运行时 provider extension。**

## 影响

- 首启配置表单 = 三项：**base URL + API key + 模型名**，存 Electron `safeStorage`（加密）
- 不写 `models.json`；`agentDir` 只管 session/资源，不背鉴权（与 [ADR 0004](./0004-tab-session-one-to-one.md) 的解耦一致）
- 模型名通过 `createAgentSession({ model })` 显式选定
- 切换 provider/endpoint 改 safeStorage 重启即可，不碰工作目录
