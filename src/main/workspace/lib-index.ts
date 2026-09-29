/**
 * 从 lib/common.js 生成 API 索引（seed 时写入工作目录 `lib/INDEX.md`）。
 *
 * 背景（见 docs/adr/0003 修订）：lib 源码对 agent 不可读——实测每回合有 40%+ 的工具轮次
 * 花在分段读/grep `common.js`（21–27 轮），每轮一次模型往返。索引把"有哪些、签名如何"
 * 这类提问一次答完；参数细节仍在 skill 的 drawing.md §4/§5。
 *
 * 索引由源码自动生成并随 seed 刷新，不会与实现漂移。
 */
export function buildLibIndex(source: string, maxChars = 9000): string {
  const lines = source.split(/\r?\n/)
  const seen = new Set<string>()
  const entries: string[] = []
  let comment: string[] = []
  let inBlock = false

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end >= 0) {
        comment.push(line.slice(0, end))
        inBlock = false
      } else {
        comment.push(line.replace(/^\s*\*?\s?/, ''))
      }
      continue
    }
    if (line.startsWith('/*')) {
      const end = line.indexOf('*/')
      if (end >= 0 && end > 2) comment.push(line.slice(2, end))
      else {
        comment.push(line.slice(2).replace(/^\*?\s?/, ''))
        inBlock = true
      }
      continue
    }
    if (line.startsWith('//')) {
      comment.push(line.replace(/^\/\/\s?/, ''))
      continue
    }
    if (line.trim() === '') {
      comment = []
      continue
    }
    const fn = /^function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(line)
    const decl = fn ? null : /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line)
    const name = fn?.[1] ?? decl?.[1]
    if (name && !seen.has(name)) {
      seen.add(name)
      const args = fn?.[2]?.trim() ?? ''
      const doc = comment
        .map((c) => c.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ')
        .slice(0, 110)
      entries.push(`- \`${name}(${args})\`${doc ? `\n  ${doc}` : ''}`)
    }
    comment = []
  }

  const header = [
    '# lib/common.js API 索引',
    '',
    '源码自动生成(勿手改)。助手与公式的**参数细节**见 skill 的 `drawing.md` §4/§5;',
    '行为或时序拿不准时, 用 `check_demo` 在沙箱里真跑页面确认——lib 源码对 agent 不可读。',
    ''
  ].join('\n')
  const body: string[] = []
  let size = 0
  for (const entry of entries) {
    if (size + entry.length > maxChars) {
      body.push('- …(其余见 drawing.md §4/§5)')
      break
    }
    body.push(entry)
    size += entry.length + 1
  }
  return `${header}${body.join('\n')}\n`
}
