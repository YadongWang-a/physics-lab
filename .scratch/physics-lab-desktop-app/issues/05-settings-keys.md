# 05 — 设置页：双槽位 Key

**What to build:** 老师图形化配置主模型与视觉模型（各可独立配置供应商/模型/Key/自定义 OpenAI 兼容端点，可单可双）；Key 系统加密存储；保存后会话使用新配置。

**Blocked by:** 01

**Status:** ready-for-agent

- [x] 主模型 + 视觉模型各自独立配置槽位；支持自定义 OpenAI 兼容端点（baseURL + 模型名 + Key）
- [x] Key 经系统加密存储（Windows DPAPI），明文不落盘
- [x] 模型列表动态获取；保存后新会话使用新配置
- [x] 未配置 Key 时启动给出明确引导（如何申请/填写）

## Comments

实现于 commit（ticket 05）。验证记录：
- 单测 44/44：SettingsStore 加密存取 5 例（明文不落盘/往返/解密失败降级/无 Key 不写/损坏容错）、provider-config 3 例、mainSlot 端到端（真实 Key：assistant provider 断言 = 槽位供应商）
- smoke-settings 3/3：加密往返 ✓、opencode-go 模型列表 19 个 ✓、真实 Key 最小 complete OK ✓
- smoke-workspace 扩展：设置弹窗渲染（双槽位表单 + 测试按钮）✓；smoke-agent PASS
- 安全边界：明文 Key 只在主进程内存（会话创建/测试时），渲染层只收 hasApiKey 状态；settings.json 仅 apiKeyEnc（DPAPI）
- 配置生效：保存 → releaseAll（旧会话释放）→ 下次消息按新配置重建会话，历史从磁盘恢复；设置保存广播 settings:changed
- 自定义端点：ProviderConfigInput 注册（baseUrl + 协议 + 模型目录），setRuntimeApiKey 运行时注入（不写 auth.json）
