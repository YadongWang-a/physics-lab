/* ============================================================
   common.js — 物理实验演示公用脚本
   提供: 主题切换 / canvas DPR 适配 / 控件双向绑定 /
         键盘快捷键 / 工具函数
   各页面在自身 <script> 中实现物理逻辑与绘制
   ============================================================ */
"use strict";

/* ---- DOM 快捷方式 ---- */
const $ = id => document.getElementById(id);

/* ---- 主题 ---- */
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  const btn = $('themeBtn');
  if (btn) btn.textContent = t === 'light' ? '☀️' : '🌙';
}
// 启动时恢复上次主题
(function () {
  const t = localStorage.getItem('theme');
  if (t) applyTheme(t);
})();

/* ---- 工具函数 ---- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---- Canvas 高 DPI + 响应式适配 ----
   高度取 max(HTML属性值, 55%视口高度), 大屏自动拉高, 小屏保底。
   按 devicePixelRatio 放大像素缓冲区。
   返回 {ctx, w, h} (w=CSS宽度, h=逻辑高度) */
function fitCanvas(c) {
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const attrH = parseFloat(c.getAttribute('height') || 0);
  const vh = window.innerHeight * 0.48;
  const h = Math.max(attrH, vh);
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(h * dpr);
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h };
}

/* ---- 范围滑块 ↔ 数字输入 双向绑定 ----
   rId / nId : 元素 ID
   parse     : parseFloat / parseInt
   onChange  : function(value) — 值变化回调(由各页面定义) */
function bindRangeNumber(rId, nId, parse, onChange) {
  const r = $(rId), n = $(nId);
  const sync = function (v) {
    r.value = v;
    n.value = v;
    if (onChange) onChange(parse(v));
  };
  r.addEventListener('input', function () { sync(r.value); });
  n.addEventListener('input', function () {
    sync(clamp(parse(n.value), parse(r.min), parse(r.max)));
  });
}

/* ---- 键盘快捷键: 空格暂停/运行 , R 重置 ----
   state    : {running:bool, last:?}  — 需要有 running 字段
   resetFn  : function()              — 重置回调
   返回 cleanup 函数以便移除监听 */
function setupKeyboard(state, resetFn) {
  function handler(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      state.running = !state.running;
      state.last = null;
    }
    if (e.code === 'KeyR') {
      if (resetFn) resetFn();
    }
  }
  window.addEventListener('keydown', handler);
  return function cleanup() { window.removeEventListener('keydown', handler); };
}

/* ---- 主题按钮绑定(约定按钮 id="themeBtn") ---- */
function setupThemeButton() {
  const btn = $('themeBtn');
  if (btn) {
    btn.onclick = function () {
      applyTheme(getTheme() === 'light' ? 'dark' : 'light');
    };
  }
}

/* ---- 图例切换条绑定 ----
   containerId : 图例容器 ID(如 'legendBar')
   showObj     : {key:bool} 对象
   renderFn    : 重绘回调 */
function setupLegend(containerId, showObj, renderFn) {
  const bar = $(containerId);
  if (!bar) return;
  bar.querySelectorAll('.lg-item').forEach(function (el) {
    el.addEventListener('click', function () {
      const k = el.dataset.k;
      showObj[k] = !showObj[k];
      el.classList.toggle('on', showObj[k]);
      if (renderFn) renderFn();
    });
  });
}

/* ---- 动画主循环启动 ---- */
function startAnimation(frameFn) {
  requestAnimationFrame(frameFn);
}
