/** 模型槽位配置（主模型 / 视觉模型），主进程与渲染层共享 */

export type SlotProvider = 'opencode-go' | 'deepseek' | 'custom'

/** 自定义 OpenAI 兼容端点协议 */
export type CustomApi = 'openai-completions' | 'openai-responses'

export interface ModelSlotConfig {
  provider: SlotProvider
  /** 模型 id；provider=custom 时为所选自定义模型名 */
  modelId: string
  /** 自定义端点 baseURL（provider=custom 必填） */
  baseUrl?: string
  /** 自定义端点协议（默认 openai-completions） */
  api?: CustomApi
  /** 自定义端点可用模型名（逗号分隔输入转数组） */
  customModels?: string[]
  /**
   * 明文 API Key —— 仅存在于内存（会话创建/测试时）；
   * 落盘一律经 safeStorage 加密（见 SettingsStore.apiKeyEnc）。
   */
  apiKey?: string
}

export interface AppSettings {
  workspaceDir?: string
  main?: ModelSlotConfig
  vision?: ModelSlotConfig
}

/** 渲染层可见的槽位视图：不含明文 Key */
export interface ModelSlotView extends Omit<ModelSlotConfig, 'apiKey'> {
  hasApiKey: boolean
}

export interface SettingsView {
  main: ModelSlotView | null
  vision: ModelSlotView | null
}

/** 保存 payload：Key 单独传（空字符串 = 保持原样，禁止回显明文） */
export interface SaveSettingsPayload {
  main?: ModelSlotConfig
  vision?: ModelSlotConfig | null
  /** 传入则覆盖主槽位 Key；省略/空 = 保持原样 */
  mainApiKey?: string
  /** 传入则覆盖视觉槽位 Key；省略/空 = 保持原样 */
  visionApiKey?: string
}

export const CUSTOM_PROVIDER_ID = 'custom'

export const DEFAULT_MAIN_SLOT: ModelSlotConfig = {
  provider: 'opencode-go',
  modelId: 'deepseek-v4-flash'
}

export const PROVIDER_LABELS: Record<SlotProvider, string> = {
  'opencode-go': 'opencode-go（本机 opencode 网关）',
  deepseek: 'DeepSeek',
  custom: '自定义 OpenAI 兼容端点'
}

/**
 * 槽位 → 渲染层视图：剥离明文 Key（安全边界：渲染层永不接触明文）。
 * 主进程 settings:get / settings:save 返回值必经此转换。
 */
export function toSlotView(slot: ModelSlotConfig | undefined): ModelSlotView | null {
  if (!slot) return null
  const { apiKey, ...rest } = slot
  return { ...rest, hasApiKey: Boolean(apiKey) }
}

/**
 * settings:save 的合并语义（纯函数，便于测试）：
 * - `payload.main` 来自渲染层视图（不含明文 Key），整体替换时不能丢 Key；
 * - `mainApiKey` 省略/空 = 保持原样（渲染层不回显明文），故未传新 Key 时沿用 `current.main?.apiKey`；
 * - `payload.main` 整体缺省才回退 `current.main`（如只更新 vision）。
 */
export function mergeSettings(
  current: AppSettings,
  payload: SaveSettingsPayload
): AppSettings {
  const main: ModelSlotConfig | undefined = payload.main ?? current.main
  if (main) {
    main.apiKey = payload.mainApiKey ?? current.main?.apiKey
  }
  const vision: ModelSlotConfig | undefined =
    payload.vision === null ? undefined : payload.vision ?? current.vision
  if (vision) {
    vision.apiKey = payload.visionApiKey ?? current.vision?.apiKey
  }
  return { workspaceDir: current.workspaceDir, main, vision }
}
