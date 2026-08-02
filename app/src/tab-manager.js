// TabManager — Agent session 生命周期 + 文件扫描（见 ADR 0004/0009）。
// 接口：getOrCreate(filePath|null)、listFiles()、onChange(fn)、dispose()、activePath。
// 对调用者：一个 TabManager = 一个工作目录的完整 agent/tab 管理。
const fs = require('fs');
const path = require('path');

function createTabManager({ workdir, llm, agentFactory }) {
  const agents = new Map();          // filePath|null → AgentHandle
  const listeners = new Set();       // (tabs: Tab[]) => void
  let _activePath = null;            // null = 新建演示
  let watcher = null;
  let disposed = false;

  function scanFiles() {
    const tabs = [];
    if (!workdir || !fs.existsSync(workdir)) return tabs;
    const dirs = fs.readdirSync(workdir, { withFileTypes: true });
    for (const entry of dirs) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const p = path.join(workdir, entry.name);
      try {
        const head = fs.readFileSync(p, 'utf8', 0, 500);
        const m = head.match(/<!--\s*physics-demo:\s*(.+?)\s*-->/);
        if (!m) continue;
        tabs.push({ title: m[1].trim(), path: p, file: entry.name });
      } catch {}
    }
    return tabs;
  }

  function notify() {
    const tabs = scanFiles();
    listeners.forEach(fn => { try { fn(tabs); } catch {} });
  }

  function startWatcher() {
    if (!workdir) return;
    try {
      watcher && watcher.close();
      watcher = fs.watch(workdir, (evt, file) => {
        if (file && file.endsWith('.html')) notify();
      });
    } catch {}
  }

  startWatcher();

  return {
    /** 获取或创建 agent——ADR 0004：一个文件一个 session（异步） */
    async getOrCreate(filePath) {
      if (disposed) throw new Error('TabManager disposed');
      if (agents.has(filePath)) return agents.get(filePath);
      const agent = await agentFactory({ workdir, llm, file: filePath });
      agents.set(filePath, agent);
      _activePath = filePath;
      return agent;
    },

    /** 扫描工作目录中带 physics-demo 标记的 .html */
    listFiles() { return scanFiles(); },

    /** 订阅文件变更 */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** 手动触发通知（测试用） */
    _notifyChange() { notify(); },

    /** 当前活动文件路径（null = 新建） */
    get activePath() { return _activePath; },

    /** 清理所有 agent 和文件监听 */
    dispose() {
      disposed = true;
      if (watcher) { try { watcher.close(); } catch {} watcher = null; }
      for (const a of agents.values()) { try { a.dispose(); } catch {} }
      agents.clear();
      listeners.clear();
    },
  };
}

module.exports = { createTabManager };
