# ADR 0010: System prompt 应用内联，不写 AGENTS.md 到工作目录

**日期**: 2026-08-01
**状态**: 已接受

## 背景

[ADR 0002](./0002-few-shot-on-demand.md) 要求 system prompt 含示例目录索引；另有 Agent 输出结构（【问题理解】→【解答】→【演示生成】→✅）、浅色唯一（[ADR 0006](./0006-light-theme-only.md)）、演示模式监听器 + E3（[ADR 0007](./0007-present-mode.md)）等约定要喂给 agent。需决定这些放哪。Pi SDK 的 DefaultResourceLoader 会从 `cwd` 向上发现 `AGENTS.md` 作为上下文文件。

## 选项

### A. 应用内联字符串，经 DefaultResourceLoader 的 systemPromptOverride 传入（推荐）

约定作为应用源码里的字符串，构造 `new DefaultResourceLoader({ systemPromptOverride: () => SYSTEM_PROMPT, ... })` 再传 `createAgentSession({ resourceLoader })`（SDK 无 createAgentSession 级 systemPrompt 选项，系统提示走 ResourceLoader）。示例目录索引写死其中（ball-spring/arc-projectile/isochronous-circle/incline-baffle + 各自一句话描述），agent 用 `read` 工具按需读工作目录里的示例文件。

### B. AGENTS.md 复制到工作目录，靠 DefaultResourceLoader 发现

约定写成 `AGENTS.md` 随 `lib/`/examples 一起复制到工作目录。

- 优势：约定随工作目录走、可移植可编辑
- 劣势：老师可能误改；目录索引与实际文件易不同步

## 决策

**选 A —— 应用内联 systemPrompt。**

## 影响

- 约定随应用版本走、不可被工作目录误改
- 工作目录**不放** `AGENTS.md`（只放 HTML + `lib/` + examples + `.pi/agent/sessions`）
- system prompt 内容由应用维护；示例目录索引若新增示例需同步更新 prompt
