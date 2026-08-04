// preload：contextBridge 暴露最小安全 IPC API（contextIsolation: true）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // LLM 配置
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),

  // 工作目录
  getWorkdir: () => ipcRenderer.invoke('workdir:get'),
  selectWorkdir: () => ipcRenderer.invoke('workdir:select'),

  // Chat
  send: (text) => ipcRenderer.invoke('chat:send', text),
  stop: () => ipcRenderer.invoke('chat:stop'),
  onStream: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('chat:stream', h);
    return () => ipcRenderer.removeListener('chat:stream', h);
  },

  // 标签页：扫描 + 激活（ADR 0004：一个文件一个 session）
  scanTabs: () => ipcRenderer.invoke('tabs:scan'),
  activateTab: (path) => ipcRenderer.invoke('tabs:activate', path),
  onTabsChanged: (cb) => {
    const h = (_e, payload) => cb(payload.tabs);
    ipcRenderer.on('tabs:changed', h);
    return () => ipcRenderer.removeListener('tabs:changed', h);
  },

  // Preview（fs.watch 通知文件变化）
  onFileChanged: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('preview:file-changed', h);
    return () => ipcRenderer.removeListener('preview:file-changed', h);
  },

  // 调试日志（写文件）
  debug: (msg) => ipcRenderer.invoke('debug:log', msg),

  // 窗口控制（无框窗口）
  winMinimize: () => ipcRenderer.send('window:minimize'),
  winMaximize: () => ipcRenderer.send('window:maximize'),
  winClose: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (cb) => {
    const h = (_e, val) => cb(val);
    ipcRenderer.on('window:maximize-change', h);
    return () => ipcRenderer.removeListener('window:maximize-change', h);
  },
});
