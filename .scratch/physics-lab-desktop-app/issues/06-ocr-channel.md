# 06 — OCR 图片通道

**What to build:** 老师粘贴/选择题目照片后按能力路由：主模型支持视觉则图片直通会话；主模型不支持视觉且配置了视觉模型则先经视觉模型提取文本/公式再进入会话；仅单 Key 且不支持视觉则明确提示不可用。

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [x] 聊天输入支持粘贴/选择图片
- [x] 主模型支持视觉 → 图片直通会话（agent 可看图）
- [x] 主模型文本 + 已配置视觉模型 → 图片经视觉模型转文本/公式进对话，能据此生成演示
- [x] 仅单 Key 且不支持视觉 → 明确提示"当前无法识别图片"，不静默失败
- [x] 路由过程对老师透明（聊天中可见处理说明）

## Comments

实现于 commit 576d450。验证记录：
- 单测 49/49（vision-route 4 例：直通/转文本/不可用/空 input）
- smoke-ocr PASS：minimax-m3（opencode-go 目录视觉模型）真实走 extractImageText 管道（认证/图片注入/文本返回）
- smoke-workspace 含贴图占位符断言 PASS
- 技术点：直通用 SDK 原生 `PromptOptions.images`（ImageContent，pi-ai 类型）；转文本用独立 ModelRuntime + 视觉槽位运行时注入（不写 auth.json）；注入文本标注「【题目图片内容（视觉模型识别）】」保证 agent 明确图片来源
- 路由判定基于 `Model.input`（模型目录能力声明），非猜测
