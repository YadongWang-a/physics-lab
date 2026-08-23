import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPhysicsSession, skillSystemPrompt } from '../src/main/agent/agent-runner'

const KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENCODE_API_KEY

// 模拟渲染层 applyChatEvent 的 message_update 分支（与 App.tsx 同逻辑）
function applyLike(prev: string, delta: string): string {
  return prev + delta
}

describe.skipIf(!KEY)('回路：流式事件批到达时的 delta 丢失', () => {
  it('真实事件流 + 渲染层时序模拟：批大小 > 1 即丢 delta', async () => {
    const base = mkdtempSync(join(tmpdir(), 'physics-lab-batch-'))
    const { session, dispose } = await createPhysicsSession({
      cwd: base,
      sessionDir: join(base, '.pi-sessions'),
      agentDir: join(base, '.agent'),
      mainSlot: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: KEY },
      systemPrompt: skillSystemPrompt('D:/项目开发/physics-lab/resources/physics-lab-skill')
    })
    const deltas: string[] = []
    session.subscribe((e) => {
      const ev = e as { type?: string; assistantMessageEvent?: { type?: string; delta?: string } }
      if (ev.type === 'message_update' && ev.assistantMessageEvent?.type === 'text_delta' && typeof ev.assistantMessageEvent.delta === 'string') {
        deltas.push(ev.assistantMessageEvent.delta)
      }
    })
    await session.prompt('一个小球从 5m 高处自由落体，求落地时间')
    const last = session.messages[session.messages.length - 1] as { stopReason?: string; content?: unknown[] }
    if (last?.stopReason === 'error') throw new Error('回合错误')

    const fullText = String(
      (last.content as { type?: string; text?: string }[])
        ?.filter((c) => c?.type === 'text')
        .map((c) => c.text ?? '')
        .join('') ?? ''
    )
    const joined = deltas.join('')
    console.log(`DEFAULT deltas=${deltas.length} 拼接长度=${joined.length} 完整长度=${fullText.length} 完整一致=${joined === fullText}`)

    // 渲染层时序模拟：每批 batchSize 个事件基于同一旧 ref（setMessages 值更新 + ref 异步）
    const simulate = (batchSize: number): string => {
      let ref = '' // 模拟 messagesRef（render 后更新）
      const out: string[] = []
      for (let i = 0; i < deltas.length; i += batchSize) {
        const batch = deltas.slice(i, i + batchSize)
        let applied = ref // 批内每次 handler 都读旧 ref
        for (const d of batch) applied = applyLike(ref, d) // 值更新：每批最终 = 最后一次
        ref = applied // 批结束时才「渲染」，ref 更新
        out.push(ref)
      }
      return out[out.length - 1] ?? ''
    }

    console.log('batch=1 完整一致:', simulate(1) === fullText)
    for (const b of [2, 5, 10, 20]) {
      const got = simulate(b)
      const pct = Math.round((1 - got.length / fullText.length) * 100)
      console.log(`batch=${b} 长度=${got.length} 丢失=${pct}% 片段=${JSON.stringify(got.slice(0, 60))}`)
    }

    // 修复后语义：函数式更新 setMessages(prev => ...)，批内每个事件基于最新累积
    const simulateFixed = (): string => {
      let ref = ''
      for (const d of deltas) ref = applyLike(ref, d) // 每事件基于最新
      return ref
    }
    const fixed = simulateFixed()
    console.log(`FIXED 完整一致=${fixed === fullText} 长度=${fixed.length}`)
    expect(fixed).toBe(fullText)
    dispose()
    expect(true).toBe(true)
  }, 180_000)
})
