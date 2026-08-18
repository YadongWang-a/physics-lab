# 演示平铺于工作目录、共享 lib，每 HTML 一个独立 session 文件

用户指定工作目录后，所有演示 HTML 平铺在该目录，共享一份 `lib/`（common.css/common.js/mathjax.js）；每个 HTML 对应 `.pi-sessions/` 中一个独立 session 文件（不依赖 Pi 按 cwd 的默认分组）。工作目录整体拷贝即带走全部演示与对话历史。

**Status**: accepted

**Considered Options**:
- 每演示一子目录 + 每目录独立 cwd —— Pi 天然按 cwd 分 session，但老师浏览/管理是嵌套目录，单演示无法一键查看全部
- 平铺 + 显式 session 文件路径（`.pi-sessions/<html>.jsonl`）—— 目录扁平直观、lib 单份不重复；代价是放弃 Pi 的 cwd 自动分组，由应用维护 session 文件与 HTML 的一一映射

**Consequences**:
- 应用维护 `demos` 清单（文件 ↔ session 文件 ↔ 标题 ↔ 创建时间）以恢复会话
- 平铺目录中混入用户自己的文件时，应用按已知扩展名/清单区分，不擅自纳入
- session 恢复不依赖 cwd 路径一致（跨机器迁移可用）
