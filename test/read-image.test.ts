import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAttachment } from '../src/main/agent/read-image'
import { ATTACHMENTS_DIR } from '../src/main/agent/image-attachments'

/** read_image 只能回看会话附件——它不该变成"拿图片当借口读任意文件"的通道 */
describe('read_image 的附件边界（ADR-0003 修订）', () => {
  const setup = (): string => {
    const ws = mkdtempSync(join(tmpdir(), 'physics-lab-ri-'))
    mkdirSync(join(ws, ATTACHMENTS_DIR), { recursive: true })
    writeFileSync(join(ws, ATTACHMENTS_DIR, 'a-1.png'), Buffer.from([1, 2, 3]))
    writeFileSync(join(ws, 'secret.txt'), 'x')
    return ws
  }

  it('附件目录内的图片 → 解析出绝对路径与 mime', () => {
    const ws = setup()
    const r = resolveAttachment(ws, `${ATTACHMENTS_DIR}/a-1.png`)
    expect(r.mimeType).toBe('image/png')
    expect(r.abs).toBe(join(ws, ATTACHMENTS_DIR, 'a-1.png'))
  })

  it('越界（工作目录里的其它文件、或用 ../ 绕出）→ 拒绝', () => {
    const ws = setup()
    expect(() => resolveAttachment(ws, 'secret.txt')).toThrow(/只能回看会话附件/)
    expect(() => resolveAttachment(ws, `${ATTACHMENTS_DIR}/../../secret.txt`)).toThrow(
      /只能回看会话附件/
    )
  })

  it('附件不存在 / 非图片扩展名 → 拒绝并给出可读原因', () => {
    const ws = setup()
    expect(() => resolveAttachment(ws, `${ATTACHMENTS_DIR}/nope.png`)).toThrow(/附件不存在/)
    writeFileSync(join(ws, ATTACHMENTS_DIR, 'b.bin'), 'x')
    expect(() => resolveAttachment(ws, `${ATTACHMENTS_DIR}/b.bin`)).toThrow(/不是可回看的图片/)
  })
})
