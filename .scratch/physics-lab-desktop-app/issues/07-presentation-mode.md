# 07 — 演示模式

**What to build:** 老师一键全屏展示当前演示，直接投影上课；键盘交互（空格暂停/继续等）在演示模式下可用。

**Blocked by:** 03

**Status:** ready-for-agent

- [x] "演示"按钮进入全屏渲染当前演示
- [x] 可退出全屏恢复正常界面
- [x] 演示模式键盘操作（空格暂停/继续、重置等）可用
- [x] 演示模式为当前文件的展示态，明确其与编辑态的切换关系

## Comments

实现于 commit（ticket 07）。验证记录：
- smoke-workspace 扩展 PASS：进入演示（全屏覆盖层 + 退出按钮 + 聊天隐藏）/ 退出（聊天恢复 + 覆盖层消失）
- 键盘操作：lib/common.js 自带 setupKeyboard（空格暂停/继续、R 重置）—— webview 聚焦时天然可用，演示模式不干预
- 全屏：渲染层覆盖层（复用 webview 不重载）+ 主窗口真全屏（BrowserWindow.setFullScreen）
- 展示态/编辑态：进入演示隐藏全部应用 UI（纯展示），退出恢复；Esc 外层焦点时生效，退出按钮兜底（webview 内 Esc 归 demo，无冲突）
- 注意：旧版 ADR-0007 曾废弃演示模式，新 spec（User Story 20/21）恢复该需求，本实现按新 spec 落地
