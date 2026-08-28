import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceManager, isDemoFile, extractTitle } from '../src/main/workspace/workspace-manager'

/**
 * 工作目录管理单测（无 Electron、无 Key）。
 * seam：workspace-manager（主进程文件/清单逻辑层）。
 * 断言外部行为：扫描识别、标题提取、清单持久化、删除边界。
 */

const DEMO_HTML = `<!doctype html><html><head><title>弹簧振子</title></head>
<body><canvas id="scene"></canvas>
<script src="lib/common.js"></script></body></html>`

const MARKED_HTML = `<!-- physics-demo: 绳环下落 --><!doctype html><html><head><title>忽略此标题</title></head>
<body><script src="lib/common.js"></script></body></html>`

const SKILL_MARKED_HTML = `<!-- physics-lab-skill: 绳环悬物 · 缓慢下降(F/F_f/F_N 变化分析) --><!doctype html><html><head><title>忽略</title></head>
<body><script src="lib/common.js"></script></body></html>`

const PLAIN_HTML = '<!doctype html><html><head><title>随便一个网页</title></head><body>hi</body></html>'

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'physics-lab-ws-'))
}

describe('isDemoFile / extractTitle', () => {
  it('判定演示：引用 lib/common.js 的 html 才算演示', () => {
    const dir = makeWorkspace()
    writeFileSync(join(dir, 'a.html'), DEMO_HTML)
    writeFileSync(join(dir, 'b.html'), PLAIN_HTML)
    expect(isDemoFile(join(dir, 'a.html'))).toBe(true)
    expect(isDemoFile(join(dir, 'b.html'))).toBe(false)
  })

  it('标题提取：physics 注释优先（两种标记），其次 <title>，否则文件名', () => {
    const dir = makeWorkspace()
    writeFileSync(join(dir, 'marked.html'), MARKED_HTML)
    writeFileSync(join(dir, 'skill-marked.html'), SKILL_MARKED_HTML)
    writeFileSync(join(dir, 'titled.html'), DEMO_HTML)
    expect(extractTitle(join(dir, 'marked.html'))).toBe('绳环下落')
    expect(extractTitle(join(dir, 'skill-marked.html'))).toBe('绳环悬物 · 缓慢下降(F/F_f/F_N 变化分析)')
    expect(extractTitle(join(dir, 'titled.html'))).toBe('弹簧振子')
    writeFileSync(join(dir, 'plain.html'), '<html><body>x</body></html>')
    expect(extractTitle(join(dir, 'plain.html'))).toBe('plain.html')
  })
})

describe('WorkspaceManager', () => {
  let dir: string

  beforeEach(() => {
    dir = makeWorkspace()
  })

  it('首次打开创建 .pi-sessions 与空清单', async () => {
    const ws = await WorkspaceManager.open(dir)
    expect(existsSync(join(dir, '.pi-sessions', 'demos.json'))).toBe(true)
    expect(ws.list()).toEqual([])
  })

  it('扫描识别演示并写入清单；普通 html 不纳入', async () => {
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    writeFileSync(join(dir, 'notes.html'), PLAIN_HTML)
    const ws = await WorkspaceManager.open(dir)
    await ws.scan()
    const demos = ws.list()
    expect(demos.map((d) => d.file)).toEqual(['spring.html'])
    expect(demos[0]?.title).toBe('弹簧振子')
    expect(demos[0]?.sessionFile).toBe('spring.jsonl')
    // 清单已落盘
    const ws2 = await WorkspaceManager.open(dir)
    expect(ws2.list().map((d) => d.file)).toEqual(['spring.html'])
  })

  it('重复扫描不产生重复条目', async () => {
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    const ws = await WorkspaceManager.open(dir)
    await ws.scan()
    await ws.scan()
    expect(ws.list()).toHaveLength(1)
  })

  it('文件被外部删除后，扫描从清单移除该条目', async () => {
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    const ws = await WorkspaceManager.open(dir)
    await ws.scan()
    unlinkSync(join(dir, 'spring.html'))
    await ws.scan()
    expect(ws.list()).toEqual([])
  })

  it('删除演示：移除 html、会话文件与清单条目，不触碰其他文件', async () => {
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    writeFileSync(join(dir, 'keep.html'), PLAIN_HTML)
    const ws = await WorkspaceManager.open(dir)
    await ws.scan()
    const demo = ws.list()[0]!
    // 模拟已存在的会话文件
    writeFileSync(join(dir, '.pi-sessions', demo.sessionFile), '{"type":"session"}\n')

    await ws.remove(demo.file)

    expect(existsSync(join(dir, 'spring.html'))).toBe(false)
    expect(existsSync(join(dir, '.pi-sessions', demo.sessionFile))).toBe(false)
    expect(ws.list()).toEqual([])
    expect(existsSync(join(dir, 'keep.html'))).toBe(true)
    expect(existsSync(join(dir, '.pi-sessions', 'demos.json'))).toBe(true)
  })

  it('删除不存在的演示是安全空操作', async () => {
    const ws = await WorkspaceManager.open(dir)
    expect(() => ws.remove('ghost.html')).not.toThrow()
  })

  it('手工编辑的坏清单条目（缺 sessionFile）：remove 安全、scan 重建合法条目', async () => {
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    mkdirSync(join(dir, '.pi-sessions'), { recursive: true })
    writeFileSync(
      join(dir, '.pi-sessions', 'demos.json'),
      JSON.stringify({ version: 1, demos: [{ file: 'spring.html', title: 'x', createdAt: 1 }] })
    )
    const ws = await WorkspaceManager.open(dir)
    // remove 容忍坏条目，不抛错
    expect(() => ws.remove('ghost-entry.html')).not.toThrow()
    // scan 重建坏条目为合法条目
    await ws.scan()
    const demo = ws.list()[0]
    expect(demo?.file).toBe('spring.html')
    expect(demo?.sessionFile).toBe('spring.jsonl')
    expect(demo?.title).toBe('弹簧振子')
  })

  it('bindSession：显式改绑会话文件并落盘（重启后保留），幂等与边界', async () => {
    writeFileSync(join(dir, 'spring.html'), DEMO_HTML)
    const ws = await WorkspaceManager.open(dir)
    await ws.scan()
    expect(ws.bindSession('spring.html', '_new-1756000000-abc123.jsonl')).toBe(true)
    expect(ws.list()[0]?.sessionFile).toBe('_new-1756000000-abc123.jsonl')
    // 幂等：重复绑定同一会话文件返回 false（不改清单）
    expect(ws.bindSession('spring.html', '_new-1756000000-abc123.jsonl')).toBe(false)
    // 落盘验证：重新打开清单保留显式关联
    const ws2 = await WorkspaceManager.open(dir)
    expect(ws2.list()[0]?.sessionFile).toBe('_new-1756000000-abc123.jsonl')
    // 不存在的演示条目 → 失败
    expect(ws.bindSession('ghost.html', 'x.jsonl')).toBe(false)
  })
})
