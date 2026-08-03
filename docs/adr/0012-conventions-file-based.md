# ADR 0012: 写作规范文件化（CONVENTIONS.md），system prompt 收为薄骨架

**日期**: 2026-08-03
**状态**: 已接受（取代 [ADR 0010](./0010-system-prompt-bundled.md)）

## 背景

[ADR 0010](./0010-system-prompt-bundled.md) 选择把全部文件规范内联进 system prompt（约 50 行），理由是"约定随应用版本走、不可被工作目录误改"。但参考项目 pi-agent-test 的经验是：**规范要能长**（其 CONVENTIONS.md 约 10KB，含动静双形态、FBD 面板、多阶段多体、几何写实、自检清单等章节），prompt 内联到这种体量会：① prompt 巨大、token 成本高；② 规范和代码耦合，改约定要改代码；③ 校验工具无法读取规范做约定级检查。

参考方案：system prompt 只含纪律规则骨架（先读规范再写、写工具纪律、自检报告、形态判定、改名语义），规范全文放 `CONVENTIONS.md` 由 agent 用 `read` 工具在运行时读取——规范文件是唯一事实源。

## 选项

### A. 规范文件化 + 薄骨架 prompt（推荐）

`app/CONVENTIONS.md` 随 `lib/` 一起由 `setupWorkdir` 复制进工作目录（始终覆盖刷新），agent 写前必须 `read` 它。system prompt 保留三块：纪律规则（参考骨架）+ 输出结构（app 特有：问题理解/解答/演示生成/✅）+ 示例目录索引（ADR 0002）。

### B. 保持内联

维持 ADR 0010，把 CONVENTIONS.md 内容合并进 prompt。prompt 变得巨大，且规范与代码耦合。

## 决策

**选 A。** CONVENTIONS.md 是**应用 fork**，内容按本应用 ADR 修订（physics-demo 标记 ADR 0005、浅色唯一 ADR 0006、演示模式监听器 ADR 0007、demo-mode 双形态），与参考项目的 CONVENTIONS.md 从此分叉：参考项目是试验场，约定验证通过后人工同步到应用版（流程问题，代码层面无负担）。

## 影响

- ADR 0010 被取代：规范不再内联
- 工作目录新增只读文件 `CONVENTIONS.md`（文件树只扫根目录 `*.html`，不会误显示）
- 4 个示例演示迁移：补 `demo-mode` meta 与演示模式监听器（见 ADR 0014）
- 约定级校验（如 verify-demo 的形态元素检查）有文件可读，未来可挂
