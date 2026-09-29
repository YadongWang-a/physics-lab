import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockedLibGrep, guardedGrepTool } from '../src/main/agent/guarded-grep'
import type { AgentToolResult, ExtensionContext } from '@earendil-works/pi-coding-agent'

function ctxWithCwd(cwd: string): ExtensionContext {
  return { cwd } as unknown as ExtensionContext // 单次测试替身：SDK 无 ctx 工厂
}

function textOf(res: AgentToolResult<unknown>): string {
  return res.content.map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('')
}

const tmp = mkdtempSync(join(tmpdir(), 'physics-lab-grep-'))

describe('guarded grep：lib 源码不可检索（ADR-0003 修订）', () => {
  it('检索 lib/*.js 或整个 lib 目录被拦截，文案指向索引与 check_demo', () => {
    const msg = blockedLibGrep(tmp, 'lib/common.js')
    expect(msg).toContain('lib/*.js 源码不可检索')
    expect(msg).toContain('lib/INDEX.md')
    expect(msg).toContain('check_demo')
    expect(blockedLibGrep(tmp, 'lib')).not.toBeNull()
    expect(blockedLibGrep(tmp, join(tmp, 'lib', 'mathjax.js'))).not.toBeNull()
  })

  it('页面代码、模板、css、工作目录整体检索仍放行', () => {
    expect(blockedLibGrep(tmp, 'demo.html')).toBeNull()
    expect(blockedLibGrep(tmp, 'lib/common.css')).toBeNull()
    expect(blockedLibGrep(tmp, '.')).toBeNull()
    expect(blockedLibGrep(tmp)).toBeNull()
    expect(blockedLibGrep(tmp, join(tmp, 'app.js'))).toBeNull()
  })

  it('工具包装：命中返回拦截文案，未命中走原生 grep', async () => {
    mkdirSync(join(tmp, 'lib'), { recursive: true })
    const tool = guardedGrepTool(tmp)
    const blocked = await tool.execute(
      'g1',
      { pattern: 'startLoop', path: 'lib/common.js' },
      undefined,
      undefined,
      ctxWithCwd(tmp)
    )
    expect(textOf(blocked)).toContain('lib/*.js 源码不可检索')
  })
})
