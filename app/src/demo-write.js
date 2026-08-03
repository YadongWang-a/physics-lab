// demo-write.js — 纯决策逻辑（全项目唯一的测试接缝，见 ADR 0011）。
// 移植自 pi-agent-test/cli/core.mjs：命名校验 / validate_demo 规则 / 备份轮转 / 会话绑定。
// 差异：a) app 用 safeStorage 存配置，故无 loadConfig；b) 增加 app 专属硬校验
// （physics-demo 标记、演示模式监听器，见 ADR 0005/0007）与浅色/形态警告；
// c) 增加内联 JS 语法检查（node --check）。
// 不依赖 pi SDK；纯 Node fs；可写可测。
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PIAGENT_DIR = '.piagent';

/** stem → 目标文件名（stem 为去掉 .html 的文件名） */
function htmlName(stem) {
  return `${stem}.html`;
}

/* ---------- 命名 ---------- */

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*\.html$/;

function isValidDemoName(name) {
  return NAME_RE.test(name);
}

/* ---------- validate_demo 校验规则 ---------- */

// 结构必备项：每项缺失产生一条错误
const STRUCTURE_CHECKS = [
  { re: /<!DOCTYPE html>/i, label: '缺少 <!DOCTYPE html>' },
  { re: /<meta\s+name="demo-mode"\s+content="(dynamic|static)"/i, label: '缺少形态声明 <meta name="demo-mode" content="dynamic|static">' },
  { re: /lib\/common\.css/, label: '缺少 <link rel="stylesheet" href="lib/common.css">' },
  { re: /lib\/common\.js/, label: '缺少 <script src="lib/common.js"></script>' },
  { re: /<canvas/i, label: '缺少 <canvas> 场景画布' },
  { re: /<\/html>/i, label: '缺少 </html> 闭合标签' },
];

// app 专属硬校验（ADR 0005/0007）：缺了它们 app 功能断裂（文件树识别 / 演示模式）
const APP_CHECKS = [
  {
    re: (html) => /<!--\s*physics-demo\s*:/.test(html.slice(0, 500)),
    label: '缺少文件标记 <!-- physics-demo: 中文标题 -->（app 文件树靠它识别）',
  },
  {
    re: (html) => /addEventListener\(\s*["']message["'][\s\S]{0,500}?["']present["']/.test(html),
    label: '缺少演示模式监听器（window.addEventListener("message", … "present"…)，见 CONVENTIONS §1）',
  },
];

// 元素配对：常见容器标签开闭数量必须相等
const PAIR_TAGS = ['div', 'script', 'canvas', 'style'];

function pairingErrors(html) {
  const errors = [];
  for (const tag of PAIR_TAGS) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${tag}`, 'gi')) || []).length;
    if (open !== close) {
      errors.push(`标签 <${tag}> 未配对(开 ${open} / 闭 ${close})`);
    }
  }
  return errors;
}

/**
 * 写/校验共用的接受规则（返回错误列表，空数组即通过）：
 * 已绑定 → 只写目标文件，或一个全新合法的 kebab-case 名（视为改名）；
 * 未绑定 → 任何合法且不重名的新文件。
 */
const existsMessage = (name) => `文件名已存在,不能覆盖: "${name}"`;

function writeAcceptanceErrors(state, name, existing) {
  const errors = [];
  if (state.bound) {
    if (name !== htmlName(state.stem)) {
      if (!isValidDemoName(name) || existing.includes(name)) {
        errors.push(`当前目标为 ${htmlName(state.stem)};新文件名须为合法 kebab-case 且不存在("${name}")`);
      }
    }
  } else if (existing.includes(name)) {
    errors.push(existsMessage(name));
  }
  return errors;
}

/**
 * 校验一次 demo 写入是否合规。
 * @param {object} p
 * @param {string} p.name        拟写入的文件名(须为裸文件名)
 * @param {string} [p.allowedFile] 模式 B:唯一可写的目标文件名
 * @param {string[]} [p.existing]  模式 A:cwd 下现有文件名列表
 * @param {string} p.html        拟写入的 HTML 内容
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateDemoWrite({ name, allowedFile, existing = [], html }) {
  const errors = [];

  if (!isValidDemoName(name)) {
    errors.push(`文件名不合法: "${name}" 须为小写 kebab-case 且以 .html 结尾`);
  }
  if (allowedFile !== undefined) {
    if (name !== allowedFile) {
      errors.push(`模式 B 只允许写目标文件: "${allowedFile}"(尝试写 "${name}")`);
    }
  } else if (existing.includes(name)) {
    errors.push(existsMessage(name));
  }

  for (const { re, label } of STRUCTURE_CHECKS) {
    if (!re.test(html)) errors.push(label);
  }
  for (const { re, label } of APP_CHECKS) {
    if (!re(html)) errors.push(label);
  }
  errors.push(...pairingErrors(html));

  return { ok: errors.length === 0, errors };
}

/**
 * 组合作用域规则(writeAcceptanceErrors)与结构校验(validateDemoWrite)，
 * 供 write_demo / edit_demo / validate_demo 共用。作用域错误短路返回。
 * 注意:已绑定状态下,改名(name 为全新合法 kebab-case)按"新文件"校验,
 * 不再受 allowedFile 限制——这是改名路径唯一通过的门。
 */
function assessDemoWrite(state, name, html) {
  const existing = fs.readdirSync(state.cwd).filter((f) => f.endsWith('.html'));
  const scopeErrors = writeAcceptanceErrors(state, name, existing);
  if (scopeErrors.length > 0) return scopeErrors;
  const result = validateDemoWrite({
    name,
    allowedFile: state.bound && name === htmlName(state.stem) ? htmlName(state.stem) : undefined,
    existing,
    html,
  });
  return result.errors;
}

/* ---------- 非阻塞警告(风格/形态,见 ADR 0011) ---------- */

/**
 * 提取 demo-mode 值(dynamic|static)，缺省返回 null。
 */
function demoModeOf(html) {
  const m = html.match(/<meta\s+name="demo-mode"\s+content="(dynamic|static)"/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * 约定级警告(不拦截,随工具结果回显给 agent):
 * - 浅色唯一违规(ADR 0006):出现 [data-theme] / themeBtn / setupThemeButton
 * - 静态演示含动画元素(无时间轴约定);动态演示缺 run/startAnimation/setupKeyboard
 */
function appWarnings(html) {
  const warnings = [];
  if (/\[data-theme|themeBtn|setupThemeButton/.test(html)) {
    warnings.push('浅色唯一(ADR 0006):检测到 [data-theme]/themeBtn,请删除主题切换相关代码');
  }
  const mode = demoModeOf(html);
  if (mode === 'static') {
    if (/startAnimation\s*\(|setupKeyboard\s*\(|id="run"/.test(html)) {
      warnings.push('静态演示不应包含动画元素(startAnimation/setupKeyboard/#run)——无时间轴,参数驱动即时重绘');
    }
  } else if (mode === 'dynamic') {
    const missing = [];
    if (!/id="run"/.test(html)) missing.push('id="run"(运行按钮)');
    if (!/startAnimation\s*\(/.test(html)) missing.push('startAnimation()');
    if (!/setupKeyboard\s*\(/.test(html)) missing.push('setupKeyboard()');
    if (missing.length) warnings.push(`动态演示缺少要素: ${missing.join('、')}(按 CONVENTIONS 自检清单核实)`);
  }
  return warnings;
}

/* ---------- 内联 JS 语法检查(硬错误,node --check) ---------- */

/**
 * 提取内联 <script>(无 src)并逐个做语法检查。
 * @returns {string[]} 语法错误列表(空数组即通过)
 */
function checkInlineJsSyntax(html) {
  const errors = [];
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [i, m] of scripts.entries()) {
    const check = spawnSync(process.execPath, ['--check', '-'], { input: m[1], encoding: 'utf8' });
    if (check.status !== 0) {
      errors.push(`内联脚本 #${i + 1} 语法错误: ${String(check.stderr).trim().slice(0, 300)}`);
    }
  }
  return errors;
}

/* ---------- 目录删除（Windows + CJK 路径兜底） ---------- */

/**
 * 递归删除目录。fs.rmSync 在部分 Windows 环境（路径含 CJK 字符）会静默失败
 * （Node v24 实测：不抛错、目录仍存在），故删除后校验，失败则逐层
 * unlinkSync/rmdirSync 回退（这两个 API 在 CJK 路径上正常）。
 */
function rmDirSync(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    if (!fs.existsSync(dir)) return;
  } catch { /* 走兜底 */ }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rmDirSync(p);
    else { try { fs.unlinkSync(p); } catch {} }
  }
  try { fs.rmdirSync(dir); } catch {}
}

/* ---------- 会话目录与绑定 ---------- */

function sessionDirFor(cwd, stem) {
  return path.join(cwd, PIAGENT_DIR, stem);
}

function backupDirFor(cwd, stem) {
  return path.join(sessionDirFor(cwd, stem), 'backups');
}

/** 模式 A 未绑定会话的目录(文件写出前) */
function unboundSessionDir(cwd, token) {
  return path.join(cwd, PIAGENT_DIR, `_new-${token}`);
}

/**
 * 模式 A:会话结束时把未绑定会话目录迁移到 .piagent/<stem>/。
 * 注意:必须发生在 SessionManager dispose 之后——会话目录在存活期间
 * 绝不能改名,否则 session 文件路径失效(ENOENT)。
 * 若目标目录已存在(同名文件的历史会话),把会话文件并入后删除源。
 * @returns {string} 迁移后的会话目录
 */
function bindSession(cwd, token, stem) {
  const from = unboundSessionDir(cwd, token);
  const to = sessionDirFor(cwd, stem);
  if (!fs.existsSync(from)) return to; // 无未绑定目录(理论不出现)
  fs.mkdirSync(path.join(cwd, PIAGENT_DIR), { recursive: true });
  if (fs.existsSync(to)) {
    for (const entry of fs.readdirSync(from)) {
      fs.renameSync(path.join(from, entry), path.join(to, entry));
    }
    rmDirSync(from);
    return to;
  }
  fs.renameSync(from, to);
  return to;
}

/**
 * 启动时清理上次崩溃残留的未绑定会话目录(_new-*)。
 * 未绑定目录只存在于一次生成会话的生命周期内,残留即垃圾。
 */
function cleanupStaleUnbound(cwd) {
  const root = path.join(cwd, PIAGENT_DIR);
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root)) {
    if (entry.startsWith('_new-')) {
      rmDirSync(path.join(root, entry));
    }
  }
}

/* ---------- 备份 ---------- */

const KEEP_BACKUPS = 10;

function tsFromName(file) {
  const m = file.match(/(\d{8}-\d{6})/);
  return m ? m[1] : '';
}

function backupFileName(stem, ts, n) {
  const suffix = n > 1 ? `-${n}` : '';
  return `${stem}.${ts}${suffix}.html`;
}

/** 时间戳格式 yyyyMMdd-HHmmss(UTC),供备份命名 */
function tsOf(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/**
 * 写前备份:把目标文件复制到 .piagent/<stem>/backups/,保留最近 10 版。
 * @returns {string|null} 备份文件路径;目标文件不存在返回 null
 */
function createBackup(cwd, stem, now) {
  const target = path.join(cwd, htmlName(stem));
  if (!fs.existsSync(target)) return null;
  const backups = backupDirFor(cwd, stem);
  fs.mkdirSync(backups, { recursive: true });

  const ts = tsOf(now);
  let name = backupFileName(stem, ts, 1);
  let n = 1;
  while (fs.existsSync(path.join(backups, name))) {
    n++;
    name = backupFileName(stem, ts, n);
  }
  const dest = path.join(backups, name);
  fs.copyFileSync(target, dest);

  // 保留最近 10 版
  const files = listBackups(cwd, stem).map((f) => path.join(backups, f));
  for (const old of files.slice(KEEP_BACKUPS)) {
    fs.unlinkSync(old);
  }
  return dest;
}

/** 备份文件名列表,按时间新→旧排序(同秒时按 -n 后缀,序号大者新) */
function listBackups(cwd, stem) {
  const backups = backupDirFor(cwd, stem);
  if (!fs.existsSync(backups)) return [];
  return fs.readdirSync(backups)
    .filter((f) => f.startsWith(`${stem}.`) && f.endsWith('.html'))
    .map((f) => ({
      f,
      ts: tsFromName(f),
      n: parseInt(f.match(/\.\d{8}-\d{6}(?:-(\d+))?\.html$/)?.[1] ?? '1', 10),
    }))
    .sort((a, b) => (a.ts !== b.ts ? (a.ts < b.ts ? 1 : -1) : b.n - a.n))
    .map((x) => x.f);
}

/**
 * 恢复最近一版备份到目标文件(预留;app 暂不提供 undo 入口,数据留作安全网)。
 * @returns {string|null} 被恢复的备份文件路径;无备份返回 null
 */
function restoreBackup(cwd, stem) {
  const backups = listBackups(cwd, stem);
  if (backups.length === 0) return null;
  const newest = backups[0];
  const dest = path.join(cwd, htmlName(stem));
  fs.copyFileSync(path.join(backupDirFor(cwd, stem), newest), dest);
  return path.join(backupDirFor(cwd, stem), newest);
}

module.exports = {
  PIAGENT_DIR,
  htmlName,
  isValidDemoName,
  validateDemoWrite,
  assessDemoWrite,
  writeAcceptanceErrors,
  demoModeOf,
  appWarnings,
  checkInlineJsSyntax,
  sessionDirFor,
  backupDirFor,
  unboundSessionDir,
  bindSession,
  cleanupStaleUnbound,
  rmDirSync,
  tsOf,
  createBackup,
  listBackups,
  restoreBackup,
  KEEP_BACKUPS,
};
