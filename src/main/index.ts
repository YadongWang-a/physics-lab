import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { createPhysicsSession } from './agent/agent-runner'
import { loadEnvFile } from '../shared/load-env'

loadEnvFile()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
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
  await new Promise((r) => setTimeout(r, 1500))
  const [win] = BrowserWindow.getAllWindows()
  if (!win) throw new Error('窗口未创建')
  const ping = await win.webContents.executeJavaScript(
    `window.api?.ping?.() ?? 'MISSING'`
  )
  console.log(`[smoke-window] preload ping=${ping}`)
  app.exit(ping === 'pong' ? 0 : 1)
}

app.whenReady().then(async () => {
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
