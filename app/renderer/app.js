// physics-lab renderer — 组装 chat / tabs / preview 模块 + IPC 粘合
import { createChat } from './chat.js';
import { createTabBar } from './tabs.js';
import { createPreview } from './preview.js';

const { getConfig, setConfig, getWorkdir, selectWorkdir, scanTabs, activateTab, onTabsChanged,
        send, stop, onStream, onFileChanged, debug } = window.api;
const $ = (id) => document.getElementById(id);

// ---- 聊天模块 ----
const chat = createChat(
  $('msgs'),
  $('input'),
  document.querySelector('[data-dom-id="btn-send-message"]'),
  {
    onSend: async (text) => {
      const res = await send(text);
      if (!res.ok) chat.streamError(res.error || '发送失败');
    },
    onStop: async () => {
      const res = await stop();
      if (!res.ok) chat.streamError(res.error || '停止失败');
    },
  },
);

// 表单提交（send 按钮点击走 handleSendClick 分发：streaming 时中断、否则发送）
const sendBtn = document.querySelector('[data-dom-id="btn-send-message"]');
if (sendBtn) sendBtn.addEventListener('click', () => chat.handleSendClick());
const inp = $('input');
if (inp) inp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chat.handleSendClick(); }
});

// 流式事件
onStream((p) => {
  if (p.type === 'delta') chat.streamDelta(p.text);
  else if (p.type === 'thinking-delta') chat.streamThinking(p.text);
  else if (p.type === 'thinking-end') chat.streamThinkingEnd();
  else if (p.type === 'tool') chat.streamTool(p.name);
  else if (p.type === 'done') chat.streamDone();
  else if (p.type === 'error') chat.streamError(p.text);
});

// ---- 标签页模块 ----
const tabBar = createTabBar(
  document.querySelector('[data-region="tab-bar"]'),
  {
    onActivate: (t) => {
      chat.switchContext(t.title);
      preview.load(t.path);
      try { activateTab(t.path); } catch {}
    },
    onNew: () => {
      const bar = document.querySelector('[data-region="tab-bar"]');
      // 去重
      if (bar.querySelector('.tab-new-session')) return;
      const btn = document.createElement('button');
      btn.className = 'tab tab-active tab-new-session';
      btn.dataset.path = '__new__';
      btn.innerHTML = '<span class="truncate">＋ 新建演示</span>';
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.tab').forEach(x => x.classList.remove('tab-active'));
        btn.classList.add('tab-active');
        chat.switchContext('新建演示');
        preview.clear();
        try { activateTab('__new__'); } catch {}
      });
      const plus = $('btn-new-tab');
      plus ? bar.insertBefore(btn, plus) : bar.appendChild(btn);
      btn.click();
    },
  },
);

// 扫描 + 渲染
async function refreshTabs() {
  try {
    const list = await scanTabs();
    tabBar.render(list);
  } catch {}
}
onTabsChanged((tabs) => { if (tabs) tabBar.render(tabs); });

// 文件变化 → 刷新预览
onFileChanged(({ path }) => {
  preview.load(path);
});

// ---- 预览模块 ----
const preview = createPreview($('preview'), $('preview-empty'));

// ---- 配置表单 ----
const setup = $('setup');
const showSetup = () => { setup.classList.remove('hidden'); setup.classList.add('show'); setup.style.display = 'flex'; };
const hideSetup = () => { setup.classList.add('hidden'); setup.classList.remove('show'); setup.style.display = 'none'; };

function setStatus(cfg, wd) {
  const st = $('status-provider');
  const sw = $('status-workdir');
  const sc = $('status-connected');
  const sb = $('status-baseurl');
  if (cfg && wd) {
    st.textContent = cfg.model || 'app-openai';
    sw.textContent = wd; sc.textContent = '已连接'; sb.textContent = 'Base URL: ' + (cfg.baseUrl || '');
  } else {
    st.textContent = '未配置'; sw.textContent = wd || '~/未选择'; sc.textContent = '未连接'; sb.textContent = 'Base URL: ' + (cfg ? (cfg.baseUrl || '—') : '—');
  }
}

document.querySelector('[data-dom-id="btn-open-setup"]')?.addEventListener('click', showSetup);
$('btn-close-setup').addEventListener('click', hideSetup);
$('cfg-pick').addEventListener('click', async () => {
  const p = await selectWorkdir();
  if (p) { $('cfg-dir').textContent = p; $('cfg-dir').title = p; }
});
$('btn-save-setup').addEventListener('click', async (e) => {
  e.preventDefault();
  const cfg = { baseUrl: $('cfg-baseUrl').value.trim(), apiKey: $('cfg-apiKey').value.trim(), model: $('cfg-model').value.trim() };
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) { $('cfg-dir').textContent = '请填齐 Base URL / API Key / 模型名'; return; }
  const wd = await getWorkdir();
  if (!wd) { $('cfg-dir').textContent = '请先选择工作目录'; return; }
  await setConfig(cfg);
  hideSetup();
  await refreshUI();
});

async function refreshUI() {
  const cfg = await getConfig();
  const wd = await getWorkdir();
  if (cfg) { $('cfg-baseUrl').value = cfg.baseUrl || ''; $('cfg-model').value = cfg.model || ''; $('cfg-apiKey').value = cfg.apiKey || ''; }
  if (cfg) $('cfg-dir').textContent = wd || '未选择';
  setStatus(cfg, wd);
  if (!cfg || !wd) showSetup(); else hideSetup();
}

// ---- 窗口控制按钮 ----
const { winMinimize, winMaximize, winClose, onMaximizeChange } = window.api;
$('btn-min')?.addEventListener('click', winMinimize);
$('btn-max')?.addEventListener('click', winMaximize);
$('btn-close')?.addEventListener('click', winClose);
onMaximizeChange((maxed) => {
  const btn = $('btn-max');
  if (!btn) return;
  btn.innerHTML = maxed
    ? '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>'
    : '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
});

// ---- 启动 ----
chat.append('ai', '输入一道物理题，我会帮你理解问题、给出解答，并生成可交互的 HTML 演示。');
refreshTabs();
refreshUI();
