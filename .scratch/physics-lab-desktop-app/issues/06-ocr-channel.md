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

回归修复（老师实测：贴图后主模型收到「图片未提供，无法转述。」）：
- 现象：视觉槽位选 `deepseek/deepseek-v4-flash-vision-exp`（实时列表/手填的 exp 模型，不在 pi-ai 静态目录 deepseek 条目里：目录只有 `deepseek-v4-flash`、`deepseek-v4-pro`，均 text-only）→ `applySlotToRuntime` 走兜底注册，`customModel()` 把输入模态写死 `['text']` → pi-ai `transform-messages.downgradeUnsupportedImages` 把请求里的 image block 换成 `(image omitted: model does not support images)` → 视觉模型只看到占位符，回「图片未提供，无法转述。」→ 非空校验放行，这句废话被当作「题目图片内容」注入主模型。
- 复现证据（一次性探针，真实 Key + 真实 API，修复前）：`model.input = ["text"]`、`extract output >>> 图片未提供，无法转述。`
- 修复：`applySlotToRuntime(runtime, slot, { input })` / `customModel(id, input)` 允许声明输入模态；`extractImageText` 显式声明 `['text','image']`，并断言解析到的模型确实含 image（目录内 text-only 模型被误设为视觉槽位时报「视觉模型不支持图片输入」，而不是静默降级）。原始默认值仍为 `['text']`（目录外主模型能力未知，图片直发纯文本模型会 400）。
- 修复后同一探针：模型逐字转述测试图片（题干/数值/两问全部正确）。
- 回归测试：`provider-models.test.ts`（目录外兜底注册声明 image 后可收图）+ `provider-config.test.ts`（customModel 可声明 image）。判别力已验证：去掉声明则该断言失败（`expected [ 'text' ] to include 'image'`）。
- 已知边界：目录外（实时列表/手填）模型若被设为**主**模型，能力仍按保守 `['text']` 处理 → 图片走 OCR 通道而非直通；未配置视觉槽位时才提示「当前无法识别图片」。实时 `/models` 只回 `{id, object, owned_by}`，拿不到模态元数据。


## Comments

**2026-10-07：转述契约修订——不止 OCR，要把原图描述出来**

起因（老师提问）：extract 路上视觉模型的输出是主模型**唯一**能拿到的题图信息（实测：进入会话的用户消息 437 字，其中 **415 字是转述**，会话里 `image` 块 **0** 个），而旧 prompt 只要"题目文字、已知条件、数字、公式、几何关系、装置结构"，**没有要求描述视角与三维/二维**——于是"图是从哪个方向看的""三维还是平面示意""哪条线是竖直方向"这类信息全靠运气。

改动两处：

1. `vision-extract.EXTRACT_PROMPT` 重写为**四节契约**：`【题目文字】/【图形描述】/【已知与符号】/【不确定与冲突】`。其中【图形描述】强制逐项写：
   - **图形类型**：平面示意图 / 立体(轴测)图 / 实物照片 / 多视图(主视·俯视·侧视)
   - **视角**：俯视 / 正视 / 侧视 / 斜视；**画面里哪条线是竖直方向**；深度方向怎么表达
   - **位置关系**：逐个元素谁在谁的上下左右、谁与谁连接/接触/约束（绳杆弹簧轨道支撑面支点场铰链）+ 初始状态（松弛/绷直、有无间隙）
   - **三维信息**：三维还是二维；竖直方向与水平面各是哪条线；物体/场/面的朝向
   - **标注与符号**：字母、箭头、角度、刻度、虚线各指向哪个元素
2. `index.ts` 注入前缀补一句：**「原图未进入本会话：图形类型、视角、位置关系一律以本节转述为准；标为「不确定」或「冲突」的项若影响解题，先向用户问清，不要猜」**——主模型此前不知道自己看不到原图。

【不确定与冲突】一节直接针对实测过的病灶：第 15 题转述里同时出现「I 区磁场垂直纸面向外」与标注「×」，主模型看不到图，只能在隐藏思考里反复猜（thinking 原话 `I区磁场垂直纸面向外，标注"×" — contradictory but let's take:`）。新契约要求**两个都如实写出并标「冲突」**，不许自行取舍。

验收：`test/vision-route.test.ts` 新增 3 例文本契约（四节结构、图形描述五项、不确定/冲突与"不做物理分析"）；`npm run typecheck`。
**未做真机图片验证**：本机 shell 无 DEEPSEEK_API_KEY（应用内的 Key 是加密存储），所以没有跑真实图片过一遍新 prompt——需在应用里贴一张题图，再比对转述输出。

**2026-10-07（续）：与原图保真的机制——题图落盘 + `read_image` 回看**

转述契约（四节，见上条）解决"该描述什么"，本条解决"描述可疑时怎么办"：

- **题图落盘**：extract 前把原图写进 `<工作目录>/.pi-sessions/attachments/<会话键>-<n>.<ext>`（`image-attachments.saveChatImages`，未知 mime 落 `.bin`；会话键里的分隔符被替换，不逃逸目录）。
- **`read_image` 工具**（ADR-0003 修订）：就转述里「不确定/冲突」的那一点定向追问视觉模型（一次一件事），只允许读附件目录内的图片。
- **注入文本**带上附件路径与规则：*原图未进入本会话（已存: …）……本节标为「不确定」或「冲突」的项若影响解题，先用 `read_image` 就那一点定向追问，仍不清再问用户*。
- 提示词 §2 增一条同义规则；未配置视觉槽位时 `read_image` 返回明确文案。

验收：`read-image.test.ts`（越界/不存在/非图片三种拒绝）、`image-attachments.test.ts`（扩展名与字节保真、键不逃逸）、`vision-route.test.ts`（四节契约）——合计 32 passed；`npm run typecheck` 通过。
未做真机验证：本机 shell 无 Key，`read_image` 的真实视觉调用未跑（需在应用里贴图 → 触发一次回看）。
