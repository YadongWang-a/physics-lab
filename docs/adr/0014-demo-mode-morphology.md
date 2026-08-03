# ADR 0014: 静态/动态双形态（demo-mode）

**日期**: 2026-08-03
**状态**: 已接受

## 背景

参考项目 pi-agent-test 在生成实践中发现：**不是所有物理题都该做成动画**。平衡、受力分析、几何关系类题目强行加时间轴，既难做又违和。参考项目因此引入双形态判定，并验证成熟：

- **动态演示**：时间演化类（运动、过程）→ 运行/暂停/重置 + 动画
- **静态演示**：平衡/受力/几何类 → **无时间轴**，参数驱动即时重绘（拖滑块 → 画布立即更新），不加运行/动画

形态是**内容层决策**（agent 按题目判定），但需要在**校验层**落地才有约束力。

## 决策

- 每个演示 `<head>` 必须声明 `<meta name="demo-mode" content="dynamic|static">`——缺声明是**硬错误**（写入拦截）
- 形态专属元素检查为**非阻塞警告**（与浅色违规同策略，ADR 0011）：静态含动画元素（startAnimation/setupKeyboard/#run）→ 警告；动态缺 run/startAnimation/setupKeyboard → 警告
- CONVENTIONS.md（ADR 0012）§0/§3/§4 完整描述两种形态的写作约定与自检清单（⑧ 动静判定说明，回复开头必须报告）
- **4 个现有示例迁移**：全部补 `<meta name="demo-mode" content="dynamic">`（它们都是动态演示），并顺带补上演示模式监听器（ADR 0007）——示例是 agent 的 few-shot 模板（ADR 0002），模板不合规会教坏 agent
- vitest 回归断言：4 个示例全部通过结构校验且为 dynamic

## 影响

- agent 生成的演示具备形态声明，app 侧后续可按形态差异化展示（文件树徽标等，暂不做）
- 示例迁移意味着 `lib/` 之外 4 个 HTML 也要随版本刷新（`setupWorkdir` 已是"始终覆盖"）
- 校验模块 `demo-write.js` 的 `demoModeOf`/`appWarnings` 承担形态检查
