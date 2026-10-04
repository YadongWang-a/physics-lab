# 主模型思考档位固定 low（不跟随 SDK 默认 high）

`createPhysicsSession` 显式传 `thinkingLevel: DEFAULT_THINKING_LEVEL`（`'low'`，`agent-runner.ts`），不再沿用 Pi SDK 的默认档位 `high`。

起因是一次性能诊断（2026-10-03）：生成一轮 5–22 分钟，工具只占 0.0–2.8s，时间全在模型侧。用会话 trace（`.pi-sessions/*.jsonl` 带 `timestamp` + `usage`）逐请求归因，得到两个独立病灶：

1. **请求流静默挂死**：单条请求 0 token 静默 324.6–818.3s，被 SDK 空闲超时（`DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000`）判死报 `terminated`；`terminated` 在 SDK 可重试清单内，agent 层自动重试（maxRetries 3、baseDelayMs 2000 指数）→ 单轮白等 330.7s / 818.3s / 833.5s。证据：挂起后**同一条请求重试 26.8s 就成功**，说明那 5–13 分钟连接已死，不是在思考。
2. **单请求输出量巨大**：单请求 30k–86k 输出 token（推理占 96%+，如 `write` 出 62,147 / 推理 59,884 → 246s；`ls` 出 72,419 / 推理 72,356 → 313.5s），按 ~230 tok/s 折算即 2–6 分钟一次。

**Status**: accepted

**Considered Options**:
- **沿用 SDK 默认 high** —— 否决：同题 A/B（"小球从 5m 高处自由落体"，同一提示词、同日）：high 467.9s / 22 请求（含一次 324.6s `terminated`）vs low 135.3s / 13 请求
- **medium** —— 不可选：`deepseek-v4-flash` 的 `thinkingLevelMap` 里 medium 为 `null`（不支持），可选档只有 low / high / max
- **minimal** —— 未取：更省，但推理能力退化风险更大且未测
- **降低 HTTP 空闲超时（300s → 90s）** —— 未否决，**仍未采纳**：与本次改动正交，可直接把"白等 5 分钟"压到 ≤90s；本轮只按用户选择动了档位
- **限定每请求思考 token 预算** —— 不可行：SDK 的 `thinkingBudgets` 只被 anthropic / bedrock 两条通道消费，DeepSeek 的 `openai-completions` 通道不读它

**Consequences**:
- **本次改动不是根治**。同题 A/B 的收益主要来自"挂起次数减少"；在真题上 low 挡不住推理爆量：传送带选择题（用户真实题面）在 low 档下首个请求仍 **223.3s / 出 48,375 tok（其中推理 48,288）**，且该轮随后再次出现 ≥2.5 分钟静默 → **静默挂死不是 high 独有**，档位只影响其频率。
- 真正的成本仍由"单请求推理/输出体量"决定；要动它需从提示词侧减少单次推理负担（或换模型），或从传输侧缩短白等（空闲超时），见上"未采纳"项。
- 引入的显式默认值使档位成为一处可回退的常量（`DEFAULT_THINKING_LEVEL`）：若出现"推导质量下降"类回归，改这一个常量即可回退到 high。
- 代价未量化：low 对推导严谨度的影响没有在真题上做过 A/B（本轮只测了时长与 token），属**已知未验证风险**。
- 诊断方法可复现：`.scratch/perf/timeline.mjs <session.jsonl>`（读真实会话 trace 归因到"模型请求 / 工具执行 / 用户等待"）。该脚本是临时诊断工具，不是产品代码。
