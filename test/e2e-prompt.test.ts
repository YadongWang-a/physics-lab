import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPhysicsSession } from '../src/main/agent/agent-runner'
import { skillSystemPrompt } from '../src/main/agent/agent-runner'

// 端到端：新 skill 提示（含 LaTeX 规范）→ 真实模型输出 → 断言格式
// 需要 DEEPSEEK_API_KEY 环境变量；缺失跳过
const KEY = process.env.DEEPSEEK_API_KEY ?? process.env.OPENCODE_API_KEY

describe.skipIf(!KEY)('端到端：新提示的公式输出格式', () => {
  it('真实生成含 LaTeX 公式而非 Unicode 文本', async (ctx) => {
    const base = mkdtempSync(join(tmpdir(), 'physics-lab-e2e-'))
    const { session, dispose } = await createPhysicsSession({
      cwd: base,
      sessionDir: join(base, '.pi-sessions'),
      agentDir: join(base, '.agent'),
      mainSlot: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: KEY },
      systemPrompt: skillSystemPrompt('D:/项目开发/physics-lab/resources/physics-lab-skill')
    })
    await session.prompt('一个小球从 5m 高处自由落体，求落地时间')
    const last = session.messages[session.messages.length - 1] as { role?: string; content?: unknown[]; errorMessage?: string }
    if (last?.role === 'assistant' && (last as { stopReason?: string }).stopReason === 'error') {
      ctx.skip()
      return
    }
    const text = String(
      (last as { content?: unknown[] }).content
        ?.filter((c) => (c as { type?: string }).type === 'text')
        .map((c) => (c as { text?: string }).text ?? '')
        .join('') ?? ''
    )
    console.log('E2E_TEXT_START=' + text.slice(0, 300))
    // 新规范：公式必须 LaTeX 包裹
    expect(text).toMatch(/\$[^$]+\$/)
    // 不再用 Unicode 拼凑公式
    expect(text).not.toMatch(/[½√²⟹]/)
    dispose()
  })
})
