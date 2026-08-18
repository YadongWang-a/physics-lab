# agent 能力边界：只用 Pi agent 内建能力 + 原样 skill，不写扩展

桌面应用的所有 agent 功能必须通过集成 Pi agent（`@earendil-works/pi-coding-agent`）实现：不自行实现 LLM 调用/agent 循环；自定义工具与扩展数量最小化；physics-lab-skill 直接调用（默认加载、常驻），不对 skill 内容做任何修改。

**Status**: accepted

**Considered Options**:
- 自建 LLM 调用层 —— 灵活但重复造轮子、失去 skill/会话/事件流生态
- 大量自定义工具/扩展（如独立运行时检查工具）—— 功能强但违背"尽量少"约束
- 修改 skill 适配应用 —— 用户明确禁止（skill 是资产，应用适配 skill 而非相反）

**Consequences**:
- 工具面 = Pi 内建工具的最小够用集（write/edit/read 等），自检依赖 skill 原样流程
- skill 以只读方式随应用打包（`resources/`），运行时不可变
- 若未来需要超出内建能力的工具，须重新评估约束（记录于本 ADR 的修订）
