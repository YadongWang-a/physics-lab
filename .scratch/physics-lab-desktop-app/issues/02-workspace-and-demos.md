# 02 — 工作目录与演示清单

**What to build:** 老师启动时选择工作目录（记住上次选择）；应用扫描其中所有演示 HTML，为每个演示维护独立会话与中文标题；重启后列表与会话完整恢复；删除演示需二次确认（ADR-0001/0002）。

**Blocked by:** 01

**Status:** ready-for-agent

- [x] 首次启动引导选择工作目录；重启自动恢复上次目录（可更改）
- [x] 扫描工作目录中演示 HTML 并列出（中文标题，无标题时显示文件名）
- [x] 每个演示对应独立会话文件（一个 HTML 一个 session）；工作目录一份清单（demos.json）记录 文件↔会话↔中文标题↔创建时间 映射
- [x] 重启应用后演示列表与各自会话完整恢复
- [x] 删除演示需二次确认；删除后应用创建的会话文件一并移除（不触碰用户其他文件）

## Comments

实现于 commit e2b8c13。验证记录：
- 单测 14/14：workspace-manager 9（扫描判定/标题提取含 physics-lab-skill 标记/清单持久化/删除边界/坏清单容忍）、session-resume 2（清单会话文件恢复历史 + 固定命名）、agent-runner 3
- `--smoke-workspace`：预置工作目录 → 窗口全链路（main→preload→renderer）列表渲染 PASS；冒烟模式 userData 隔离，不污染真实设置
- code-review 修复：physics-lab-skill 注释标记匹配（真实 demo 首行格式）、scan 重验清单条目、remove 语义一致（用户确认后删除，容忍坏条目）、冒烟 userData 隔离、术语统一（会话）
- 会话恢复在数据层验证（session-resume 测试）；应用内恢复接入由 ticket 03 完成
