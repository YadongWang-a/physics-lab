import { describe, expect, it } from 'vitest'
import { normalizeMathDelims } from '../src/shared/math-delims'

describe('normalizeMathDelims：LaTeX 圆/方括号定界符 → 美元定界符', () => {
  it('行内 \\(…\\) 转为 $…$', () => {
    expect(normalizeMathDelims('质量比 \\(m_2\\ge m_1\\) 时显示轻球撞重球')).toBe(
      '质量比 $m_2\\ge m_1$ 时显示轻球撞重球'
    )
  })

  it('展示公式 \\[…\\] 转为 $$…$$（含换行）', () => {
    expect(normalizeMathDelims('守恒：\\[\np_初 = p_末\n\\] 结束')).toBe('守恒：$$\np_初 = p_末\n$$ 结束')
  })

  it('成对转换，未配对的 \\( 不动', () => {
    expect(normalizeMathDelims('只有左定界 \\(m_2=4 无右定界')).toBe('只有左定界 \\(m_2=4 无右定界')
    expect(normalizeMathDelims('普通括号 (m_2=4) 与函数 f(x) 不受影响')).toBe(
      '普通括号 (m_2=4) 与函数 f(x) 不受影响'
    )
  })

  it('代码块与行内代码中的 \\( 原样保留', () => {
    const src = '前文\n```\n\\(x\\) not math\n```\n后文 `\\(y\\)` 尾'
    expect(normalizeMathDelims(src)).toBe(src)
  })

  it('混合场景：验证抽查段落（真实 agent 输出形态）', () => {
    const src = '验证（抽查）：\\(m_2=4\\)：球1撞球2 → \\(v_1\'=-\\tfrac35 v_0,\\ v_2\'=\\tfrac15 v_0\\)，\\(p\\)、\\(K\\) 守恒 ✓'
    expect(normalizeMathDelims(src)).toBe(
      "验证（抽查）：$m_2=4$：球1撞球2 → $v_1'=-\\tfrac35 v_0,\\ v_2'=\\tfrac15 v_0$，$p$、$K$ 守恒 ✓"
    )
  })
})
