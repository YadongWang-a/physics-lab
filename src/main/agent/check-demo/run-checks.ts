import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { canvasTextCheck, collectIssues, drawListCheck, evidenceCheck, idCrossCheck, readFileHtml, skeletonCheck, syntaxCheck, type CheckIssue, type CheckResult, type DrawListItem } from './static-check'
import { DemoChecker } from './runtime-check'

/**
 * 统一检查入口：静态（语法/ID/骨架/证据/图清单）→ 无 error 时运行时断言。
 * 工具调用、应用层自动自检、冒烟共用（避免三处重复）。
 */
export async function runChecks(
  workspaceDir: string,
  file: string,
  checker: DemoChecker,
  assertions?: string[],
  drawList?: readonly DrawListItem[]
): Promise<CheckResult> {
  const htmlPath = join(workspaceDir, file)
  if (!existsSync(htmlPath)) {
    return {
      ok: false,
      issues: [{ level: 'error', code: 'file-not-found', message: `文件不存在：${file}` }]
    }
  }
  const html = readFileHtml(htmlPath)
  const staticIssues: CheckIssue[] = [
    ...syntaxCheck(html),
    ...idCrossCheck(html),
    ...skeletonCheck(html),
    ...canvasTextCheck(html),
    ...evidenceCheck(html),
    ...drawListCheck(html, drawList)
  ]
  if (staticIssues.some((i) => i.level === 'error')) {
    return collectIssues(staticIssues)
  }
  const runtimeIssues = await checker.check({ htmlPath, assertions })
  return collectIssues([...staticIssues, ...runtimeIssues])
}
