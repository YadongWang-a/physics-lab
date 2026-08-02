// tabs.js — 标签栏：动态文件 tab + "新建演示"临时 tab
// 接口：createTabBar(container, { onActivate, onNew }) → { render(list), setActive(path), getActive() }
export function createTabBar(bar, { onActivate, onNew }) {
  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function render(list) {
    // 清除旧 tab（保留 + 按钮和临时新建 tab）
    [...bar.children].forEach(c => {
      if (c.id === 'btn-new-tab') return;
      if (c.classList.contains('tab-new-session')) return;
      c.remove();
    });

    const activeEl = bar.querySelector('.tab-active');
    const activePath = activeEl ? activeEl.dataset.path : null;

    let foundActive = false;
    list.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.path = t.path;
      btn.innerHTML = '<span class="truncate">' + escapeHtml(t.title) + '</span>';
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.tab').forEach(x => x.classList.remove('tab-active'));
        btn.classList.add('tab-active');
        onActivate(t);
      });
      if (t.path === activePath) { btn.classList.add('tab-active'); foundActive = true; }
      const plus = document.getElementById('btn-new-tab');
      plus ? bar.insertBefore(btn, plus) : bar.appendChild(btn);
    });

    // 自动选第一个
    if (!foundActive && list.length) {
      const first = bar.querySelector('.tab');
      if (first) first.click();
    }
  }

  function setActive(path) {
    bar.querySelectorAll('.tab').forEach(x => x.classList.remove('tab-active'));
    const t = bar.querySelector('.tab[data-path="' + CSS.escape(path) + '"]');
    if (t) t.classList.add('tab-active');
  }

  function getActive() {
    const a = bar.querySelector('.tab-active');
    return a ? a.dataset.path : null;
  }

  // + 按钮：新建演示
  const plus = document.getElementById('btn-new-tab');
  if (plus) plus.addEventListener('click', () => onNew());

  return { render, setActive, getActive };
}
