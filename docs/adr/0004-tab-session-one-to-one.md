# ADR 0004: 标签页与 Pi Agent Session 1:1

**日期**: 2026-07-31
**状态**: 已接受

## 背景

用户的模型是「一个物理题 = 一个 HTML 文件 = 一个对话上下文」。需要决定标签页（Tab）和 Pi Agent Session 的映射关系。

## 选项

### A. 一对一（推荐）

每个标签页创建一个独立的 `AgentSession`，关标签页时 session 保留（Pi Agent SDK 自动持久化）。重新打开同一 HTML 时恢复对话历史。Session 落到 `<工作目录>/.pi/agent/sessions/`（见下"决策"），工作目录自洽可移植。

### B. 一个 Session 管理所有标签页

单一 Agent session，根据活跃标签页切换上下文。

- 优势：节省资源
- 劣势：上下文混乱，不同物理题的对话会互相污染

## 决策

**选 A — 一对一。**

理由：
1. 简单直接，标签页生命周期清晰
2. 不同物理题的对话天然隔离，不会互相污染
3. Pi Agent SDK 原生支持多 session 和自动持久化
4. 重新打开 HTML 时恢复历史对话，支持跨天迭代

## 决策细节：Session 持久化位置

`createAgentSession({ agentDir: <工作目录>/.pi/agent, ... })` —— Session 落到 `<工作目录>/.pi/agent/sessions/`，工作目录自洽可移植（HTML + `lib/` + examples + `.pi/agent/sessions` 一起拷走，对话历史不丢）。

LLM 鉴权与 `agentDir` 解耦：`ModelRuntime` + 启动时 `setRuntimeApiKey(provider, key)` 注入应用 safeStorage 里的密钥（全局、加密、不落 `agentDir`），`model` 用参数显式传——API Key 不进工作目录，不会每开一个工作目录就要重配。

## 影响

- 多个标签页同时存在 = 多个 session 同时占用内存
- 需要限制并发 Agent 运行数（防止 API 配额耗尽）
- 标签页关闭不等于 session 销毁——用户可手动删除不需要的 session
- `~/.pi/agent/`（SDK 默认）不再使用；session 归工作目录，全局只留 LLM 鉴权（safeStorage）
