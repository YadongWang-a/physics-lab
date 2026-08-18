import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { createPhysicsSession } from '../src/main/agent/agent-runner'

/**
 * SDK 层 seam 测试（ticket 01，spec「Testing Decisions」）。
 * 需要真实 Key：DEEPSEEK_API_KEY 缺失时整组跳过（质量门 09 前的临时形态）。
 * 断言外部行为：会话创建、事件流、会话文件落盘、会话恢复。
 */

const hasKey = !!process.env.DEEPSEEK_API_KEY || !!process.env.OPENCODE_API_KEY

/** DeepSeek 账户余额不足（402）时动态跳过；余额恢复后测试自动生效 */
function skipOnInsufficientBalance(ctx: { skip: () => unknown }, messages: unknown[]): void {
  const last = messages[messages.length - 1] as { role?: string; errorMessage?: string } | undefined
  const errMsg = last?.role === 'assistant' ? last.errorMessage ?? '' : ''
  if (errMsg.includes('402') || errMsg.includes('Insufficient Balance')) {
    ctx.skip()
  }
}

function makeDirs(): { cwd: string; sessionDir: string; agentDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'physics-lab-test-'))
  return {
    cwd: base,
    sessionDir: join(base, '.pi-sessions'),
    agentDir: join(base, '.agent')
  }
}

describe.skipIf(!hasKey)('SDK 层：agent 会话（真实 Key）', () => {
  it('创建会话并完成一次 prompt，事件流与消息可观测', async (ctx) => {
    const dirs = makeDirs()
    const { session, dispose } = await createPhysicsSession(dirs)

    const deltas: string[] = []
    let settled = false
    session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        deltas.push(event.assistantMessageEvent.delta)
      } else if (event.type === 'agent_settled') {
        settled = true
      }
    })

    await session.prompt('只回复两个字：你好')
    skipOnInsufficientBalance(ctx, session.messages)

    expect(deltas.length).toBeGreaterThan(0)
    expect(settled).toBe(true)
    const last = session.messages[session.messages.length - 1]
    expect(last?.role).toBe('assistant')
    expect(session.messages.some((m) => m.role === 'user')).toBe(true)
    dispose()
  })

  it('会话文件落盘于 sessionDir，且包含对话条目', async () => {
    const dirs = makeDirs()
    const { session, dispose } = await createPhysicsSession(dirs)
    await session.prompt('只回复两个字：你好')
    dispose()

    const sessionFile = session.sessionFile
    expect(sessionFile).toBeTruthy()
    expect(sessionFile!.startsWith(dirs.sessionDir)).toBe(true)

    const reopened = SessionManager.open(sessionFile!)
    const entries = reopened.getEntries()
    expect(entries.length).toBeGreaterThan(0)
    const types = entries.map((e) => e.type)
    expect(types.some((t) => t === 'message')).toBe(true)
  })

  it('会话可恢复：恢复后保留历史并可继续对话', async (ctx) => {
    const dirs = makeDirs()
    const first = await createPhysicsSession(dirs)
    await first.session.prompt('只回复两个字：你好')
    skipOnInsufficientBalance(ctx, first.session.messages)
    const sessionFile = first.session.sessionFile!
    const historyCount = first.session.messages.length
    first.dispose()

    const reopenedManager = SessionManager.open(sessionFile)
    const second = await createPhysicsSession({ ...dirs, sessionManager: reopenedManager })
    expect(second.session.messages.length).toBe(historyCount)
    await second.session.prompt('再说一次')
    expect(second.session.messages.length).toBeGreaterThan(historyCount)
    second.dispose()
  })
})
