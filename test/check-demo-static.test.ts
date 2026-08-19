import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectIssues,
  idCrossCheck,
  skeletonCheck,
  syntaxCheck
} from '../src/main/agent/check-demo/static-check'

/**
 * check_demo 静态检查单测（无 Electron、无 Key）。
 * 回归基准：resources/demos/ 的 9 个真实演示必须全部通过（skill 体系产物）。
 */

const DEMOS_DIR = join(process.cwd(), 'resources', 'demos')

const GOOD_HTML = `<!doctype html><html><head><title>弹簧振子</title></head>
<body>
<canvas id="scene"></canvas>
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

describe('回归基准：resources/demos 全部通过', () => {
  const demoFiles = readdirSync(DEMOS_DIR).filter((f) => f.toLowerCase().endsWith('.html'))
  expect(demoFiles.length).toBeGreaterThan(0)

  it.each(demoFiles)('%s 静态检查通过', (file) => {
    const html = readFileSync(join(DEMOS_DIR, file), 'utf8')
    const result = collectIssues([...syntaxCheck(html), ...idCrossCheck(html), ...skeletonCheck(html)])
    expect(result.issues).toEqual([])
  })
})
