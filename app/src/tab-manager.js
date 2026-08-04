// TabManager — Agent session 生命周期 + 文件扫描（见 ADR 0004/0009）。
// 接口：getOrCreate(filePath|null)、listFiles()、onChange(fn)、dispose()、activePath。
// 对调用者：一个 TabManager = 一个工作目录的完整 agent/tab 管理。
const fs = require('fs');
const path = require('path');

function createTabManager({ workdir, llm, agentFactory }) {
  const agents = new Map();          // filePath|null → AgentHandle
  const pending = new Map();         // filePath -> in-flight Promise<AgentHandle>（getOrCreate 并发防护）
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

  // 改名（write_demo 写新文件名）时重挂 key：agents Map 与 activePath（ADR 0013）。
  // 通知由 notify() 与 fs.watch 双保险触发；Preview 刷新由 main 的 onRename 转发。
  function rekey(oldPath, newPath) {
    if (!agents.has(oldPath)) return;
    const agent = agents.get(oldPath);
    agents.delete(oldPath);
    agents.set(newPath, agent);
    if (_activePath === oldPath) _activePath = newPath;
    notify();
  }

  return {
    /** 获取或创建 agent——ADR 0004：一个文件一个 session（异步） */
    async getOrCreate(filePath) {
      if (disposed) throw new Error('TabManager disposed');
      if (agents.has(filePath)) return agents.get(filePath);
      // 并发防护：创建中进行时复用同一个 in-flight Promise，避免重复 createAgent
      // （重复 createAgent 会重复 loadSdk import + 重复 SessionManager.open 同一会话目录 -> 死锁）
      if (pending.has(filePath)) return pending.get(filePath);
      const p = Promise.resolve(agentFactory({
        workdir, llm, file: filePath,
        onRename: (oldPath, newPath) => rekey(oldPath, newPath),
      })).then((agent) => {
        agents.set(filePath, agent);
        _activePath = filePath;
        pending.delete(filePath);
        return agent;
      }).catch((err) => {
        pending.delete(filePath); // 失败也要清理，避免永久卡死
        throw err;
      });
      pending.set(filePath, p);
      return p;
    },

    /** 改名重挂：agents Map key 与 activePath 迁移到新路径 */
    rekey,

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
      pending.clear();
      listeners.clear();
    },
  };
}

module.exports = { createTabManager };
