import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * lib/common.js `fieldArrow` 的 px 语义回归（无 Electron、无 Key）。
 *
 * 契约（drawing.md §4 F1）: 杆半宽/箭头半宽/箭头长都是 **px**，内部除以 `scale`
 * 换回调用方坐标单位。回归背景：杆半宽曾写死 `0.5`（漏除 scale），
 * 在世界变换页（scale≈192）把细箭头撑成 ~96px 宽的灰块，画布上显示为大三角形。
 * 因此这里断言"屏幕像素尺寸与 scale 无关"，而不是断言某个具体世界坐标值。
 */

const LIB_SOURCE = readFileSync(
  join(process.cwd(), 'resources', 'physics-lab-skill', 'lib', 'common.js'),
  'utf8'
)

const noop = (): void => {}
const FAKE_WINDOW = { addEventListener: noop }
const FAKE_DOCUMENT = { addEventListener: noop, getElementById: () => null }

/** 载入浏览器版 lib（顶层会碰 window/document，给桩即可），录下 fieldArrow 的闭合路径 */
function arrowOffsets(scale: number): { shaft: number; head: number } {
  const { fieldArrow } = new Function(
    'window',
    'document',
    `${LIB_SOURCE}; return { fieldArrow };`
  )(FAKE_WINDOW, FAKE_DOCUMENT) as {
    fieldArrow: (
      ctx: unknown,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      opts: { scale: number }
    ) => void
  }

  const pts: Array<[number, number]> = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    beginPath: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    moveTo: (x: number, y: number) => pts.push([x, y]),
    lineTo: (x: number, y: number) => pts.push([x, y])
  }
  // 水平箭头（长 10 世界单位，须满足 len*scale ≥ 3 才绘制）：
  // path = 杆上沿 → 杆上沿(头根) → 头上沿 → 尖端 → 头下沿 → 杆下沿
  fieldArrow(ctx, 0, 0, 10, 0, { scale })
  expect(pts).toHaveLength(6)
  return { shaft: Math.abs(pts[0]![1]), head: Math.abs(pts[2]![1]) }
}

describe('fieldArrow：杆/箭头的 px 语义与 scale 无关', () => {
  it('世界变换页与世界/屏坐标页的屏幕像素尺寸一致（scale=1/100/192.09）', () => {
    for (const scale of [1, 100, 192.09]) {
      const { shaft, head } = arrowOffsets(scale)
      // 乘回 scale = 屏幕像素半宽，必须恒为 0.5px / 1.8px
      expect(shaft * scale).toBeCloseTo(0.5, 6)
      expect(head * scale).toBeCloseTo(1.8, 6)
    }
  })
})
