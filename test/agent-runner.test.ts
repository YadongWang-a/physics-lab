import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { createPhysicsSession, lastTurnError } from '../src/main/agent/agent-runner'

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

  it('mainSlot 配置生效：会话使用设置页指定的供应商/模型（ticket 05）', async (ctx) => {
    const dirs = makeDirs()
    const apiKey = process.env.OPENCODE_API_KEY ?? process.env.DEEPSEEK_API_KEY
    if (!apiKey) ctx.skip()
    const { session, dispose } = await createPhysicsSession({
      ...dirs,
      mainSlot: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey }
    })
    await session.prompt('只回复两个字：你好')
    skipOnInsufficientBalance(ctx, session.messages)

    const last = session.messages[session.messages.length - 1]
    const assistant = last as { role?: string; provider?: string } | undefined
    expect(assistant?.role).toBe('assistant')
    expect(assistant?.provider).toBe('deepseek')
    dispose()
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

describe('lastTurnError：agent 回合错误提取（无网络、无 Key）', () => {
  it('最后一条 assistant 消息 stopReason=error 时返回 errorMessage', () => {
    const messages = [
      { role: 'user', content: '两个小球弹性碰撞' },
      { role: 'assistant', content: [], stopReason: 'error', errorMessage: '401: {"type":"AuthError","message":"Invalid API key."}' }
    ]
    expect(lastTurnError(messages)).toBe('401: {"type":"AuthError","message":"Invalid API key."}')
  })

  it('error 但无 errorMessage 时返回兜底文案', () => {
    const messages = [{ role: 'assistant', content: [], stopReason: 'error' }]
    expect(lastTurnError(messages)).toMatch(/模型调用失败/)
  })

  it('正常结束（stopReason=stop）返回 null', () => {
    const messages = [{ role: 'assistant', content: [{ type: 'text', text: 'ok' }], stopReason: 'stop' }]
    expect(lastTurnError(messages)).toBeNull()
  })

  it('空消息或最后一条非 assistant 返回 null', () => {
    expect(lastTurnError([])).toBeNull()
    expect(lastTurnError([{ role: 'user', content: 'hi' }])).toBeNull()
  })
})
