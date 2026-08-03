# ADR 0011: 校验拦截式写入工具（write_demo / edit_demo / validate_demo）

**日期**: 2026-08-03
**状态**: 已接受（取代 [ADR 0009](./0009-agent-tools-no-sandbox.md) 的工具列表部分）

## 背景

pi-agent-test 参考项目（CLI）验证过一个关键结论：**Pi SDK 的内置 `write`/`edit` 工具无法按路径限制**，靠 system prompt 软约束（"只写目标文件"）不足以防止 agent 乱写乱命名。参考项目因此砍掉内置写工具，把写入权收敛到自定义工具 `write_demo`（写入前主进程校验，不合规直接拦截回传原因）。

本应用原本沿用内置 `read/write/edit/ls/find/grep`（ADR 0009），无任何写入拦截。决定按参考项目移植，并保留局部编辑能力（有意偏离参考项目的"只整文件写"）。

## 选项

### A. 三个自定义工具，全部过主进程校验（推荐）

- `write_demo(name, content)` — 整文件写，写入前校验
- `edit_demo(old_text, new_text)` — 局部修改目标文件（old_text 首次出现处替换），**对修改后的完整文件跑同一套校验**
- `validate_demo(name, content)` — 写前自检，不写盘

白名单：`read / grep / find / ls + write_demo + edit_demo + validate_demo`（无 bash）。

校验内容分两级：
- **硬错误（拦截）**：命名（kebab-case）、作用域（已绑定只写目标文件/改名走新名路径）、结构（DOCTYPE / demo-mode meta / lib 引用 / canvas / 配对）、app 功能依赖（`physics-demo` 标记、演示模式监听器）、**内联 JS 语法（node --check）**——语法错误是唯一能让 Preview 白屏的失败，参考项目只在独立脚本里查，本应用没有"人工跑脚本"这层，故并入拦截（有意加严）
- **非阻塞警告**（随工具结果回显，不拦截）：浅色唯一违规（`[data-theme]`/`themeBtn`）、形态要素（静态含动画 / 动态缺 run/startAnimation/setupKeyboard）

### B. 只做结构校验（严格对齐参考）

语法/形态/浅色都不拦。缺点：语法错误会让 Preview 直接白屏，且本应用无 verify-demo 兜底层。

## 决策

**选 A。** 三工具共用一个纯逻辑校验模块 `src/demo-write.js`（移植自参考 `cli/core.mjs`，零 SDK 依赖，是测试接缝，vitest 覆盖全部分支），外加 app 专属硬校验与语法检查。

## 影响

- 工具集变更：`write`/`edit` 不再可用（ADR 0009 的工具列表被取代；"禁 bash、无路径隔离"的取舍不变）
- agent 每轮可能整文件重写（write_demo）或局部修改（edit_demo），两者都过同一校验
- 校验规则演进 = 改 `demo-write.js` + 测试，不动 agent 接线
- 备份机制（每轮写前快照 10 版）作为安全网保留，undo 命令暂不提供（数据已在，命令未来可加）
- thinking 展示策略（前 120 字 teaser，完毕移除）为 UI 细节，不单开 ADR，记录于 `renderer/chat.js` 注释
