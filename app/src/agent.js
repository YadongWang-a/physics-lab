// Agent 接线（见 ADR 0004/0008/0009/0010）。
// G1 用 inMemory（持久化随标签页功能一起做）。
// OpenAI 兼容 endpoint：ModelRuntime.registerProvider → setRuntimeApiKey → getModel（不用 extension factory）
// 工具：read/write/edit/ls/find/grep，禁 bash；无路径隔离。
// system prompt：DefaultResourceLoader.systemPromptOverride（ADR 0010）。
const path = require('path');
const fs = require('fs');
const { SYSTEM_PROMPT } = require('./system-prompt');

let _coding, _ai;
async function loadSdk() {
  if (!_coding) {
    _coding = await import('@earendil-works/pi-coding-agent');
    _ai = await import('@earendil-works/pi-ai');
  }
  return { coding: _coding, ai: _ai };
}

function log(msg) {
  try {
    const { app } = require('electron');
    const fp = path.join(app.getPath('userData'), 'agent.log');
    fs.appendFileSync(fp, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

async function createAgent({ workdir, llm, file }) {
  log('createAgent: enter file=' + (file || 'none'));
  const { coding, ai } = await loadSdk();
  log('createAgent: SDK loaded');
  const { createAgentSession, DefaultResourceLoader, SessionManager, ModelRuntime } = coding;

  const agentDir = path.join(workdir, '.pi', 'agent');

  // 每个 session 绑定一个文件：告诉 agent 只编辑这个文件（ADR 0004：一个文件一个 session）
  const perfile = file
    ? '\n\n⚠️ **当前编辑目标**：`' + path.basename(file) + '`。只修改这个文件，不要动工作目录中其他 .html 文件。'
    : '\n\n🆕 **当前是新建演示**——你需要创建一个新的 HTML 文件（用 write 工具），文件名用英文 slug（如 `spring-demo.html`），第一行包含 `<!-- physics-demo: 中文标题 -->`。';
  const prompt = SYSTEM_PROMPT + perfile;
  log('createAgent: start model=' + llm.model + ' baseUrl=' + llm.baseUrl + ' file=' + (file || 'none'));

  // 1. ModelRuntime（纯运行时，不读 auth.json/models.json）
  const modelRuntime = await ModelRuntime.create({ modelsPath: null });
  log( 'ModelRuntime created, built-in providers: ' + modelRuntime.getProviders().map(p => p.id).join(','));

  // 2. 注册自定义 OpenAI-compatible provider（baseUrl + model 定义，key 后面运行时注入）
  modelRuntime.registerProvider('app-openai', {
    name: 'App OpenAI',
    baseUrl: llm.baseUrl,
    api: 'openai-completions',
    models: [{
      id: llm.model,
      name: llm.model,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    }],
  });
  log( 'registered provider app-openai');

  // 3. 运行时注入 API key（不落盘）
  await modelRuntime.setRuntimeApiKey('app-openai', llm.apiKey);
  log( 'setRuntimeApiKey done');

  // 4. 取模型——现在稳了，因为 registerProvider + setRuntimeApiKey 都走 modelRuntime
  const model = modelRuntime.getModel('app-openai', llm.model);
  if (!model) {
    const avail = await modelRuntime.getAvailable();
    log( 'model NOT FOUND, available: ' + JSON.stringify(avail.map(m => m.id || m.provider + '/' + (m.id || '?'))));
    throw new Error('模型 "' + llm.model + '" 未找到。可用: ' + avail.map(m => m.id || m.name).join(', '));
  }
  log( 'model found: ' + (model.id || JSON.stringify({ id: model.id, provider: (model.provider || {}).id })));

  // 5. ResourceLoader：systemPrompt 应用内联（ADR 0010），noContextFiles 关掉 AGENTS.md 发现
  const loader = new DefaultResourceLoader({
    cwd: workdir,
    agentDir,
    systemPrompt: prompt,
    noContextFiles: true,
  });

  // 6. 创建 session —— session 持久化到 <工作目录>/.pi/agent/sessions/（ADR 0004：一个文件一个 session）
  const tools = ['read', 'write', 'edit', 'ls', 'find', 'grep']; // 禁 bash
  const { session } = await createAgentSession({
    resourceLoader: loader,
    modelRuntime,
    model,
    tools,
    // sessionManager 省略 → 默认 SessionManager.create(cwd)，持久化到 agentDir/sessions/
  });
  log( 'createAgentSession ok, sessionId=' + session.sessionId + ' isStreaming=' + session.isStreaming);

  return {
    session,
    subscribe(onEvent) {
      return session.subscribe((event) => {
        try { onEvent(event); } catch {}
      });
    },
    async send(text) {
      log( 'session.prompt start');
      await session.prompt(text);
      log( 'session.prompt end');
    },
    async dispose() {
      try { session.dispose(); } catch {}
      log( 'session disposed');
    },
  };
}

module.exports = { createAgent };
