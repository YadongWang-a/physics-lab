import { readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { Type } from 'typebox'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { extractImageText } from './vision-extract'
import { ATTACHMENTS_DIR } from './image-attachments'
import type { ModelSlotConfig } from '../../shared/settings-types'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
}

/**
 * 附件路径解析 + 越界拦截（ADR-0003 修订）：`read_image` 只能回看会话附件，
 * 且必须是可回看的图片格式——它不该变成"拿图片当借口读任意文件"的通道。
 */
export function resolveAttachment(cwd: string, relPath: string): { abs: string; mimeType: string } {
  const root = resolve(cwd, ATTACHMENTS_DIR)
  const abs = resolve(cwd, relPath)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`只能回看会话附件（${ATTACHMENTS_DIR}/ 内的文件）：${relPath}`)
  }
  if (!statSync(abs, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`附件不存在：${relPath}`)
  }
  const ext = abs.slice(abs.lastIndexOf('.') + 1).toLowerCase()
  const mimeType = MIME_BY_EXT[ext]
  if (!mimeType) {
    throw new Error(`不是可回看的图片（支持 png/jpg/webp/gif）：${relPath}`)
  }
  return { abs, mimeType }
}

const ASK_PREFIX =
  '这是物理题的图。只回答被问到的这一点；图上没有或看不清就直说「看不清」，不要推测、不要补充其他内容。\n\n问题: '

/**
 * `read_image` —— 回看题图（ADR-0003 修订）。
 * 视觉转述是一次性的、主模型看不到原图，所以转述里标了「不确定/冲突」又影响解题的几何，
 * 必须有"再看一眼"的通道：就那一点定向追问视觉模型（一次一件事），而不是靠猜。
 */
export function readImageTool(opts: {
  cwd: string
  authPath: string
  getVisionSlot: () => ModelSlotConfig | undefined
}) {
  return defineTool({
    name: 'read_image',
    label: '回看题图',
    description:
      '回看老师贴的题图（会话附件），就图上某一点向视觉模型定向提问。' +
      '用于视觉转述里标了「不确定」或「冲突」、且影响解题的项——一次只问一件事（如「绳是绷直还是松弛」）；' +
      '重述整张图请勿用它。参数：path 为附件路径（见系统提示的图片节），question 为要问的那一点。',
    promptSnippet: 'read_image(path, question) — 回看题图，就某一点定向提问视觉模型',
    parameters: Type.Object({
      path: Type.String({ description: `附件路径，形如 ${ATTACHMENTS_DIR}/<会话>-1.png` }),
      question: Type.String({ description: '要问的那一点，一次只问一件事' })
    }),
    execute: async (_toolCallId, params) => {
      const slot = opts.getVisionSlot()
      if (!slot) {
        const text = '未配置视觉模型，无法回看题图（请在设置里配置视觉槽位）。'
        return { content: [{ type: 'text', text }], details: { text } }
      }
      const { abs, mimeType } = resolveAttachment(opts.cwd, params.path)
      const text = await extractImageText({
        authPath: opts.authPath,
        slot,
        images: [{ data: readFileSync(abs).toString('base64'), mimeType }],
        prompt: ASK_PREFIX + params.question
      })
      return { content: [{ type: 'text', text }], details: { text } }
    }
  })
}
