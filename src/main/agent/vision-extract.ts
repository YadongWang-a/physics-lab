import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ImageContent } from '@earendil-works/pi-ai'
import { applySlotToRuntime } from './provider-config'
import type { ModelSlotConfig } from '../../shared/settings-types'

/** 聊天图片载荷（渲染层 → 主进程） */
export interface ImagePayload {
  /** base64（无 data: 前缀） */
  data: string
  mimeType: string
}

/** 路由判定（纯函数，可单测）：主模型视觉能力 × 视觉槽位配置 */
export type RouteKind = 'direct' | 'extract' | 'unsupported'

export function routeDecision(
  mainModelInput: readonly string[],
  visionConfigured: boolean
): RouteKind {
  if (mainModelInput.includes('image')) return 'direct'
  return visionConfigured ? 'extract' : 'unsupported'
}

const EXTRACT_PROMPT =
  '这是物理题目或物理过程的图片。请把图片内容完整转述为文字：题目文字、已知条件、数字、公式、几何关系、装置结构。只输出转述内容，不要解释、不要评论。'

/**
 * OCR 通道第二路：主模型不支持视觉时，用视觉槽位把图片转成文字。
 * 与 settings:test 同模式：独立 ModelRuntime + 运行时注入（不写 auth.json 明文）。
 */
export async function extractImageText(options: {
  authPath: string
  slot: ModelSlotConfig
  images: ImagePayload[]
}): Promise<string> {
  const { authPath, slot, images } = options
  const runtime = await ModelRuntime.create({ authPath, refreshOnCreate: false })
  await applySlotToRuntime(runtime, slot)
  await runtime.refresh()
  const model = runtime.getModel(slot.provider, slot.modelId)
  if (!model) {
    throw new Error(`视觉模型不存在：${slot.provider}/${slot.modelId}`)
  }
  const msg = await runtime.complete(
    model,
    {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_PROMPT },
            ...images.map((i): ImageContent => ({ type: 'image', data: i.data, mimeType: i.mimeType }))
          ],
          timestamp: Date.now()
        }
      ]
    },
    { signal: AbortSignal.timeout(90000) }
  )
  const text = msg.content
    .filter((c) => c.type === 'text' && 'text' in c)
    .map((c) => ('text' in c ? c.text : ''))
    .join('')
  if (!text.trim()) {
    throw new Error('视觉模型未返回可用的文字内容')
  }
  return text
}
