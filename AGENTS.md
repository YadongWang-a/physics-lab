# AGENTS.md — physics-lab

## Agent 配置

本项目使用 Pi Agent SDK（`@earendil-works/pi-coding-agent`）作为 AI Agent 框架。

### 可用 Skills

| Skill | 触发方式 | 用途 |
|---|---|---|
| `physics-demo` | 用户输入物理题目或演示需求 | 生成交互式 HTML 物理演示 |
| `grill-with-docs` | `/grill-with-docs` | 深入追问设计决策，同时产出 CONTEXT.md 和 ADR |
| `grilling` | `/grilling` 或 "追问" 类短语 | 压力测试计划和决策 |
| `domain-modeling` | 涉及领域术语或架构决策 | 维护术语表和 ADR |

### Agent Session 模型

- 每个标签页 = 一个独立的 `AgentSession`
- Session 由 Pi Agent SDK 自动持久化到 `<工作目录>/.pi/agent/sessions/`（通过 `agentDir` 配置，见 ADR 0004）
- 关标签页不销毁 session，重开恢复历史
- 支持手动删除不需要的 session

### Agent 工具定义

```
工具集（见 ADR 0009）：
  read / write / edit / ls / find / grep — SDK 内置，**禁 bash**
  Preview：主进程 fs.watch 自动刷新，不做工具
```

### Few-shot 示例策略

System prompt 包含示例目录索引（功能描述，不含代码）。Agent 根据用户需求判断最相关的示例，调用 `read` 读取后参考。

```
索引示例：
- ball-spring.html：自由落体+弹簧回弹，Velocity Verlet，能量条
- arc-projectile.html：抛物线轨迹，初速度/角度参数
- isochronous-circle.html：伽利略等时性，多条弦同时滑落
- incline-baffle.html：斜面+挡板碰撞，速度矢量分解
```

### Agent 输出规范

每次生成 HTML 时，输出必须包含：
1. **【问题理解】** — 用自己的话复述物理问题
2. **【解答】** — 物理推导和计算结果（如有），方便老师校验
3. **【演示生成】** — 说明生成了什么、包含哪些交互控件
4. **✅ 文件已更新：[文件名]** — 明确通知完成

生成的文件要求：
- 第一行：`<!-- physics-demo: 中文标题 -->`
- 引入 `lib/common.css`
- 浅色主题唯一（无 `[data-theme]`、无 🌙 按钮，见 ADR 0006）
- 内嵌演示模式 postMessage 监听器 + E3 区域结构（见 ADR 0007）
- Canvas 高 DPI 适配
- 文件名：英文 slug（如 `incline-spring.html`）
