import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveChatImages, ATTACHMENTS_DIR } from '../src/main/agent/image-attachments'

describe('会话附件：题图落盘（与原图保真的前提）', () => {
  it('按 mime 定扩展名，返回相对工作目录的路径，字节与输入一致', () => {
    const ws = mkdtempSync(join(tmpdir(), 'physics-lab-att-'))
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]).toString('base64')
    const paths = saveChatImages(ws, '_new-1-abc', [
      { data: png, mimeType: 'image/png' },
      { data: png, mimeType: 'image/jpeg' }
    ])
    expect(paths).toEqual([
      `${ATTACHMENTS_DIR}/_new-1-abc-1.png`,
      `${ATTACHMENTS_DIR}/_new-1-abc-2.jpg`
    ])
    for (const p of paths) expect(existsSync(join(ws, p))).toBe(true)
    expect(readFileSync(join(ws, paths[0]!)).toString('base64')).toBe(png)
  })

  it('会话键里的路径分隔符不会逃出附件目录', () => {
    const ws = mkdtempSync(join(tmpdir(), 'physics-lab-att-'))
    const paths = saveChatImages(ws, '../evil', [{ data: '', mimeType: 'image/png' }])
    expect(paths[0]).toBe(`${ATTACHMENTS_DIR}/.._evil-1.png`)
    expect(existsSync(join(ws, paths[0]!))).toBe(true)
  })
})
