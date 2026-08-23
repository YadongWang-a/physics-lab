import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionHost } from '../src/main/agent/session-host'

/**
 * 多轮对话延续（新会话未绑定 HTML 时）：渲染层把 activeKeyRef 作为
 * sessionKey 传回，同一 tab 内的连续发送必须复用同一 agent 会话——
 * 否则第二轮的「确认」会进入无历史的全新会话（agent 说没有上文）。
 */

function makeHost(dir: string): SessionHost {
  return new SessionHost({
    agentDir: join(dir, '.agent'),
    skillDir: join(dir, 'skill'),
    getMainSlot: () => ({ provider: 'deepseek', modelId: 'deepseek-v4-flash' })
  })
}

describe('SessionHost：新会话多轮延续', () => {
  it('同一 sessionKey 两次 getSession 返回同一会话（历史延续）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-multiturn-'))
    const host = makeHost(dir)
    const first = await host.getSession(dir, null, () => {})
    const second = await host.getSession(dir, null, () => {}, first.key)
    expect(second.key).toBe(first.key)
    expect(second.ps.session).toBe(first.ps.session)
  })

  it('无 sessionKey 时每次创建新会话（旧行为，单轮隔离）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-single-'))
    const host = makeHost(dir)
    const a = await host.getSession(dir, null, () => {})
    const b = await host.getSession(dir, null, () => {})
    expect(b.key).not.toBe(a.key)
  })

  it('已绑定文件（file 非 null）时 file 优先于 sessionKey', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-file-'))
    const host = makeHost(dir)
    const a = await host.getSession(dir, 'demo.html', () => {})
    const b = await host.getSession(dir, 'demo.html', () => {}, a.key)
    expect(b.key).toBe('demo.html')
    expect(b.ps.session).toBe(a.ps.session)
  })
})
