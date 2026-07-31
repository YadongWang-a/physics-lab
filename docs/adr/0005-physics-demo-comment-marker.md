# ADR 0005: HTML 注释标记识别演示文件

**日期**: 2026-07-31
**状态**: 已接受

## 背景

工作目录中可能包含各种 HTML 文件。文件树需要只显示 Agent 生成的物理演示 HTML，而不是所有 `.html`。

## 选项

### A. HTML 注释标记（推荐）

Agent 生成的 HTML 中包含格式为 `<!-- physics-demo: 中文标题 -->` 的注释。文件树扫描工作目录中的 `.html` 文件，读取前几行寻找此标记。找到则显示，标题取自冒号后的文本。

### B. `<meta>` 标记

使用 `<meta name="physics-demo" content="true">` 和 `<meta name="physics-demo-title" content="中文标题">`。

- 优势：标准 HTML 元数据
- 劣势：占用 DOM，不如注释低调

### C. 目录约定

要求 Agent 生成的文件放在特定子目录（如 `demos/`）。

- 优势：不需要解析文件内容
- 劣势：限制目录结构，不够灵活

## 决策

**选 A — HTML 注释标记。**

理由：
1. 低调不占 DOM，纯信息标记
2. 同时承载两个功能：识别是否为演示文件 + 提供中文标题
3. 文件名用英文 slug，标题从注释提取
4. 解析成本极低（读前几行、正则匹配即可）

## 标记格式

```html
<!-- physics-demo: 斜面弹簧振子 -->
<!DOCTYPE html>
<html lang="zh-CN">
...
```

Agent 模板中默认包含此注释。用户手写的 HTML 或不相关的 HTML 不会出现。

## 影响

- 文件树扫描需要读取每个 `.html` 的前几行（性能可接受，通常工作目录文件数 < 100）
- Agent 的 system prompt 中需要明确要求包含此标记
