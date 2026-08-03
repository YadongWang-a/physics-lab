// 工作目录管理：选择目录 + 首次使用时复制 lib/ 与 4 个示例（见 ADR 0002/0003）。
// 静态资源在仓库根（app/ 的上级）：../lib 与 ../<4 个 html>。
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const DEMO_FILES = [
  'ball-spring.html',
  'arc-projectile.html',
  'isochronous-circle.html',
  'incline-baffle.html',
];

// 仓库根 = app/ 的上级目录（开发态）。打包态用 process.resourcesPath。
function resourcesRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return path.resolve(__dirname, '..', '..');
}

// 弹窗选工作目录
async function selectWorkdir() {
  const res = await dialog.showOpenDialog({
    title: '选择物理演示工作目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
}

// 首次使用：复制 lib/ + examples/ 到工作目录。幂等。
function setupWorkdir(workdir) {
  const root = resourcesRoot();
  // lib/：始终覆盖刷新（保证 common.css/js 最新）
  const srcLib = path.join(root, 'lib');
  const dstLib = path.join(workdir, 'lib');
  copyDir(srcLib, dstLib);

  // CONVENTIONS.md：写作规范（ADR 0012），agent 写前必须读取；始终覆盖刷新
  const srcConv = path.join(__dirname, '..', 'CONVENTIONS.md');
  if (fs.existsSync(srcConv)) fs.copyFileSync(srcConv, path.join(workdir, 'CONVENTIONS.md'));

  // 示例 HTML：放 workdir 根（与 lib/ 同级），始终覆盖刷新（保证标记/样式与源同步）
  for (const f of DEMO_FILES) {
    const src = path.join(root, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(workdir, f));
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

module.exports = { selectWorkdir, setupWorkdir, resourcesRoot, DEMO_FILES };
