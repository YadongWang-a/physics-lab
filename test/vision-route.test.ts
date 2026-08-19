import { describe, expect, it } from 'vitest'
import { routeDecision } from '../src/main/agent/vision-extract'

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
