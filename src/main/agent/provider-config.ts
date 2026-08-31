import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { CUSTOM_PROVIDER_ID, type CustomApi, type ModelSlotConfig } from '../../shared/settings-types'

/** 自定义端点默认协议 */
export const DEFAULT_CUSTOM_API = 'openai-completions' as const

/** 槽位结构（provider 放宽为 string：兼容旧参数 provider/apiKey/modelId 的 fallback 路径） */
export interface SlotLike {
  provider: string
  modelId: string
  apiKey?: string
  baseUrl?: string
  api?: CustomApi
  customModels?: string[]
}

/**
 * 槽位 → 运行时注入。规则：
 * - 内置供应商（deepseek）：setRuntimeApiKey 运行时注入（不落 auth.json 明文）
 * - custom：先注册自定义端点（baseUrl + 协议 + 模型目录），再运行时注入 Key
 */
export async function applySlotToRuntime(runtime: ModelRuntime, slot: SlotLike): Promise<void> {
  if (slot.provider === CUSTOM_PROVIDER_ID) {
    const models = customModelsOf(slot)
    if (!slot.baseUrl) throw new Error('自定义端点缺少 baseURL')
    if (models.length === 0) throw new Error('自定义端点未配置模型名')
    runtime.registerProvider(CUSTOM_PROVIDER_ID, {
      name: '自定义端点',
      baseUrl: slot.baseUrl,
      api: slot.api ?? DEFAULT_CUSTOM_API,
      models: models.map((m) => customModel(m))
    })
  }
  if (slot.apiKey) {
    await runtime.setRuntimeApiKey(slot.provider, slot.apiKey)
  }
}

/** 自定义端点模型目录：customModels 优先，否则单模型 modelId */
export function customModelsOf(slot: SlotLike): string[] {
  if (slot.customModels && slot.customModels.length > 0) return slot.customModels
  return slot.modelId ? [slot.modelId] : []
}

/** 自定义端点的模型目录条目（未声明的元数据用保守默认，全部由端点自己决定） */
export function customModel(id: string) {
  return {
    id,
    name: id,
    reasoning: false,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192
  }
}

/** 内置供应商 → 可用模型 id 列表（动态获取：registry.refresh 后从运行时目录读） */
export function listProviderModels(runtime: ModelRuntime, provider: string): string[] {
  return runtime.getModels(provider).map((m) => m.id)
}
