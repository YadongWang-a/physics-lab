# ADR 0013: 会话持久化与恢复（.piagent/ 布局 + 绑定时序）

**日期**: 2026-08-03
**状态**: 已接受（扩展 [ADR 0004](./0004-tab-session-one-to-one.md)）

## 背景

ADR 0004 定了"一个文件一个 session"，但会话落在 SDK 默认 `workdir/.pi/agent/sessions/`，且**每轮 app 启动都是全新会话**——隔天重启接不上昨天的话题。参考项目 pi-agent-test 的会话模型解决了两件事：① 编辑模式启动时按文件恢复历史会话；② 生成模式用未绑定目录，agent 首次写文件后绑定到该文件（会话目录改名迁移）。

参考模型的关键约束：**会话目录在存活期间绝不能改名**（session 文件路径失效，ENOENT），绑定只能发生在 dispose 之后。

## 决策

按参考项目**原样移植**（不留特例）：

- **布局**：每个目标文件一个会话目录 `workdir/.piagent/<stem>/`（会话文件 + `backups/`）；新建演示用未绑定目录 `_new-<token>`。`cleanupStaleUnbound` 在 app 启动时清理崩溃残留。
- **恢复**：打开文件标签 → `SessionManager.list` 查历史 → 有则 `open`（恢复对话），无则 `create`；新建标签永远是全新未绑定会话。
- **绑定时序**：新建标签里 agent 首次 write_demo 落盘 → 标记绑定；**关闭标签/退出 app（dispose 之后）** → `bindSession` 把 `_new-<token>` 迁移到 `.piagent/<stem>/`；没写过文件 → 删除未绑定目录。
- **半成品丢失**：新建演示写到一半关闭 app → 未绑定会话被清理，不恢复。与 CLI 行为一致，用备份机制兜底心理预期。
- **改名**：编辑模式下 write_demo 写全新合法文件名 = 改名——旧文件立即删除、TabManager 的 agents Map key 与 activePath 重挂（`rekey`）、Preview 刷新；会话目录迁移推迟到关闭标签时（与参考的 exit-time 迁移一致）。

## 影响

- ADR 0004 的"一个文件一个 session"保留，补上持久化与恢复
- `.piagent/` 目录进入工作目录（文件树只扫根目录 `*.html`，不会误显示；`_new-*` 残留由启动清理兜底）
- agent 句柄的 `dispose()` 内置绑定/清理逻辑，TabManager.dispose（app 退出）触发
- 配置仍在 userData safeStorage（ADR 0008），**不进** `.piagent/config.json`——参考项目的明文配置是 CLI 妥协，应用不采纳（安全倒退不可接受）
