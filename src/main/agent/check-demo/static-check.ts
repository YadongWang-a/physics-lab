import { readFileSync } from 'node:fs'

/**
 * check_demo 静态检查（纯函数，可单测）。
 * 对应 skill 第 7 步自检的机械部分；取代原 `node --check`（ADR-0003 唯一自定义工具）。
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
