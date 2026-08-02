# ADR 0009: Agent 工具集与沙箱取舍（无内置沙箱，接受逃逸风险）

**日期**: 2026-08-01
**状态**: 已接受

## 背景

需决定 agent 用哪些工具、是否把文件操作严格限制在工作目录。Pi SDK 文档明确：**"Pi does not include a built-in sandbox. Built-in tools can read files, write files, edit files, and run shell commands with the permissions of the pi process."** 内置 `read`/`write`/`edit` 用进程（=用户账号）权限，不限制在 `cwd`，`../` 与绝对路径越界都不拦。

## 选项

### A. 内置工具、不隔离（J2，推荐-取舍）

启用 SDK 内置 `read`/`write`/`edit`/`glob`，**禁用 `bash`**；Preview 由主进程 `fs.watch` 监听当前演示文件自动刷新 iframe，不做工具。接受无路径隔离——agent 能读写用户账号下任意文件。

### B. 自定义 read_file/write_file/edit_file + 严格路径校验（J1）

`defineTool` 自定义文件工具，内部解析真实路径（含 symlink）、确认落工作目录内、否则拒；不启用任何内置文件工具与 bash。轻量且严格，但文件 IO 自己写。

### C. 容器化整个 agent 进程

VM/容器/微 VM。最严格但基础设施重，对给老师装的桌面应用过度。

## 决策

**选 A —— 内置工具、不隔离、禁 bash、fs.watch 预览。**

理由：SDK 内置文件工具是其看家本事、久经考验；禁 `bash` 去掉"跑任意命令"的最大风险面；`fs.watch` 比自定义 `preview` 工具更即时且少一个工具。严格隔离（B/C）在 G1 阶段判定不值得。

## 影响（含已接受的风险）

- **已接受风险**：agent 由 LLM 驱动，若老师粘贴的物理题夹 prompt-injection，理论上可能诱导其动工作目录外文件。低概率、非零——此为知情取舍
- `CONTEXT.md` / `CLAUDE.md` 原"P0 工具 read_file/write_file/preview"**作废**，改为本文档约定
- 将来若要严格隔离，回退到 B（自定义工具 + 路径校验）成本可控；本 ADR 记录此取舍，避免后续不知情者误"修复"
