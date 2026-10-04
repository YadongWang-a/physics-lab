# 11 — 生成耗时分析（图片 → 演示 HTML）

**What to build:** 缩短"贴图 → 生成演示 HTML"的端到端耗时。当前实测：成功的图像流程 **639s（10.6 分钟）** 才写出 HTML，其中 98% 是主模型生成时间；`reasoning` 令牌占输出令牌的 87%~98%。

**Blocked by:** 03, 06

**Status:** needs-triage

## 实测数据（本机真实会话，`~/.pi-sessions/*.jsonl` 时间戳）

### 端到端分段（session `_new-1789788454058-5nnati` 回合 1：贴图 → 17.4KB HTML）

| 阶段 | 耗时 | 占比 |
| --- | --- | --- |
| 视觉模型 OCR（`extractImageText`，真实 API 实测） | ~2.4s | 0.4% |
| 第 1 步：`ls`×2 前的 53,891 reasoning 令牌 | 238.0s | 37% |
| 读 drawing.md / template-2d/3d / lib（约 7 步工具） | ~8.5s | 1% |
| 第 2 步：`grep` 返回 No matches 前的 39,587 reasoning 令牌 | 169.7s | 27% |
| `write` 17,433 字节（29,747 输出令牌，其中 reasoning 22,414） | 102.5s | 16% |
| 写后自读/`edit` 修正（7 步） | ~120s | 19% |
| 全部工具执行累计（全是本地 fs） | ~1s | 0.2% |
| settle 后自动自检（静态 + 隐藏窗口运行时，实测 1,365ms/991ms） | ~1.4s | 0.2% |

### 令牌结构

| 会话 | 回合 | 墙钟 | 输出令牌 | 其中 reasoning | 步数 |
| --- | --- | --- | --- | --- | --- |
| 半球倒立（首轮成功） | 1 | 946s（含用户阅读） | 151,687 | 139,860（92%） | 21 |
| 传送带（贴图） | 1 | 612s | 140,086 | 137,641（98%） | 18 |
| 半球倒立（整会话） | 4 | 12,259s | 210,545 | 187,222（89%） | 40 |

- 生成速率稳定 **230~290 输出令牌/秒**（85,594/370.9s、54,000/238.0s、39,674/169.7s、29,747/102.5s）→ **墙钟 ≈ 总输出令牌 ÷ 250**。慢的不是带宽，是令牌量。
- 真正的产物只占极小部分：`write` 那一步的非 reasoning 输出 **7,333 令牌**（17,433 字节 HTML），其余全是 thinking、探索与写后修正。

### reasoning 会被回灌成后续每一步的输入（复利成本）

`deepseek` 的 compat 带 `requiresReasoningContentOnAssistantMessages: true`，SDK 每次请求都带上历史 assistant 的 reasoning 内容：

| 步 | input | cacheRead | 上下文≈ | 本步 reasoning |
| --- | --- | --- | --- | --- |
| 1 | 446 | 5,504 | 5,950 | 85,466 |
| 2 | 191 | 91,392 | 91,583 | 25 |
| 8 | 1,553 | 108,416 | 109,969 | 36,428 |
| 9 | 181 | 146,560 | 146,741 | 24 |
| 20 | 155 | 192,384 | 192,539 | 3,624 |

即：第 1 步多想的 85k 令牌，会让后续每一步的上下文都多 85k；整会话 cacheRead 8.03M 令牌 / 40 步 ≈ 每步 200k。**早期 thinking 越猛，后面每步越慢。**

### 思考档位在 DeepSeek 上不可调

- 会话记录 `thinking_level_change: "high"`；`agent-runner.ts` 未传 `thinkingLevel` → SDK 默认 `medium`，而 `deepseek-v4-flash` 的 `thinkingLevelMap = {minimal:null, low:"low", medium:null, high:"high", max:"max"}`，`clampThinkingLevel` 向上取到 **high**。
- `openai-completions.js` 的 `thinkingFormat: "deepseek"` 分支只做两件事：有 reasoningEffort → `thinking:{type:"enabled"}`；没有 → `thinking:{type:"disabled"}`。deepseek compat 无 `supportsReasoningEffort`、无 `supportsThinkingTokenBudget` → **low/medium/high 发出的请求完全相同，唯一有效的开关是「开/关」**。
- 应用也未传 `options.maxTokens` → 不发 `max_tokens`，无法用输出上限约束思考长度。

## 可优化项（按实测收益排序，尚未实现）

**P1｜第 1 步是最大单步，先拆它。** 实测该步不是"跑 ls"而是"把整道题的推导 + 整个生成方案一次性在隐藏 thinking 里算完"：上下文仅 ~6k 令牌，却吐 54k（session A）/ 85k（session B）reasoning 令牌才发第一个工具调用，占该回合 37% / 61%。同一份推导随后被反复重算：

| 步 | thinking 字数 | 耗时 | 动作 | 物理符号命中 |
| --- | --- | --- | --- | --- |
| 1 | 184,099 | 238.0s | `ls,ls` | 3 |
| 2-7 | 41~222/步 | 1.2~2.4s/步 | 读文件/`grep` | 0 |
| 8 | 120,209 | 169.7s | `grep`（返回 No matches） | 4 |
| 9 | 62,698 | 102.6s | `write` | 4 |
| 10 | 15,621 | 23.5s | `read` | 4 |
| 11 | 14,484 | 22.2s | `edit` | 2 |

同一回合可见文本合计仅 2,666 字，隐藏 thinking 438,762 字（164 倍）；skill §3「推导先行且输出给用户…确认后再继续」的完成条件**没有执行**（第 1 步可见输出 91 字，全程未向用户展示推导、未等确认就写了文件，用户最后才自行核对「答案一致(AD)」）。session B 同样：步 1 = 276,629 字 thinking / 370.9s，步 8 = 103,148 字 / 156.6s。

改法：把推导从隐藏 thinking 搬到可见文本并**止于确认**——第 1 步只产出「假设清单 → 过程阶段划分 → 受力→方程→结论」（约 1~2k 字可见文本）后停轮等用户确认。收益：① 该步 54k~85k 隐藏令牌压到 ~1k；② 后续每一步上下文里是 1k 文本而非 85k 隐藏推理；③ 步 8/9/10 的重复推导（120k+63k+15k 字）大部分消失；④ 顺带修掉流程违规与返工风险。代价是一次用户交互——skill 本来就要求。

**P2｜预注入 skill 静态材料**：drawing.md 20KB、模板骨架 10~12KB、`lib/` API 索引进 system prompt。写文件前 11 步全是自己 `ls/find/grep/read` 摸 API，步 8 的 120k 字空想就混着"API 怎么用"（该 grep 返回 No matches，白花 169.7s）。

**P3｜后半段机械步可关思考**：步 2-7 每步仅 1~2s，本来就不贵；`thinkingLevel:'off'` 真正的用武之地是"不要下面的图表"这类纯修改回合（实测 19s）。注意 DeepSeek 上 low/medium/high 请求完全相同，只有开/关有效；关掉推导步的思考等于让它不推导，方向错。

**P4｜少步写全**：`write` 17.4KB 后又 `read`→`edit` 7 步修正（~120s），靠模板骨架预填压缩。

**P5｜模型/配置层**：机械回合换非思考模型；DeepSeek 上"低档思考"不可用（见上）。

**P6｜上下文治理**：单演示单会话累积到每步 200k（最长 1MB jsonl），可考虑回合级裁剪/新建会话。

## 已排除项（附数据）

- OCR 通道：~2.4s（108KB PNG 真实 API 往返），不是瓶颈。
- 自动自检：静态检查 <10ms；隐藏窗口运行时检查首次 1,365ms、复用窗口 991ms（含 800ms settle）。
- 工具执行：整回合 ~1s（全部本地 fs；无网络工具）。
- 渲染层/IPC：`projectChatEvent` 已把 IPC 从 O(n²) 降到 O(n)，text delta 120ms 合并；观测 evtRate 峰值 207/5s、堆 8~12MB 稳定，无卡顿迹象。

## 顺带发现（非性能，待确认）

目录外模型走 `customModel()` 兜底注册时元数据是保守写死的：`reasoning:false`、`input:['text']`、`contextWindow:128000`、`maxTokens:8192`。而 `deepseek-v4-flash` 真实目录值是 `contextWindow:1000000`。实时列表里的 `deepseek-flash` 不在 SDK 静态目录（目录只有 `deepseek-v4-flash`/`deepseek-v4-pro`），若把它设为主模型：① 不会启用思考；② `contextWindow` 按 128k 算，而实测上下文可达 192k → [INFERENCE] 可能触发自动压缩（一次额外的摘要 LLM 调用，分钟级）。输出侧无风险：`params.max_tokens` 只由 `options.maxTokens` 决定，应用未传。

`input:['text']` 这一条已在 ticket 06 的回归修复中改为按槽位显式声明。

---

## 优化方案（待批准，尚未实施）

**基线**（session A：贴图 + 半球题，成功流程）：639s 写出 HTML / 输出 151,687 令牌（reasoning 139,860 = 92%）/ 21 步 / 可见文本 2,666 字 / 上下文峰值 192,539。
**目标**（估算，需 A/B 实测）：≤300s、输出 ≤60k 令牌、步数 ≤10。
**验收方法**：同题（半球倒立 + 贴图）、同模型 A/B；用 `.pi-sessions/*.jsonl` 统计墙钟/步数/令牌/上下文峰值/可见文本比，外加"thinking 里物理符号命中的步数"（量化重复推导是否消失）。

### P5 度量护栏（先做，零 LLM 成本，服务后续 A/B）
回合结束打印统计行（墙钟、步数、输出/reasoning 令牌、上下文峰值、可见文本字数）——数据全在 session jsonl；把本次分析脚本落成 `scripts/session-stats.mjs`。

### P0 拆回合：推导变可见文本并止于确认（最大单项，估算 −250~350s）
依据：步 1 = 238s/54k reasoning（会话 B=370.9s/85k），可见输出仅 91 字；整回合可见 2,666 字 ↔ 隐藏 thinking 438,762 字（164 倍）；同一推导在步 8（120,209 字/169.7s）、步 9（62,698 字/102.6s）、步 10（15,621 字）反复重算；skill §3「推导先行且输出给用户…确认后再继续」未执行。
改法：
1. app 侧包装文本追加硬门：新会话收到题目后，本回合**只做** §1-§3，把「假设清单 → 过程阶段划分 → 受力→方程→结论」作为**可见文本**输出后**结束回合等确认**，不得同回合写文件；输入是"物理过程"或用户已确认时豁免，直接生成。
2. 生成回合明确"引用已确认的推导，不要重复推导"。
3. 护栏（可选，复用自动自检模式）：settled 后检查本会话是否输出过推导文本而工作目录已出现新 HTML → 记为流程违规。
风险：多一次用户点击（skill 本来就要求确认，属补齐流程）；豁免条件写错会让"直接生成"场景变啰嗦。

### P1 资源绑定与免校验（估算 −3.6s 往返 + 去掉 72.8k 字符源码读）
依据：步 1 `ls <skillDir>`、步 3 `ls <workspace>/lib`；skill §5 完成条件要求校验 lib，而应用那句"已预置且为最新版"没有解除它；历史 `e4b9529` 证明"注入确定路径 → 不再 find/ls"，`6e17806` 内嵌正文时删掉了"确认存在即可、不要读大文件"。
改法（只动 app 侧包装文本，不改 skill 正文——ADR-0003）：
- 把 template-2d/3d、drawing.md、lib 三件套**绑定到 `${skillDir}`**（现在只绑了 drawing.md）；
- 明确"工作目录 `lib/` 已预置为本 skill 版本：无需列目录 / 无需拷贝 / 无需读取校验"；
- 清单由 session 创建时 `readdir(skillDir)` 生成（防漂移）；路径保持运行时插值（ticket 08 打包后 `skillDir` 会变）。
约束：`test/agent-skill.test.ts` 的负向断言（不含 `find/ls`、不含"必须用 read 工具读取技能文件"）需保持。

### P2 唯一 API 来源 + 模板骨架内联（估算 −150~250s）
依据：步 2/4/5 读了 drawing.md 20KB + 模板 22.7KB + common.js 46,536+26,318 字符（drawing.md 自称"`lib/common.js` 是唯一真相源"，两边都读）；步 6/7/8 还在 grep common.css，步 8 那次返回 16 字符却花 169.7s。
改法：(a) 明确"绘制 API 只查 drawing.md §0/§2/§4/§6，`lib/common.js` 是实现、不要读"；(b) 把模板骨架与 drawing.md 索引内联进系统提示（约 +14k 常驻令牌，DeepSeek 前缀缓存后 cacheRead $0.0028/M）。
风险：常驻上下文 +14k，而峰值已到 192k；若触发自动压缩会反噬。

### P3 压缩写后修正（估算 −60~100s）
依据：`write` 后 7 步 read/edit（~120s）。改法：模板骨架内联让"只填 @slot"更可执行；check_demo 断言前置；修复循环设上限（现状"失败→修复→重跑"无上限）。

### P4 机械回合关思考（低优先，需设置项）
依据：DeepSeek 上 low/medium/high 请求完全相同，唯一开关 on/off；"不要下面的图表"回合 19s。改法：`createAgentSession({ thinkingLevel })` 暴露为设置（默认关，保守）。风险：回合类型不可靠判定。

### 不做 / 暂不做
OCR 2.4s、自动自检 1.4s、工具执行 ~1s、渲染层 IPC —— 实测非瓶颈；换模型属配置层，待 A/B 后评估。
**后续调研项**：剥离历史 reasoning（DeepSeek `requiresReasoningContentOnAssistantMessages` 要求回传）可让每步上下文 −60%，但请求装配权在 SDK（ADR-0003），需先做可行性实验。

**执行顺序**：P5 → P0 → P1 → P2(a) → P2(b) → P3 →（P4），每步各自 A/B。
