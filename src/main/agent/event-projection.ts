/**
 * SDK 事件 → 渲染层事件投影。
 *
 * SDK 的 `message_update` 每个 token 都携带**整条累积消息的快照**（`event.message`
 * 与 `assistantMessageEvent.partial`）。实测单条事件 80KB，而其中真正的新信息只有
 * `delta`（5 个字符）——一个长回合的 IPC 量是 O(n²)（一次回合实测 ~0.6GB）。
 * 渲染层为此做结构化克隆 + 反序列化，主线程饱和（setInterval 漂移 18s）、堆涨到
 * 2.9GB 后被 Chromium 以 reason=oom 杀掉（exitCode=-536870904）。
 *
 * 渲染层只用三类信息（见 App.tsx 的 textDeltaOf / applyChatEvent）：文本增量、
 * 工具调用起止、回合落地。其余（thinking/toolcall 增量、message/turn 生命周期）
 * 它拿不到也没用。这里按渲染层契约白名单投影，把 IPC 从 O(n²) 降到 O(n)。
 *
 * 返回 null = 该事件渲染层不需要（不投递）。
 */
export function projectChatEvent(e: unknown): unknown | null {
  if (typeof e !== 'object' || e === null || !('type' in e)) return null
  const ev = e as Record<string, unknown>
  switch (ev.type) {
    case 'message_update': {
      const ae = ev.assistantMessageEvent
      if (typeof ae !== 'object' || ae === null || !('type' in ae)) return null
      // 只留文本增量；`partial` / `message` 整条快照在投影层丢弃
      if (ae.type !== 'text_delta') return null
      if (!('delta' in ae)) return null
      const delta = ae.delta
      if (typeof delta !== 'string' || delta === '') return null
      return { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta } }
    }
    case 'tool_execution_start':
      return typeof ev.toolName === 'string'
        ? { type: 'tool_execution_start', toolName: ev.toolName }
        : { type: 'tool_execution_start' }
    case 'tool_execution_end':
      return { type: 'tool_execution_end' }
    // 回合结束：渲染层据此冲刷 delta 缓冲并退出「生成中」
    case 'agent_settled':
      return { type: 'agent_settled' }
    default:
      return null
  }
}
