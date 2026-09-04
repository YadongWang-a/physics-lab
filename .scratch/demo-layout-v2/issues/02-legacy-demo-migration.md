# 02 · 存量 3 个 demo 的改造方式

Type: grilling
Status: resolved

## Question

testlab 现有 3 个 demo（chase-catch-up、free-fall-5m、elastic-collision-1-2）按新规范如何改造？

- 候选 A：用 app 新建/继续 agent 会话重生成或修改，端到端检验新模板/lib 约定（推荐，但需要模型 Key 且耗 token）。
- 候选 B：手工直接改 3 个 html（快、确定性高，但不检验生成链路）。
- 需一并决定：chase 页现有手写双栏图表是否迁移到 01 定的标准件；改造后如何验收（人工过一遍 + smoke-workspace 脚本）。

## Answer

1. **改造方式：agent 会话重生成/修改**。在 app 中对 3 个 demo 的既有会话发修改要求，端到端检验新模板/lib 约定。
2. chase 手写双栏图表（drawCharts）迁移到 `setupCharts` 标准件。
3. 验收：人工过一遍（布局/图表/快捷键/吸顶四项）+ 更新 smoke-workspace 脚本断言（新布局：图表区容器、sticky 吸顶）。
