# 01 · 标准图表区的技术形态
Type: grilling
Status: resolved

## Question

标准图表区做成什么技术形态，SKILL 指南如何指示 agent「按题型选图、无图隐藏」？

- 候选 A：lib 新标准件（如 `setupCharts(parent, defs)`）——模板预留固定容器，页面把图定义交给标准件；chase 手写图表迁移到标准件。
- 候选 B：模板固定骨架（双栏 div + 常用绘图助手），各页在 @slot 自行实现绘制；自由度高但一致性弱。
- 需一并决定：SKILL 指南措辞——哪些题型画什么图（运动学 x-t/v-t、能量 Ep/Ek、电路 U-I…），无图题型如何隐藏区域（display:none 会否影响 fitCanvas/resize 布局）。

已有锁定前提：图表区在画布正下方双栏并排、窄屏堆叠；画布高视口×≈42%。

## Answer

1. **技术形态：lib 标准件**。新增 `setupCharts(parent, defs)`（与 setupScene/startLoop 同构）；模板在画布下方预留固定双栏容器（窄屏堆叠），页面 @slot 只写图定义（坐标轴/曲线/取值函数）。chase 手写图表迁移到标准件。
2. **SKILL 指南只给原则，不写题型→图映射表**：原则 = 「能画时间曲线/关系曲线就画」（运动学 x-t/v-t、能量 Ep/Ek、电路 i-t 等由 agent 自判）；无合适图的题型不调 setupCharts，图表容器为空时自动收起（CSS :empty），不留白。
3. 隐藏机制属实现细节，执行会话定（倾向 :empty 塌缩，注意 fitCanvas/resize 对 0 尺寸画布的兼容）。
