# 04 — check_demo 自检工具

**What to build:** agent 的唯一自定义工具（ADR-0003：自定义面最小化），替代 skill 原流程的 `node --check` 并提供运行时断言；生成后自动自检，失败自动修复重跑（不设上限），老师可随时停止。

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] check_demo 注册为 agent 的唯一自定义工具，返回结构化 `{ok, issues[]}`
- [ ] 静态检查：末段 script 语法编译（取代 node --check）、`$('id')`↔id 交叉核对、骨架标记断言（有 startLoop/setupScene、无手写动画循环）
- [ ] 运行时断言：沙箱加载无 console 错误、演示状态无 NaN/发散、画布非空白、支持 agent 传入自定义断言片段（如能量守恒漂移）
- [ ] 检查失败 → agent 自动修复并重跑；聊天区"停止"按钮可随时打断
- [ ] 正常交付时 check_demo 通过

## Comments
