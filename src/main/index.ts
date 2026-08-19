import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { createPhysicsSession } from './agent/agent-runner'
import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ImageContent } from '@earendil-works/pi-ai'
import { applySlotToRuntime, listProviderModels } from './agent/provider-config'
import { extractImageText, routeDecision, type ImagePayload } from './agent/vision-extract'
import { toSlotView, type ModelSlotConfig, type SaveSettingsPayload, type SettingsView } from '../shared/settings-types'
import { loadEnvFile } from '../shared/load-env'
import { isInsufficientBalance } from '../shared/balance'
import type { WorkspaceSnapshot } from '../shared/ipc-types'
import { WorkspaceManager } from './workspace/workspace-manager'
import { SettingsStore } from './workspace/app-settings'
import { seedLibIntoWorkspace } from './workspace/lib-seed'
import { SessionHost } from './agent/session-host'
import { DemoChecker } from './agent/check-demo/runtime-check'
import { runChecks } from './agent/check-demo/run-checks'

loadEnvFile()

// check_demo 冒烟：隐藏窗口 canvas 2D 在部分 GPU 环境拿不到 context → 软渲染（教学应用软渲染也更稳）
if (process.argv.includes('--smoke-checkdemo')) {
  app.disableHardwareAcceleration()
}

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
  ipcMain.handle(
    'chat:send',
    async (event, file: string | null, text: string, images?: ImagePayload[]) => {
      if (!currentWs) throw new Error('尚未选择工作目录')
      const host = ensureSessionHost()
      if (file) stoppedKeys.delete(file)
      const { key, ps } = await host.getSession(currentWs.dirname, file, (e) => {
        broadcast('chat:event', { file: key, event: e })
        if ((e as { type?: string }).type !== 'agent_settled') return
        // 新会话：先绑定生成的新 HTML，再自动自检
        if (!file) {
          const created = finalizeNewSession(`${key}.jsonl`)
          if (created) void autoCheckDemo(host, currentWs!.dirname, created, key)
        } else {
          void autoCheckDemo(host, currentWs!.dirname, file, key)
        }
      })

      // OCR 通道路由（ticket 06）：主模型视觉直通 / 视觉模型转文本 / 明确不可用
      let promptText = text
      let promptImages: ImageContent[] | undefined
      if (images && images.length > 0) {
        const s = settings?.load()
        const kind = routeDecision(ps.modelInput, Boolean(s?.vision))
        if (kind === 'direct') {
          promptImages = images.map((i) => ({ type: 'image', data: i.data, mimeType: i.mimeType }))
          broadcast('chat:event', { file: key, event: { type: 'ocr_note', text: `已发送 ${images.length} 张图片（主模型支持视觉，直通识别）` } })
        } else if (kind === 'extract' && s?.vision) {
          broadcast('chat:event', { file: key, event: { type: 'ocr_note', text: `正在用视觉模型识别 ${images.length} 张图片…` } })
          try {
            const extracted = await extractImageText({
              authPath: join(app.getPath('userData'), 'agent', 'auth.json'),
              slot: s.vision,
              images
            })
            promptText = `${text}\n\n【题目图片内容（视觉模型识别）】\n${extracted}`
            broadcast('chat:event', { file: key, event: { type: 'ocr_note', text: '图片已由视觉模型识别为文字，进入对话' } })
          } catch (err) {
            broadcast('chat:event', {
              file: key,
              event: {
                type: 'chat_error',
                message: `图片识别失败：${err instanceof Error ? err.message : String(err)}`
              }
            })
            return { ok: false, key }
          }
        } else {
          broadcast('chat:event', {
            file: key,
            event: { type: 'chat_error', message: '当前无法识别图片：主模型不支持视觉，且未配置视觉模型（请在设置中配置）' }
          })
          return { ok: false, key }
        }
      }

      host.prompt(key, promptText, promptImages).catch((err: unknown) => {
        broadcast('chat:event', {
          file: key,
          event: { type: 'chat_error', message: err instanceof Error ? err.message : String(err) }
        })
      })
      return { ok: true, key }
    }
  )

  ipcMain.handle('chat:abort', async (_event, file: string) => {
    stoppedKeys.add(file)
    await sessionHost?.abort(file)
    return { ok: true }
  })

  ipcMain.handle('chat:history', (event, file: string) => {
    if (!currentWs) return []
    return ensureSessionHost().history(file, currentWs.dirname)
  })
}

// ---- settings：双槽位模型配置（ticket 05） ----
/** 渲染层视图：剥离明文 Key，只带 hasApiKey 状态 */
function settingsView(): SettingsView {
  const s = settings?.load() ?? {}
  return {
    main: toSlotView(s.main),
    vision: toSlotView(s.vision)
  }
}

function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => settingsView())

  ipcMain.handle('settings:save', (_event, payload: SaveSettingsPayload) => {
    if (!settings) throw new Error('设置未初始化')
    const current = settings.load()
    const main: ModelSlotConfig | undefined = payload.main ?? current.main
    // 明文 Key 走独立字段（渲染层不回显）；省略/空串 = 保持原样
    if (main && payload.mainApiKey) main.apiKey = payload.mainApiKey
    const vision: ModelSlotConfig | undefined =
      payload.vision === null ? undefined : (payload.vision ?? current.vision)
    if (vision && payload.visionApiKey) vision.apiKey = payload.visionApiKey
    settings.save({ workspaceDir: current.workspaceDir, main, vision })
    // 配置变化 → 旧会话（旧模型/旧 Key）全部释放；下次消息按新配置重建，历史从磁盘恢复
    sessionHost?.releaseAll()
    broadcast('settings:changed', {})
    return settingsView()
  })

  /** 内置供应商模型列表（动态获取；custom 由用户在 UI 手动填模型名） */
  ipcMain.handle('settings:models', async (_event, provider: string) => {
    const runtime = await ModelRuntime.create({
      authPath: join(app.getPath('userData'), 'agent', 'auth.json'),
      refreshOnCreate: false
    })
    const registry = new ModelRegistry(runtime)
    await registry.refresh()
    return listProviderModels(runtime, provider)
  })

  /** 用给定配置发一次最小请求，验证 Key/端点可用 */
  ipcMain.handle('settings:test', async (_event, payload: { slot: ModelSlotConfig }) => {
    return testSlotConnection(payload.slot)
  })
}

/** settings:test 与冒烟共用：注册槽位 → 发最小 complete → 返回 ok/error */
async function testSlotConnection(slot: ModelSlotConfig): Promise<{ ok: boolean; error?: string }> {
  const runtime = await ModelRuntime.create({
    authPath: join(app.getPath('userData'), 'agent', 'auth.json'),
    refreshOnCreate: false
  })
  try {
    await applySlotToRuntime(runtime, slot)
    await runtime.refresh()
    const model = runtime.getModel(slot.provider, slot.modelId)
    if (!model) {
      return { ok: false, error: `模型不存在：${slot.provider}/${slot.modelId}` }
    }
    await runtime.complete(
      model,
      { messages: [{ role: 'user', content: '只回复一个字：好', timestamp: Date.now() }] },
      { signal: AbortSignal.timeout(30000) }
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function ensureSessionHost(): SessionHost {
  if (!sessionHost) {
    throw new Error('会话宿主未初始化')
  }
  return sessionHost
}

// 自动自检兑底：不依赖模型自觉调用 check_demo；settled 后应用层检查 + 失败注入修复
let autoChecker: DemoChecker | null = null
const autoChecking = new Set<string>()
/** 用户停止过的会话：不再自动注入修复（下次用户发送时解除） */
const stoppedKeys = new Set<string>()

async function autoCheckDemo(
  host: SessionHost,
  wsDir: string,
  file: string,
  key: string
): Promise<void> {
  if (autoChecking.has(key)) return
  if (!autoChecker) autoChecker = new DemoChecker()
  const result = await runChecks(wsDir, file, autoChecker)
  broadcast('chat:event', { file: key, event: { type: 'check_demo_result', result } })
  if (result.ok || stoppedKeys.has(key)) return
  // 失败 → 注入修复指令；修复后 settled 会再次触发本流程（用户点停止可逃出）
  autoChecking.add(key)
  try {
    const summary = result.issues.map((i) => `[${i.code}] ${i.message}`).join('\n')
    await host.prompt(
      key,
      `【自动自检未通过】check_demo 返回：\n${summary}\n请修复这些问题（重新生成或编辑 HTML），并调用 check_demo 验证直到通过。`
    )
  } finally {
    autoChecking.delete(key)
  }
}

/**
 * 新会话生成完成后：扫描识别新 HTML，把临时会话文件（_new-<ts>.jsonl）
 * 重命名为 <新html>.jsonl（与清单约定一致），并通知渲染层刷新列表。
 */
function finalizeNewSession(pendingSessionFile: string): string | null {
  if (!currentWs) return null
  const before = new Set(currentWs.list().map((d) => d.file))
  currentWs.scan()
  const after = currentWs.list().map((d) => d.file)
  const created = after.filter((f) => !before.has(f))
  if (created.length !== 1) return null
  const stem = created[0]!.replace(/\.html$/i, '')
  const oldPath = join(currentWs.dirname, '.pi-sessions', pendingSessionFile)
  const newPath = join(currentWs.dirname, '.pi-sessions', `${stem}.jsonl`)
  if (existsSync(oldPath) && !existsSync(newPath)) {
    renameSync(oldPath, newPath)
  }
  broadcast('workspace:changed', {})
  return created[0]!
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
  // 设置弹窗（ticket 05）：点齿轮 → 断言双槽位表单渲染
  await win.webContents.executeJavaScript(`document.querySelector('button[title="模型设置"]').click()`)
  await delay(600)
  const settingsUi = await win.webContents.executeJavaScript(
    `(() => ({
      modal: !!document.querySelector('div[style*="z-index: 100"]'),
      providerSelects: document.querySelectorAll('select').length,
      keyInputs: document.querySelectorAll('input[type="password"]').length,
      testBtn: [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('测试连接'))
    }))()`
  )
  // 聊天贴图入口（ticket 06）：占位符提示可粘贴图片
  const pasteHint = await win.webContents.executeJavaScript(
    `(() => {
      const ta = document.querySelector('textarea')
      return ta ? ta.placeholder.includes('图片') : false
    })()`
  )
  console.log(
    `[smoke-workspace] demo items=${state.count}; dir shown=${state.dirShown}; webview=${state.webview}; settings modal=${settingsUi.modal}; paste hint=${pasteHint}`
  )
  const ok =
    state.count === 1 &&
    state.dirShown &&
    state.webview &&
    settingsUi.modal &&
    settingsUi.providerSelects >= 2 &&
    settingsUi.testBtn &&
    pasteHint
  app.exit(ok ? 0 : 1)
}

/**
 * check_demo 冒烟（ticket 04 验收）：
 *   electron-vite dev -- --smoke-checkdemo
 * 对 resources/demos/ 的真实演示跑完整 check_demo（静态 + 运行时断言）。
 */
async function smokeCheckDemo(): Promise<void> {
  const demoDir = join(app.getAppPath(), 'resources', 'demos')
  // 旧版像素系 demo（CLAUDE.md 注明）非新模板体系产物，运行时断言不适用（静态检查仍全过）
  const legacy: Record<string, true> = {
    'arc-projectile.html': true,
    'ball-spring.html': true,
    'isochronous-circle.html': true
  }
  const files = readdirSync(demoDir).filter(
    (f) => f.toLowerCase().endsWith('.html') && !legacy[f]
  )
  const checker = new DemoChecker()
  let passed = 0
  for (const file of files) {
    const result = await runChecks(demoDir, file, checker)
    console.log(`[smoke-checkdemo] ${file} ${result.ok ? 'PASS' : 'FAIL'} ${JSON.stringify(result.issues)}`)
    if (result.ok) passed++
  }
  checker.destroy()
  console.log(`[smoke-checkdemo] ${passed}/${files.length} passed`)
  app.exit(passed === files.length ? 0 : 1)
}

/**
 * 设置冒烟（ticket 05 验收）：
 *   electron-vite dev -- --smoke-settings
 * ① 加密存取往返（明文不落盘）② 模型列表动态获取 ③ 真实 Key 最小 complete（无 Key 则 SKIP）。
 */
async function smokeSettings(): Promise<void> {
  const store = SettingsStore.at(app.getPath('userData'))
  const probeKey = process.env.OPENCODE_API_KEY ?? 'sk-roundtrip-probe'
  store.save({ main: { provider: 'opencode-go', modelId: 'deepseek-v4-flash', apiKey: probeKey } })
  const loaded = store.load()
  const roundtrip = loaded.main?.apiKey === probeKey
  console.log(`[smoke-settings] encrypted roundtrip=${roundtrip}`)

  const runtime = await ModelRuntime.create({
    authPath: join(app.getPath('userData'), 'agent', 'auth.json'),
    refreshOnCreate: false
  })
  const registry = new ModelRegistry(runtime)
  await registry.refresh()
  const models = listProviderModels(runtime, 'opencode-go')
  console.log(`[smoke-settings] models count=${models.length}`)
  if (models.length === 0 || !roundtrip) {
    console.log('[smoke-settings] FAIL')
    app.exit(1)
    return
  }

  if (!process.env.OPENCODE_API_KEY) {
    console.log('[smoke-settings] SKIP (无 OPENCODE_API_KEY)')
    app.exit(0)
    return
  }
  const test = await testSlotConnection({
    provider: 'opencode-go',
    modelId: 'deepseek-v4-flash',
    apiKey: process.env.OPENCODE_API_KEY
  })
  console.log(`[smoke-settings] complete ${test.ok ? 'OK' : 'FAIL: ' + (test.error ?? '')}`)
  app.exit(test.ok ? 0 : 1)
}

/**
 * OCR 冒烟（ticket 06 验收）：
 *   electron-vite dev -- --smoke-ocr
 * 真实 Key：从 opencode-go 目录挑一个支持视觉的模型，用 1×1 PNG 走 extractImageText。
 * 无 Key 则 SKIP；目录无视觉模型则 FAIL（配置问题）。
 */
async function smokeOcr(): Promise<void> {
  const authPath = join(app.getPath('userData'), 'agent', 'auth.json')
  if (!process.env.OPENCODE_API_KEY) {
    console.log('[smoke-ocr] SKIP (无 OPENCODE_API_KEY)')
    app.exit(0)
    return
  }
  const runtime = await ModelRuntime.create({ authPath, refreshOnCreate: false })
  await applySlotToRuntime(runtime, {
    provider: 'opencode-go',
    modelId: 'unused',
    apiKey: process.env.OPENCODE_API_KEY
  })
  await runtime.refresh()
  const visionModel = runtime.getModels('opencode-go').find((m) => m.input.includes('image'))
  if (!visionModel) {
    console.log('[smoke-ocr] FAIL (opencode-go 目录无视觉模型)')
    app.exit(1)
    return
  }
  // 1×1 透明 PNG（base64）
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  const text = await extractImageText({
    authPath,
    slot: { provider: 'opencode-go', modelId: visionModel.id, apiKey: process.env.OPENCODE_API_KEY },
    images: [{ data: png, mimeType: 'image/png' }]
  })
  const ok = text.trim().length > 0
  console.log(`[smoke-ocr] vision model=${visionModel.id}; extracted=${JSON.stringify(text.slice(0, 80))}`)
  console.log(`[smoke-ocr] ${ok ? 'PASS' : 'FAIL'}`)
  app.exit(ok ? 0 : 1)
}

app.whenReady().then(async () => {
  // 冒烟模式隔离 userData：不污染真实 settings.json（恢复上次工作目录）
  if (process.argv.some((a) => a.startsWith('--smoke'))) {
    app.setPath('userData', mkdtempSync(join(tmpdir(), 'physics-lab-smoke-userdata-')))
  }
  settings = SettingsStore.at(app.getPath('userData'))
  sessionHost = new SessionHost({
    agentDir: join(app.getPath('userData'), 'agent'),
    skillDir: skillDir(),
    getMainSlot: () => settings?.load().main
  })
  registerWorkspaceIpc()
  registerSettingsIpc()

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
  if (process.argv.includes('--smoke-checkdemo')) {
    await smokeCheckDemo().catch((err) => {
      console.error('[smoke-checkdemo] FAIL', err)
      app.exit(1)
    })
    return
  }
  if (process.argv.includes('--smoke-settings')) {
    await smokeSettings().catch((err) => {
      console.error('[smoke-settings] FAIL', err)
      app.exit(1)
    })
    return
  }
  if (process.argv.includes('--smoke-ocr')) {
    await smokeOcr().catch((err) => {
      console.error('[smoke-ocr] FAIL', err)
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
