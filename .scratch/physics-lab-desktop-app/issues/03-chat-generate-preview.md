# 03 — 聊天-生成-预览最小闭环

**What to build:** 产品最小可用闭环：左聊天右预览；老师输入物理题文字 → agent 默认按 physics-lab-skill 完整流程执行（SKILL.md 常驻系统提示，ADR-0003）→ 生成演示 HTML 到工作目录 → 右侧沙箱预览自动刷新显示。

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [x] 左聊天右预览布局；消息发送、流式增量渲染、思考与工具调用过程可见
- [x] skill 默认加载：系统提示常驻 skill 指令，agent 完全按其 7 步流程执行；skill 内容只读使用、不做任何修改
- [x] 输入一道简单物理题（如"小球自由落体"）→ 生成演示到工作目录 → 预览沙箱加载并自动刷新
- [x] 生成结果含 lib/ 三件套，拷贝目录即可离线用浏览器打开
- [x] 演示文件名为 kebab 英文，界面以中文标题展示
- [x] 开发期 Key 走环境变量（图形化配置由 05 提供）

## Comments

实现于 commit db42c63。验证记录：
- 测试 15 通过 + 3 跳过；typecheck 双端 OK；smoke-workspace PASS（列表/目录/webview 全链路）
- skill 注册与系统提示常驻：无 Key 测试验证（skills 含 physics-lab-skill、SKILL.md 未改动）
- **外部阻塞（非代码缺陷）**：DeepSeek API Key 余额不足（402 Insufficient Balance）—— 端到端生成测试与 smoke-agent 已做余额感知（动态 SKIP），余额充值后自动生效
- 关键工程决策：lib 由应用预置（避免 agent 读取 2.1MB mathjax.js 进上下文）；空工作目录可直接发起新会话（_new-<ts> 生成后绑定重命名）
- code-review 修复：首次生成入口、streaming 按会话 key、事件转发 broadcast、磁盘历史恢复、规则合规
