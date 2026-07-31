# ADR 0002: Few-shot 示例按需读取

**日期**: 2026-07-31
**状态**: 已接受

## 背景

Agent 生成 HTML 时需要参考现有的 4 个物理演示示例（`ball-spring.html`、`arc-projectile.html`、`isochronous-circle.html`、`incline-baffle.html`）。需要决定如何把这些示例喂给 Agent。

## 选项

### A. 全量塞入 System Prompt

每次对话把 4 个完整 HTML 文件（~30-50K tokens）塞进 system prompt。

- 优势：Agent 每次都能参考全部示例，质量稳定
- 劣势：占用大量 context window，未来示例增多无法扩展

### B. 目录索引 + 按需读取（推荐）

System prompt 中只放示例目录：
```
- ball-spring.html：自由落体+弹簧回弹，Velocity Verlet 积分，能量条
- arc-projectile.html：抛物线轨迹，初速度/角度参数，轨迹预测
- isochronous-circle.html：伽利略等时性，多条弦同时滑落，证明卡片
- incline-baffle.html：斜面+挡板碰撞，速度矢量，法向/切向分解
```

Agent 根据用户需求判断哪个示例最相关 → 调用 `read_file` 读取 → 参考其实现。

## 决策

**选 B — 目录索引 + 按需读取。**

理由：
1. 省 token，目录索引不超过 1K tokens
2. 可扩展，未来 50 个示例也不影响 system prompt 大小
3. Agent 读完真实代码再写，比靠记忆更可靠
4. Agent 可以选择多个相关示例组合参考（比如斜面 + 弹簧两个都读）

## 影响

- System prompt 需要包含清晰的「何时读示例、如何选择」指令
- 工具调用多一步（先读示例再写文件），但通常增加 1-2 秒延迟，可接受
