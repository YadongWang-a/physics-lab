import { describe, expect, it } from 'vitest'
import { EXTRACT_PROMPT, routeDecision } from '../src/main/agent/vision-extract'

describe('OCR 路由判定（ticket 06）', () => {
  it('主模型支持视觉 → 直通（无论是否配置视觉槽位）', () => {
    expect(routeDecision(['text', 'image'], false)).toBe('direct')
    expect(routeDecision(['text', 'image'], true)).toBe('direct')
  })

  it('主模型无视觉 + 配置了视觉槽位 → 转文本', () => {
    expect(routeDecision(['text'], true)).toBe('extract')
  })

  it('主模型无视觉 + 无视觉槽位 → 明确不可用（不静默）', () => {
    expect(routeDecision(['text'], false)).toBe('unsupported')
  })

  it('空 input 数组按无视觉处理', () => {
    expect(routeDecision([], true)).toBe('extract')
  })
})

describe('视觉转述契约（ticket 06 修订）：要把原图描述出来，不止 OCR', () => {
  it('四节结构：题目文字 / 图形描述 / 已知与符号 / 不确定与冲突', () => {
    for (const k of ['【题目文字】', '【图形描述】', '【已知与符号】', '【不确定与冲突】']) {
      expect(EXTRACT_PROMPT).toContain(k)
    }
  })

  it('图形描述必须覆盖 图形类型 / 视角 / 位置关系 / 三维 / 标注符号', () => {
    for (const k of ['图形类型', '视角', '位置关系', '三维信息', '标注与符号', '竖直方向']) {
      expect(EXTRACT_PROMPT).toContain(k)
    }
  })

  it('看不清或矛盾处如实标出，不做物理解读', () => {
    expect(EXTRACT_PROMPT).toContain('不确定: …')
    expect(EXTRACT_PROMPT).toContain('冲突: A 与 B')
    expect(EXTRACT_PROMPT).toContain('不做物理分析')
  })
})
