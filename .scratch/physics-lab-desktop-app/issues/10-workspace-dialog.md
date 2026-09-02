# 10 — 工作目录选择对话框与关闭工作空间闭环

**What to build:** 首次启动 / 关闭工作空间后，用模态对话框引导选择工作目录（替代全屏空态页）；新增 `workspace:close` IPC 清除持久化工作目录记录，使"关闭工作空间"后重启不再自动恢复旧目录。

**Blocked by:** None

**Status:** ready-for-agent

- [x] 首次启动（无已保存工作目录）弹出「选择工作目录」模态对话框
- [x] 「关闭工作空间」→ 调用 `workspace:close`（清 watcher、清 settings 记录）→ 重新弹出引导对话框
- [x] 对话框点「暂不选择」可跳过，左上角列表头部/空态页仍可随时选择
- [x] 选定后立即切换工作空间，不自动选中演示

## Comments

实现说明（补记）：
- 渲染层：`src/renderer/src/WorkspaceDialog.tsx`（新组件）；`App.tsx` 无工作空间分支保留全屏引导页 + 对话框叠加
- 主进程：`workspace:close` 处理器（`currentWs = null`、关 watcher、`settings.patch({ workspaceDir: '' })`）；preload 暴露 `api.workspace.close`
- 收尾时修复：`workspace:close` 处理器曾被误插进 `workspace:remove` 函数体内（语义错误：首次 remove 才注册、二次 remove 重复注册崩溃），已移到同级
- 顺手修正 `smoke-workspace` 与现行 UI 的三处漂移：`隐藏演示列表`/`就绪` 断言 → `收起浏览`+rail`演示列表`/Key 徽标；`dir shown` 改按路径末两段匹配；「演示」按钮 `trim()` 后比较；并给窗口创建与主布局挂载加轮询等待消除 vite 重载竞态
- 验证：`npm run typecheck` 通过；`npx electron-vite dev -- --smoke-workspace` 全部断言通过（0 退出）；vitest 11/13 文件通过，2 个失败均为真实 Key 在线测试的 LLM 输出非确定性/超时，与本改动无关
