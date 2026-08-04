# 实现计划：停止/中断功能 + getOrCreate 并发防护

## 背景

physics-lab app 几次"未响应"的复盘暴露两个结构性缺口：
1. **无中断功能** — `main.js` 的 `chat:send` 里 `await a.send(text)` 一路 await 到回合结束，streaming 时输入框被禁用（`setEnabled(false)`），卡住时无法中断。SDK 有公开的 `session.abort()`（`agent-session.d.ts:440`）但未接线。
2. **`getOrCreate` 并发无防护** — `tab-manager.js:61-71`：`agentFactory`（`createAgent`，耗时长）进行中时 `agents.has(filePath)` 仍为 false（要等 `:68` 才 set），这期间第二次调用会重复 `createAgent` → 重复 `loadSdk` import + 重复 `SessionManager.open` 同一会话目录 → 死锁/卡死。

按优先级实现：先并发防护（缺口 2，根因级），再停止功能（缺口 1，体验级）。

## 关键事实（已查证）

- **SDK abort 行为**：`session.abort()`（`agent-session.js:1165`）= `abortRetry()` + `agent.abort()` + `await waitForIdle()`。agent-core 中止当前回合时仍发 `message_end`（stopReason="aborted"）+ `turn_end`（`_runAgentSettled` 在 `finally` 里必跑，`agent-session.js:752-756`）。
- **现有 `turn_end` 处理器**：`main.js:59` 已把 `turn_end` 转发为 `chat:stream { type:'done' }` → 渲染层 `streamDone()` 恢复 UI（`chat.js:185`）。**即 abort 后 UI 会自动恢复**，停止按钮只需触发 abort，不必另写状态机。
- **`chat:send` 的 `await a.send(text)`**：abort 后也会 resolve（prompt 不抛），所以 `chat:send` handler 正常走完返回 `{ok:true}`，不冲突。
- **send 按钮结构**（`index.html:226`）：`<button data-dom-id="btn-send-message">` 内含向上箭头 SVG。`chat.js` 的 `sendBtn` 已引用它，`setEnabled(false)` 在 streaming 时禁用它 — 这正是要改的：streaming 时 send 按钮要可点（变停止按钮）。
- **测试模式**：`tab-manager.test.js` 用 `fakeFactory`（返回 `Promise.resolve({...})`）+ vitest。并发测试需让 factory 返回延迟 promise。

---

## 改动 1：`getOrCreate` 并发防护（`tab-manager.js`）

**问题**：`getOrCreate(filePath)` 在 `await agentFactory(...)` 期间，`agents.has(filePath)` 为 false，并发调用会重复创建。

**方案**：维护一个 `pending` Map（filePath → in-flight Promise）。创建中复用同一个 promise；创建完写入 `agents` 并清理 `pending`。失败也要清理 `pending`（避免永久卡死）。

```js
const pending = new Map(); // filePath -> in-flight Promise<agent>

async getOrCreate(filePath) {
  if (disposed) throw new Error('TabManager disposed');
  if (agents.has(filePath)) return agents.get(filePath);
  if (pending.has(filePath)) return pending.get(filePath); // 复用进行中的创建
  const p = agentFactory({ workdir, llm, file: filePath, onRename: (o,n) => rekey(o,n) })
    .then(agent => { agents.set(filePath, agent); _activePath = filePath; pending.delete(filePath); return agent; })
    .catch(err => { pending.delete(filePath); throw err; });
  pending.set(filePath, p);
  return p;
}
```

**边界**：`rekey` 把 agent 从 oldPath 迁到 newPath；若迁后又有 `getOrCreate(oldPath)`，会正常新建（pending 已清理）。`dispose` 时 pending 里若有未完成创建，直接清空 Map（已 disposed，`getOrCreate` 会抛）。

**TDD**：先写红测试——"并发 getOrCreate 同一文件只创建一次 agent"。fakeFactory 返回延迟 promise（用 `new Promise(r => setTimeout(r, 50))` 模拟耗时），`Promise.all([getOrCreate('a.html'), getOrCreate('a.html')])` 后 `agentsCreated.length === 1`。

---

## 改动 2：停止/中断功能（主进程 + preload + 渲染层）

### 2a. agent.js — 暴露 `stop()`

agent handle（`agent.js:309`）新增 `stop` 方法，调 `session.abort()`：

```js
async stop() {
  try { await session.abort(); log('session aborted'); }
  catch (e) { log('abort failed: ' + (e && e.message || e)); }
},
```

不传 `session` 给外部（现状已传 `session`，保留兼容），新增 `stop` 即可。

### 2b. main.js — `chat:stop` IPC handler

```js
ipcMain.handle('chat:stop', async () => {
  if (!tm || !activeTab) return { ok: false };
  try {
    const a = await tm.getOrCreate(activeTab);
    if (a && a.stop) await a.stop();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
```

abort 后 SDK 发 `turn_end` → 现有 `main.js:59` → `chat:stream {type:'done'}` → `streamDone()` 恢复 UI。**无需额外状态恢复逻辑**。

### 2c. preload.js — 暴露 `stop`

```js
stop: () => ipcRenderer.invoke('chat:stop'),
```

### 2d. 渲染层 — send 按钮切换为停止按钮

**chat.js**：
- `streaming` 期间 send 按钮不禁用，而是切换为"停止"形态（图标变方块、点击触发 `stop`）。
- 新增 `onStop` 回调注入（与 `onSend` 同级）。
- `setEnabled(ok)` 改为：空闲禁用/启用 send；streaming 时**强制启用** send 并切换为停止按钮。
- 新增 `setStopMode(bool)`：true 时换停止图标 + 绑定 stop；false 时换回发送图标 + 绑定 send。

```js
function setSendMode(mode) { // 'send' | 'stop'
  sendBtn.dataset.mode = mode;
  sendBtn.disabled = false; // 两种模式都可点
  sendBtn.innerHTML = mode === 'stop' ? STOP_SVG : SEND_SVG;
}
```
- `streamStart()` → `setSendMode('stop')`
- `streamDone()`/`streamError()` → `setSendMode('send')`
- `setEnabled(ok)`：只在 'send' 模式下按 ok 禁用/启用（streaming 时不走 setEnabled 的 disable）。
- send 按钮点击：按 `sendBtn.dataset.mode` 分发到 `send()` 或 `onStop()`。

**app.js**：`createChat` 注入 `onStop: () => stop()`。

**STOP_SVG**：方块停止图标 `<rect x="6" y="6" width="12" height="12" rx="1"/>`。

### 2e. index.html — 无需改 DOM

复用现有 `data-dom-id="btn-send-message"` 按钮，仅 JS 切换图标和 dataset.mode。不改 HTML 结构。

---

## 验证

- `npx vitest run` — 47 现有测试 + 新增并发测试全过。
- 单测：`tab-manager.test.js` 加并发用例（`Promise.all` 同文件 → 1 个 agent）。
- 重启 Electron 实跑：发题 → streaming 中点停止按钮 → 回合立即结束、输入框恢复、preview 不崩。

## 不做（范围控制）

- 演示模式触发入口（缺口 4）— 非救急，留后。
- 文件树面板 — tab 栏已替代，CLAUDE.md 描述出入属文档问题，不改代码。
- README 待验证点更新 — 留后。
