# 09 — 质量门：样本题集集成测试

**What to build:** 在用户选定的测试 seam（Pi SDK 调用层）建立自动化测试：check_demo 静态检查纯函数单测（无 Electron、无 Key）+ 样本题集集成测试（真实 Key、环境变量门控），作为发布前质量门。

**Blocked by:** 04, 06

**Status:** ready-for-agent

- [ ] check_demo 静态检查纯函数单测（script 语法编译、ID 交叉核对、骨架标记断言），无 Electron、无 Key 可跑
- [ ] SDK 层集成测试（真实 Key、环境变量门控，不进默认 CI）：样本题集（题目+答案 / 题目无答案 / 物理过程 / 附图）各至少一例 → 完整生成 → check_demo 通过
- [ ] 测试只断言外部行为（HTML 生成、检查通过、事件流完整、会话可恢复），不测实现细节
- [ ] 测试脚手架与先例确立，后续 ticket 沿用

## Comments
