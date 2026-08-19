# 04 — check_demo 自检工具

**What to build:** agent 的唯一自定义工具（ADR-0003：自定义面最小化），替代 skill 原流程的 `node --check` 并提供运行时断言；生成后自动自检，失败自动修复重跑（不设上限），老师可随时停止。

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [x] check_demo 注册为 agent 的唯一自定义工具，返回结构化 `{ok, issues[]}`
- [x] 静态检查：末段 script 语法编译（取代 node --check）、`$('id')`↔id 交叉核对、骨架标记断言（有 startLoop/setupScene、无手写动画循环）
- [x] 运行时断言：沙箱加载无 console 错误、演示状态无 NaN/发散、画布非空白、支持 agent 传入自定义断言片段
- [x] 检查失败 → agent 自动修复并重跑；聊天区"停止"按钮可随时打断
- [x] 正常交付时 check_demo 通过

## Comments

实现于 commit d438ef9。验证记录：
- 单测 17（静态检查，含 9 个真实 demos 回归基准全过）+ 全量 35/35（含端到端：生成 → 静态检查通过）
- smoke-checkdemo 7/7（真实 demo 静态+运行时断言；uframe 的 Pm=Infinity 为合法哨兵 → warning）
- smoke-workspace / smoke-agent PASS
- **自检闭环双保险**：① check_demo 工具注册（模型可能主动调用，诊断确认过）；② 应用层自动兑底 —— agent_settled 后自动检查，失败注入修复指令循环，UI 显示结果
- 停止按钮可逃出自动修复循环（chat:abort 标记 stopped，停止注入；下次发送解除）
- 运行时断言：DemoChecker 复用隐藏沙箱窗口（串行队列防竞态、loadFile 超时+重试、probe 超时）
- code-review 修复：停止逃逸、并发竞态、三处重复检查逻辑（runChecks 统一）、措辞、双引号 id 支持、惰性 checker 实例化
