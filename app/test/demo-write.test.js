// demo-write 测试（移植自 pi-agent-test/cli/test/core.test.mjs + app 专属校验）
// Seams: 命名 / 结构校验 / app 硬校验 / 警告 / 语法检查 / 备份轮转 / 会话绑定 / 清理
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  htmlName, isValidDemoName, validateDemoWrite, assessDemoWrite, writeAcceptanceErrors,
  demoModeOf, appWarnings, checkInlineJsSyntax,
  sessionDirFor, backupDirFor, unboundSessionDir, bindSession, cleanupStaleUnbound,
  tsOf, createBackup, listBackups, restoreBackup,
} = require('../src/demo-write');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-write-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

/* ---------- 命名 ---------- */

describe('isValidDemoName', () => {
  it('接受 kebab-case 英文名', () => {
    for (const n of ['arc-projectile.html', 'ball-spring.html', 'a.html', 'x-1-2.html']) {
      expect(isValidDemoName(n)).toBe(true);
    }
  });
  it('拒绝非法名(大写/路径/中文/双连符/无扩展名)', () => {
    for (const n of ['Arc.html', 'x/y.html', '物理.html', 'a--b.html', 'a.b.html', '.html', 'a', 'a.txt', 'a.html.bak']) {
      expect(isValidDemoName(n)).toBe(false);
    }
  });
});

/* ---------- validate_demo 校验 ---------- */

const GOOD_HTML = `<!-- physics-demo: 测试演示 -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="demo-mode" content="dynamic">
<link rel="stylesheet" href="lib/common.css">
<script>
window.addEventListener("message", function(e){
  var d=e.data; if(!d||d.cmd!=="present")return;
  document.body.classList.toggle("present", !!d.value);
});
</script>
</head>
<body>
<div class="wrap">
<canvas id="scene" height="400"></canvas>
</div>
<script src="lib/common.js"></script>
</body>
</html>`;

describe('validateDemoWrite 结构校验', () => {
  it('通过合规写入(模式 B:文件名等于目标)', () => {
    const r = validateDemoWrite({ name: 'demo.html', allowedFile: 'demo.html', html: GOOD_HTML });
    expect(r.ok).toBe(true);
  });
  it('模式 B:文件名不等于目标时拒绝', () => {
    const r = validateDemoWrite({ name: 'other.html', allowedFile: 'demo.html', html: GOOD_HTML });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /目标文件/.test(e))).toBe(true);
  });
  it('模式 A:与现有文件重名时拒绝', () => {
    const r = validateDemoWrite({ name: 'demo.html', existing: ['demo.html'], html: GOOD_HTML });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /已存在/.test(e))).toBe(true);
  });
  it('模式 A:不与现有文件重名时通过', () => {
    const r = validateDemoWrite({ name: 'fresh.html', existing: ['demo.html'], html: GOOD_HTML });
    expect(r.ok).toBe(true);
  });
  it('逐项报告结构缺失', () => {
    const M = '<meta name="demo-mode" content="dynamic">';
    const base = `<!-- physics-demo: t -->\n<!DOCTYPE html><head>${M}</head><html><script>window.addEventListener("message",function(e){if(!e.data||e.data.cmd!=="present")return;});</script><link rel="stylesheet" href="lib/common.css"><script src="lib/common.js"></script><canvas id="scene"></canvas></html>`;
    const cases = [
      [base, 0],
      [base.replace('<!DOCTYPE html>', ''), 1], // 缺 DOCTYPE
      [base.replace(M, ''), 1],                 // 缺 demo-mode
      [base.replace('<link rel="stylesheet" href="lib/common.css">', ''), 1], // 缺 css
      [base.replace('<script src="lib/common.js"></script>', ''), 1], // 缺 js
      [base.replace('<canvas id="scene"></canvas>', ''), 1], // 缺 canvas
      [base.replace('</html>', ''), 1],         // 缺 </html>
      [base.replace('<!-- physics-demo: t -->', ''), 1], // 缺标记
      [base.replace('addEventListener("message"', 'addEventListener("foo"'), 1], // 缺监听器
    ];
    for (const [html, expectErrors] of cases) {
      const r = validateDemoWrite({ name: 'demo.html', allowedFile: 'demo.html', html });
      expect(r.ok).toBe(expectErrors === 0);
      expect(r.errors.length).toBe(expectErrors);
    }
  });
  it('报告未配对标签', () => {
    const bad = GOOD_HTML.replace('</div>', '');
    const r = validateDemoWrite({ name: 'demo.html', allowedFile: 'demo.html', html: bad });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /未配对/.test(e))).toBe(true);
  });
  it('缺 demo-mode 声明被拒,非法值被拒', () => {
    const noMeta = GOOD_HTML.replace(/<meta name="demo-mode"[^>]*>\n/, '');
    expect(validateDemoWrite({ name: 'd.html', allowedFile: 'd.html', html: noMeta }).ok).toBe(false);
    const badMeta = GOOD_HTML.replace('content="dynamic"', 'content="other"');
    const r = validateDemoWrite({ name: 'd.html', allowedFile: 'd.html', html: badMeta });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /demo-mode/.test(e))).toBe(true);
  });
});

/* ---------- assessDemoWrite(工具共用组合规则) ---------- */

describe('assessDemoWrite', () => {
  it('已绑定时改名路径通过', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v1');
    const st = { cwd: dir, bound: true, stem: 'demo' };
    expect(assessDemoWrite(st, 'pendulum-hit.html', GOOD_HTML)).toEqual([]);
  });
  it('已绑定时写已存在的其他文件被拒', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v1');
    fs.writeFileSync(path.join(dir, 'other.html'), 'v1');
    const st = { cwd: dir, bound: true, stem: 'demo' };
    expect(assessDemoWrite(st, 'other.html', GOOD_HTML).length).toBe(1);
  });
  it('未绑定时新文件通过、重名拒绝', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v1');
    const st = { cwd: dir, bound: false };
    expect(assessDemoWrite(st, 'fresh.html', GOOD_HTML)).toEqual([]);
    expect(assessDemoWrite(st, 'demo.html', GOOD_HTML).length).toBe(1);
  });
  it('结构错误仍被报告(不因作用域通过而放行)', () => {
    const st = { cwd: dir, bound: true, stem: 'demo' };
    expect(assessDemoWrite(st, 'demo.html', '<html>broken').some((e) => /DOCTYPE/i.test(e))).toBe(true);
  });
});

/* ---------- app 专属警告与形态 ---------- */

describe('demoModeOf / appWarnings', () => {
  it('提取 demo-mode 值', () => {
    expect(demoModeOf(GOOD_HTML)).toBe('dynamic');
    expect(demoModeOf(GOOD_HTML.replace('dynamic', 'static'))).toBe('static');
    expect(demoModeOf('<html></html>')).toBe(null);
  });
  it('浅色违规(themeBtn/data-theme)是警告不是错误', () => {
    const html = GOOD_HTML + '<button id="themeBtn">🌙</button><style>[data-theme="dark"]{}</style>';
    expect(validateDemoWrite({ name: 'd.html', allowedFile: 'd.html', html }).ok).toBe(true);
    expect(appWarnings(html).some((w) => /浅色唯一/.test(w))).toBe(true);
  });
  it('静态演示含动画元素是警告;动态演示缺要素是警告', () => {
    const staticHtml = GOOD_HTML.replace('content="dynamic"', 'content="static"')
      .replace('<canvas id="scene" height="400"></canvas>', '<canvas id="scene" height="400"></canvas><script>startAnimation(()=>{})</script>');
    const w = appWarnings(staticHtml);
    expect(w.some((x) => /静态演示不应包含动画/.test(x))).toBe(true);

    const dynMissing = GOOD_HTML; // 无 #run / startAnimation / setupKeyboard
    expect(appWarnings(dynMissing).some((x) => /动态演示缺少要素/.test(x))).toBe(true);
  });
  it('合规动态演示无警告', () => {
    const html = GOOD_HTML.replace(
      '<script src="lib/common.js"></script>',
      '<script src="lib/common.js"></script><script>function startAnimation(f){f()}function setupKeyboard(s,r){}</script><button id="run">▶</button>'
    );
    expect(appWarnings(html)).toEqual([]);
  });
});

/* ---------- 内联 JS 语法检查 ---------- */

describe('checkInlineJsSyntax', () => {
  it('语法错误被检出', () => {
    const html = GOOD_HTML.replace('</body>', '<script>function oops( { return 1; }</script></body>');
    expect(checkInlineJsSyntax(html).length).toBeGreaterThan(0);
  });
  it('合法脚本通过,带 src 的外部脚本跳过', () => {
    expect(checkInlineJsSyntax(GOOD_HTML)).toEqual([]);
    const html = GOOD_HTML + '<script src="lib/mathjax.js"></script>';
    expect(checkInlineJsSyntax(html)).toEqual([]);
  });
});

/* ---------- 备份与轮转 ---------- */

const T1 = Date.UTC(2026, 7, 3, 10, 0, 0);
const T2 = Date.UTC(2026, 7, 3, 10, 0, 5);
const T3 = Date.UTC(2026, 7, 3, 10, 0, 30);

describe('备份', () => {
  it('createBackup 复制到 .piagent/<stem>/backups/ 并返回路径', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v1');
    const p = createBackup(dir, 'demo', T1);
    expect(p.endsWith(`demo.${tsOf(T1)}.html`)).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toBe('v1');
  });
  it('目标不存在返回 null 且不创建目录', () => {
    expect(createBackup(dir, 'ghost', T1)).toBe(null);
    expect(fs.existsSync(path.join(dir, '.piagent'))).toBe(false);
  });
  it('保留最近 10 版,超出删除最旧', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v0');
    for (let i = 1; i <= 11; i++) createBackup(dir, 'demo', T1 + i * 60000);
    const backups = listBackups(dir, 'demo');
    expect(backups.length).toBe(10);
    expect(backups.every((b) => !b.includes(tsOf(T1)))).toBe(true);
  });
  it('同秒多版按 -n 后缀排序,restoreBackup 恢复最新一版', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v0');
    createBackup(dir, 'demo', T1);
    createBackup(dir, 'demo', T1);
    createBackup(dir, 'demo', T1);
    const backups = listBackups(dir, 'demo');
    expect(backups[0].includes('-3')).toBe(true);
    expect(backups[1].includes('-2')).toBe(true);
    expect(backups[2]).toBe(`demo.${tsOf(T1)}.html`);
    const restored = restoreBackup(dir, 'demo');
    expect(restored && restored.includes('-3')).toBe(true);
  });
  it('listBackups 按时间新→旧排序', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v0');
    createBackup(dir, 'demo', T1);
    createBackup(dir, 'demo', T3);
    createBackup(dir, 'demo', T2);
    const backups = listBackups(dir, 'demo');
    expect(backups[0].includes(tsOf(T3))).toBe(true);
    expect(backups[1].includes(tsOf(T2))).toBe(true);
    expect(backups[2].includes(tsOf(T1))).toBe(true);
  });
  it('restoreBackup 把最近一版恢复到目标文件;无备份返回 null', () => {
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v1');
    createBackup(dir, 'demo', T1);
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v2');
    createBackup(dir, 'demo', T2);
    fs.writeFileSync(path.join(dir, 'demo.html'), 'v3');
    const restored = restoreBackup(dir, 'demo');
    expect(restored && restored.includes(tsOf(T2))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'demo.html'), 'utf8')).toBe('v2');
    const none = restoreBackup(dir, 'ghost');
    expect(none).toBe(null);
  });
});

/* ---------- 会话目录与绑定 ---------- */

describe('会话目录与绑定', () => {
  it('sessionDirFor/backupDirFor/unboundSessionDir 落在 cwd/.piagent/ 下', () => {
    expect(sessionDirFor(dir, 'demo')).toBe(path.join(dir, '.piagent', 'demo'));
    expect(backupDirFor(dir, 'demo')).toBe(path.join(dir, '.piagent', 'demo', 'backups'));
    expect(unboundSessionDir(dir, 'abc123')).toBe(path.join(dir, '.piagent', '_new-abc123'));
  });
  it('bindSession 把未绑定目录迁移到 .piagent/<stem>/', () => {
    const unbound = unboundSessionDir(dir, 'abc123');
    fs.mkdirSync(unbound, { recursive: true });
    fs.writeFileSync(path.join(unbound, 'session.jsonl'), 'x');
    const newDir = bindSession(dir, 'abc123', 'pendulum-hit');
    expect(newDir).toBe(sessionDirFor(dir, 'pendulum-hit'));
    expect(fs.readFileSync(path.join(newDir, 'session.jsonl'), 'utf8')).toBe('x');
    expect(fs.existsSync(unbound)).toBe(false);
  });
  it('bindSession 目标目录已存在时并入会话文件并删除源', () => {
    const unbound = unboundSessionDir(dir, 'abc123');
    fs.mkdirSync(unbound, { recursive: true });
    fs.writeFileSync(path.join(unbound, 's1.jsonl'), 'x');
    const to = sessionDirFor(dir, 'demo');
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(path.join(to, 's2.jsonl'), 'y');
    bindSession(dir, 'abc123', 'demo');
    expect(fs.existsSync(unbound)).toBe(false);
    expect(fs.existsSync(path.join(to, 's1.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(to, 's2.jsonl'))).toBe(true);
  });
  it('bindSession 无未绑定目录时原样返回', () => {
    expect(bindSession(dir, 'ghost', 'demo')).toBe(sessionDirFor(dir, 'demo'));
  });
  it('cleanupStaleUnbound 删除 _new-* 残留,保留已绑定会话目录', () => {
    fs.mkdirSync(unboundSessionDir(dir, 'aaa'), { recursive: true });
    fs.mkdirSync(unboundSessionDir(dir, 'bbb'), { recursive: true });
    fs.mkdirSync(sessionDirFor(dir, 'demo'), { recursive: true });
    cleanupStaleUnbound(dir);
    expect(fs.existsSync(unboundSessionDir(dir, 'aaa'))).toBe(false);
    expect(fs.existsSync(unboundSessionDir(dir, 'bbb'))).toBe(false);
    expect(fs.existsSync(sessionDirFor(dir, 'demo'))).toBe(true);
  });
});

/* ---------- 写/校验共用接受规则 ---------- */

describe('writeAcceptanceErrors', () => {
  it('已绑定时目标文件零错误', () => {
    const st = { bound: true, stem: 'demo' };
    expect(writeAcceptanceErrors(st, 'demo.html', ['demo.html', 'other.html'])).toEqual([]);
  });
  it('已绑定时新 kebab-case 名视为改名,零错误', () => {
    const st = { bound: true, stem: 'demo' };
    expect(writeAcceptanceErrors(st, 'pendulum-hit.html', ['demo.html'])).toEqual([]);
  });
  it('已绑定时写已存在的其他文件被拒;非法新名被拒', () => {
    const st = { bound: true, stem: 'demo' };
    expect(writeAcceptanceErrors(st, 'other.html', ['demo.html', 'other.html']).length).toBe(1);
    expect(writeAcceptanceErrors(st, 'Bad Name.html', ['demo.html']).length).toBe(1);
  });
  it('未绑定时写已存在文件被拒,新文件通过', () => {
    const st = { bound: false };
    expect(writeAcceptanceErrors(st, 'demo.html', ['demo.html']).length).toBe(1);
    expect(writeAcceptanceErrors(st, 'fresh.html', ['demo.html'])).toEqual([]);
  });
});

/* ---------- 4 个示例回归：迁移后全部通过校验 ---------- */

describe('示例回归（迁移后）', () => {
  const DEMO_FILES = ['ball-spring.html', 'arc-projectile.html', 'isochronous-circle.html', 'incline-baffle.html'];
  for (const f of DEMO_FILES) {
    it(`${f} 通过结构校验且为动态形态`, () => {
      const html = fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
      const r = validateDemoWrite({ name: f, allowedFile: f, html });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
      expect(demoModeOf(html)).toBe('dynamic');
    });
  }
});
