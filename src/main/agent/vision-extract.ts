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

/**
 * 视觉转述契约（ticket 06，2026-10-07 修订）：
 * 不止逐字 OCR——必须描述**原图本身**：图形类型、视角、位置关系、三维/二维、标注符号，
 * 并把看不清/矛盾处标出来（原来漏读或读错的几何会全盘传给主模型，而主模型看不到原图）。
 */
export const EXTRACT_PROMPT = [
  '这是物理题目或物理过程的图片(可能是题目文字、示意图、实物照片、多视图)。请转述为文字, 供后续解题使用, 按四节输出:',
  '',
  '【题目文字】逐字转述题干与选项; 公式写 LaTeX(如 $v_0$、$\\frac{1}{2}mv^2$)。',
  '',
  '【图形描述】本节最重要, 必须逐项写清:',
  '- 图形类型: 平面示意图 / 立体(轴测)图 / 实物照片 / 多视图(主视·俯视·侧视);',
  '- 视角: 从哪个方向看(俯视 / 正视 / 侧视 / 斜视), 画面里哪条线是竖直方向, 深度方向怎么表达;',
  '- 位置关系: 逐个元素写清谁在谁的上下左右、谁与谁连接/接触/约束(绳、杆、弹簧、轨道、支撑面、支点、场、铰链), 以及初始状态(绳松弛还是绷直、有无间隙);',
  '- 三维信息: 三维还是二维; 若是三维, 竖直方向与水平面各是哪条线, 各物体、场、面的朝向;',
  '- 标注与符号: 图上的字母、箭头、角度、刻度、虚线、符号各自指向哪个元素。',
  '',
  '【已知与符号】题面给定的量、单位与符号约定。',
  '',
  '【不确定与冲突】看不清、被遮挡、或文字与图上符号互相矛盾的, 逐条列出(写「不确定: …」或「冲突: A 与 B」); 两个都如实写出, 不要猜、不要替它取舍。',
  '',
  '只做转述与图形描述; 不做物理分析(不列方程、不判断临界、不给结论)。'
].join('\n')

/**
 * OCR 通道第二路：主模型不支持视觉时，用视觉槽位把图片转成文字。
 * 与 settings:test 同模式：独立 ModelRuntime + 运行时注入（不写 auth.json 明文）。
 * `prompt` 缺省走整图转述契约（EXTRACT_PROMPT）；`read_image` 用定向提问的自定义 prompt。
 */
export async function extractImageText(options: {
  authPath: string
  slot: ModelSlotConfig
  images: ImagePayload[]
  prompt?: string
}): Promise<string> {
  const { authPath, slot, images, prompt = EXTRACT_PROMPT } = options
  const runtime = await ModelRuntime.create({ authPath, refreshOnCreate: false })
  // 视觉槽位必须声明 image 输入：目录外模型（如实时列表里的 vision 变体）若按保守默认
  // 注册为 text-only，SDK 会把图片换成占位文本，模型只能回「图片未提供」
  await applySlotToRuntime(runtime, slot, { input: ['text', 'image'] })
  await runtime.refresh()
  const model = runtime.getModel(slot.provider, slot.modelId)
  if (!model) {
    throw new Error(`视觉模型不存在：${slot.provider}/${slot.modelId}`)
  }
  if (!model.input.includes('image')) {
    throw new Error(`视觉模型不支持图片输入：${slot.provider}/${slot.modelId}（请改选支持视觉的模型）`)
  }
  const msg = await runtime.complete(
    model,
    {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
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
