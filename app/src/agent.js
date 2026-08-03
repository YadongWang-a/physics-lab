// Agent 接线（见 ADR 0004/0008/0009/0011/0012/0013）。
// 移植自 pi-agent-test/cli/cli.mjs 的接线方式：
// - 工具白名单：只读内置 + 自定义 write_demo/edit_demo/validate_demo（全量白名单，自定义工具必须显式列入）
// - 写入统一走自定义工具，主进程校验拦截（结构 + 作用域 + 内联 JS 语法），浅色/形态违规为非阻塞警告
// - 会话 .piagent/<stem>/ 布局：编辑模式恢复历史，新建模式 _new-<token> 未绑定、dispose 时绑定/清理
// - 新建演示首轮消息包装为"第一版是草稿"
// OpenAI 兼容 endpoint：ModelRuntime.registerProvider → setRuntimeApiKey → getModel（ADR 0008，safeStorage 密钥运行时注入）
// system prompt：薄骨架（ADR 0012），规范细节在 CONVENTIONS.md（agent 用 read 读取）
const path = require('path');
const fs = require('fs');
const { randomBytes } = require('crypto');
const { Type } = require('typebox');
const { SYSTEM_PROMPT } = require('./system-prompt');
const {
  htmlName, assessDemoWrite, appWarnings, checkInlineJsSyntax,
  sessionDirFor, unboundSessionDir, bindSession, rmDirSync,
} = require('./demo-write');

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

// SDK 的 tools 参数是全量白名单,自定义工具同样被过滤,
// 因此 write_demo / edit_demo / validate_demo 必须显式列入。
const AGENT_TOOLS = ['read', 'grep', 'find', 'ls', 'write_demo', 'edit_demo', 'validate_demo'];

function stemOf(name) {
  return name.replace(/\.html$/, '');
}

function toolOk(text) {
  return { content: [{ type: 'text', text }], details: {} };
}

function toolErr(text) {
  return { content: [{ type: 'text', text }], details: { error: text } };
}

/* ---------- 工具:write_demo / edit_demo / validate_demo ---------- */

function makeWriteDemo(state, onRename) {
  return {
    name: 'write_demo',
    label: 'Write Demo',
    description: '写入(或生成)物理演示 HTML 文件。参数 name 为文件名(小写 kebab-case,以 .html 结尾),content 为完整 HTML 内容。写入前自动校验:physics-demo 标记、lib 引用、demo-mode 声明、结构完整性、内联 JS 语法、命名与覆盖规则。改名:在编辑模式下写入一个全新文件名即为改名(旧文件立即删除,会话在关闭标签时迁移)。',
    promptSnippet: 'write_demo(name, content) — 整文件写入,写入前自动校验',
    parameters: Type.Object({
      name: Type.String({ description: '文件名,如 arc-projectile.html' }),
      content: Type.String({ description: '完整 HTML 内容' }),
    }),
    execute: async (_id, params) => {
      const { name, content } = params;
      log(`工具 write_demo name=${name} len=${(content ?? '').length}`);
      const errors = assessDemoWrite(state, name, content);
      const syntaxErrors = checkInlineJsSyntax(content);
      const allErrors = [...errors, ...syntaxErrors];
      if (allErrors.length > 0) {
        log('工具 write_demo 拦截: ' + allErrors.join(' | '));
        return toolErr(`写入被拦截:\n- ${allErrors.join('\n- ')}\n请修正后重试。`);
      }
      const warnings = appWarnings(content);

      fs.writeFileSync(path.join(state.cwd, name), content);

      if (state.bound && name !== htmlName(state.stem)) {
        // 改名:删旧目标文件;会话目录不搬(存活期间改名会断 session 文件路径),
        // 关闭标签时按最终 stem 统一绑定
        const oldPath = path.join(state.cwd, htmlName(state.stem));
        const oldStem = state.stem;
        fs.rmSync(oldPath, { force: true });
        state.stem = stemOf(name);
        log(`工具 write_demo 改名 ${htmlName(oldStem)} → ${name}`);
        try { onRename(oldPath, path.join(state.cwd, name)); } catch {}
        return toolOk(`已改名并写入 ${name}(旧文件已删除,会话将在关闭标签时迁移)。${warnSuffix(warnings)}请按自检清单报告。`);
      }

      if (!state.bound) {
        // 首次写文件:标记已绑定,退出时(dispose 后)统一迁移目录
        state.bound = true;
        state.stem = stemOf(name);
        log(`工具 write_demo 首次写入 token=${state.token} → ${name}(退出时绑定)`);
        return toolOk(`已生成 ${name}。${warnSuffix(warnings)}请按 CONVENTIONS 自检清单逐条报告(含⑧形态判定)。`);
      }

      log('工具 write_demo 写入 ' + name);
      return toolOk(`已写入 ${name}。${warnSuffix(warnings)}请按自检清单报告。`);
    },
  };
}

function makeEditDemo(state) {
  return {
    name: 'edit_demo',
    label: 'Edit Demo',
    description: '局部修改当前目标文件:把 old_text 首次出现的位置替换为 new_text。写入前自动校验修改后的完整文件(结构/标记/语法)。只允许修改当前目标文件,不允许改名。',
    promptSnippet: 'edit_demo(old_text, new_text) — 局部修改目标文件,修改后整体校验',
    parameters: Type.Object({
      old_text: Type.String({ description: '要替换的原文片段(须在目标文件中存在)' }),
      new_text: Type.String({ description: '替换后的内容' }),
    }),
    execute: async (_id, params) => {
      const { old_text, new_text } = params;
      if (!state.bound) return toolErr('当前尚无目标文件,请先用 write_demo 创建。');
      const file = path.join(state.cwd, htmlName(state.stem));
      let html;
      try { html = fs.readFileSync(file, 'utf8'); } catch {
        return toolErr(`读取目标文件失败: ${htmlName(state.stem)}`);
      }
      const idx = html.indexOf(old_text);
      if (idx === -1) {
        return toolErr('old_text 在目标文件中未找到,请核对片段后重试(含缩进/换行)。');
      }
      const newHtml = html.slice(0, idx) + new_text + html.slice(idx + old_text.length);
      log(`工具 edit_demo ${htmlName(state.stem)} old=${old_text.length} new=${new_text.length}`);
      const errors = assessDemoWrite(state, htmlName(state.stem), newHtml);
      const syntaxErrors = checkInlineJsSyntax(newHtml);
      const allErrors = [...errors, ...syntaxErrors];
      if (allErrors.length > 0) {
        log('工具 edit_demo 拦截: ' + allErrors.join(' | '));
        return toolErr(`修改被拦截(校验的是修改后的完整文件):\n- ${allErrors.join('\n- ')}\n请修正后重试。`);
      }
      const warnings = appWarnings(newHtml);
      fs.writeFileSync(file, newHtml);
      return toolOk(`已修改 ${htmlName(state.stem)}。${warnSuffix(warnings)}请按自检清单报告。`);
    },
  };
}

function makeValidateDemo(state) {
  return {
    name: 'validate_demo',
    label: 'Validate Demo',
    description: '校验一段 HTML 内容是否符合约定,不写入磁盘。参数 name 为目标文件名,content 为 HTML 内容。返回校验报告(命名/标记/lib 引用/demo-mode/结构完整性/内联 JS 语法/覆盖规则)与约定警告。',
    promptSnippet: 'validate_demo(name, content) — 写前自检,不写盘',
    parameters: Type.Object({
      name: Type.String({ description: '文件名,如 arc-projectile.html' }),
      content: Type.String({ description: 'HTML 内容' }),
    }),
    execute: async (_id, params) => {
      const { name, content } = params;
      const errors = assessDemoWrite(state, name, content);
      const syntaxErrors = checkInlineJsSyntax(content);
      const allErrors = [...errors, ...syntaxErrors];
      if (allErrors.length > 0) {
        return toolErr(`校验未通过:\n- ${allErrors.join('\n- ')}`);
      }
      const warnings = appWarnings(content);
      const extra = warnings.length ? `\n⚠ 约定警告:\n- ${warnings.join('\n- ')}` : '';
      return toolOk(`校验通过 ✓(命名、标记、lib 引用、demo-mode、结构、语法均合规)${extra}`);
    },
  };
}

function warnSuffix(warnings) {
  return warnings.length ? `⚠ 约定警告:\n- ${warnings.join('\n- ')}\n` : '';
}

/* ---------- 会话创建 ---------- */

async function createAgent({ workdir, llm, file, onRename }) {
  log('createAgent: enter file=' + (file || 'none'));
  const { coding, ai } = await loadSdk();
  log('createAgent: SDK loaded');
  const { createAgentSession, DefaultResourceLoader, SessionManager, ModelRuntime } = coding;

  const agentDir = path.join(workdir, '.pi', 'agent');

  // 每个 session 绑定一个文件:ADR 0004(一个文件一个 session)+ ADR 0013(会话持久化与恢复)
  const mode = file ? 'edit' : 'generate';
  const state = {
    cwd: workdir,
    mode,
    stem: null,
    bound: false,
    token: null,
    sessionDir: null,
  };

  let sessionManager;
  if (mode === 'edit') {
    state.stem = stemOf(path.basename(file));
    state.bound = true;
    state.sessionDir = sessionDirFor(workdir, state.stem);
  } else {
    state.token = randomBytes(6).toString('hex');
    state.sessionDir = unboundSessionDir(workdir, state.token);
  }
  fs.mkdirSync(state.sessionDir, { recursive: true });

  const sessions = await SessionManager.list(workdir, state.sessionDir);
  sessionManager = sessions.length > 0
    ? SessionManager.open(sessions[0].path)
    : SessionManager.create(workdir, state.sessionDir);
  log(`createAgent: mode=${mode} sessionDir=${state.sessionDir} restore=${sessions.length > 0}`);

  // 每个 session 绑定一个文件:告诉 agent 只编辑这个文件(ADR 0004:一个文件一个 session)
  const perfile = mode === 'edit'
    ? '\n\n⚠️ **当前编辑目标**：`' + path.basename(file) + '`。只修改这个文件，不要动工作目录中其他 .html 文件。'
    : '\n\n🆕 **当前是新建演示**——你需要创建一个新的 HTML 文件（用 write_demo 工具），文件名用英文 kebab-case（如 `spring-demo.html`），第一行包含 `<!-- physics-demo: 中文标题 -->`。';
  const prompt = SYSTEM_PROMPT + perfile;
  log('createAgent: start model=' + llm.model + ' baseUrl=' + llm.baseUrl + ' file=' + (file || 'none'));

  // 1. ModelRuntime（纯运行时，不读 auth.json/models.json）
  const modelRuntime = await ModelRuntime.create({ modelsPath: null });
  log('ModelRuntime created, built-in providers: ' + modelRuntime.getProviders().map(p => p.id).join(','));

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
  log('registered provider app-openai');

  // 3. 运行时注入 API key（不落盘）
  await modelRuntime.setRuntimeApiKey('app-openai', llm.apiKey);
  log('setRuntimeApiKey done');

  // 4. 取模型
  const model = modelRuntime.getModel('app-openai', llm.model);
  if (!model) {
    const avail = await modelRuntime.getAvailable();
    log('model NOT FOUND, available: ' + JSON.stringify(avail.map(m => m.id || m.provider + '/' + (m.id || '?'))));
    throw new Error('模型 "' + llm.model + '" 未找到。可用: ' + avail.map(m => m.id || m.name).join(', '));
  }
  log('model found: ' + (model.id || JSON.stringify({ id: model.id, provider: (model.provider || {}).id })));

  // 5. ResourceLoader：systemPrompt 薄骨架内联（ADR 0012），noContextFiles 关掉 AGENTS.md 发现
  const loader = new DefaultResourceLoader({
    cwd: workdir,
    agentDir,
    systemPrompt: prompt,
    noContextFiles: true,
  });

  // 6. 创建 session —— 自定义工具全部过主进程校验（ADR 0011）
  const onRenameSafe = typeof onRename === 'function' ? onRename : () => {};
  const { session } = await createAgentSession({
    resourceLoader: loader,
    modelRuntime,
    model,
    tools: AGENT_TOOLS,
    customTools: [
      makeWriteDemo(state, onRenameSafe),
      makeEditDemo(state),
      makeValidateDemo(state),
    ],
    sessionManager,
  });
  log('createAgentSession ok, sessionId=' + session.sessionId + ' isStreaming=' + session.isStreaming);

  let firstTurn = mode === 'generate';

  return {
    session,
    subscribe(onEvent) {
      return session.subscribe((event) => {
        try { onEvent(event); } catch {}
      });
    },
    async send(text) {
      // 生成模式首轮:把用户题目包装为生成指令(参考实现: 直通生成,第一版是草稿)
      if (firstTurn) {
        firstTurn = false;
        if (mode === 'generate') {
          text = `请生成一个物理演示 HTML(第一版是草稿,后续会继续对话修改)。
要求:保持简单——一个场景、标准双列布局、直接用 lib/common.css 与 lib/common.js 的现成接口,不要过度设计,先出能跑的草稿。
先判断题目类型:时间演化类 → 动态演示(动画);平衡/受力分析/几何关系类 → 静态演示(无时间轴,参数驱动即时重绘,不要强行做动画)。页面必须声明 <meta name="demo-mode">。
用户的题目/模型要求:

${text}`;
        }
      }
      log('session.prompt start');
      await session.prompt(text);
      log('session.prompt end');
    },
    async dispose() {
      try { session.dispose(); } catch {}
      // 生成模式退出收尾:已绑定 → 迁移会话目录到 .piagent/<stem>/(必须 dispose 之后);
      // 未绑定 → 丢弃残留
      if (state.mode === 'generate') {
        if (state.bound) {
          try {
            bindSession(workdir, state.token, state.stem);
            log(`退出绑定 token=${state.token} → ${state.stem}`);
          } catch (e) {
            log('退出绑定失败: ' + (e && e.message || e));
          }
        } else {
          rmDirSync(state.sessionDir);
        }
      }
      log('agent disposed');
    },
  };
}

module.exports = { createAgent, AGENT_TOOLS };
