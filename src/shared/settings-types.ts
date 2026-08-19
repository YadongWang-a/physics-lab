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
