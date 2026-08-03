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
- Session 持久化到 `<工作目录>/.piagent/<stem>/`（ADR 0013）：打开文件标签自动恢复历史；新建演示用未绑定目录 `_new-<token>`，关闭标签/退出时绑定，未写文件则清理，启动时清残留
- 文件改名（agent 写新文件名）→ TabManager 重挂 key、Preview 刷新

### Agent 工具定义

```
工具集（见 ADR 0011，取代 0009 工具列表）：
  read / grep / find / ls — 只读内置，**禁 bash**
  write_demo(name, content) — 整文件写，写入前主进程校验拦截（硬错误：命名/作用域/结构/physics-demo 标记/演示监听器/内联 JS 语法；警告：浅色违规/形态要素）
  edit_demo(old_text, new_text) — 局部修改目标文件，修改后的完整文件过同一校验
  validate_demo(name, content) — 写前自检，不写盘
  备份：每轮对话写前快照到 .piagent/<stem>/backups/（留 10 版，无 undo 命令）
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
