# Wayfinder map: 演示页布局 v2

Label: wayfinder:map

## Destination

一份定稿的「演示页布局 v2 规范」spec（`.scratch/demo-layout-v2/spec.md`）：画布高度、标准图表区、快捷键提示、控制条吸顶四项决定落成模板/lib 约定，并定下 testlab 存量 3 个 demo 的改造方式。spec 交付后由后续会话执行；今后生成的页面自动符合。

## Notes

- 领域：physics-lab 生成的中学物理演示页（template-2d/3d + lib/common.js 标准件）。工作会话先读 `resources/physics-lab-skill/`（SKILL.md、drawing.md、template-*.html）再动决定。
- 语言：中文输出，术语保留英文（如 tickets、lib、sticky）。
- 四项用户决定（已锁定，ticket 只做细化）：
  1. 画布高度 = 视口高 × ≈42%（现为 0.65，`fitCanvas`）
  2. 标准图表区 + 按题型选图，无图题型区隐藏
  3. 沿用现有键位（空格=运行/暂停、R=重置）+ 页面加快捷键提示
  4. `scene-actions` 控制条 sticky 吸顶（CSS position: sticky）
- 事实基线：lib 已有 `setupKeyboard`（空格/R）；chase 页有手写双栏图表（drawCharts）；`scene-actions` 在画布上方随页滚动。

## Decisions so far
- [01 · 标准图表区的技术形态](issues/01-chart-standard.md) — lib 标准件 `setupCharts` + 模板固定双栏容器；SKILL 只给「能画就画」原则，无图题型容器自动收起
- [02 · 存量 3 个 demo 的改造方式](issues/02-legacy-demo-migration.md) — agent 会话重生成；chase 图表迁移 setupCharts；验收 = 人工 + smoke 断言更新
- [03 · 汇总四项决定写 spec.md](issues/03-write-spec.md) — spec 定稿于 `.scratch/demo-layout-v2/spec.md`，四项改动点 + 存量改造 + 验收标准齐备
<!-- 一行一张已关票：标题为链接，gist 一句话 -->

## Not yet specified


<!-- 已毕业: 快捷键提示落点(spec 已定: 控制条小字 + 按钮 title);
     门禁方式(spec 已定: static-check no-charts-row warning 而非 smoke) -->
- sticky 吸顶与画笔层（pen-layer）、侧栏折叠 tab 的层叠/遮挡冲突排查
- 暂停停帧渲染（已修复的 startLoop 脏标记）与图表区补绘的配合（图表数据在暂停期改参数后需重绘）

## Out of scope

- app 聊天输入框卡顿的独立调查（另一条线，与本图无关）
- app 层全局快捷键（预览未聚焦也触发控制）——用户已明确选「沿用页面内键位」
- 标题栏 backdrop-filter 的 GPU 成本优化（播放态固有成本，另行处理）
