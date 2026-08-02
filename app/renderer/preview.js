// preview.js — 预览面板：iframe 加载 + 刷新按钮
// 接口：createPreview(iframeEl, emptyEl) → { load(path), clear() }
const $ = (id) => document.getElementById(id);

export function createPreview(iframeEl, emptyEl) {
  let currentPath = null;

  function load(path) {
    if (!path) { clear(); return; }
    currentPath = path;
    emptyEl.classList.add('hidden');
    iframeEl.classList.remove('hidden');
    iframeEl.style.display = '';
    iframeEl.src = 'file:///' + path.replace(/\\/g, '/');
    const btn = $('btn-refresh');
    if (btn) btn.classList.remove('hidden');
  }

  function refresh() {
    if (currentPath && iframeEl) {
      iframeEl.src = 'file:///' + currentPath.replace(/\\/g, '/') + '?_=' + Date.now();
    }
  }

  function clear() {
    currentPath = null;
    emptyEl.classList.remove('hidden');
    iframeEl.classList.add('hidden');
    iframeEl.style.display = 'none';
    const btn = $('btn-refresh');
    if (btn) btn.classList.add('hidden');
  }

  // 刷新按钮
  const btn = $('btn-refresh');
  if (btn) btn.addEventListener('click', refresh);

  return { load, clear, refresh };
}
