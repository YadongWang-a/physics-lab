// Electron 主进程（见 ADR 0001/0004/0009/0010）。
// TabManager：agent 生命周期 + 文件扫描（每个文件独立 session，ADR 0004 的 1:1）。
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const llmConfig = require('./llm-config');
const { selectWorkdir, setupWorkdir } = require('./workdir');
const { createAgent } = require('./agent');
const { createTabManager } = require('./tab-manager');

let win = null;
let tm = null;             // TabManager — 替换旧的 agents Map + ensureAgent + scanTabs
let activeTab = null;      // 当前活动 tab（null = 新建）
let workdir = null;

const workdirStoreFile = () => path.join(app.getPath('userData'), 'workdir.json');
function loadWorkdir() { try { return JSON.parse(fs.readFileSync(workdirStoreFile(), 'utf8')).path || null; } catch { return null; } }
function saveWorkdir(p) { fs.writeFileSync(workdirStoreFile(), JSON.stringify({ path: p })); }

// 用 TabManager 初始化：agent 工厂、流式事件转发、文件变更加通知
function initTabManager() {
  if (tm) { try { tm.dispose(); } catch {} }
  const llm = llmConfig.getLlmConfig();
  if (!workdir || !llm) return;

  tm = createTabManager({
    workdir,
    llm,
    agentFactory({ workdir, llm, file }) {
      return createAgent({ workdir, llm, file });
    },
  });

  // 流式事件转发到渲染进程
  const _onEvt = (event) => {
    if (!win || win.isDestroyed() || !event || tm.activePath !== activeTab) return;
    const ae = event.assistantMessageEvent;
    if (event.type === 'message_update' && ae && ae.type === 'text_delta') {
      win.webContents.send('chat:stream', { type: 'delta', text: ae.delta || '' });
    } else if (event.type === 'message_update' && ae && (ae.type === 'tool_use' || ae.type === 'tool_call')) {
      win.webContents.send('chat:stream', { type: 'tool', name: ae.toolName || ae.name || ae.tool || '工具' });
    } else if (event.type === 'message_update' && ae && ae.type === 'tool_result') {
      win.webContents.send('chat:stream', { type: 'tool-ok' });
    } else if (event.type === 'error' || event.type === 'session_error') {
      win.webContents.send('chat:stream', { type: 'error', text: event.error && event.error.message || String(event.error || event) });
    } else if (event.type === 'turn_end') {
      win.webContents.send('chat:stream', { type: 'done' });
    }
  };

  // 给每个新 agent 订阅流式事件。TabManager.getOrCreate 是异步的，这里做创建后订阅
  const _origGetOrCreate = tm.getOrCreate.bind(tm);
  tm.getOrCreate = async (filePath) => {
    const a = await _origGetOrCreate(filePath);
    if (a && !a._subscribed) {
      a._subscribed = true;
      // 全量事件日志（调试用）——帮我们看到 tool 事件的真实类型
      a.session.subscribe((evt) => {
        try { fs.appendFileSync(path.join(app.getPath('userData'), 'events.log'), JSON.stringify({ type: evt && evt.type, aeType: evt && evt.assistantMessageEvent && evt.assistantMessageEvent.type, keys: evt ? Object.keys(evt).slice(0,10) : [] }) + '\n'); } catch {}
      });
      a.subscribe(_onEvt);
    }
    return a;
  };

  // fs.watch 驱动的 tab 变更通知
  tm.onChange((tabs) => {
    win && win.webContents.send('tabs:changed', { tabs });
  });
}

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.svg'));
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 600,
    frame: false,
    icon,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // 最大化/还原状态通知渲染
  win.on('maximize', () => win.webContents.send('window:maximize-change', true));
  win.on('unmaximize', () => win.webContents.send('window:maximize-change', false));
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    console.error(`[renderer:${level}] ${message}  (${source}:${line})`);
  });
  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error(`[preload-error] ${preloadPath}: ${err}`);
  });
  if (process.env.PHYLAB_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
}

// ---- IPC ----
ipcMain.on('window:minimize', () => win && win.minimize());
ipcMain.on('window:maximize', () => {
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', () => win && win.close());
ipcMain.handle('tabs:scan', () => tm ? tm.listFiles() : []);
ipcMain.handle('debug:log', (_e, msg) => {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch {}
});
ipcMain.handle('config:get', () => llmConfig.getLlmConfig());
ipcMain.handle('config:set', async (_e, cfg) => {
  llmConfig.setLlmConfig(cfg);
  initTabManager();
  return { ok: true };
});
ipcMain.handle('workdir:get', () => workdir);
ipcMain.handle('workdir:select', async () => {
  const p = await selectWorkdir();
  if (!p) return null;
  setupWorkdir(p);
  workdir = p;
  saveWorkdir(p);
  initTabManager();
  return p;
});
ipcMain.handle('tabs:activate', async (_e, filePath) => {
  const realPath = (filePath === '__new__') ? null : filePath;
  activeTab = realPath;
  if (tm) await tm.getOrCreate(realPath);
  // 首次创建后订阅流式事件（已在 initTabManager 的 patch 中处理）
  return { ok: true };
});
ipcMain.handle('chat:send', async (_e, text) => {
  if (activeTab === undefined || !tm) return { ok: false, error: '未选择标签页' };
  let a;
  try { a = await tm.getOrCreate(activeTab); } catch (e) {
    return { ok: false, error: 'Agent 创建失败: ' + (e && e.message || e) };
  }
  if (!a) return { ok: false, error: 'Agent 未就绪' };
  try {
    // 强制输出结构：拼在用户消息前面，确保 agent 生成 HTML
    const prompt = '【输出要求 — 必须严格遵守】\n你的回答必须包含四个阶段，并用 write 工具创建 HTML 演示文件：\n\n1. 【问题理解】— 简述物理问题\n2. 【解答】— 物理推导与结论（公式用 $$...$$ 或 $...$）\n3. 【演示生成】— 说明生成了什么交互演示，然后**立即调用 write 工具写出 HTML 文件**（文件名用英文 slug，第一行 `<!-- physics-demo: 标题 -->`；文件规范见 system prompt）\n4. ✅ 文件已更新：[文件名]\n\n⚠️ 核心任务：生成可交互的 HTML 物理演示，不只是回答问题！\n\n---\n用户消息：\n' + text;
    await a.send(prompt);
    return { ok: true };
  } catch (e) {
    win && win.webContents.send('chat:stream', { type: 'error', text: String(e && e.message || e) });
    return { ok: false, error: String(e && e.message || e) };
  }
});

app.whenReady().then(async () => {
  workdir = loadWorkdir();
  if (workdir && fs.existsSync(workdir)) {
    setupWorkdir(workdir);
    initTabManager();
  } else { workdir = null; }
  createWindow();
});

app.on('window-all-closed', () => {
  if (tm) { try { tm.dispose(); } catch {} }
  app.quit();
});
