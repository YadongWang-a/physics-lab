// Electron 主进程（见 ADR 0001/0004/0009/0010）。
// TabManager：agent 生命周期 + 文件扫描（每个文件独立 session，ADR 0004 的 1:1）。
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const llmConfig = require('./llm-config');
const { selectWorkdir, setupWorkdir } = require('./workdir');
const { createAgent, stemOf } = require('./agent');
const { createTabManager } = require('./tab-manager');
const { createBackup, cleanupStaleUnbound } = require('./demo-write');

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
      return createAgent({
        workdir, llm, file,
        // 改名（write_demo 写新文件名）→ TabManager 重挂 key + 刷新预览（ADR 0013）
        onRename(oldPath, newPath) {
          if (!tm) return;
          tm.rekey(oldPath, newPath);
          // 活动 tab 改名时同步 activeTab：编辑模式命中 oldPath；生成模式（oldPath=null）且当前
          // activeTab=null 即该生成会话——否则下次 chat:send/chat:stop 会对已删除的旧路径重建 agent
          if (activeTab === oldPath || (oldPath === null && activeTab === null)) activeTab = newPath;
          if (win && !win.isDestroyed()) win.webContents.send('preview:file-changed', { path: newPath });
        },
      });
    },
  });

  // 流式事件转发到渲染进程
  const _onEvt = (event) => {
    if (!win || win.isDestroyed() || !event || tm.activePath !== activeTab) return;
    const ae = event.assistantMessageEvent;
    if (event.type === 'message_update' && ae && ae.type === 'text_delta') {
      win.webContents.send('chat:stream', { type: 'delta', text: ae.delta || '' });
    } else if (event.type === 'message_update' && ae && ae.type === 'thinking_delta') {
      win.webContents.send('chat:stream', { type: 'thinking-delta', text: ae.delta || '' });
    } else if (event.type === 'message_update' && ae && ae.type === 'thinking_end') {
      win.webContents.send('chat:stream', { type: 'thinking-end' });
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
      // 全量事件转发到渲染进程（_onEvt）。
      // 注：曾有同步 fs.appendFileSync 的调试日志订阅器，每个 thinking_delta 同步写盘，
      // 高频事件下阻塞主进程致"没响应"（events.log 堆到 27 万行）。已删除。
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
    // 写前备份：目标文件存在时快照到 .piagent/<stem>/backups/（保留 10 版，ADR 0011）
    if (activeTab) {
      try { createBackup(workdir, stemOf(path.basename(activeTab)), Date.now()); } catch {}
    }
    await a.send(text);
    // 回合结束刷新预览（agent 写文件发生在回合内；ADR 0003）
    if (activeTab && win && !win.isDestroyed()) {
      win.webContents.send('preview:file-changed', { path: activeTab });
    }
    return { ok: true };
  } catch (e) {
    win && win.webContents.send('chat:stream', { type: 'error', text: String(e && e.message || e) });
    return { ok: false, error: String(e && e.message || e) };
  }
});

ipcMain.handle('chat:stop', async () => {
  // 与 chat:send 同款守卫：activeTab 为 null（新建演示会话）时同样允许停止——生成回合正是卡住高发场景
  if (!tm || activeTab === undefined) return { ok: false, error: '未选择标签页' };
  try {
    const a = await tm.getOrCreate(activeTab);
    if (a && a.stop) await a.stop();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

app.whenReady().then(async () => {
  workdir = loadWorkdir();
  if (workdir && fs.existsSync(workdir)) {
    setupWorkdir(workdir);
    cleanupStaleUnbound(workdir); // 清理上次崩溃残留的未绑定会话目录（ADR 0013）
    initTabManager();
  } else { workdir = null; }
  createWindow();
});

app.on('window-all-closed', () => {
  if (tm) { try { tm.dispose(); } catch {} }
  app.quit();
});
