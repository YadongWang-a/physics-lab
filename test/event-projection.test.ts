import { describe, expect, it } from 'vitest'
import { projectChatEvent } from '../src/main/agent/event-projection'

/** SDK 真实形态：每条 token 事件都带整条累积消息快照（partial 与 message 各一份） */
function sdkTextDelta(delta: string, accumulated: string): unknown {
  const partial = { role: 'assistant', content: [{ type: 'text', text: accumulated }] }
  return {
    type: 'message_update',
    message: partial,
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta, partial }
  }
}

describe('projectChatEvent：SDK 事件 → 渲染层投影', () => {
  it('文本增量只留 delta，丢掉整条消息快照（O(n²) IPC 的来源）', () => {
    const accumulated = 'x'.repeat(40_000)
    const projected = projectChatEvent(sdkTextDelta(' up', accumulated)) as Record<string, unknown>
    expect(projected).toEqual({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' up' } })
    expect(JSON.stringify(projected).length).toBeLessThan(100)
    expect('message' in projected).toBe(false)
  })

  it('thinking/toolcall 增量不投递（渲染层不消费）', () => {
    for (const t of ['thinking_delta', 'thinking_start', 'toolcall_delta', 'toolcall_end']) {
      expect(
        projectChatEvent({
          type: 'message_update',
          message: { role: 'assistant', content: [] },
          assistantMessageEvent: { type: t, contentIndex: 0, delta: '…', partial: { role: 'assistant', content: [] } }
        })
      ).toBeNull()
    }
    // 空 delta 不投递（渲染层会当成长度 0 的追加）
    expect(projectChatEvent(sdkTextDelta('', 'abc'))).toBeNull()
  })

  it('工具调用起止与回合落地照常投递（渲染层显示工具态 / 退出生成中）', () => {
    expect(projectChatEvent({ type: 'tool_execution_start', toolName: 'check_demo', args: { x: 1 } })).toEqual({
      type: 'tool_execution_start',
      toolName: 'check_demo'
    })
    expect(projectChatEvent({ type: 'tool_execution_end', result: '…' })).toEqual({ type: 'tool_execution_end' })
    expect(projectChatEvent({ type: 'agent_settled' })).toEqual({ type: 'agent_settled' })
  })

  it('message/turn 生命周期事件不投递', () => {
    for (const t of ['message_start', 'message_end', 'agent_start', 'turn_start', 'turn_end']) {
      expect(projectChatEvent({ type: t, message: { role: 'assistant', content: [] } })).toBeNull()
    }
    expect(projectChatEvent(null)).toBeNull()
    expect(projectChatEvent('text_delta')).toBeNull()
  })
})
