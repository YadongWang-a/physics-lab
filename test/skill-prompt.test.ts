import { describe, it, expect } from 'vitest'
import { PHYSICS_SKILL_PROMPT } from '../src/main/agent/physics-skill-prompt'

describe('physics-skill-prompt：对话内公式与标题格式规范（ticket：chat 公式显示）', () => {
  it('要求 LaTeX 公式书写（编译后为单反斜杠）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('$t=\\sqrt{2h/g}$')
    expect(PHYSICS_SKILL_PROMPT).toContain('$h=\\frac{1}{2}gt^2$')
  })
  it('禁止 Unicode 文本公式与加粗伪标题', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('禁止用 Unicode 文本公式')
    expect(PHYSICS_SKILL_PROMPT).toContain('禁止用整段加粗冒充标题')
  })
  it('要求小节标题用 ###', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('小节标题用 ###')
  })
})
