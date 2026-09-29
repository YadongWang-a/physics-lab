import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  blockedLibRead,
  guardedReadTool,
  LIB_READ_LIMIT_BYTES,
  LIB_READ_MAX_LINES
} from '../src/main/agent/guarded-read'
import { createPhysicsSession } from '../src/main/agent/agent-runner'
import type { AgentToolResult, ExtensionContext } from '@earendil-works/pi-coding-agent'

const KB = 1024

/** 建临时工作目录并写 `lib/<name>`（精确 size 字节、多行），返回目录 */
function workspaceWithLibFile(name: string, size: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'physics-lab-guard-'))
  mkdirSync(join(dir, 'lib'), { recursive: true })
  const line = 'xxxxxxxxxx\n' // 11 字节/行，避免撞上 SDK 的单行 50KB 上限
  const body = line.repeat(Math.floor(size / line.length))
  writeFileSync(join(dir, 'lib', name), body + 'x'.repeat(size - body.length))
  return dir
}

/** 工具 execute 只用到 ctx.cwd（原生 read 用它解析相对路径），其余字段不参与 */
function ctxWithCwd(cwd: string): ExtensionContext {
  return { cwd } as unknown as ExtensionContext // 单次测试替身：SDK 无 ctx 工厂
}

function textOf(res: AgentToolResult<unknown>): string {
  return res.content.map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('')
}

describe('guarded read：lib 源码不可读（ADR-0003 修订）', () => {
  it('lib/*.js 一律拦截：任何大小、任何 limit 都不放行，文案指向索引与 check_demo', () => {
    const small = workspaceWithLibFile('common.js', 2 * KB)
    const big = workspaceWithLibFile('common.js', 70 * KB)
    for (const dir of [small, big]) {
      const msg = blockedLibRead(dir, 'lib/common.js')
      expect(msg).toContain('lib/*.js 源码不可读')
      expect(msg).toContain('lib/INDEX.md')
      expect(msg).toContain('check_demo')
      expect(blockedLibRead(dir, 'lib/common.js', 20)).toContain('lib/*.js 源码不可读')
    }
  })

  it('lib 下非 js 的大文件：整读拦截、定向读（limit ≤60）放行', () => {
    const dir = workspaceWithLibFile('bundle.txt', 70 * KB)
    expect(blockedLibRead(dir, 'lib/bundle.txt')).toContain('已拦截整读')
    expect(blockedLibRead(dir, 'lib/bundle.txt', LIB_READ_MAX_LINES)).toBeNull()
    expect(blockedLibRead(dir, 'lib/bundle.txt', LIB_READ_MAX_LINES + 1)).toContain('已拦截整读')
  })

  it('lib 下的小文件放行（common.css 类）', () => {
    const dir = workspaceWithLibFile('common.css', 15 * KB)
    expect(blockedLibRead(dir, 'lib/common.css')).toBeNull()
    expect(blockedLibRead(dir, 'lib/common.css', LIB_READ_LIMIT_BYTES)).toBeNull()
  })

  it('只有 lib 目录下才拦：工作目录根的文件放行（相对与绝对路径都放行）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-guard-'))
    writeFileSync(join(dir, 'demo.html'), 'x'.repeat(70 * KB))
    writeFileSync(join(dir, 'app.js'), 'x'.repeat(70 * KB))
    expect(blockedLibRead(dir, 'demo.html')).toBeNull()
    expect(blockedLibRead(dir, 'app.js')).toBeNull()
    expect(blockedLibRead(dir, join(dir, 'demo.html'))).toBeNull()
  })

  it('文件不存在时放行，交给原生 read 报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-guard-'))
    expect(blockedLibRead(dir, 'lib/does-not-exist.txt')).toBeNull()
  })
})

describe('guarded read：工具定义包装', () => {
  it('命中时直接返回拦截文案，不返回文件内容', async () => {
    const dir = workspaceWithLibFile('common.js', 70 * KB)
    const res = await guardedReadTool(dir).execute(
      't1',
      { path: 'lib/common.js' },
      undefined,
      undefined,
      ctxWithCwd(dir)
    )
    expect(textOf(res)).toContain('lib/*.js 源码不可读')
    expect(textOf(res)).not.toContain('xxxx')
  })

  it('未命中时原样走 SDK 的 read 实现', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'physics-lab-guard-'))
    writeFileSync(join(dir, 'demo.html'), '<title>演示</title>\n')
    const res = await guardedReadTool(dir).execute(
      't2',
      { path: 'demo.html' },
      undefined,
      undefined,
      ctxWithCwd(dir)
    )
    expect(textOf(res)).toContain('演示')
  })

  it('lib 下非 js 文件的定向读走原生 read，返回真实内容', async () => {
    const dir = workspaceWithLibFile('bundle.txt', 70 * KB)
    const res = await guardedReadTool(dir).execute(
      't3',
      { path: 'lib/bundle.txt', offset: 1, limit: 20 },
      undefined,
      undefined,
      ctxWithCwd(dir)
    )
    expect(textOf(res)).toContain('xxxx')
    expect(textOf(res)).not.toContain('已拦截')
  })
})

/** SDK 的工具注册表（私有字段，无公开访问器）；仅用于验证同名覆盖生效 */
interface ToolRegistryEntry {
  sourceInfo: { source: string }
}

function registryOf(session: object): Map<string, ToolRegistryEntry> | undefined {
  const bag = session as unknown as Record<string, unknown> // SDK 私有字段，故显式读取
  const registry = bag._toolDefinitions
  return registry instanceof Map ? (registry as Map<string, ToolRegistryEntry>) : undefined
}

// 真实会话级验证需要模型与 Key
const KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENCODE_API_KEY

describe.skipIf(!KEY)('guarded read/grep：会话级生效', () => {
  it('registry 里的 read/grep 来自 SDK 自定义工具，而非内建', async () => {
    const dir = workspaceWithLibFile('common.js', 70 * KB)
    const { session, dispose } = await createPhysicsSession({
      cwd: dir,
      sessionDir: join(dir, '.pi-sessions'),
      agentDir: join(dir, '.agent'),
      mainSlot: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: KEY }
    })
    const registry = registryOf(session)
    expect(registry?.get('read')?.sourceInfo.source).toBe('sdk')
    expect(registry?.get('grep')?.sourceInfo.source).toBe('sdk')
    dispose()
  })

  it('模型读或 grep lib/common.js 时都拿到拦截文案', async () => {
    const dir = workspaceWithLibFile('common.js', 70 * KB)
    const { session, dispose } = await createPhysicsSession({
      cwd: dir,
      sessionDir: join(dir, '.pi-sessions'),
      agentDir: join(dir, '.agent'),
      mainSlot: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: KEY },
      systemPrompt: '你是测试助手：用户要求调用某个工具时直接调用，并把工具返回的内容原样贴出来。'
    })
    await session.prompt(
      '依次调用两次工具：先用 read 读 lib/common.js，再用 grep 在 lib/common.js 里搜 "function"。把两次返回的内容原样贴出来。'
    )
    expect(JSON.stringify(session.messages)).toContain('lib/*.js 源码不可读')
    dispose()
  })
})
