# 05 — 设置页：双槽位 Key

**What to build:** 老师图形化配置主模型与视觉模型（各可独立配置供应商/模型/Key/自定义 OpenAI 兼容端点，可单可双）；Key 系统加密存储；保存后会话使用新配置。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 主模型 + 视觉模型各自独立配置槽位；支持自定义 OpenAI 兼容端点（baseURL + 模型名 + Key）
- [ ] Key 经系统加密存储（Windows DPAPI），明文不落盘
- [ ] 模型列表动态获取；保存后新会话使用新配置
- [ ] 未配置 Key 时启动给出明确引导（如何申请/填写）

## Comments
