import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { createPhysicsSession, SKILL_SYSTEM_PROMPT, type PhysicsSession } from './agent-runner'
import type { ChatHistoryEntry } from '../../shared/ipc-types'

/**
 * 会话池（主进程）：每演示一个 agent 会话（一个 HTML 一个 session，ADR-0002）。
 * 会话按需创建（复用/恢复历史），事件流在创建时绑定转发回调。
 * file 为 null 表示"新会话"（尚无 HTML）：用 _new-<时间戳> 作为临时 key，
 * 生成完成后由 main 的 finalizeNewSession 绑定到实际 HTML 并重命名会话文件。
 */
export interface SessionHostOptions {
  agentDir: string
  skillDir: string
}

interface SessionEntry {
  ps: PhysicsSession
  workspaceDir: string
}

type ContentBlock = { type: string; text?: string }

function textOfBlocks(content: string | ContentBlock[] | undefined): string {
  if (typeof content === 'string' || !content) return ''
  return content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text ?? '')
    .join('')
}

function messagesToHistory(messages: readonly unknown[]): ChatHistoryEntry[] {
  const out: ChatHistoryEntry[] = []
  for (const raw of messages) {
    const m = raw as { role?: string; content?: string | ContentBlock[] }
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : textOfBlocks(m.content)
      if (text) out.push({ role: 'user', text })
    } else if (m.role === 'assistant') {
      const text = textOfBlocks(m.content)
      if (text) out.push({ role: 'assistant', text })
    }
  }
  return out
}

export class SessionHost {
  private readonly sessions = new Map<string, SessionEntry>()

  constructor(private readonly opts: SessionHostOptions) {}

  /** 取（或创建）会话；file 为 null 时创建未绑定新会话。返回会话 key（供绑定） */
  async getSession(
    workspaceDir: string,
    file: string | null,
    onEvent: (e: unknown) => void
  ): Promise<{ key: string; ps: PhysicsSession }> {
    const key = file ?? `_new-${Date.now()}`
    const existing = this.sessions.get(key)
    if (existing) return { key, ps: existing.ps }
    const ps = await createPhysicsSession({
      cwd: workspaceDir,
      sessionDir: join(workspaceDir, '.pi-sessions'),
      agentDir: this.opts.agentDir,
      sessionFile: `${key}.jsonl`,
      skillDir: this.opts.skillDir,
      systemPrompt: SKILL_SYSTEM_PROMPT
    })
    ps.session.subscribe((e) => onEvent(e))
    this.sessions.set(key, { ps, workspaceDir })
    return { key, ps }
  }

  async prompt(key: string, text: string): Promise<void> {
    const entry = this.sessions.get(key)
    if (!entry) throw new Error(`会话未创建: ${key}`)
    await entry.ps.session.prompt(text)
  }

  async abort(key: string): Promise<void> {
    await this.sessions.get(key)?.ps.session.abort()
  }

  /** 会话历史：内存会话优先；否则从磁盘 .pi-sessions/<stem>.jsonl 恢复（重启后可见） */
  history(file: string, workspaceDir: string): ChatHistoryEntry[] {
    const entry = this.sessions.get(file)
    if (entry) return messagesToHistory(entry.ps.session.messages)
    // 磁盘恢复
    const sessionPath = join(workspaceDir, '.pi-sessions', `${file.replace(/\.html$/i, '')}.jsonl`)
    if (!existsSync(sessionPath)) return []
    try {
      const manager = SessionManager.open(sessionPath)
      const messages = manager
        .getEntries()
        .filter((e) => e.type === 'message')
        .map((e) => ('message' in e ? e.message : undefined))
      return messagesToHistory(messages)
    } catch {
      return []
    }
  }

  release(key: string): void {
    this.sessions.get(key)?.ps.dispose()
    this.sessions.delete(key)
  }
}
