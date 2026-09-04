# 演示页布局 v2 · spec

状态：定稿（wayfinder 地图 `.scratch/demo-layout-v2/map.md` 产出，决定详情见 01/02/03 tickets）
执行者：后续会话；动手前先读 `resources/physics-lab-skill/`（SKILL.md、drawing.md、template-2d.html、template-3d.html、lib/common.js、lib/common.css）。

## 目标

四项布局/交互调整落成模板与 lib 约定（今后生成的页面自动符合），并改造 testlab 存量 3 个 demo。

## 决定（已锁定）

### 1. 画布高度：视口高 × ≈42%

- 现状：`fitCanvas`（lib/common.js）`h = max(c._baseH, window.innerHeight * 0.65)`，1080p 屏画布 ≈700px，过高。
- 改动：系数 0.65 → 0.42；模板里画布 `height` 属性基准（baseH）同步下调，保证小屏不再被 baseH 顶到过高。
- 涉及：lib/common.js `fitCanvas`；template-2d/3d.html 画布 height 属性；SKILL/drawing.md 中高度描述。

### 2. 标准图表区：lib 标准件 `setupCharts(parent, defs)`

- 模板在画布正下方预留固定双栏容器（`.charts-row`：两张 canvas 并排，窄屏 CSS 堆叠）。
- 页面 @slot 只写图定义交给 `setupCharts`（坐标轴/网格/曲线绘制由标准件统一，含高 DPI 适配）；chase 页手写 drawCharts 迁移到标准件。
- SKILL 指南**只给原则**：「能画时间曲线/关系曲线就画」（运动学 x-t/v-t、能量 Ep/Ek、电路 i-t 等由 agent 按题型自判，不写映射表）。
- 无合适图的题型**不调 `setupCharts`**：容器为空时自动收起（CSS `:empty` 塌缩），不留白。
- 实现注意：`:empty` 塌缩须兼容 fitCanvas/resize 路径（0 尺寸画布不报错）；与 startLoop「暂停停帧」配合——图表重绘走页面 `render()` 调用链，暂停期改参数由页面显式 render 补绘（既有约定，见 common.js startLoop 注释）。

### 3. 快捷键：沿用现有键位 + 显性化提示

- 键位不变：空格 = 运行/暂停，R = 重置（`setupKeyboard` 已内置）。
- 提示落点：`scene-actions` 控制条右侧加小字提示「空格 运行/暂停 · R 重置」（或等效样式）；run/reset 按钮 title 同步补快捷键说明。
- 验收时实测：webview 聚焦下空格/R 生效。

### 4. 控制条 sticky 吸顶

- `scene-actions` 改 `position: sticky; top: 0`（配合页内滚动容器），滚过画布后控制条钉在视口顶部。
- 风险排查（实现时验证）：与画笔层 pen-layer、侧栏折叠 `.side-tabs` 的层叠/遮挡；吸顶后与 MathJax 弹层 `.mpop` 的 z-index 关系。

## 存量改造（3 个 demo）

- 方式：**agent 会话重生成/修改**——在 app 中对 chase-catch-up / free-fall-5m / elastic-collision-1-2 的既有会话发修改要求，端到端检验新约定（需模型 Key）。
- chase 手写图表迁移到 `setupCharts`。
- 验收：人工过一遍四项（画布高度/图表区/快捷键提示/吸顶）。

## 改动点清单

| 位置 | 改动 |
|---|---|
| `lib/common.js` | fitCanvas 系数 0.42；新增 `setupCharts`；startLoop 注释补「图表补绘走 render 链」 |
| `lib/common.css` | `.charts-row` 双栏/窄屏堆叠/`:empty` 塌缩；`scene-actions` sticky；快捷键提示样式 |
| `template-2d.html` / `template-3d.html` | 画布 height 基准下调；预留 `.charts-row` 容器与 @slot 注释；主循环注释同步 |
| `drawing.md` | setupCharts 用法与「能画就画」原则；无图题型隐藏约定；setupScene 吸顶/提示描述 |
| `src/main/agent/check-demo/static-check.ts` | skeletonCheck 加 `no-charts-row` warning（存量页迁移前放行，回归测试过滤该码） |
| `src/main/agent/physics-skill-prompt.ts` | 内嵌提示词：数据图像原则、画布高度勿改、自检加 charts-row 项 |
| testlab 3 个 demo | agent 会话按本 spec 修改 |

## 执行顺序建议

1. lib（fitCanvas + setupCharts + CSS）与模板同步改 → 用浏览器直开模板页自测四项。
2. drawing.md 与内嵌提示词更新。
3. testlab 3 个 demo 走 agent 会话改造 + 人工验收。
