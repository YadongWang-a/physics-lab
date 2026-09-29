import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLibIndex } from '../src/main/workspace/lib-index'

const FIXTURE = `/* 顶层说明：本文件是助手库 */
const VERSION = '1.0'

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v))
}

/* ---- 矢量箭头 (杆+箭头+可选标签) ----
   scale 可选: 在世界变换内绘制时传 scale=V.s */
function drawArrow(ctx, x1, y1, x2, y2, opts) {
  return null
}

// 单行注释的常量
const palette = function () {
  return {}
}

function drawArrow(ctx, x1, y1, x2, y2, opts) {
  return null
}

  function nestedHelper() {
  return null
}
`

describe('buildLibIndex：从 common.js 抽取 API 索引', () => {
  const index = buildLibIndex(FIXTURE)

  it('列出顶层声明与签名', () => {
    expect(index).toContain('`VERSION()`')
    expect(index).toContain('`clamp(v, a, b)`')
    expect(index).toContain('`drawArrow(ctx, x1, y1, x2, y2, opts)`')
    expect(index).toContain('`palette()`')
  })

  it('带上紧邻的文档注释（含 opts 说明）', () => {
    expect(index).toContain('杆+箭头+可选标签')
    expect(index).toContain('scale 可选')
    expect(index).toContain('单行注释的常量')
  })

  it('去重、忽略缩进的嵌套函数', () => {
    expect(index.match(/`drawArrow\(/g)).toHaveLength(1)
    expect(index).not.toContain('nestedHelper')
  })

  it('头部说明指向 drawing.md 与 check_demo，并遵守长度上限', () => {
    expect(index).toContain('drawing.md')
    expect(index).toContain('check_demo')
    expect(buildLibIndex(FIXTURE, 40)).toContain('其余见 drawing.md §4/§5')
  })

  it('真实 lib/common.js 能抽出全部助手名（含 forceArrows/startLoop/setupCharts）', () => {
    const real = readFileSync(join(process.cwd(), 'resources', 'physics-lab-skill', 'lib', 'common.js'), 'utf8')
    const realIndex = buildLibIndex(real)
    for (const name of ['forceArrows', 'startLoop', 'setupCharts', 'setupScene', 'ball', 'block', 'rope', 'spring']) {
      expect(realIndex).toContain(`\`${name}(`)
    }
    expect(realIndex.length).toBeLessThan(9500)
  })
})
