import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { createPhysicsSession } from '../src/main/agent/agent-runner'
import { WorkspaceManager } from '../src/main/workspace/workspace-manager'

/**
 * SDK 层 seam：清单中的会话文件（.pi-sessions/<stem>.jsonl）可恢复为
 * 带完整历史的 agent 会话 —— 对应 ticket 02「重启后列表与会话完整恢复」。
 * 恢复本身不调用 LLM，无需 Key。
 */

const DEMO_HTML = `<!doctype html><html><head><title>弹簧振子</title></head>
<body><canvas id="scene"></canvas>
<script src="lib/common.js"></script></body></html>`

function makeSessionFile(cwd: string, file: string): string {
  const header = {
    type: 'session',
    version: 3,
    id: 'test-session-0001',
    timestamp: '2026-08-18T00:00:00.000Z',
    cwd
  }
  const entry = {
    type: 'message',
    id: 'a1b2c3d4',
    parentId: null,
    timestamp: '2026-08-18T00:00:01.000Z',
    message: { role: 'user', content: '求小球自由落体 2 秒后的速度' }
  }
  mkdirSync(join(cwd, '.pi-sessions'), { recursive: true })
  const path = join(cwd, '.pi-sessions', file)
  writeFileSync(path, `${JSON.stringify(header)}\n${JSON.stringify(entry)}\n`, 'utf8')
  return path
}

describe('SDK 层：清单会话文件恢复', () => {
  it('扫描出的演示，其会话文件可恢复为带历史的 agent 会话', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-resume-'))
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    makeSessionFile(dir, 'spring.jsonl')

    const ws = WorkspaceManager.open(dir)
    ws.scan()
    const demo = ws.list()[0]!
    expect(demo.file).toBe('spring.html')
    expect(demo.sessionFile).toBe('spring.jsonl')

    const manager = SessionManager.open(join(dir, '.pi-sessions', demo.sessionFile))
    const { session, dispose } = await createPhysicsSession({
      cwd: dir,
      sessionDir: join(dir, '.pi-sessions'),
      agentDir: join(dir, '.agent'),
      sessionManager: manager
    })

    expect(session.messages.some((m) => m.role === 'user' && m.content === '求小球自由落体 2 秒后的速度')).toBe(
      true
    )
    dispose()
  })

  it('无会话文件的新演示：可创建全新会话（空历史）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-new-'))
    writeFileSync(join(dir, 'fresh.html'), DEMO_HTML)
    const ws = WorkspaceManager.open(dir)
    ws.scan()
    const demo = ws.list()[0]!

    const { session, dispose } = await createPhysicsSession({
      cwd: dir,
      sessionDir: join(dir, '.pi-sessions'),
      agentDir: join(dir, '.agent'),
      sessionFile: demo.sessionFile
    })
    // 固定命名生效：会话落盘为清单约定的 <stem>.jsonl
    expect(session.sessionFile?.endsWith(demo.sessionFile)).toBe(true)
    // 该路径可立即用于恢复（同历史断言：空历史可继续）
    const reopened = SessionManager.open(session.sessionFile!)
    expect(reopened.getEntries().length).toBe(0)
    dispose()
  })
})
