import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canvasTextCheck,
  collectIssues,
  evidenceCheck,
  idCrossCheck,
  skeletonCheck,
  syntaxCheck
} from '../src/main/agent/check-demo/static-check'

/**
 * check_demo 静态检查单测（无 Electron、无 Key）。
 * 回归基准：resources/demos/ 的 9 个真实演示必须全部通过（skill 体系产物）。
 */

const DEMOS_DIR = join(process.cwd(), 'resources', 'demos')

/** 存量演示页允许存在的迁移类 warning（页面按新规范重做后应消失） */
const MIGRATION_WARNINGS: Record<string, true> = {
  'no-charts-row': true,
  'canvas-prose': true,
  'chart-no-title': true,
  'hud-overflow': true,
  'no-evidence': true
}

const GOOD_HTML = `<!doctype html><html><head><title>弹簧振子</title></head>
<body>
<canvas id="scene"></canvas>
<div class="charts-row" id="charts"></div>
<div class="phase" id="phase">● 准备就绪</div>
<script src="lib/common.js"></script>
<script>
const S = { g: 9.81, speed: 1, t: 0, running: false, last: null };
const SC = setupScene({ canvas: scene, vp: {}, state: S, render: function(){} });
render();
startLoop(S, { sub: 0.002, step: function(){}, render: function(){} });
</script>
</body></html>`

describe('syntaxCheck', () => {
  it('合法脚本通过', () => {
    expect(syntaxCheck(GOOD_HTML)).toEqual([])
  })

  it('捕获语法错误（取代 node --check）', () => {
    const bad = GOOD_HTML.replace('const S =', 'const S = =')
    const issues = syntaxCheck(bad)
    expect(issues.some((i) => i.code === 'syntax-error')).toBe(true)
  })

  it('无 <script> 块报错', () => {
    expect(syntaxCheck('<html><body>x</body></html>').some((i) => i.code === 'no-script')).toBe(true)
  })
})

describe('idCrossCheck', () => {
  it('所有 $(\'id\') 都有对应 id 定义', () => {
    expect(idCrossCheck(GOOD_HTML)).toEqual([])
  })

  it('捕获缺失 id', () => {
    const html = GOOD_HTML + `\n<script>\n$('missingEl').style.display='none';\n</script>`
    const issues = idCrossCheck(html)
    expect(issues.some((i) => i.code === 'missing-id' && i.message.includes('missingEl'))).toBe(true)
  })
})

describe('skeletonCheck', () => {
  it('使用 startLoop/setupScene 且无手写循环', () => {
    expect(skeletonCheck(GOOD_HTML)).toEqual([])
  })

  it('手写 requestAnimationFrame 报错', () => {
    const bad = GOOD_HTML.replace('startLoop(S', 'requestAnimationFrame(step);\nstartLoop(S')
    expect(skeletonCheck(bad).some((i) => i.code === 'hand-rolled-loop')).toBe(true)
  })
})

describe('canvasTextCheck：画布文字预算', () => {
  const withText = (code: string): string =>
    GOOD_HTML.replace(/<\/script>\s*<\/body>/, `${code}\n</script>\n</body>`)

  it('短标签/量值不报警', () => {
    const html = withText(`ctx.fillText('绳绷直', X(1), Y(0)); ctx.fillText('w_甲 = 1.2 m/s', X(2), Y(0));`)
    expect(canvasTextCheck(html)).toEqual([])
  })

  it('长讲解句报警（含句读）', () => {
    const html = withText(`ctx.fillText('绿箭头 = 相对传送带的速度 w；红箭头 F 仅在 0→t₁ 阶段存在。', X(1), Y(0));`)
    const issues = canvasTextCheck(html)
    expect(issues.some((i) => i.code === 'canvas-prose' && i.level === 'warning')).toBe(true)
  })

  it('无 fillText 的页面不报警', () => {
    expect(canvasTextCheck(GOOD_HTML)).toEqual([])
  })
})

describe('evidenceCheck：讲解点的投影证据（ADR-0006）', () => {
  const withScript = (code: string): string =>
    GOOD_HTML.replace(/<\/script>\s*<\/body>/, `${code}\n</script>\n</body>`)
  const withHud = (items: string): string =>
    GOOD_HTML.replace(
      'setupScene({ canvas: scene, vp: {}, state: S, render: function(){} })',
      `setupScene({ canvas: scene, vp: {}, state: S, render: function(){}, hud: [${items}] })`
    )

  it('图表定义缺 title 报警；有 title 则干净', () => {
    const series = `getX: () => S.t, series: [{ label: 'v', get: () => S.v }]`
    const noTitle = withScript(`const CH = setupCharts($('charts'), [{ yLabel: 'v/(m/s)', ${series} }]);`)
    expect(evidenceCheck(noTitle).some((i) => i.code === 'chart-no-title')).toBe(true)
    const titled = withScript(`const CH = setupCharts($('charts'), [{ title: 'v-t: t₁ 后速度为何不再增大', ${series} }]);`)
    expect(evidenceCheck(titled)).toEqual([])
  })

  it('hud 超过 4 项报警，恰好 4 项干净', () => {
    const item = (k: string) => `{ k: '${k}', label: '${k}' }`
    const over = withHud([1, 2, 3, 4, 5].map((n) => item(`k${n}`)).join(', '))
    expect(evidenceCheck(over).some((i) => i.code === 'hud-overflow')).toBe(true)
    const exact = withHud([1, 2, 3, 4].map((n) => item(`k${n}`)).join(', '))
    expect(evidenceCheck(exact).some((i) => i.code === 'hud-overflow')).toBe(false)
  })

  it('既无矢量又无图表报警；有矢量则不报警', () => {
    expect(evidenceCheck(GOOD_HTML).some((i) => i.code === 'no-evidence')).toBe(true)
    const withVector = withScript(`forceArrows(ctx, 0, 0, [{ x: 1, y: 0, color: '#f00', label: 'F' }], { scale: 1 });`)
    expect(evidenceCheck(withVector)).toEqual([])
  })
})

describe('回归基准：resources/demos 全部通过', () => {
  const demoFiles = readdirSync(DEMOS_DIR).filter((f) => f.toLowerCase().endsWith('.html'))
  expect(demoFiles.length).toBeGreaterThan(0)

  it.each(demoFiles)('%s 静态检查通过', (file) => {
    const html = readFileSync(join(DEMOS_DIR, file), 'utf8')
    const result = collectIssues([
      ...syntaxCheck(html),
      ...idCrossCheck(html),
      ...skeletonCheck(html),
      ...canvasTextCheck(html),
      ...evidenceCheck(html)
    ])
    // 存量页允许「迁移类」warning：no-charts-row(v2 图表区)、canvas-prose(画布文字预算)、
    // 证据层（chart-no-title/hud-overflow/no-evidence，ADR-0006，存量页早于该规范）；
    // 页面按新规范重做后应消失；其余必须干净
    expect(result.issues.filter((i) => !MIGRATION_WARNINGS[i.code])).toEqual([])
  })
})
