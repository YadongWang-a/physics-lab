import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPhysicsSession, skillSystemPrompt } from '../src/main/agent/agent-runner'
import { seedLibIntoWorkspace } from '../src/main/workspace/lib-seed'
import { collectIssues, idCrossCheck, skeletonCheck, syntaxCheck } from '../src/main/agent/check-demo/static-check'

/**
 * ticket 03：skill 默认加载 + lib 预置 + 端到端生成。
 * seam：SDK 调用层（agent-runner）。端到端用例需真实 Key（env 门控）。
 */

const SKILL_DIR = join(process.cwd(), 'resources', 'physics-lab-skill')
const hasKey = !!process.env.DEEPSEEK_API_KEY || !!process.env.OPENCODE_API_KEY

function makeDirs(): { cwd: string; sessionDir: string; agentDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'physics-lab-skilltest-'))
  return { cwd: base, sessionDir: join(base, '.pi-sessions'), agentDir: join(base, '.agent') }
}

describe('skill 注册（无 Key）', () => {
  it('physics-lab-skill 被只读注册进会话', async () => {
    const dirs = makeDirs()
    const { session, skills, systemPrompt, dispose } = await createPhysicsSession({
      ...dirs,
      skillDir: SKILL_DIR,
      systemPrompt: skillSystemPrompt(SKILL_DIR)
    })
    expect(skills).toContain('physics-lab-skill')
    // 系统提示已常驻注入（skill 默认触发，无"引入"概念；含 SKILL.md 确定路径，agent 无需 find）
    expect(systemPrompt).toContain(join(SKILL_DIR, 'SKILL.md'))
    expect(systemPrompt).toContain('完整流程')
    // skill 内容未被修改（只读注册）：SKILL.md 仍在原目录
    expect(existsSync(join(SKILL_DIR, 'SKILL.md'))).toBe(true)
    expect(session.sessionFile).toBeTruthy()
    dispose()
  })
})

describe('lib 预置（无 Key）', () => {
  it('seedLibIntoWorkspace 把 lib 三件套复制到工作目录', () => {
    const { cwd } = makeDirs()
    seedLibIntoWorkspace(cwd, SKILL_DIR)
    for (const f of ['common.css', 'common.js', 'mathjax.js']) {
      expect(existsSync(join(cwd, 'lib', f))).toBe(true)
    }
  })

  it('lib 已存在时不重复覆盖（保持与 skill 源一致）', () => {
    const { cwd } = makeDirs()
    seedLibIntoWorkspace(cwd, SKILL_DIR)
    seedLibIntoWorkspace(cwd, SKILL_DIR)
    const first = readFileSync(join(cwd, 'lib', 'common.js'), 'utf8')
    const src = readFileSync(join(SKILL_DIR, 'lib', 'common.js'), 'utf8')
    expect(first).toBe(src)
  })
})

describe.skipIf(!hasKey)('端到端：物理题 → skill 流程生成演示（真实 Key）', () => {
  it('输入物理题后，工作目录出现引用 lib 的演示 HTML', async (ctx) => {
    const dirs = makeDirs()
    seedLibIntoWorkspace(dirs.cwd, SKILL_DIR)
    const { session, dispose } = await createPhysicsSession({
      ...dirs,
      skillDir: SKILL_DIR,
      systemPrompt: skillSystemPrompt(SKILL_DIR),
      sessionFile: 'free-fall.jsonl'
    })
    try {
      await session.prompt('生成一个小球自由落体的演示 HTML。不要提问，直接按流程生成。')
    } finally {
      dispose()
    }
    // 账户余额不足（DeepSeek 402）时跳过而非失败；余额恢复后自动生效
    const last = session.messages[session.messages.length - 1]
    const errMsg =
      last?.role === 'assistant' && 'errorMessage' in last ? String(last.errorMessage) : ''
    if (errMsg.includes('402') || errMsg.includes('Insufficient Balance')) {
      return ctx.skip()
    }
    const files = readdirSync(dirs.cwd).filter((f) => f.toLowerCase().endsWith('.html'))
    expect(files.length).toBeGreaterThan(0)
    const demo = files[0]!
    expect(demo).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/) // kebab 命名
    const content = readFileSync(join(dirs.cwd, demo), 'utf8')
    expect(content).toMatch(/src=["']lib\/common\.js["']/) // 引用 lib（离线可运行）
    // 自检保证（应用层兜底等价验证）：生成文件必须通过 check_demo 静态检查
    const result = collectIssues([
      ...syntaxCheck(content),
      ...idCrossCheck(content),
      ...skeletonCheck(content)
    ])
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([])
  }, 1_200_000)
})
