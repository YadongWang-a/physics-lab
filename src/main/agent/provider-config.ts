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
 * - 内置供应商（deepseek）：setRuntimeApiKey 运行时注入（不落 auth.json 明文）；
 *   槽位模型不在运行时目录时（实时列表领先 SDK 静态目录），用保守默认条目兜底注册，
 *   否则 registry.find 报「模型不存在」
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
  } else if (slot.modelId && !runtime.getModels(slot.provider).some((m) => m.id === slot.modelId)) {
    const def = runtime.getProvider(slot.provider)
    runtime.registerProvider(slot.provider, {
      name: def?.name ?? slot.provider,
      baseUrl: def?.baseUrl,
      api: DEFAULT_CUSTOM_API,
      models: [customModel(slot.modelId)]
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
/** 自定义端点模型目录条目（未声明的元数据用保守默认，全部由端点自己决定）；亦用于实时列表目录外模型的兜底注册 */
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

/** 内置供应商 → 实时模型列表端点（OpenAI 兼容 GET /models；无条目 = 不支持实时拉取） */
const LIVE_MODEL_ENDPOINTS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/models'
}

/**
 * 实时拉取供应商当前支持的模型 id（失败/无 Key 返回空，调用方回落静态目录）。
 * 独立于 SDK：deepseek 未实现 refreshModels，静态目录会落后于官方新模型。
 */
export async function fetchLiveModelIds(provider: string, apiKey: string | undefined): Promise<string[]> {
  const url = LIVE_MODEL_ENDPOINTS[provider]
  if (!url || !apiKey) return []
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

/** 静态目录 ∪ 实时列表：静态在前（带能力元数据），目录外新模型追加（纯函数，可单测） */
export function mergeModelIds(staticIds: readonly string[], liveIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [...staticIds, ...liveIds]) {
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/** 内置供应商 → 可用模型 id 列表（动态获取：registry.refresh 后从运行时目录读） */
export function listProviderModels(runtime: ModelRuntime, provider: string): string[] {
  return runtime.getModels(provider).map((m) => m.id)
}
