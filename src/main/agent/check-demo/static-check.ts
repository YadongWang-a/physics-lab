import { readFileSync } from 'node:fs'

/**
 * check_demo 静态检查（纯函数，可单测）。
 * 对应 skill 收尾自检的可机械化部分；取代原 `node --check`（ADR-0003）。
 */

export interface CheckIssue {
  level: 'error' | 'warning'
  code: string
  message: string
}

export interface CheckResult {
  ok: boolean
  issues: CheckIssue[]
}

const SCRIPT_RE = /<script>([\s\S]*?)<\/script>/g
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g

export function collectIssues(issues: CheckIssue[]): CheckResult {
  return { ok: !issues.some((i) => i.level === 'error'), issues }
}

/** 最后一个 <script> 块（页面主体脚本） */
export function extractLastScript(html: string): string | null {
  const matches = [...html.matchAll(SCRIPT_RE)]
  const last = matches[matches.length - 1]
  return last ? (last[1] ?? null) : null
}

export function syntaxCheck(html: string): CheckIssue[] {
  const script = extractLastScript(html)
  if (script === null) {
    return [{ level: 'error', code: 'no-script', message: '未找到 <script> 块' }]
  }
  try {
    new Function(script)
    return []
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [{ level: 'error', code: 'syntax-error', message: `末段脚本语法错误：${message}` }]
  }
}

/** $('id') / $("id") 引用必须有对应 id="..." 定义 */
export function idCrossCheck(html: string): CheckIssue[] {
  const used = new Set<string>()
  for (const m of html.matchAll(/\$\('([^']+)'\)/g)) used.add(m[1]!)
  for (const m of html.matchAll(/\$\("([^"]+)"\)/g)) used.add(m[1]!)
  const defined = new Set<string>()
  for (const m of html.matchAll(/id="([^"]+)"/g)) defined.add(m[1]!)
  return [...used]
    .filter((id) => !defined.has(id))
    .map((id) => ({
      level: 'error' as const,
      code: 'missing-id',
      message: `$('${id}') 无对应 id="${id}"`
    }))
}

/** 骨架标记：用 lib startLoop/setupScene，不手写动画循环（HTML 注释已剥离） */
export function skeletonCheck(html: string): CheckIssue[] {
  const code = html.replace(HTML_COMMENT_RE, '')
  const issues: CheckIssue[] = []
  if (!/startLoop\s*\(\s*S\b/.test(code)) {
    issues.push({ level: 'error', code: 'no-start-loop', message: '未调用 lib startLoop(S, …)（禁止手写动画循环）' })
  }
  if (!/setupScene\s*\(\s*\{/.test(code)) {
    issues.push({ level: 'error', code: 'no-setup-scene', message: '未调用 setupScene({…})（标准件缺失）' })
  }
  if (/requestAnimationFrame\s*\(/.test(code)) {
    issues.push({ level: 'error', code: 'hand-rolled-loop', message: '发现手写 requestAnimationFrame（应使用 lib startLoop）' })
  }
  if (/setInterval\s*\(/.test(code)) {
    issues.push({ level: 'warning', code: 'set-interval', message: '发现 setInterval（动画应走 startLoop）' })
  }
  if (!/class="[^"]*charts-row/.test(code)) {
    issues.push({ level: 'warning', code: 'no-charts-row', message: '缺 .charts-row 图表容器（v2 模板骨架标准件；有图题型应调 setupCharts，无图题型保留空容器）' })
  }
  return issues
}

export function readFileHtml(filePath: string): string {
  return readFileSync(filePath, 'utf8')
}

/**
 * 画布文字预算（SKILL「内容规则」）：画布内 fillText 只允许 几何/结构标签、量符号+数值、极短状态词。
 * 只查字面量（动态数值经字符串拼接不进候选）；命中长句/句读记为 warning，提示改走
 * 解析弹层（讲解）、legend 图例栏（颜色含义）、.phase（阶段叙述）、hud/读数（数值汇总）。
 */
export function canvasTextCheck(html: string): CheckIssue[] {
  const script = extractLastScript(html)
  if (!script) return []
  const prose: string[] = []
  for (const m of script.matchAll(/fillText\(\s*(['"])([^'"]*)\1/g)) {
    const text = m[2] ?? ''
    if (text.length > 14 || /[，；。⇒]/.test(text)) prose.push(text)
  }
  if (prose.length === 0) return []
  const sample = prose.slice(0, 2).map((t) => `「${t.length > 22 ? t.slice(0, 22) + '…' : t}」`).join('')
  return [
    {
      level: 'warning',
      code: 'canvas-prose',
      message: `画布内 ${prose.length} 条文字疑似讲解${sample}：讲解走解析弹层，颜色含义走图例，数值汇总走 hud/读数面板`
    }
  ]
}

/**
 * 讲解点的投影证据（ADR-0006）：可机械化的那一部分。
 * 图表 title / hud 容量 / 页面整体是否有可指认的证据——语义绑定（哪个讲解点配哪条证据）仍靠 §7 自检。
 */
export function evidenceCheck(html: string): CheckIssue[] {
  const code = html.replace(HTML_COMMENT_RE, '')
  const issues: CheckIssue[] = []
  const chartDefs = (code.match(/\bseries\s*:/g) ?? []).length
  const chartTitles = (code.match(/\btitle\s*:/g) ?? []).length
  if (chartDefs > chartTitles) {
    issues.push({
      level: 'warning',
      code: 'chart-no-title',
      message: `${chartDefs} 个图表定义里只有 ${chartTitles} 个 title：每张图的 title 要写明它回答的那个讲解点`
    })
  }
  const hudItems = code.match(/\bhud\s*:\s*\[([\s\S]*?)\]/)?.[1]?.match(/\{/g)?.length ?? 0
  if (hudItems > 4) {
    issues.push({
      level: 'warning',
      code: 'hud-overflow',
      message: `hud 有 ${hudItems} 项：标准件上限 4 项，按 选项判决量 > 临界前后两值 > 初始条件量 取舍`
    })
  }
  const vectors = (code.match(/\b(forceArrows|vecComp|forceTriangle|drawArrow|traj)\s*\(/g) ?? []).length
  if (vectors === 0 && chartDefs === 0) {
    issues.push({
      level: 'warning',
      code: 'no-evidence',
      message: '页面既没有矢量（受力/速度/轨迹）也没有图表：讲解点缺少可指认的投影证据'
    })
  }
  // 调了 setupCharts 却不更新 → 图表永远空白（实测出现过的缺陷；error 级才会触发修复循环）
  if (/\bsetupCharts\s*\(/.test(code) && !/\.update\s*\(/.test(code)) {
    issues.push({
      level: 'error',
      code: 'chart-not-updated',
      message: '调了 setupCharts 但没有 render() 末尾的 CH.update()：图表不会出线'
    })
  }
  return issues
}
