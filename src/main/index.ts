import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync, mkdtempSync, renameSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { createPhysicsSession } from './agent/agent-runner'
import { loadEnvFile } from '../shared/load-env'
import { isInsufficientBalance } from '../shared/balance'
import type { WorkspaceSnapshot } from '../shared/ipc-types'
import { WorkspaceManager } from './workspace/workspace-manager'
import { SettingsStore } from './workspace/app-settings'
import { seedLibIntoWorkspace } from './workspace/lib-seed'
import { SessionHost } from './agent/session-host'

loadEnvFile()

let currentWs: WorkspaceManager | null = null
let settings: SettingsStore | null = null
let sessionHost: SessionHost | null = null
let watcher: FSWatcher | null = null
let watcherTimer: NodeJS.Timeout | null = null

function skillDir(): string {
  return join(app.getAppPath(), 'resources', 'physics-lab-skill')
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function snapshot(): WorkspaceSnapshot {
  if (!currentWs) throw new Error('尚未选择工作目录')
  return { dir: currentWs.dirname, demos: currentWs.list() }
}

async function openWorkspace(dir: string): Promise<WorkspaceSnapshot> {
  currentWs = WorkspaceManager.open(dir)
  currentWs.scan()
  seedLibIntoWorkspace(dir, skillDir())
  startWorkspaceWatcher(dir)
  settings?.save({ workspaceDir: dir })
  return snapshot()
}

/** 监听工作目录 .html 变化 → 防抖通知渲染层刷新预览 */
function startWorkspaceWatcher(dir: string): void {
  watcher?.close()
  watcher = null
  watcher = watch(dir, (event, filename) => {
    if (!filename || !filename.toString().toLowerCase().endsWith('.html')) return
    if (watcherTimer) clearTimeout(watcherTimer)
    watcherTimer = setTimeout(() => {
      currentWs?.scan()
      broadcast('preview:changed', { file: filename.toString() })
    }, 300)
  })
}

function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择工作目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return openWorkspace(result.filePaths[0])
  })

  ipcMain.handle('workspace:get', async () => {
    if (currentWs) return snapshot()
    const dir = settings?.load().workspaceDir
    if (dir && existsSync(dir)) return openWorkspace(dir)
    return null
  })

  ipcMain.handle('workspace:rescan', async () => {
    if (!currentWs) throw new Error('尚未选择工作目录')
    currentWs.scan()
    return snapshot()
  })

  ipcMain.handle('workspace:remove', async (_event, file: string) => {
    if (!currentWs) throw new Error('尚未选择工作目录')
    currentWs.remove(file)
    sessionHost?.release(file)
    return snapshot()
  })

  // ---- chat：每演示一个 agent 会话，事件流经 chat:event 推送 ----
  ipcMain.handle('chat:send', async (event, file: string | null, text: string) => {
    if (!currentWs) throw new Error('尚未选择工作目录')
    const host = ensureSessionHost()
    const { key } = await host.getSession(currentWs.dirname, file, (e) => {
      broadcast('chat:event', { file: key, event: e })
      // 新会话生成完成 → 绑定 HTML 并刷新列表
      if (!file && (e as { type?: string }).type === 'agent_settled') {
        finalizeNewSession(`${key}.jsonl`)
      }
    })
    host.prompt(key, text).catch((err: unknown) => {
      broadcast('chat:event', {
        file: key,
        event: { type: 'chat_error', message: err instanceof Error ? err.message : String(err) }
      })
    })
    return { ok: true, key }
  })

  ipcMain.handle('chat:abort', async (_event, file: string) => {
    await sessionHost?.abort(file)
    return { ok: true }
  })

  ipcMain.handle('chat:history', (event, file: string) => {
    if (!currentWs) return []
    return ensureSessionHost().history(file, currentWs.dirname)
  })
}

function ensureSessionHost(): SessionHost {
  if (!sessionHost) {
    throw new Error('会话宿主未初始化')
  }
  return sessionHost
}

/**
 * 新会话生成完成后：扫描识别新 HTML，把临时会话文件（_new-<ts>.jsonl）
 * 重命名为 <新html>.jsonl（与清单约定一致），并通知渲染层刷新列表。
 */
function finalizeNewSession(pendingSessionFile: string): void {
  if (!currentWs) return
  const before = new Set(currentWs.list().map((d) => d.file))
  currentWs.scan()
  const after = currentWs.list().map((d) => d.file)
  const created = after.filter((f) => !before.has(f))
  if (created.length !== 1) return
  const stem = created[0]!.replace(/\.html$/i, '')
  const oldPath = join(currentWs.dirname, '.pi-sessions', pendingSessionFile)
  const newPath = join(currentWs.dirname, '.pi-sessions', `${stem}.jsonl`)
  if (existsSync(oldPath) && !existsSync(newPath)) {
    renameSync(oldPath, newPath)
  }
  broadcast('workspace:changed', {})
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite 开发/生产加载约定
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

/**
 * 主进程内 SDK 冒烟（ticket 01 验收）：
 *   electron-vite dev -- --smoke-agent
 * 用真实 Key 在主进程跑通一次会话，事件流输出到控制台，然后退出。
 * Key 来自 DEEPSEEK_API_KEY 环境变量。
 */
async function smokeAgent(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'physics-lab-smoke-'))
  const { session, dispose } = await createPhysicsSession({
    cwd: dir,
    sessionDir: join(dir, '.pi-sessions'),
    agentDir: join(dir, '.agent')
  })
  let deltas = 0
  let settled = false
  let tools = 0
  session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      deltas++
    } else if (event.type === 'tool_execution_start') {
      tools++
    } else if (event.type === 'agent_settled') {
      settled = true
      console.log(`[smoke] agent_settled; text deltas=${deltas}; tool calls=${tools}; sessionFile=${session.sessionFile}`)
    }
  })
  await session.prompt('只回复两个字：你好')
  // DeepSeek 余额不足（402）时显式 SKIP，而非 FAIL（余额恢复后自动生效）
  if (isInsufficientBalance(session.messages[session.messages.length - 1])) {
    console.log('[smoke] SKIP (Insufficient Balance — 需充值 DeepSeek 账户)')
    dispose()
    app.exit(0)
    return
  }
  const ok = deltas > 0 && settled
  console.log(`[smoke] ${ok ? 'PASS' : 'FAIL'}`)
  dispose()
  app.exit(ok ? 0 : 1)
}

/**
 * 窗口冒烟（验证 preload 桥接在沙箱窗口内真实加载）：
 *   electron-vite dev -- --smoke-window
 */
async function smokeWindow(): Promise<void> {
  createWindow()
  await delay(1500)
  const [win] = BrowserWindow.getAllWindows()
  if (!win) throw new Error('窗口未创建')
  const ping = await win.webContents.executeJavaScript(
    `window.api?.ping?.() ?? 'MISSING'`
  )
  console.log(`[smoke-window] preload ping=${ping}`)
  app.exit(ping === 'pong' ? 0 : 1)
}

/**
 * 工作目录全链路冒烟（ticket 02 验收）：
 *   electron-vite dev -- --smoke-workspace
 * 预置一个含演示的工作目录 → 启动窗口 → 断言渲染层列表渲染出该演示。
 */
async function smokeWorkspace(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'physics-lab-wssmoke-'))
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'lib', 'common.js'), '// stub')
  writeFileSync(
    join(dir, 'spring.html'),
    '<!doctype html><html><head><title>弹簧振子</title></head><body><script src="lib/common.js"></script></body></html>'
  )
  settings?.save({ workspaceDir: dir })
  createWindow()
  await delay(1500)
  const [win] = BrowserWindow.getAllWindows()
  if (!win) throw new Error('窗口未创建')
  // 轮询等待渲染层完成列表渲染（dev 首载 vite transform 耗时不定）；单次原子查询
  const deadline = Date.now() + 45000
  let state = { count: 0, dirShown: false, webview: false }
  while (Date.now() < deadline) {
    state = await win.webContents.executeJavaScript(
      `(() => ({
        count: document.querySelectorAll('[data-demo-item]').length,
        dirShown: document.body.innerText.includes(${JSON.stringify(dir)}),
        webview: !!document.querySelector('webview')
      }))()`
    )
    if (state.count === 1 && state.dirShown && state.webview) break
    await delay(500)
  }
  console.log(
    `[smoke-workspace] demo items=${state.count}; dir shown=${state.dirShown}; webview=${state.webview}`
  )
  app.exit(state.count === 1 && state.dirShown && state.webview ? 0 : 1)
}

app.whenReady().then(async () => {
  // 冒烟模式隔离 userData：不污染真实 settings.json（恢复上次工作目录）
  if (process.argv.some((a) => a.startsWith('--smoke'))) {
    app.setPath('userData', mkdtempSync(join(tmpdir(), 'physics-lab-smoke-userdata-')))
  }
  settings = SettingsStore.at(app.getPath('userData'))
  sessionHost = new SessionHost({
    agentDir: join(app.getPath('userData'), 'agent'),
    skillDir: skillDir()
  })
  registerWorkspaceIpc()

  if (process.argv.includes('--smoke-agent')) {
    await smokeAgent().catch((err) => {
      console.error('[smoke] FAIL', err)
      app.exit(1)
    })
    return
  }
  if (process.argv.includes('--smoke-window')) {
    await smokeWindow().catch((err) => {
      console.error('[smoke-window] FAIL', err)
      app.exit(1)
    })
    return
  }
  if (process.argv.includes('--smoke-workspace')) {
    await smokeWorkspace().catch((err) => {
      console.error('[smoke-workspace] FAIL', err)
      app.exit(1)
    })
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((err) => {
  console.error('[main] startup FAIL', err)
  app.exit(1)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
