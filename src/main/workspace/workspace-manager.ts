import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, join } from 'node:path'
import type { DemoMeta } from '../../shared/ipc-types'

/**
 * 工作目录管理（ADR-0001/0002）。
 * 纯 Node 逻辑（无 Electron 依赖），可单测。
 *
 * 约定：
 * - 演示判定：*.html 且引用 `lib/common.js`（skill 生态生成物特征）；老师杂散网页不纳入
 * - 清单：`<工作目录>/.pi-sessions/demos.json`，工作目录一份（索引，非会话）
 * - 会话：每演示一个独立文件 `.pi-sessions/<stem>.jsonl`（一个 HTML 一个 session）
 * - 删除只触碰应用创建物（目标 html + 其会话文件），不碰用户其他文件
 */

export type { DemoMeta }

interface Manifest {
  version: 1
  demos: DemoMeta[]
}

const SESSIONS_DIR = '.pi-sessions'
const MANIFEST_FILE = 'demos.json'
// 兼容 skill 生态两种标记：physics-lab-skill（现行生成物）与 physics-demo（旧版）
const DEMO_MARKER_RE = /<!--\s*(?:physics-lab-skill|physics-demo):\s*(.*?)\s*-->/i
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i
const LIB_REF_RE = /src=["']lib\/common\.js["']/

function isValidEntry(entry: DemoMeta): boolean {
  return (
    typeof entry.file === 'string' &&
    entry.file.length > 0 &&
    typeof entry.title === 'string' &&
    typeof entry.sessionFile === 'string' &&
    typeof entry.createdAt === 'number'
  )
}

export function isDemoFile(filePath: string): boolean {
  if (!filePath.toLowerCase().endsWith('.html')) return false
  try {
    return LIB_REF_RE.test(readFileSync(filePath, 'utf8'))
  } catch {
    return false
  }
}

export function extractTitle(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf8')
    const marker = content.match(DEMO_MARKER_RE)
    if (marker?.[1]?.trim()) return marker[1].trim()
    const title = content.match(TITLE_RE)
    if (title?.[1]?.trim()) return title[1].trim()
  } catch {
    /* 读取失败走文件名兜底 */
  }
  return basename(filePath)
}

export class WorkspaceManager {
  private constructor(
    private readonly dir: string,
    private manifest: Manifest
  ) {}

  /** 打开（必要时创建）工作目录与清单 */
  static open(dir: string): WorkspaceManager {
    mkdirSync(join(dir, SESSIONS_DIR), { recursive: true })
    const manifestPath = join(dir, SESSIONS_DIR, MANIFEST_FILE)
    let manifest: Manifest
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Manifest).version === 1 &&
        Array.isArray((parsed as Manifest).demos)
      ) {
        manifest = parsed as Manifest
      } else {
        throw new Error('bad manifest')
      }
    } catch {
      manifest = { version: 1, demos: [] }
      // 首次打开：立即落盘空清单，保证清单文件始终存在
      writeFileSync(
        join(dir, SESSIONS_DIR, MANIFEST_FILE),
        JSON.stringify(manifest, null, 2),
        'utf8'
      )
    }
    return new WorkspaceManager(dir, manifest)
  }

  get dirname(): string {
    return this.dir
  }

  list(): DemoMeta[] {
    return [...this.manifest.demos]
  }

  /** 重新扫描工作目录，与清单对齐（新增演示纳入、已删/失效条目移除），并落盘 */
  scan(): void {
    const known = new Map(this.manifest.demos.map((d) => [d.file, d]))
    const next: DemoMeta[] = []
    for (const entry of readdirSync(this.dir)) {
      if (!entry.toLowerCase().endsWith('.html')) continue
      const filePath = join(this.dir, entry)
      if (!statSync(filePath).isFile()) continue
      // 清单条目同样须通过演示判定（文件被替换/改坏后不保留），并容忍手工编辑的坏条目
      if (!isDemoFile(filePath)) continue
      const existing = known.get(entry)
      if (existing && isValidEntry(existing)) {
        next.push(existing)
        known.delete(entry)
      } else {
        next.push({
          file: entry,
          title: extractTitle(filePath),
          sessionFile: entry.replace(/\.html$/i, '') + '.jsonl',
          createdAt: Date.now()
        })
      }
    }
    this.manifest.demos = next
    this.save()
  }

  /**
   * 删除演示（UI 层已二次确认）：移除目标演示 html 与其会话文件、清单条目。
   * 只删应用已纳入清单的文件；手工编辑坏条目（缺会话文件等）容忍跳过。
   */
  remove(file: string): void {
    const demo = this.manifest.demos.find((d) => d.file === file)
    if (!demo) return
    const htmlPath = join(this.dir, file)
    if (existsSync(htmlPath)) rmSync(htmlPath)
    if (demo.sessionFile) {
      const sessionPath = join(this.dir, SESSIONS_DIR, demo.sessionFile)
      if (existsSync(sessionPath)) rmSync(sessionPath)
    }
    this.manifest.demos = this.manifest.demos.filter((d) => d.file !== file)
    this.save()
  }

  private save(): void {
    writeFileSync(
      join(this.dir, SESSIONS_DIR, MANIFEST_FILE),
      JSON.stringify(this.manifest, null, 2),
      'utf8'
    )
  }
}
