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

describe('内置 skill prompt（无 Key）', () => {
  it('完整规范直接注入 system prompt，不注册或读取 SKILL.md', () => {
    const systemPrompt = skillSystemPrompt(SKILL_DIR)
    expect(systemPrompt).toContain('<physics-lab-skill>')
    expect(systemPrompt).toContain('生成流程')
    expect(systemPrompt).toContain('包括新建演示、修改已有 HTML、继续对话')
    expect(systemPrompt).toContain('drawing.md')
    expect(systemPrompt).not.toContain('必须用 read 工具读取技能文件')
    expect(systemPrompt).not.toContain('find/ls')
  })

  it('注入工作目录现有演示名单（命名查重靠它，省掉 ls 探索）', () => {
    const withDemos = skillSystemPrompt(SKILL_DIR, ['alpha.html', 'beta-3d.html'])
    expect(withDemos).toContain('## 工作目录现有演示')
    expect(withDemos).toContain('- alpha.html')
    expect(withDemos).toContain('- beta-3d.html')
    expect(skillSystemPrompt(SKILL_DIR)).toContain('- （工作目录暂无 .html）')
  })
})

describe('skill 资产（无 Key）', () => {
  it('drawing.md §11 带 3D 取景判据与可运行的收尾自查断言', () => {
    const md = readFileSync(join(SKILL_DIR, 'drawing.md'), 'utf8')
    expect(md).toContain('### 取景与观感(3D 专属, 画完必查)')
    expect(md).toContain("querySelector('#scene')")
    expect(md).toContain('>=0.5')
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
