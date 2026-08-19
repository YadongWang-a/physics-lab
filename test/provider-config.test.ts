import { describe, expect, it } from 'vitest'
import { CUSTOM_PROVIDER_ID, type ModelSlotConfig } from '../src/shared/settings-types'
import { customModel, customModelsOf } from '../src/main/agent/provider-config'

describe('provider-config：槽位解析', () => {
  it('customModels 优先；否则单模型 modelId', () => {
    const slot: ModelSlotConfig = {
      provider: CUSTOM_PROVIDER_ID,
      modelId: 'qwen-max',
      customModels: ['qwen-max', 'qwen-turbo']
    }
    expect(customModelsOf(slot)).toEqual(['qwen-max', 'qwen-turbo'])
    expect(customModelsOf({ provider: CUSTOM_PROVIDER_ID, modelId: 'only-one' })).toEqual(['only-one'])
  })

  it('custom 模型目录条目：必填元数据齐全（Api/Model 契约）', () => {
    const m = customModel('qwen-max')
    expect(m).toMatchObject({
      id: 'qwen-max',
      name: 'qwen-max',
      reasoning: false,
      input: ['text'],
      contextWindow: 128000,
      maxTokens: 8192
    })
    expect(typeof m.cost.input).toBe('number')
    expect(typeof m.cost.output).toBe('number')
    expect(typeof m.cost.cacheRead).toBe('number')
    expect(typeof m.cost.cacheWrite).toBe('number')
  })

  it('自定义端点无模型名 → 空目录（注册时应拒绝）', () => {
    expect(customModelsOf({ provider: CUSTOM_PROVIDER_ID, modelId: '' })).toEqual([])
  })
})
