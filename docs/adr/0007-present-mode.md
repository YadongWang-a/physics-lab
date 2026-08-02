# ADR 0007: 演示模式架构

**日期**: 2026-08-01
**状态**: 已接受

## 背景

老师上课投屏时，现有 `.grid` 双列布局（场景 + 控制面板同框）画布不够大、参数滑块占地方。需要一种"演示态"：画布撑大、控制/参数折叠，便于投屏讲解。该模式横跨两层——**HTML 内部 reflow**（iframe 内的区域重排）与**应用外壳 reflow**（收起 Chat、撑满 Preview），两半需同时发生。

## 选项

### 1. CSS / 监听逻辑住哪一层

- **A1 住生成的 HTML（推荐）**：演示态 CSS 在 `lib/common.css`，HTML 挂一个 postMessage 监听器。保住"一个自洽 HTML 文件"的产品定位，所有生成演示免费获得。
- A2 住应用外壳注入：往 `file://` iframe 注入 CSS 跨域脆弱，对独立打开的文件无效。否决。

### 2. 触发方式：单向 vs 双向

- **C2 单向 app→iframe（推荐）**：应用工具栏"演示"按钮发 postMessage 给 iframe；HTML 内**不放**演示按钮，只挂监听器。契约最简。
- C1 双向（HTML 留按钮 + 双向状态同步）：每份 HTML 多一段收发逻辑，且两个触发点易状态不一致。否决。

### 3. 演示态布局

- **E3（推荐）**：顶部"临界状态"栏保留（课纲，老师顺着最高点→接触→最低点讲）；`▶ ⏸ ↺` dock 在画布左上；画布撑满；图例/相位/能量叠加在画布上；参数滑块变成底部可收起抽屉。
- E1 画布占满 + 全控件浮层：把教学要用的临界状态按钮也藏起来，讲课中点不到。否决。
- E2 画布左大 + 控件窄栏：零交互但场景非最大。否决。

### 4. 应用外壳半边

- **F1 Chat 完全隐藏（推荐）**：Chat 整个收起，Preview 撑满到窗口左缘；保留标签栏 + 工具栏（含"演示"按钮，方便退出）。演示态不写 prompt，Chat 无需占地方。
- F2 Chat 收成窄条：浪费左侧空间，学生看到对话内容可能干扰。否决。

## 决策

**演示模式 = 生成的 HTML 内的一种布局态。**

- CSS 规则在 `lib/common.css`（`.present` 态），布局按 E3
- 生成的 HTML 内挂一个 postMessage 监听器（无演示按钮），监听 `{cmd:"present", value:true|false}`，给 `<body>` 切 `.present` class
- 应用工具栏"演示"按钮：单向发 postMessage 给当前 Tab 的 iframe，**同时**应用收起 Chat、Preview 撑满（F1）
- 退出：再点"演示"按钮 / 按 Esc
- 状态：按 Tab 持久（每个 Tab 独立存 on/off）；Agent 重新生成该 Tab 的 HTML 后重置为关

## postMessage 契约

```js
// 应用（父）→ iframe（子）
iframeEl.contentWindow.postMessage({ cmd: "present", value: true }, "*");
```

```js
// 生成的 HTML 内（每份都自带）
window.addEventListener("message", (e) => {
  if (e.data?.cmd === "present")
    document.body.classList.toggle("present", !!e.data.value);
});
```

- `file://` iframe 的 origin 为 `null`，监听器不校验 origin（本地文件、无远程内容，风险可控）；若未来引入远程内容需加 `e.source` 校验
- 应用须等 iframe 加载完成后再发消息（处理加载时序）

## 影响

- 每份生成 HTML 必须内嵌 postMessage 监听器 + E3 区域结构 —— agent 模板与 few-shot 示例须编码此约定，否则传导不进生成物
- 4 个示例 HTML 需补监听器 + E3 区域结构，保持与 few-shot 源一致
- **已接受的取舍**：独立用浏览器打开的 HTML **无法进入演示模式**（无按钮、监听器等不到 postMessage）。运行演示本身（画布/控制/参数）仍自洽，仅演示态切换依赖应用
- 应用需建 postMessage 通道、处理 iframe 加载时序、维护每 Tab 的演示态开关
- 与主题（浅色，见 [ADR 0006](./0006-light-theme-only.md)）正交，可同时生效
