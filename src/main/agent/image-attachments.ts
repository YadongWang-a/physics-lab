import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 会话附件目录（相对工作目录）：老师贴的题图落在工作目录里，随工作目录迁移（ADR-0002）。
 * 它是"与原图保真"的前提——主模型看不到原图，后续只能靠 `read_image` 回看这一份。
 * `read_image` 只允许读这个目录内的文件，不能当任意文件读取器用。
 */
export const ATTACHMENTS_DIR = '.pi-sessions/attachments'

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

/**
 * 把老师贴的图存进工作目录的会话附件，返回**相对工作目录**的路径（供注入系统提示/对话）。
 * 未知 mime 落成 `.bin`：仍然留档，只是 `read_image` 不会把它当图回看。
 */
export function saveChatImages(
  workspaceDir: string,
  key: string,
  images: readonly { data: string; mimeType: string }[]
): string[] {
  const safeKey = key.replace(/[^\w.-]/g, '_')
  mkdirSync(join(workspaceDir, ATTACHMENTS_DIR), { recursive: true })
  return images.map((img, i) => {
    const rel = `${ATTACHMENTS_DIR}/${safeKey}-${i + 1}.${EXT_BY_MIME[img.mimeType] ?? 'bin'}`
    writeFileSync(join(workspaceDir, rel), Buffer.from(img.data, 'base64'))
    return rel
  })
}
