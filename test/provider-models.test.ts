import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent'
import {
  applySlotToRuntime,
  fetchLiveModelIds,
  mergeModelIds
} from '../src/main/agent/provider-config'

describe('mergeModelIds：静态目录 ∪ 实时列表', () => {
  it('静态在前、目录外追加、去重保序', () => {
    expect(mergeModelIds(['a', 'b'], ['b', 'c', 'a'])).toEqual(['a', 'b', 'c'])
  })
  it('实时为空时原样返回静态', () => {
    expect(mergeModelIds(['a', 'b'], [])).toEqual(['a', 'b'])
  })
  it('过滤空 id', () => {
    expect(mergeModelIds([], ['', 'x'])).toEqual(['x'])
  })
})

describe('applySlotToRuntime：目录外模型兜底注册', () => {
  it('槽位模型不在运行时目录时注册合成条目，registry.find 可查', async () => {
    const authPath = join(mkdtempSync(join(tmpdir(), 'pml-')), 'auth.json')
    const runtime = await ModelRuntime.create({ authPath, refreshOnCreate: false })
    const ghost = 'deepseek-future-model-x'
    expect(runtime.getModels('deepseek').some((m) => m.id === ghost)).toBe(false)
    await applySlotToRuntime(runtime, { provider: 'deepseek', modelId: ghost })
    expect(runtime.getModels('deepseek').some((m) => m.id === ghost)).toBe(true)
    const registry = new ModelRegistry(runtime)
    await registry.refresh()
    expect(registry.find('deepseek', ghost)?.id).toBe(ghost)
  })

  it('目录内模型不触发重注册（目录保持原样）', async () => {
    const authPath = join(mkdtempSync(join(tmpdir(), 'pml-')), 'auth.json')
    const runtime = await ModelRuntime.create({ authPath, refreshOnCreate: false })
    const before = runtime.getModels('deepseek').map((m) => m.id)
    await applySlotToRuntime(runtime, { provider: 'deepseek', modelId: 'deepseek-v4-flash' })
    expect(runtime.getModels('deepseek').map((m) => m.id)).toEqual(before)
  })
})

describe('fetchLiveModelIds：实时 /models 拉取', () => {
  it('无 Key / 未知供应商返回空（回落静态目录）', async () => {
    expect(await fetchLiveModelIds('deepseek', undefined)).toEqual([])
    expect(await fetchLiveModelIds('unknown-provider', 'sk-x')).toEqual([])
  })
})
