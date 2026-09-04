/* ============================================================
   common.js — 物理实验演示公用脚本
   提供: 演示模式 / canvas DPR 适配 / 控件双向绑定 /
         键盘快捷键 / 工具函数
   各页面在自身 <script> 中实现物理逻辑与绘制
   ============================================================ */
"use strict";

/* ---- DOM 快捷方式 ---- */
const $ = id => document.getElementById(id);

/* ---- 演示模式 (present mode) ----
   应用经 postMessage 发 {cmd:"present", value:true|false} 触发;
   给 <body> 加 .present class → common.css reflow(侧边栏隐藏、场景卡撑满)。
   原 ADR 0007 底部抽屉机制已废弃(被侧边栏折叠取代)。
   file:// iframe origin 为 null,监听器不校验来源(本地文件,风险可控)。 */
window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || d.cmd !== 'present') return;
  document.body.classList.toggle('present', !!d.value);
  window.dispatchEvent(new Event('resize'));   /* 布局变化 → 重跑 fitCanvas */
});

/* ---- 小节折叠 (事件委托: 点 .vhead 切父容器 .closed) ----
   弹层内问题/推导/答案各为 .sec > .vhead + .sec-body;
   委托监听, 页面零手写。 */
document.addEventListener('click', function (e) {
  const h = e.target.closest && e.target.closest('.vhead');
  if (!h) return;
  const w = h.parentElement;
  if (!w) return;
  const closed = w.classList.toggle('closed');
  h.setAttribute('aria-expanded', String(!closed));
});

/* ---- 工具函数 ---- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---- 颜色调色板缓存 ----
   各页 drawScene 每帧读几十个 CSS 变量(浅色唯一, 加载后永不变化),
   每帧 getComputedStyle 是反模式。palette() 首次调用把常用变量读全并缓存,
   后续直接返回内存对象。自定义变量直接取已缓存对象。
   用法: const C = palette(); ctx.fillStyle = C.ballLo; */
const PALETTE_KEYS = ['cyan','orange','green','red','blue','purple','txt','dim',
  'ballHi','ballLo','ballSt','ballTxt','ground','groundHatch','grid','ruler','dimTxt',
  'arcFill','arcStroke','traj','para','txt','base','spring','rulerTick',
  'faceTopFill','faceTopStroke','faceBotFill','faceBotStroke','faceHiFill','faceHiStroke',
  'faceFrontFill','faceFrontStroke','faceBackFill','faceBackStroke'];
let _palette = null;
function palette(){
  if (_palette) return _palette;
  const cs = getComputedStyle(document.documentElement);
  const C = {};
  for (const k of PALETTE_KEYS) C[k] = cs.getPropertyValue('--' + k).trim();
  // 主题变量是 --cyan 等; 画布变量是 --canvas-ball-hi 等, 这里再补 --canvas-* 映射
  C.canvas = {
    grid: cs.getPropertyValue('--canvas-grid').trim(),
    ballHi: cs.getPropertyValue('--canvas-ball-hi').trim(),
    ballLo: cs.getPropertyValue('--canvas-ball-lo').trim(),
    ballSt: cs.getPropertyValue('--canvas-ball-stroke').trim(),
    ballTxt: cs.getPropertyValue('--canvas-ball-txt').trim(),
    ground: cs.getPropertyValue('--canvas-ground').trim(),
    groundHatch: cs.getPropertyValue('--canvas-ground-hatch').trim(),
    ruler: cs.getPropertyValue('--canvas-ruler').trim(),
    rulerTick: cs.getPropertyValue('--canvas-ruler-tick').trim(),
    dimTxt: cs.getPropertyValue('--canvas-dim-txt').trim(),
    txt: cs.getPropertyValue('--canvas-txt').trim(),
    arcFill: cs.getPropertyValue('--canvas-arc-fill').trim(),
    arcStroke: cs.getPropertyValue('--canvas-arc-stroke').trim(),
    traj: cs.getPropertyValue('--canvas-traj').trim(),
    para: cs.getPropertyValue('--canvas-para').trim(),
    base: cs.getPropertyValue('--canvas-base').trim(),
    spring: cs.getPropertyValue('--canvas-spring').trim(),
  };
  // 把 canvas.* 也提到顶层, 方便 C.ballLo 这种短写
  Object.assign(C, C.canvas);
  _palette = C;
  return C;
}

/* ---- 2D 视口 fit (物理世界 -> 像素, 自适应铺满, 保持纵横比) ----
   各页 view() 的公共部分。传入画布尺寸、世界范围、内边距, 返回 {s,ox,oy}。
   s = min(可用宽/世界宽, 可用高/世界高); ox/oy 平移到物理原点。 */
function fitView(w, h, xMin, xMax, yMin, yMax, pad){
  pad = pad || {l:40, r:20, t:20, b:30};
  const sx = (w - pad.l - pad.r) / (xMax - xMin);
  const sy = (h - pad.t - pad.b) / (yMax - yMin);
  const s = Math.min(sx, sy);
  const ox = pad.l - xMin * s;
  const oy = pad.t + yMax * s;
  return { s, ox, oy };
}

/* ---- 矢量箭头 (杆+箭头+可选标签) ----
   SKILL.md 标准件: 长度按需传入(调用方按最大力≈120px 缩放后给屏幕长度)。
   scale 可选: 在世界变换(模板 translate+scale(V.s))内绘制时传 scale=V.s,
   内部像素值(线宽/箭头/字号/标签偏移)除以 scale 换算回世界单位, 屏幕上保持
   2.5px/10px/10px; 不传 = 纯屏幕坐标, 行为与旧版一致(兼容既有像素式页面)。
   dash 可选: 虚线像素数组(如 [10,7]), 内部除以 scale, 画完复位。
   每个 ctx.fillText 前会设 font/textAlign/textBaseline, 绘制后复位 textBaseline。 */
function drawArrow(ctx, x1, y1, x2, y2, color, label, scale, dash){
  const sc = scale || 1;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len * sc < 3) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5 / sc;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ang = Math.atan2(dy, dx);
  const ah = 10 / sc;
  const bodyEnd_x = x2 - ah * 0.6 * Math.cos(ang);
  const bodyEnd_y = y2 - ah * 0.6 * Math.sin(ang);
  if (dash){ ctx.setLineDash(dash.map(function(v){ return v / sc; })); }
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bodyEnd_x, bodyEnd_y); ctx.stroke();
  if (dash){ ctx.setLineDash([]); }
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(ang - 0.35), y2 - ah * Math.sin(ang - 0.35));
  ctx.lineTo(x2 - ah * Math.cos(ang + 0.35), y2 - ah * Math.sin(ang + 0.35));
  ctx.closePath(); ctx.fill();
  if (label){
    ctx.font = 'bold ' + (10 / sc) + 'px sans-serif';
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const off = 6 / sc;
    const lx = x2 + nx * off, ly = y2 + ny * off;
    ctx.textAlign = Math.abs(nx) > 0.5 ? (nx > 0 ? 'left' : 'right') : 'center';
    ctx.textBaseline = Math.abs(ny) > 0.3 ? (ny > 0 ? 'top' : 'bottom') : 'bottom';
    ctx.fillText(label, lx, ly);
    ctx.textBaseline = 'alphabetic';
  }
}

/* ============================================================
   物理绘图原语库 (SKILL.md「绘制」标准件; 页面禁止重写, 直接调用)
   ------------------------------------------------------------
   统一约定 (与 drawArrow 一致):
   - 坐标: 世界单位, 由调用方映射 (世界变换页: X=x, Y=-y; 屏幕系页: 直接传 px)。
   - scale: 当前 ctx 缩放。页面在世界变换 (translate+scale(V.s)) 内绘制时传 V.s;
     屏幕系/图表面板绘制传 1 或不传。内部所有像素常量 (线宽/字号/箭头/虚线/偏移)
     除以 scale, 保证屏幕上恒定像素。
   - 几何尺寸 (半径 r / 半宽 hw / 长度) 是世界单位, 随视口缩放, 不除以 scale。
   - dash 一律传像素数组 (如 [10,7]), 内部除以 scale; 画完自动复位 setLineDash([])。
   - 每个函数设置 font/textAlign/textBaseline, 绘制后复位 textBaseline='alphabetic'。
   颜色未指定时由 opts.color/各色位提供; 需要主题色时调用方传 palette() 变量。
   ============================================================ */

function pOpt(o, k, d){ return o && o[k] !== undefined ? o[k] : d; }
function pFont(size, scale){ return 'bold ' + (size / scale) + 'px sans-serif'; }

/* ---- A. 刚体与机构 ---- */

/* A1 球体: 上浅下深径向渐变 + 描边 + 居中标签(字符串或多段 parts)。
   opts: {hi, lo, st, txt, lw, label, font, scale, ghost(虚线轮廓), color(ghost 色), dash,
          gx, gy(渐变中心偏移, 坐标单位, 默认 r*0.4), r0(渐变内半径, 默认 r*0.15)} */
function ball(ctx, x, y, r, opts){
  const sc = pOpt(opts, 'scale', 1);
  const g = ctx.createRadialGradient(
    x - pOpt(opts, 'gx', r * 0.4), y - pOpt(opts, 'gy', r * 0.4),
    pOpt(opts, 'r0', r * 0.15), x, y, r);
  g.addColorStop(0, pOpt(opts, 'hi', '#ffffff'));
  g.addColorStop(1, pOpt(opts, 'lo', '#5a9bf0'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  if (pOpt(opts, 'ghost', false)){
    ctx.strokeStyle = pOpt(opts, 'color', '#8893ad');
    ctx.lineWidth = pOpt(opts, 'lw', 2) / sc;
    ctx.setLineDash(pOpt(opts, 'dash', [5, 4]).map(function(v){ return v / sc; }));
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = pOpt(opts, 'st', '#2b2f3a');
    ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  }
  if (opts && opts.label){
    ctx.fillStyle = pOpt(opts, 'txt', '#1a1e2e');
    multiLabel(ctx, x, y, Array.isArray(opts.label) ? opts.label : [{ t: String(opts.label) }],
      { size: pOpt(opts, 'font', 11), scale: sc, baseline: 'middle' });
  }
}

/* A2 方块物块: 上浅下深线性渐变 + 描边 + 居中标签(字符串或多段 parts)。
   opts: {hi, lo, st, txt, lw, label, labelY, font, scale, dash(虚线状态框)} */
function block(ctx, x, y, hw, hh, opts){
  const sc = pOpt(opts, 'scale', 1);
  const g = ctx.createLinearGradient(x, y - hh, x, y + hh);
  g.addColorStop(0, pOpt(opts, 'hi', '#dce6f5'));
  g.addColorStop(1, pOpt(opts, 'lo', '#9db8dd'));
  ctx.fillStyle = g;
  ctx.fillRect(x - hw, y - hh, hw * 2, hh * 2);
  ctx.strokeStyle = pOpt(opts, 'st', '#2b2f3a');
  ctx.lineWidth = pOpt(opts, 'lw', 2.2) / sc;
  if (pOpt(opts, 'dash', null)){
    ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  }
  ctx.strokeRect(x - hw, y - hh, hw * 2, hh * 2);
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
  if (opts && opts.label){
    ctx.fillStyle = pOpt(opts, 'txt', '#1a1e2e');
    multiLabel(ctx, x, y + pOpt(opts, 'labelY', 0),
      Array.isArray(opts.label) ? opts.label : [{ t: String(opts.label) }],
      { size: pOpt(opts, 'font', 11), scale: sc, baseline: 'middle' });
  }
}

/* A3 轻杆: 粗线 + 圆端帽。opts: {color, lw, scale} */
function rod(ctx, x1, y1, x2, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#1a1e2e');
  ctx.lineWidth = pOpt(opts, 'lw', 5) / sc;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/* A4 绳/软线: 折线(pts 世界坐标数组)或两点悬垂
   (pts.length===2 且 opts.sag 给定 → quadratic 中点下坠, sag 世界单位)。
   opts: {color, lw, sag, dash, scale} */
function rope(ctx, pts, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#000000');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pOpt(opts, 'dash', null)) ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  ctx.beginPath();
  if (pts.length === 2 && opts && opts.sag !== undefined){
    const p0 = pts[0], p1 = pts[1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo((p0.x + p1.x) / 2 + nx * opts.sag, (p0.y + p1.y) / 2 + ny * opts.sag, p1.x, p1.y);
  } else {
    pts.forEach(function(p, i){ i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  }
  ctx.stroke();
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
}

/* A5 弹簧线圈: 任意方向。opts: {coils(默认6), amp(振幅, 世界单位, 默认段长5%),
   lead(直线导程 px, 默认 min(10, 段长8%) 屏幕像素), N(采样段数, 默认 max(60, coils*12)),
   color, lw, scale} */
function spring(ctx, x1, y1, x2, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ang = Math.atan2(dy, dx);
  const coils = pOpt(opts, 'coils', 6);
  const lead = pOpt(opts, 'lead', null) !== null ? pOpt(opts, 'lead') / sc : Math.min(10 / sc, len * 0.08);
  const span = len - 2 * lead;
  const amp = pOpt(opts, 'amp', span * 0.05);
  const N = pOpt(opts, 'N', Math.max(60, coils * 12));
  ctx.strokeStyle = pOpt(opts, 'color', '#6b7280');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.save();
  ctx.translate(x1, y1); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(lead, 0);
  for (let i = 0; i <= N; i++){
    const f = i / N, s = Math.sin(f * Math.PI * 2 * coils);
    ctx.lineTo(lead + span * f, s * amp);
  }
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.restore();
}

/* A6 定滑轮: 外圈 + 轮毂 + 轴心 + 可选绳绕 (rope:[a0,a1] 世界弧度, ccw 反向绕)。
   opts: {color, fill, hub, axle, rope, ropeColor, ropeGap, ccw, lw, scale} */
function pulley(ctx, x, y, r, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#8a8fa0');
  ctx.strokeStyle = col; ctx.fillStyle = pOpt(opts, 'fill', '#ffffff');
  ctx.lineWidth = pOpt(opts, 'lw', 2) / sc;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, pOpt(opts, 'hub', r * 0.35), 0, 7); ctx.fill();
  ctx.fillStyle = '#1a1e2e';
  ctx.beginPath(); ctx.arc(x, y, pOpt(opts, 'axle', r * 0.12), 0, 7); ctx.fill();
  if (opts && opts.rope){
    const a0 = opts.rope[0], a1 = opts.rope[1];
    ctx.strokeStyle = pOpt(opts, 'ropeColor', '#000000');
    ctx.lineWidth = pOpt(opts, 'ropeLw', 1.5) / sc;
    ctx.beginPath(); ctx.arc(x, y, r + pOpt(opts, 'ropeGap', 0), a0, a1, pOpt(opts, 'ccw', false)); ctx.stroke();
  }
}

/* A7 滚筒/滚轮: 外圈 + 可选辐条。opts: {color, spokes, lw, scale} */
function roller(ctx, x, y, r, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#8a8fa0');
  ctx.lineWidth = pOpt(opts, 'lw', 2) / sc;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  const spokes = pOpt(opts, 'spokes', 0);
  if (spokes > 0){
    ctx.lineWidth = pOpt(opts, 'lw', 1) / sc;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++){
      const a = i / spokes * Math.PI * 2;
      ctx.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25);
      ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
    }
    ctx.stroke();
  }
}

/* A8 轨道: 默认双线; opts: {width(轨距, 世界单位, 默认0.08), single(单线, 画一条主线),
   ticks(端刻线, 布尔, 默认false), color, lw, scale} */
function track(ctx, x1, y1, x2, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const w = pOpt(opts, 'width', 0.08) / 2;
  const nx = -dy / L * w, ny = dx / L * w;
  const col = pOpt(opts, 'color', '#8a8fa0');
  ctx.strokeStyle = col;
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  if (pOpt(opts, 'single', false)){
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  } else {
    ctx.moveTo(x1 + nx, y1 + ny); ctx.lineTo(x2 + nx, y2 + ny);
    ctx.moveTo(x1 - nx, y1 - ny); ctx.lineTo(x2 - nx, y2 - ny);
  }
  ctx.stroke();
  if (pOpt(opts, 'ticks', false)){
    const tl = pOpt(opts, 'tickLen', 0.08);
    ctx.beginPath();
    ctx.moveTo(x1 - nx * 2, y1 - ny * 2); ctx.lineTo(x1 + nx * 2, y1 + ny * 2);
    ctx.moveTo(x2 - nx * 2, y2 - ny * 2); ctx.lineTo(x2 + nx * 2, y2 + ny * 2);
    ctx.stroke();
  }
}

/* A9 地面/支撑面: 横线 + 剖面斜线 + 可选标签(下方)。
   opts: {color, lw, hatch(默认true), hatchStep(世界单位), label, labelColor, font, labelDy(世界单位), scale} */
function ground(ctx, x1, x2, y, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#6b7280');
  ctx.strokeStyle = col; ctx.lineWidth = pOpt(opts, 'lw', 2) / sc;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  if (pOpt(opts, 'hatch', true)){
    const step = pOpt(opts, 'hatchStep', 0.06);
    ctx.lineWidth = pOpt(opts, 'lw', 1) / sc;
    ctx.beginPath();
    for (let x = x1 + step; x < x2; x += step){
      ctx.moveTo(x, y); ctx.lineTo(x + step * 0.6, y + step * 0.6);
    }
    ctx.stroke();
  }
  if (opts && opts.label){
    ctx.fillStyle = pOpt(opts, 'labelColor', col);
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(String(opts.label), x1, y + pOpt(opts, 'labelDy', 0.1));
    ctx.textBaseline = 'alphabetic';
  }
}

/* A10 斜面: 斜线 + 法向剖面线 + 可选标签。
   opts: {color, lw, hatchStep(世界单位), label, labelColor, font, scale} */
function inclinedPlane(ctx, x1, y1, x2, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#8a8fa0');
  ctx.strokeStyle = col; ctx.lineWidth = pOpt(opts, 'lw', 2.5) / sc; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const step = pOpt(opts, 'hatchStep', L / 10);
  ctx.lineWidth = pOpt(opts, 'lw', 1) / sc;
  ctx.beginPath();
  for (let f = step / L; f < 1; f += step / L){
    ctx.moveTo(x1 + dx * f, y1 + dy * f);
    ctx.lineTo(x1 + dx * f + nx * step * 0.5, y1 + dy * f + ny * step * 0.5);
  }
  ctx.stroke();
  if (opts && opts.label){
    ctx.fillStyle = pOpt(opts, 'labelColor', col);
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(String(opts.label), x1 + pOpt(opts, 'labelDx', 0.1), y1 + pOpt(opts, 'labelDy', 0.1));
    ctx.textBaseline = 'alphabetic';
  }
}

/* A11 墙壁: 竖线 + 剖面线(向侧边, opts.side 默认 -1) + 可选标签。
   opts: {color, lw, hatch(默认true), hatchStep, side, label, font, scale} */
function wall(ctx, x, y1, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#8a8fa0');
  const side = pOpt(opts, 'side', -1);
  ctx.strokeStyle = col; ctx.lineWidth = pOpt(opts, 'lw', 2.5) / sc;
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  if (pOpt(opts, 'hatch', true)){
    const step = pOpt(opts, 'hatchStep', 0.08);
    ctx.lineWidth = pOpt(opts, 'lw', 1) / sc;
    ctx.beginPath();
    for (let y = y1 + step; y < y2; y += step){
      ctx.moveTo(x, y); ctx.lineTo(x + side * step * 0.7, y + side * step * 0.7);
    }
    ctx.stroke();
  }
  if (opts && opts.label){
    ctx.fillStyle = pOpt(opts, 'labelColor', col);
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(opts.label), x + side * 0.15, (y1 + y2) / 2 + pOpt(opts, 'labelDy', 0));
    ctx.textBaseline = 'alphabetic';
  }
}

/* A12 结点/铰接/轴心: 实心圆点 + 描边。r 世界单位。
   opts: {fill, color, lw, scale} */
function joint(ctx, x, y, r, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.fillStyle = pOpt(opts, 'fill', '#1a1e2e');
  ctx.strokeStyle = pOpt(opts, 'color', '#8a8fa0');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.stroke();
}

/* A13 通用多边形/面片(3D 桌面/墙面/面): pts=[{x,y}...] 当前坐标系坐标。
   opts: {fill, stroke, lw, scale} */
function poly(ctx, pts, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.beginPath();
  pts.forEach(function(p, i){ i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
  ctx.closePath();
  if (pOpt(opts, 'fill', null)){ ctx.fillStyle = opts.fill; ctx.fill(); }
  if (pOpt(opts, 'stroke', null)){ ctx.strokeStyle = opts.stroke; ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc; ctx.stroke(); }
}

/* ---- B. 矢量与力 ---- */

/* B1 共点力系束: 从 (ox,oy) 出发多个箭头。
   forces = [{x, y, color, label}] 终点世界坐标; label 为字符串 → drawArrow,
   为 parts 数组(如 [{t:'m'},{t:'2',sub:true},{t:'g'}]) → 在箭头端点旁 multiLabel。 */
function forceArrows(ctx, ox, oy, forces, opts){
  const sc = pOpt(opts, 'scale', 1);
  forces.forEach(function(f){
    const lbl = Array.isArray(f.label) ? null : f.label;
    drawArrow(ctx, ox, oy, f.x, f.y, f.color, lbl, sc);
    if (Array.isArray(f.label)){
      ctx.fillStyle = f.color;
      multiLabel(ctx, f.x + 7 / sc, f.y - 4 / sc, f.label, { size: pOpt(opts, 'font', 11), scale: sc });
    }
  });
}

/* B2 正交分解(力平行四边形): 主矢量实线 + 两虚线分量箭头 + 平行四边形补边。
   主矢量 (ox,oy)→(ox+vx,oy+vy), 分量沿 x/y 轴。
   opts: {color, compColor, dash(px), lw, scale, label(主矢量), compLabels:[h,v], font} */
function vecComp(ctx, ox, oy, vx, vy, opts){
  const sc = pOpt(opts, 'scale', 1);
  const ax = ox + vx, ay = oy + vy;
  const dash = pOpt(opts, 'dash', [10, 7]);
  const col = pOpt(opts, 'color', '#7c3aed');
  const ccol = pOpt(opts, 'compColor', '#5bd98a');
  drawArrow(ctx, ox, oy, ax, ay, col, pOpt(opts, 'label', null), sc);
  drawArrow(ctx, ox, oy, ax, oy, ccol, null, sc, dash);
  drawArrow(ctx, ox, oy, ox, ay, ccol, null, sc, dash);
  ctx.strokeStyle = ccol; ctx.lineWidth = pOpt(opts, 'lw', 1.4) / sc;
  ctx.setLineDash(dash.map(function(v){ return v / sc; }));
  ctx.beginPath(); ctx.moveTo(ax, oy); ctx.lineTo(ax, ay); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, ay); ctx.lineTo(ax, ay); ctx.stroke();
  ctx.setLineDash([]);
  const cl = pOpt(opts, 'compLabels', null);
  if (cl){
    ctx.fillStyle = ccol;
    multiLabel(ctx, ax + 8 / sc, oy - 4 / sc, Array.isArray(cl[0]) ? cl[0] : [{ t: String(cl[0]) }],
      { size: pOpt(opts, 'font', 11), scale: sc });
    multiLabel(ctx, ox + 8 / sc, ay + 6 / sc, Array.isArray(cl[1]) ? cl[1] : [{ t: String(cl[1]) }],
      { size: pOpt(opts, 'font', 11), scale: sc });
  }
}

/* B3 力三角形: 沿顶点依次画箭头, 闭合=平衡。
   pts = [{x, y, color, label}] 顶点(世界坐标); opts.closed 时末段虚线连回起点。
   opts: {closed, dash, lw, scale} */
function forceTriangle(ctx, pts, opts){
  const sc = pOpt(opts, 'scale', 1);
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i + 1];
    drawArrow(ctx, a.x, a.y, b.x, b.y, b.color || a.color, b.label, sc);
  }
  if (opts && opts.closed){
    const a = pts[pts.length - 1], b = pts[0];
    ctx.strokeStyle = b.color || '#8893ad';
    ctx.lineWidth = pOpt(opts, 'lw', 1.4) / sc;
    ctx.setLineDash(pOpt(opts, 'dash', [10, 7]).map(function(v){ return v / sc; }));
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* B4 圆弧箭头(力矩/转动): 半径 r 世界单位, a0→a1 弧度(ccw 反向绕), 末端切线箭头。
   opts: {color, lw, dash, ccw, label, font, labelR(标签半径系数, 默认1.3), scale} */
function arcArrow(ctx, x, y, r, a0, a1, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#7c3aed');
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = pOpt(opts, 'lw', 2) / sc;
  if (pOpt(opts, 'dash', null)) ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  ctx.beginPath(); ctx.arc(x, y, r, a0, a1, pOpt(opts, 'ccw', false)); ctx.stroke();
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
  const t = pOpt(opts, 'ccw', false) ? a0 : a1;           /* 箭头在弧末端 */
  const tipx = x + r * Math.cos(t), tipy = y + r * Math.sin(t);
  const ux = -Math.sin(t), uy = Math.cos(t);              /* 切线方向 */
  const ah = 10 / sc;
  ctx.beginPath();
  ctx.moveTo(tipx, tipy);
  ctx.lineTo(tipx - ux * ah * 0.9 + uy * ah * 0.35, tipy - uy * ah * 0.9 - ux * ah * 0.35);
  ctx.moveTo(tipx, tipy);
  ctx.lineTo(tipx - ux * ah * 0.9 - uy * ah * 0.35, tipy - uy * ah * 0.9 + ux * ah * 0.35);
  ctx.stroke();
  if (opts && opts.label){
    const am = (a0 + a1) / 2, rr = r * pOpt(opts, 'labelR', 1.3);
    ctx.fillStyle = pOpt(opts, 'labelColor', col);
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.label), x + Math.cos(am) * rr, y + Math.sin(am) * rr);
    ctx.textBaseline = 'alphabetic';
  }
}

/* B5 轨迹折线: pts 世界坐标数组。opts: {color, dash, lw, scale} */
function traj(ctx, pts, opts){
  const sc = pOpt(opts, 'scale', 1);
  if (!pts || pts.length < 2) return;
  ctx.strokeStyle = pOpt(opts, 'color', '#8893ad');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (pOpt(opts, 'dash', null)) ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  ctx.beginPath();
  pts.forEach(function(p, i){ i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.stroke();
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
}

/* ---- C. 标注与几何 ---- */

/* C1 多段标签(主+下标+尾注): parts=[{t:'T', sub:true, color?}] 或字符串。
   居中于 (x,y) (align 可 'c'|'l'|'r'); 下标 0.62× 字号、下沉 subDy× 字号(默认 0.28)。
   opts: {size(主字号 px, 默认11), scale, align, gap(段间距系数, 默认0.16),
          subDy(下标下沉系数, 默认0.28), baseline('middle'|'alphabetic', 默认 alphabetic)} */
function multiLabel(ctx, x, y, parts, opts){
  const sc = pOpt(opts, 'scale', 1);
  const size = pOpt(opts, 'size', 11) / sc;
  const arr = Array.isArray(parts) ? parts : [{ t: String(parts) }];
  const fs = size * 0.62, gap = size * pOpt(opts, 'gap', 0.16);
  const subDy = pOpt(opts, 'subDy', 0.28);
  let w = 0;
  arr.forEach(function(p){
    ctx.font = 'bold ' + (p.sub ? fs : size) + 'px sans-serif';
    w += ctx.measureText(p.t).width + gap;
  });
  const align = pOpt(opts, 'align', 'c');
  const mid = pOpt(opts, 'baseline', 'alphabetic') === 'middle';
  let cx = align === 'c' ? x - w / 2 : (align === 'r' ? x - w : x);
  arr.forEach(function(p){
    ctx.font = 'bold ' + (p.sub ? fs : size) + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = mid ? 'middle' : 'alphabetic';
    if (p.color) ctx.fillStyle = p.color;
    ctx.fillText(p.t, cx, y + (p.sub ? size * subDy : 0));
    cx += ctx.measureText(p.t).width + gap;
  });
  ctx.textBaseline = 'alphabetic';
}

/* C2 简单标签: multiLabel 单段便捷形式。opts 同 multiLabel */
function label(ctx, x, y, text, opts){
  multiLabel(ctx, x, y, [{ t: String(text) }], opts);
}

/* C3 尺寸线: 两端垂直刻线 + 中间标签(沿线法向偏置)。
   opts: {color, lw, font, scale, tick(刻线半长px, 默认4), labelOffset(px, 默认10),
          align, dash(主线虚线)} */
function dimLine(ctx, x1, y1, x2, y2, lbl, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#6b7280');
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  ctx.strokeStyle = col; ctx.lineWidth = pOpt(opts, 'lw', 1.2) / sc;
  if (pOpt(opts, 'dash', null)) ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
  const tl = pOpt(opts, 'tick', 4) / sc;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * tl, y1 + ny * tl); ctx.lineTo(x1 - nx * tl, y1 - ny * tl);
  ctx.moveTo(x2 + nx * tl, y2 + ny * tl); ctx.lineTo(x2 - nx * tl, y2 - ny * tl);
  ctx.stroke();
  if (lbl){
    const off = pOpt(opts, 'labelOffset', 10) / sc;
    ctx.fillStyle = col;
    multiLabel(ctx, (x1 + x2) / 2 + nx * off, (y1 + y2) / 2 + ny * off,
      [{ t: String(lbl) }], { size: pOpt(opts, 'font', 11), scale: sc, align: pOpt(opts, 'align', 'c') });
  }
}

/* C4 角度弧 + 标签(角平分线外侧)。a0→a1 弧度(ccw 反向绕)。
   opts: {color, label, labelColor, font, dash, fill, ccw, rFactor(标签半径系数1.3), lw, scale} */
function angleArc(ctx, x, y, r, a0, a1, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#1a1e2e');
  ctx.strokeStyle = col;
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  if (pOpt(opts, 'dash', null)) ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  ctx.beginPath(); ctx.arc(x, y, r, a0, a1, pOpt(opts, 'ccw', false)); ctx.stroke();
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
  if (opts && opts.label){
    const am = (a0 + a1) / 2, rr = r * pOpt(opts, 'rFactor', 1.3);
    ctx.fillStyle = pOpt(opts, 'labelColor', col);
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.label), x + Math.cos(am) * rr, y + Math.sin(am) * rr);
    ctx.textBaseline = 'alphabetic';
  }
}

/* C5 虚线线段。opts: {color, lw, dash(px, 默认[8,6]), scale} */
function dashLine(ctx, x1, y1, x2, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#000000');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.setLineDash(pOpt(opts, 'dash', [8, 6]).map(function(v){ return v / sc; }));
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}

/* C6 虚线矩形(状态框), 中心 (x,y)。opts: {color, lw, dash, scale} */
function dashRect(ctx, x, y, w, h, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#000000');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.setLineDash(pOpt(opts, 'dash', [8, 6]).map(function(v){ return v / sc; }));
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.setLineDash([]);
}

/* C7 虚线圆(参考/状态轮廓)。opts: {color, lw, dash, scale} */
function dashCircle(ctx, x, y, r, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#000000');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.setLineDash(pOpt(opts, 'dash', [8, 6]).map(function(v){ return v / sc; }));
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
}

/* C8 关键点。opts: {color, r(px, 默认2.5), scale} */
function dot(ctx, x, y, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.fillStyle = pOpt(opts, 'color', '#2f6fd0');
  ctx.beginPath(); ctx.arc(x, y, pOpt(opts, 'r', 2.5) / sc, 0, 7); ctx.fill();
}

/* C9 特殊标记: kind = 'cross'|'star'|'tri'|'ring'。
   opts: {color, size(px, 默认7), lw, scale} */
function marker(ctx, x, y, kind, opts){
  const sc = pOpt(opts, 'scale', 1);
  const s = pOpt(opts, 'size', 7) / sc;
  const col = pOpt(opts, 'color', '#c94040');
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = pOpt(opts, 'lw', 1.6) / sc; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'cross'){
    ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x - s, y + s); ctx.lineTo(x + s, y - s);
    ctx.stroke();
  } else if (kind === 'ring'){
    ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.stroke();
  } else if (kind === 'tri'){
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.87, y + s * 0.5); ctx.lineTo(x - s * 0.87, y + s * 0.5);
    ctx.closePath(); ctx.fill();
  } else { /* star: 四角星 */
    ctx.beginPath();
    for (let i = 0; i < 8; i++){
      const a = i * Math.PI / 4, rr = i % 2 === 0 ? s : s * 0.45;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
}

/* C10 坐标轴(图线用): 从原点 (x0,y0) 画 +x/−y 两轴 + 箭头 + 刻度。
   opts: {color, lw, font, scale, xLen, yLen(单位与坐标一致), ticks:[nx,ny],
          labels:[xLabel,yLabel], arrow(默认true)} */
function axis(ctx, x0, y0, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#6b7280');
  const xl = pOpt(opts, 'xLen', 1), yl = pOpt(opts, 'yLen', 1);
  const ticks = pOpt(opts, 'ticks', [4, 4]);
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.beginPath();
  ctx.moveTo(x0 - xl * 0.04, y0); ctx.lineTo(x0 + xl, y0);
  ctx.moveTo(x0, y0 + yl * 0.04); ctx.lineTo(x0, y0 - yl);
  ctx.stroke();
  const ah = 8 / sc;
  ctx.beginPath();                                            /* x 轴箭头 */
  ctx.moveTo(x0 + xl, y0);
  ctx.lineTo(x0 + xl - ah, y0 - ah * 0.5); ctx.lineTo(x0 + xl - ah, y0 + ah * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();                                            /* y 轴箭头 */
  ctx.moveTo(x0, y0 - yl);
  ctx.lineTo(x0 - ah * 0.5, y0 - yl + ah); ctx.lineTo(x0 + ah * 0.5, y0 - yl + ah);
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = pOpt(opts, 'lw', 1) / sc;
  ctx.beginPath();                                            /* 刻度 */
  for (let i = 1; i <= ticks[0]; i++){
    const gx = x0 + xl * i / ticks[0];
    ctx.moveTo(gx, y0 - 3 / sc); ctx.lineTo(gx, y0 + 3 / sc);
  }
  for (let i = 1; i <= ticks[1]; i++){
    const gy = y0 - yl * i / ticks[1];
    ctx.moveTo(x0 - 3 / sc, gy); ctx.lineTo(x0 + 3 / sc, gy);
  }
  ctx.stroke();
  if (opts && opts.labels){
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(opts.labels[0]), x0 + xl + 6 / sc, y0 + 12 / sc);
    ctx.fillText(String(opts.labels[1]), x0 + 8 / sc, y0 - yl - 4 / sc);
    ctx.textBaseline = 'alphabetic';
  }
}

/* ---- D. 图线与面板 ---- */

/* D1 函数曲线: map={x:v=>px, y:v=>px} 映射器(chartPanel 返回或手写); fn(t)→值; 采样 n 段。
   opts: {color, lw, dash, scale} */
function plotLine(ctx, map, fn, t0, t1, n, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', '#2f6fd0');
  ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  if (pOpt(opts, 'dash', null)) ctx.setLineDash(pOpt(opts, 'dash').map(function(v){ return v / sc; }));
  ctx.beginPath();
  for (let i = 0; i <= n; i++){
    const t = t0 + (t1 - t0) * i / n;
    const px = map.x(t), py = map.y(fn(t));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  if (pOpt(opts, 'dash', null)) ctx.setLineDash([]);
}

/* D2 数据点: pts=[{x,y}] (值域, 经 map 映射)。opts: {color, r(px, 默认2.5), scale} */
function plotPoints(ctx, map, pts, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.fillStyle = pOpt(opts, 'color', '#2f6fd0');
  const r = pOpt(opts, 'r', 2.5) / sc;
  pts.forEach(function(p){ ctx.beginPath(); ctx.arc(map.x(p.x), map.y(p.y), r, 0, 7); ctx.fill(); });
}

/* D3 图表面板(屏幕空间): 面板底 + 边框 + 标题; 返回映射器 {x(v),y(v),x0,y0,x1,y1}。
   opts: {title, xMin,xMax,yMin,yMax(必需), pad:{l,r,t,b}, bg, border, font, titleColor,
          grid(默认true), gridColor, xTicks, yTicks, scale} */
function chartPanel(ctx, x, y, w, h, opts){
  const sc = pOpt(opts, 'scale', 1);
  const pad = Object.assign({ l: 26, r: 10, t: 22, b: 18 }, pOpt(opts, 'pad', null));
  ctx.fillStyle = pOpt(opts, 'bg', 'rgba(255,255,255,.82)');
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = pOpt(opts, 'border', '#c8cdd8');
  ctx.lineWidth = 1 / sc;
  ctx.strokeRect(x + 0.5 / sc, y + 0.5 / sc, w - 1 / sc, h - 1 / sc);
  if (opts && opts.title){
    ctx.font = pFont(pOpt(opts, 'font', 10), sc);
    ctx.fillStyle = pOpt(opts, 'titleColor', '#6b7280');
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(opts.title), x + 6 / sc, y + 14 / sc);
  }
  const x0 = x + pad.l, x1 = x + w - pad.r, y0 = y + h - pad.b, y1 = y + pad.t;
  if (pOpt(opts, 'grid', true)){
    const nx = pOpt(opts, 'xTicks', 5), ny = pOpt(opts, 'yTicks', 4);
    ctx.strokeStyle = pOpt(opts, 'gridColor', '#e8eaef');
    ctx.lineWidth = 1 / sc;
    ctx.beginPath();
    for (let i = 1; i <= nx; i++){
      const gx = x0 + (x1 - x0) * i / nx;
      ctx.moveTo(gx, y1); ctx.lineTo(gx, y0);
    }
    for (let i = 1; i <= ny; i++){
      const gy = y0 - (y0 - y1) * i / ny;
      ctx.moveTo(x0, gy); ctx.lineTo(x1, gy);
    }
    ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
  return {
    x: function(v){ return x0 + (v - opts.xMin) / (opts.xMax - opts.xMin) * (x1 - x0); },
    y: function(v){ return y0 - (v - opts.yMin) / (opts.yMax - opts.yMin) * (y0 - y1); },
    x0: x0, x1: x1, y0: y0, y1: y1
  };
}

/* D4 网格背景(世界坐标): x∈[x0,x1], y∈[y0,y1], 步长 step。
   opts: {color, lw, scale} */
function grid(ctx, x0, y0, x1, y1, step, opts){
  const sc = pOpt(opts, 'scale', 1);
  ctx.strokeStyle = pOpt(opts, 'color', 'rgba(120,140,180,.18)');
  ctx.lineWidth = pOpt(opts, 'lw', 1) / sc;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step){ ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += step){ ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
}

/* ---- E. 状态与特效 ---- */

/* E1 碰撞发光/冲击波: f∈[0,1] 进度; 径向渐变光圈 + 膨胀环。
   opts: {stops:[内,外](默认白→橙透明), fill(默认true; false=只画环不画光圈),
          spread(环膨胀半径, 默认 r*1.6), ring(环色), lw, scale} */
function glow(ctx, x, y, r, f, opts){
  const sc = pOpt(opts, 'scale', 1);
  if (pOpt(opts, 'fill', true)){
    const stops = pOpt(opts, 'stops', ['rgba(255,255,255,0.9)', 'rgba(255,220,150,0)']);
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 1, x, y, r);
    g.addColorStop(0, stops[0]); g.addColorStop(1, stops[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const spread = pOpt(opts, 'spread', r * 1.6);
  ctx.strokeStyle = pOpt(opts, 'ring', 'rgba(255,255,255,' + (0.6 * (1 - f)).toFixed(2) + ')');
  ctx.lineWidth = pOpt(opts, 'lw', 1.8) / sc;
  ctx.beginPath(); ctx.arc(x, y, r + f * spread, 0, 7); ctx.stroke();
}

/* E2 状态虚线参照(末态轮廓): 虚线框 + 顶部标签。
   opts: {color, lw, dash, label, labelColor, font, labelDy(px, 默认8), scale} */
function ghost(ctx, x, y, w, h, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#000000');
  ctx.strokeStyle = col; ctx.lineWidth = pOpt(opts, 'lw', 1.5) / sc;
  ctx.setLineDash(pOpt(opts, 'dash', [8, 6]).map(function(v){ return v / sc; }));
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.setLineDash([]);
  if (opts && opts.label){
    ctx.fillStyle = pOpt(opts, 'labelColor', col);
    ctx.font = pFont(pOpt(opts, 'font', 11), sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(opts.label), x, y - h / 2 - pOpt(opts, 'labelDy', 8) / sc);
    ctx.textBaseline = 'alphabetic';
  }
}

/* ============================================================
   F 场与电路 (SKILL.md「内容规则·场的表示」标准件; 页面禁止手写等价代码)
   ------------------------------------------------------------
   匀强场/磁感线表示: 静态背景、细、低对比灰。像素稳定约定已内置
   (端点取整 + 不透明填充 + 单一路径), 页面不得重写。
   ============================================================ */

/* F1 场线箭头(主/侧视): 细箭头, 杆+头画成同一条闭合路径(永不断开),
   端点取整 + 不透明填充 + 轮廓描边 → 像素稳定, 与底层元素无关。
   opts: {color(默认 #808692), head(箭头长 px, 默认4), headW(半宽 px, 默认1.8), scale} */
function fieldArrow(ctx, x1, y1, x2, y2, opts){
  const sc = pOpt(opts, 'scale', 1);
  const ax = Math.round(x1), ay = Math.round(y1), bx = Math.round(x2), by = Math.round(y2);
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy); if (len * sc < 3) return;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const uh = pOpt(opts, 'head', 4) / sc, hw = pOpt(opts, 'headW', 1.8) / sc;
  const hbx = bx - ux * uh, hby = by - uy * uh;
  const col = pOpt(opts, 'color', '#808692');
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(ax + px * 0.5, ay + py * 0.5);
  ctx.lineTo(hbx + px * 0.5, hby + py * 0.5);
  ctx.lineTo(hbx + hw * px, hby + hw * py);
  ctx.lineTo(bx, by);
  ctx.lineTo(hbx - hw * px, hby - hw * py);
  ctx.lineTo(hbx - px * 0.5, hby - py * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1 / sc;
  ctx.stroke();
}

/* F2 场线端视(俯视): 竖直场线呈端视 —— ⊙(出纸面) / ×(入纸面)。
   opts: {r(半径 px, 默认3), dir('out'|'in', 默认 'out'), color, lw(环线宽, 默认2), scale} */
function fieldEnd(ctx, x, y, opts){
  const sc = pOpt(opts, 'scale', 1);
  const col = pOpt(opts, 'color', '#808692');
  const r = pOpt(opts, 'r', 3) / sc;
  ctx.strokeStyle = col; ctx.lineWidth = pOpt(opts, 'lw', 2) / sc;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  if (pOpt(opts, 'dir', 'out') === 'out'){
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r * 0.37, 0, 7); ctx.fill();
  } else {
    ctx.lineWidth = 1.5 / sc;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6);
    ctx.moveTo(x - r * 0.6, y + r * 0.6); ctx.lineTo(x + r * 0.6, y - r * 0.6);
    ctx.stroke();
  }
}

/* ============================================================
   物理公式与计算库 (SKILL.md「计算」标准件; 页面禁止重写, 直接调用)
   ------------------------------------------------------------
   标准公式与数值方法: 语义固定、跨题高频, 生成时直接调用, 不再手写。
   命名: 返回对象 {x,v} / {vA,vB} / {Fx,Fy} 等; 角度一律弧度 (deg2rad 转换)。
   碰撞/运动学/简谐/能量/分解/数值方法 六类 + 主循环积分器。
   ============================================================ */

/* ---- 数值小件 ---- */
function deg2rad(d){ return d * Math.PI / 180; }
function rad2deg(r){ return r * 180 / Math.PI; }
function lerp(a, b, t){ return a + (b - a) * t; }

/* ---- 一维碰撞 ---- */
function elastic1D(vA, vB, mA, mB){                    /* 完全弹性: 动量+动能守恒 */
  const mt = mA + mB;
  return { vA: ((mA - mB) * vA + 2 * mB * vB) / mt, vB: ((mB - mA) * vB + 2 * mA * vA) / mt };
}
function inelastic1D(vA, vB, mA, mB){                  /* 完全非弹性: 粘连共速 */
  const v = (mA * vA + mB * vB) / (mA + mB);
  return { vA: v, vB: v };
}
function eRestitution(vA, vB, vA2, vB2){               /* 恢复系数 e = -(vB'-vA')/(vB-vA) */
  return -(vB2 - vA2) / (vB - vA);
}

/* ---- 运动学 ---- */
function uniformMotion(v0, a, t){                       /* 匀变速: 位移/末速 */
  return { x: v0 * t + 0.5 * a * t * t, v: v0 + a * t };
}
function freeFall(t, g){ return { y: 0.5 * g * t * t, v: g * t }; }   /* 静止下落 */
function vFromHeight(h, g){ return Math.sqrt(2 * g * h); }
function hFromSpeed(v, g){ return v * v / (2 * g); }
function effGravity(g, th){ return g * Math.sin(th); }   /* 斜面有效重力 (th 弧度) */
function projXY(v0, th, h0, g, t){                      /* 抛体轨迹点 */
  return { x: v0 * Math.cos(th) * t, y: h0 + v0 * Math.sin(th) * t - 0.5 * g * t * t };
}
function projFlight(v0, th, h0, g){                     /* 落地时间 (h0=0 时 = 2v₀sinθ/g) */
  if (h0 === 0){ return 2 * v0 * Math.sin(th) / g; }
  const vy = v0 * Math.sin(th);
  return (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
}
function projRange(v0, th, h0, g){ return v0 * Math.cos(th) * projFlight(v0, th, h0, g); }
function projMaxH(v0, th, h0, g){ return h0 + (v0 * Math.sin(th)) * (v0 * Math.sin(th)) / (2 * g); }
function criticalSpeed(g, R){ return Math.sqrt(g * R); }   /* 竖直圆周最高点临界 v=√(gR) */

/* ---- 简谐 ---- */
function omega(k, m){ return Math.sqrt(k / m); }
function shmPeriod(k, m){ return 2 * Math.PI * Math.sqrt(m / k); }
function suggestSubstep(k, m){ return 0.1 * Math.sqrt(m / k); }  /* ω·dt<0.1 子步长规则 */

/* ---- 能量 ---- */
function KE(m, v){ return 0.5 * m * v * v; }
function PEg(m, g, h){ return m * g * h; }
function PEs(k, x){ return 0.5 * k * x * x; }

/* ---- 力分解 ---- */
function resolve(F, th){ return { Fx: F * Math.cos(th), Fy: F * Math.sin(th) }; }

/* ---- 数值方法 ---- */
function bisect(fn, lo, hi, tol){                       /* 二分求根 (fn 单调变号) */
  tol = tol || 1e-9;
  const flo0 = fn(lo), fhi0 = fn(hi);
  if (flo0 * fhi0 > 0) return null;
  let lo2 = lo, hi2 = hi, flo = flo0, fhi = fhi0;
  for (let i = 0; i < 200; i++){
    const mid = (lo2 + hi2) / 2, fm = fn(mid);
    if (Math.abs(fm) < tol || (hi2 - lo2) / 2 < tol) return mid;
    if (fm * flo <= 0){ hi2 = mid; fhi = fm; } else { lo2 = mid; flo = fm; }
  }
  return (lo2 + hi2) / 2;
}
function solveQuad(a, b, c){                            /* 实根数组或 null */
  const d = b * b - 4 * a * c;
  if (d < 0) return null;
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
}
function _vScale(v, k){ return Array.isArray(v) ? v.map(function(x){ return x * k; }) : v * k; }
function _vAdd(a, b){
  if (Array.isArray(a)) return a.map(function(x, i){ return x + b[i]; });
  return a + b;
}
/* 通用 RK4: deriv(t, y) → dy/dt (y 可为标量或数组), 返回推进后的 y */
function rk4(deriv, y, t, h){
  const k1 = deriv(t, y);
  const k2 = deriv(t + h / 2, _vAdd(y, _vScale(k1, h / 2)));
  const k3 = deriv(t + h / 2, _vAdd(y, _vScale(k2, h / 2)));
  const k4 = deriv(t + h, _vAdd(y, _vScale(k3, h)));
  return _vAdd(y, _vScale(_vAdd(_vAdd(k1, _vScale(k2, 2)), _vAdd(_vScale(k3, 2), k4)), h / 6));
}
/* Velocity Verlet: accel(x)→a (标量), 推进 {x,v} */
function verlet2(accel, x, v, h){
  const a = accel(x);
  const x2 = x + v * h + 0.5 * a * h * h;
  const a2 = accel(x2);
  return { x: x2, v: v + 0.5 * (a + a2) * h };
}

/* ---- 主循环 + 子步积分器 (SKILL.md「计算」标准件; 各页不再手写 frame) ----
   用法: startLoop(S, {sub, step, render, postStep?, stopCheck?, mode?})
   - S 需含 {running, last, speed?} (speed 缺失按 1)
   - sub: 子步长(秒); 0/缺省 = 每帧调一次 step(dt) (解析单步)
   - step(h): 物理推进(只写这里)
   - render(): 绘制一帧; 运行中每帧调, 暂停时只在脏标记(初帧/resize)时补一次
   - postStep(): 每运行帧收尾
   - stopCheck(): 返回 true 则暂停
   - mode: 指定时仅 S.mode===mode 推进; 其余视同暂停帧
   暂停帧不渲染(CPU≈0)。暂停期任何状态变更(含 lib 内部空格/运行按钮)必须
   伴随显式 render() —— lib 的 setupScene/setupKeyboard 已内置; 页面自定义
   控件改完状态须自行调 render()。resize 由本函数监听置脏兜底重绘。
   限幅 dt≤0.05 与 ×S.speed 已内置, 各页不得重写。 */
function startLoop(S, opts){
  let dirty = true;   /* 暂停帧补渲染标记: 初帧 / resize / 布局变化 */
  window.addEventListener('resize', function () { dirty = true; });
  function frame(now){
    if (S.last == null) S.last = now;
    let dt = (now - S.last) / 1000; S.last = now;
    const sp = S.speed !== undefined ? S.speed : 1;
    dt = Math.min(dt, 0.05) * sp;
    if (S.running && (!opts.mode || S.mode === opts.mode)){
      if (opts.sub > 0){
        let rem = dt;
        while (rem > 0 && S.running){
          const h = Math.min(opts.sub, rem);
          opts.step(h);
          rem -= h;
          if (opts.stopCheck && opts.stopCheck()) S.running = false;
        }
      } else {
        opts.step(dt);
      }
      if (opts.postStep) opts.postStep();
      opts.render();
    } else if (dirty){
      dirty = false;
      opts.render();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---- Canvas 高 DPI + 响应式适配 ----
   高度取 max(HTML属性值, 视口高×42%), 编辑态给下方图表区留空间;
   演示模式(.present, 画布独占 70vh)用 62% 保缓冲分辨率。
   按 devicePixelRatio 放大像素缓冲区。
   返回 {ctx, w, h} (w=CSS宽度, h=逻辑高度) */
function fitCanvas(c) {
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // 基准高度只读一次: c.height 写缓冲会反射回 height 属性(变成 h·dpr),
  // 下次再读属性会把缓冲高度当基准 → 画布高度只能涨不能缩(resize 后无法复原)。
  if (c._baseH === undefined) c._baseH = parseFloat(c.getAttribute('height') || 0);
  const frac = document.body.classList.contains('present') ? 0.62 : 0.42;
  const vh = window.innerHeight * frac;
  const h = Math.max(c._baseH, vh);
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(h * dpr);
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h };
}

/* ---- 标准图表区 (setupCharts; SKILL「数据图像」标准件) ----
   模板在画布下方预留 <div class="charts-row" id="charts">; 无图题型不调用本
   函数, 容器 :empty 自动塌缩不留白。有图页面在 render() 末尾调 CH.update():
   运行帧每帧采样; 暂停期改参数后由页面显式调一次(配合 startLoop 暂停停帧)。
   用法:
     const CH = setupCharts($('charts'), [
       { title:'x-t 图', yLabel:'x/m', getX:()=>S.t,
         series:[{label:'A', color:'#2f6fd0', get:()=>S.xA},
                 {label:'B', color:'#c94040', get:()=>S.xB}] },
       { title:'v-t 图', yLabel:'v/(m/s)', getX:()=>S.t, series:[...] }
     ]);
   def 字段: title?(左上角标注) / xLabel?('t/s' 缺省) / yLabel? / series(必填,
   get 返回 null/NaN 跳过该样本) / getX(缺省 () => 0, 一般传 () => S.t) /
   maxPoints?(缺省 1200, 超限隔点抽稀 + 采样隔帧)。
   x 单调递增 → 追加样本; x 不变(暂停改参/静态关系图) → 原位更新最新样本。
   返回 { update(), clear() }; resize 自适应(自绘缓冲, 不走 fitCanvas)。 */
function setupCharts(container, defs){
  if (!container) return { update: function(){}, clear: function(){} };
  const SERIES_COLORS = ['#2f6fd0', '#c94040', '#1f9d55', '#b8860b', '#7c3aed'];
  const charts = defs.map(function (def) {
    const cv = document.createElement('canvas');
    cv.className = 'chart';
    container.appendChild(cv);
    return { def: def, cv: cv, ctx: cv.getContext('2d'), pts: [], lastX: null, count: 0, stride: 1 };
  });
  function size(ch){
    const r = ch.cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ch.cv.width = Math.max(1, Math.round(r.width * dpr));
    ch.cv.height = Math.max(1, Math.round(r.height * dpr));
    ch.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ch.w = r.width; ch.h = r.height;
  }
  function redraw(ch){
    const ctx = ch.ctx, w = ch.w, h = ch.h, d = ch.def;
    ctx.clearRect(0, 0, w, h);
    /* 坐标范围: x 取样本全程, y 取各系列 min/max(过滤空样本), 各留 8% 边距 */
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of ch.pts){
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      for (let i = 1; i < p.length; i++){
        if (!isFinite(p[i])) continue;
        if (p[i] < y0) y0 = p[i];
        if (p[i] > y1) y1 = p[i];
      }
    }
    if (!isFinite(x0)) { x0 = 0; x1 = 1; }
    if (!isFinite(y0)) { y0 = 0; y1 = 1; }
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const mx = (x1 - x0) * 0.04 || 1, my = (y1 - y0) * 0.08;
    x0 -= mx; x1 += mx; y0 -= my; y1 += my;
    const L = 34, R = 8, T = 20, B = 18;              /* 边距: 左留 y 轴标签 */
    const px = function (x){ return L + (x - x0) / (x1 - x0) * (w - L - R); };
    const py = function (y){ return h - B - (y - y0) / (y1 - y0) * (h - T - B); };
    /* 网格 + 坐标轴 + 刻度(约 4 段) */
    ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++){
      const gx = L + i * (w - L - R) / 4, gy = T + i * (h - T - B) / 4;
      ctx.moveTo(gx, T); ctx.lineTo(gx, h - B);
      ctx.moveTo(L, gy); ctx.lineTo(w - R, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = '#98a0b3'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px(0), T); ctx.lineTo(px(0), h - B); ctx.lineTo(w - R, h - B); ctx.stroke();
    ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(d.xLabel || 't/s', (L + w - R) / 2, h - B + 3);
    ctx.textAlign = 'left';
    ctx.fillText(fmtTick(y1), 2, T - 12);
    ctx.fillText(fmtTick(y0), 2, h - B - 12);
    /* 标题(左上) + 图例(右上) */
    if (d.title){ ctx.textAlign = 'left'; ctx.fillText(d.title, L + 4, 4); }
    let lx = w - R - 4;
    const series = d.series;
    for (let i = series.length - 1; i >= 0; i--){
      const label = series[i].label, color = series[i].color || SERIES_COLORS[i % SERIES_COLORS.length];
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(label, lx, 8);
      lx -= ctx.measureText(label).width + 10;
      ctx.fillStyle = color;
      ctx.fillRect(lx + 3, 5, 8, 3);
      lx -= 8;
    }
    /* 曲线(逐段连线, 跳过空样本) */
    for (let si = 0; si < series.length; si++){
      ctx.strokeStyle = series[si].color || SERIES_COLORS[si % SERIES_COLORS.length];
      ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      for (const p of ch.pts){
        const v = p[si + 1];
        if (!isFinite(v)){ pen = false; continue; }
        const X = px(p[0]), Y = py(v);
        if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
      }
      ctx.stroke();
    }
  }
  function fmtTick(v){ return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1); }
  function update(){
    for (const ch of charts){
      const d = ch.def;
      ch.count++;
      if (ch.stride > 1 && ch.count % ch.stride !== 0) continue;
      const x = d.getX ? d.getX() : 0;
      const vals = d.series.map(function (s){ const v = s.get(); return v == null ? NaN : v; });
      if (vals.every(function (v){ return !isFinite(v); })){ redraw(ch); continue; }
      if (ch.lastX == null || x > ch.lastX + 1e-12){
        ch.pts.push([x].concat(vals)); ch.lastX = x;
      } else if (ch.pts.length){
        ch.pts[ch.pts.length - 1] = [x].concat(vals);
      }
      const max = d.maxPoints || 1200;
      if (ch.pts.length > max){
        ch.pts = ch.pts.filter(function (_, i){ return i % 2 === 0; });
        ch.stride = Math.min(ch.stride * 2, 30);
      }
      redraw(ch);
    }
  }
  function clear(){
    for (const ch of charts){ ch.pts.length = 0; ch.lastX = null; ch.stride = 1; redraw(ch); }
  }
  let rt;
  window.addEventListener('resize', function(){
    clearTimeout(rt);
    rt = setTimeout(function(){ for (const ch of charts){ size(ch); redraw(ch); } }, 120);
  });
  for (const ch of charts){ size(ch); redraw(ch); }
  return { update: update, clear: clear };
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
   redraw   : function() 可选         — 空格切换后补一次渲染(暂停帧不再自动重绘)
   返回 cleanup 函数以便移除监听 */
function setupKeyboard(state, resetFn, onResume, redraw) {
  function handler(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.running && onResume) onResume();
      state.running = !state.running;
      state.last = null;
      if (redraw) redraw();
    }
    if (e.code === 'KeyR') {
      if (resetFn) resetFn();
    }
  }
  window.addEventListener('keydown', handler);
  return function cleanup() { window.removeEventListener('keydown', handler); };
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

/* ---- 视口缩放/平移 (zoom + pan) ----
   各页自持 vp = {zoom, panX, panY} (zoom=1/pan=0 即自适应原始视图)。
   绑定画布滚轮 -> 缩放 vp.zoom (仅改 zoom, 以各页物理原点/地面为自然锚点,
   不与平移耦合, 因此四页 transform 各异也能共用一套工具)。
   返回方法对象供按钮调用: zoomIn/zoomOut/reset/pan。
     - reset: zoom=1, pan=0 (回到自适应)
     - pan(dx,dy): 屏幕像素平移 (dx>0 内容右移, dy>0 内容下移)
   onChange : 重绘回调 (各页 render) */
/* opts: {panDrag?:bool} panDrag=false 时不绑拖拽平移(供需要拖拽做他用的页,如 3D 旋转) */
function setupViewport(canvas, vp, onChange, opts) {
  const ZMIN = 0.3, ZMAX = 4, STEP = 1.2;
  const panDrag = !opts || opts.panDrag !== false;
  function setZoom(z){ vp.zoom = clamp(z, ZMIN, ZMAX); if (onChange) onChange(); }
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    const f = e.deltaY < 0 ? STEP : 1 / STEP;
    setZoom(vp.zoom * f);
  }, { passive: false });

  if (panDrag) {
    /* 拖拽平移 (左键按住移动 -> 屏幕 px 直接累加到 panX/panY) */
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;            // 仅左键
      e.preventDefault();
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', function () {
      if (dragging) { dragging = false; canvas.style.cursor = 'grab'; }
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      vp.panX += e.clientX - lx;
      vp.panY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (onChange) onChange();
    });
    canvas.style.cursor = 'grab';
  }

  return {
    zoomIn:  function () { setZoom(vp.zoom * STEP); },
    zoomOut: function () { setZoom(vp.zoom / STEP); },
    reset:   function () { vp.zoom = 1; vp.panX = 0; vp.panY = 0; if (onChange) onChange(); },
    pan:     function (dx, dy) { vp.panX += dx; vp.panY += dy; if (onChange) onChange(); }
  };
}

/* ---- 应用视口变换到画布 ctx (以画布中心为锚点的相似变换) ----
   调用方需 ctx.save() 在前、ctx.restore() 在后。
   把整段场景绘制(坐标 + 尺寸: 半径/线宽/字号/矢量长度)统一缩放平移,
   保证元素间相对关系不随 zoom 畸变。各页用 fit 坐标(zoom=1)绘制即可。 */
function applyViewport(ctx, w, h, vp) {
  ctx.translate(w / 2 + vp.panX, h / 2 + vp.panY);
  ctx.scale(vp.zoom, vp.zoom);
  ctx.translate(-w / 2, -h / 2);
}

/* ---- 运行/暂停 单按钮同步 ----
   每帧由各页 render() 调用, 把按钮文案/样式同步到 state.running,
   覆盖手动点击 / 空格键 / 动画自动结束 三种触发路径, 永不脱节。
   running=false -> '▶ 运行' (primary 蓝, 邀请运行);
   running=true  -> '⏸ 暂停' (灰, 表示进行中, 点击即暂停)。 */
function syncRunToggle(id, running, runLabel, pauseLabel) {
  const b = $(id); if (!b) return;
  const label = running ? pauseLabel : runLabel;
  if (b.textContent !== label) b.textContent = label;
  b.classList.toggle('primary', !running);
}

/* ---- 平移步长: 画布尺寸的 8% ----
   供方向按钮使用, 返回 {dx,dy} 屏幕像素 (符合 setupViewport.pan 的约定) */
function panStep(canvas, dir) {
  const r = canvas.getBoundingClientRect();
  const s = Math.min(r.width, r.height) * 0.08;
  switch (dir) {
    case 'up':    return { dx: 0,  dy:  s };   // 内容下移 = 露出上方
    case 'down':  return { dx: 0,  dy: -s };
    case 'left':  return { dx:  s, dy: 0 };    // 内容右移 = 露出左侧
    case 'right': return { dx: -s, dy: 0 };
  }
  return { dx: 0, dy: 0 };
}

/* ---- 绑定视口按钮 (画布, vp, 重绘, opts) ----
   约定按钮 id: vpIn / vpOut / vpReset / vpUp / vpDown / vpLeft / vpRight */
function bindViewportButtons(canvas, vp, onChange, opts) {
  const ctl = setupViewport(canvas, vp, onChange, opts);
  const bind = function (suf, fn) { const el = $('vp' + suf); if (el) el.onclick = fn; };
  bind('In',    ctl.zoomIn);
  bind('Out',   ctl.zoomOut);
  bind('Reset', ctl.reset);
  bind('Up',    function () { const p = panStep(canvas, 'up');    ctl.pan(p.dx, p.dy); });
  bind('Down',  function () { const p = panStep(canvas, 'down');  ctl.pan(p.dx, p.dy); });
  bind('Left',  function () { const p = panStep(canvas, 'left');  ctl.pan(p.dx, p.dy); });
  bind('Right', function () { const p = panStep(canvas, 'right'); ctl.pan(p.dx, p.dy); });
  return ctl;
}

/* ---- 守恒律监测 (运行时物理自检) ----
   数值积分可能发散(能量漂移、动量不守恒), 静态自检抓不到。本工具实时算
   各守恒量的相对漂移, 超阈值标红, 让运行时错误可见。
   用法:
     const CON = setupConservation(sceneC.parentElement, {
       items: [ {label:'E', getValue:function(){ return energy().E; }} ],   // 守恒量(恒定)
       tol: 0.01,                                                          // 相对漂移阈值(1%)
       ids: { panel:'conPanel' }                                            // 可选, 默认 conPanel
     });
   - 首次调 check() 记录初值; 之后每帧 render() 里调 CON.check()。
   - 漂移超阈 -> 该项标红 + console.warn。有摩擦/耗散的题不要列该量为守恒。
   返回 { check }: 页面在 render() 里调 check() 刷新面板。 */
function setupConservation(parent, o){
  const panel = document.createElement('div');
  panel.className = 'consv';
  panel.id = (o.ids && o.ids.panel) || 'conPanel';
  panel.innerHTML = o.items.map(function(it, i){
    return '<span class="cv" data-i="'+i+'"><b>'+it.label+'</b> <code class="cvv">-</code><code class="cvd">-</code></span>';
  }).join('');
  parent.appendChild(panel);
  const initials = o.items.map(function(){ return null; });
  let started = false;
  return {
    check: function(){
      o.items.forEach(function(it, i){
        const val = it.getValue();
        if (val == null || isNaN(val)) return;
        if (!started || initials[i] == null){ initials[i] = val; started = true; }
        const el = panel.querySelector('.cv[data-i="'+i+'"]');
        if (!el) return;
        const ref = Math.abs(initials[i]) > 1e-9 ? initials[i] : 1;
        const drift = (val - initials[i]) / Math.abs(ref);
        el.querySelector('.cvv').textContent = val.toFixed(3);
        const dEl = el.querySelector('.cvd');
        dEl.textContent = (drift>=0?'+':'')+(drift*100).toFixed(2)+'%';
        const over = Math.abs(drift) > (o.tol || 0.01);
        el.classList.toggle('bad', over);
        if (over && it.getValue._warned !== true){
          console.warn('[conservation] ' + it.label + ' drift ' + (drift*100).toFixed(2) + '%');
          it.getValue._warned = true;
        }
      });
    }
  };
}

/* ---- 场景标准件注入 (setupScene) ----
   各页调一次, 注入统一的 scene-actions (运行/暂停 toggle + 重置 + 缩放 + 平移 +
   动画倍速) 和图例栏, 并绑定全部标准行为(运行切换/重置/视口/键盘/图例);
   另注入画布右缘双标签 .side-tabs(齿轮=侧边栏折叠, 书=解析弹层)。
   侧边栏(.grid > .card:last-child)默认展开, 点齿轮收起/展开; 解析弹层(.mpop, 问题/推导/答案)
   覆盖式, 无 .mpop 的页面自动隐藏「解析」标签。
   页面只保留物理专属: S / view 或 project3 / drawScene(内含 applyViewport 包裹) /
   step / 参数·读数·临界态·答案卡。
   返回 { syncRun }: 页面在 render() 末尾调 syncRun() 每帧同步运行按钮文案。

   o = {
     canvas,         // 画布元素
     vp,             // {zoom,panX,panY}
     state,          // 状态对象 S (需有 .running/.last; 有 legend 时 .show 被本函数设置)
     render,         // 重绘回调 (图例/视口变化时调用)
     resetFn,        // 重置回调
     runLabel,       // '▶ 运行' / '▶ 同时释放'
     panDrag,        // 2D=true (拖拽平移), 3D=false (拖拽留给旋转相机)
     legend,         // [{k,label,color,on:true}] 或 null (无可切换量, 如纯等时演示)
     onBeforeRun,    // 可选 fn(): 开始运行前调用, 页面做"从结束态重启"
     extraActions,   // 可选 HTML: 额外动作组 (如 incline 三视图 seg), 插在 spacer 之后
     pen             // 可选 bool: 默认 true(注入「✎ 画笔」标注); false 禁用整组
   } */
function setupScene(o) {
  const canvas = o.canvas, card = canvas.parentElement, state = o.state;
  const ARROW_RIGHT = '→';   // -> 右移箭头

  /* 1. scene-actions: 注入到 canvas 之前 */
  /* 侧边栏开关图标(齿轮, currentColor 跟随按钮色) */
  const GEAR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
  const actions = document.createElement('div');
  actions.className = 'scene-actions';
  actions.innerHTML =
    '<button class="btn sm primary" id="run" title="运行/暂停(快捷键 空格)">' + o.runLabel + '</button>' +
    '<button class="btn sm" id="reset" title="重置(快捷键 R)">↺ 重置</button>' +
    '<div class="seg seg-act" title="缩放">' +
      '<button id="vpIn">＋</button><button id="vpOut">－</button><button id="vpReset">还原</button></div>' +
    '<div class="seg seg-act" title="平移">' +
      '<button id="vpUp">↑</button><button id="vpDown">↓</button>' +
      '<button id="vpLeft">←</button><button id="vpRight">' + ARROW_RIGHT + '</button></div>' +
    '<button class="btn sm" id="pen" title="画笔标注(再点一次清除)">✎ 画笔</button>' +
    '<label class="spd" title="动画倍速">倍速' +
      '<input type="range" id="spd" min="0.2" max="3" step="0.1" value="' + (state.speed || 1) + '"></label>' +
    '<span class="kbd-hint">⌨ 空格 运行/暂停 · R 重置</span>' +
    '<div class="spacer"></div>' +
    (o.extraActions || '');
  card.insertBefore(actions, canvas);

  /* 2. legendbar: 注入到 canvas 之后 (有 legend 才生成) */
  if (o.legend) {
    const showObj = {};
    const bar = document.createElement('div');
    bar.className = 'legendbar'; bar.id = 'legendBar';
    bar.innerHTML = o.legend.map(function (it) {
      showObj[it.k] = it.on !== false;
      return '<span class="lg-item ' + (showObj[it.k] ? 'on' : '') + '" data-k="' + it.k +
             '" style="--c:' + it.color + '"><span class="lg-sw"></span>' + it.label + '</span>';
    }).join('');
    card.insertBefore(bar, canvas.nextSibling);
    state.show = showObj;
    setupLegend('legendBar', showObj, o.render);
  }

  /* 2.5 画笔标注层: 「✎ 画笔」开关 → 覆盖画布的透明层, 屏幕空间笔迹。
         开启时画布拖拽平移被覆盖层拦截(仍可滚轮/按钮缩放平移),
         关闭时清空笔迹(再开重画); o.pen=false 时整组禁用。 */
  const penBtn = $('pen');
  if (penBtn && o.pen !== false) {
    const ov = document.createElement('canvas');
    ov.className = 'pen-layer';
    card.appendChild(ov);
    const octx = ov.getContext('2d');
    const penColor = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#c94040';
    let penOn = false, drawing = false;

    /* 覆盖层尺寸跟随场景画布(CSS 尺寸 + dpr 缓冲), 与 fitCanvas 同构;
       笔迹以屏幕坐标点列存储: 画布尺寸变化(窗口缩放/侧栏折叠/MathJax 排版
       都可能触发 resize)会重建缓冲, 重放笔迹即可不丢; 尺寸不变时重放为空操作 */
    const strokes = [];
    let stroke = null;

    function replay() {
      octx.lineCap = 'round'; octx.lineJoin = 'round';
      octx.strokeStyle = penColor; octx.lineWidth = 2.5;
      for (const st of strokes) {
        if (!st.pts.length) continue;
        octx.beginPath();
        octx.moveTo(st.pts[0].x, st.pts[0].y);
        for (let i = 1; i < st.pts.length; i++) octx.lineTo(st.pts[i].x, st.pts[i].y);
        octx.stroke();
      }
    }

    function syncPenLayer() {
      ov.style.left = canvas.offsetLeft + 'px';
      ov.style.top = canvas.offsetTop + 'px';
      ov.style.width = canvas.offsetWidth + 'px';
      ov.style.height = canvas.offsetHeight + 'px';
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      ov.width = Math.round(r.width * dpr);
      ov.height = Math.round(r.height * dpr);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      replay();
    }
    syncPenLayer();
    window.addEventListener('resize', syncPenLayer);

    function setPen(on) {
      penOn = on;
      ov.classList.toggle('active', on);
      penBtn.classList.toggle('primary', on);
      penBtn.title = on ? '退出画笔(清除笔迹)' : '画笔标注(再点一次清除)';
      if (!on) { strokes.length = 0; octx.clearRect(0, 0, ov.width, ov.height); }  /* 切回即清 */
    }
    penBtn.onclick = function () { setPen(!penOn); };

    /* 画笔模式下滚轮缩放仍可用(转发给场景画布既有监听) */
    ov.addEventListener('wheel', function (e) {
      e.preventDefault();
      canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaY: e.deltaY, clientX: e.clientX, clientY: e.clientY
      }));
    }, { passive: false });

    function penPos(e) {
      const r = ov.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    ov.addEventListener('pointerdown', function (e) {
      if (!penOn) return;
      e.preventDefault();
      ov.setPointerCapture(e.pointerId);
      drawing = true;
      stroke = { pts: [] };
      strokes.push(stroke);
      const p = penPos(e);
      stroke.pts.push(p);
      octx.lineCap = 'round'; octx.lineJoin = 'round';
      octx.strokeStyle = penColor; octx.lineWidth = 2.5;
      octx.beginPath(); octx.moveTo(p.x, p.y); octx.lineTo(p.x + 0.01, p.y + 0.01); octx.stroke();
    });
    ov.addEventListener('pointermove', function (e) {
      if (!drawing || !penOn) return;
      e.preventDefault();
      const p = penPos(e);
      stroke.pts.push(p);
      octx.lineTo(p.x, p.y); octx.stroke();
    });
    window.addEventListener('pointerup', function () { drawing = false; stroke = null; });
  } else if (penBtn) {
    penBtn.style.display = 'none';
  }

  /* 3. 绑定 */
  $('run').onclick = function () {
    if (state.running) { state.running = false; }
    else { if (o.onBeforeRun) o.onBeforeRun(); state.running = true; state.last = null; }
    o.render();   /* 暂停帧不再自动重绘: 切换后补一帧(含 syncRun 按钮文案) */
  };
  $('reset').onclick = o.resetFn;
  setupKeyboard(state, o.resetFn, o.onBeforeRun, o.render);
  bindViewportButtons(canvas, o.vp, o.render, { panDrag: o.panDrag });
  const spd = $('spd');   /* 动画倍速(绑 state.speed) */
  if (spd) spd.addEventListener('input', function(){ state.speed = parseFloat(spd.value); });

  /* 4. 侧边栏折叠 + 解析弹层: 开关 = 画布右缘双标签组 .side-tabs
        (锚定场景卡, 见 DevTools 面板边界手柄; 折叠切换后派发 resize
        复用页面重排路径——折叠是 CSS 布局变化, 不触发 window resize)
        齿轮=参数侧栏(默认展开), 书=解析弹层(问题/推导/答案, 覆盖式).mpop */
  const BOOK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';
  const grid = document.querySelector('.grid');
  const tabs = document.createElement('div');
  tabs.className = 'side-tabs';
  tabs.innerHTML =
    '<button type="button" class="side-tab" id="sideToggle" title="显示参数面板">' + GEAR + '<span class="side-txt">参数</span></button>' +
    '<button type="button" class="side-tab" id="solveToggle" title="查看问题/推导/答案">' + BOOK + '<span class="side-txt">解析</span></button>';
  card.appendChild(tabs);

  /* 侧边栏折叠: 默认展开 */
  const sideToggle = $('sideToggle');
  function applySide(open) {
    grid.classList.toggle('side-collapsed', !open);
    sideToggle.innerHTML = GEAR + '<span class="side-txt">' + (open ? '收起' : '参数') + '</span>';
    sideToggle.title = open ? '隐藏参数面板' : '显示参数面板';
    sideToggle.classList.toggle('primary', open);
    window.dispatchEvent(new Event('resize'));
  }

  /* 解析弹层: 头部(标题+关闭, 也是拖动抓手)注入 + 开/关 + 背板点击 + ESC;
     页面无 .mpop 则不显示「解析」标签 */
  const mpop = document.getElementById('mpop');
  const solveToggle = $('solveToggle');
  if (mpop && solveToggle) {
    /* 头部为标准件, 存量页面无则注入(模板已含) */
    const panel = mpop.querySelector('.mpop-panel');
    if (panel && !panel.querySelector('.mpop-head')) {
      const head = document.createElement('div');
      head.className = 'mpop-head';
      head.innerHTML = '<span class="mpop-title">问题 · 推导 · 答案</span>' +
        '<button type="button" class="mpop-close" title="关闭 (Esc)">✕</button>';
      panel.insertBefore(head, panel.firstChild);
    }
    function setPop(open) {
      mpop.classList.toggle('open', open);
      solveToggle.innerHTML = BOOK + '<span class="side-txt">' + (open ? '收起' : '解析') + '</span>';
      solveToggle.title = open ? '收起解析面板' : '查看问题/推导/答案';
      solveToggle.classList.toggle('primary', open);
    }
    solveToggle.onclick = function () { setPop(!mpop.classList.contains('open')); };
    const back = mpop.querySelector('.mpop-back');
    if (back) back.onclick = function () { setPop(false); };
    const closeBtn = panel && panel.querySelector('.mpop-close');
    if (closeBtn) closeBtn.onclick = function () { setPop(false); };
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Escape' && mpop.classList.contains('open')) setPop(false);
    });
    setPop(false);

    /* 拖动: 抓手 = .mpop-head; 首次拖动转 fixed 定位并锁定当前尺寸, 松手保持;
       头部至少 120px 留在视口内; 节标题(.vhead)是折叠按钮, 不与拖动冲突 */
    const head = panel && panel.querySelector('.mpop-head');
    if (head && panel) {
      let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
      head.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.mpop-close')) return;      /* 关闭按钮可点 */
        dragging = true;
        const r = panel.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.left = r.left + 'px';
        panel.style.top = r.top + 'px';
        panel.style.margin = '0';
        panel.style.width = r.width + 'px';
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        head.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      head.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        const x = Math.min(Math.max(ox + (e.clientX - sx), -panel.offsetWidth + 120), window.innerWidth - 120);
        const y = Math.min(Math.max(oy + (e.clientY - sy), 0), window.innerHeight - 60);
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
      });
      const stopDrag = function () { dragging = false; };
      head.addEventListener('pointerup', stopDrag);
      head.addEventListener('pointercancel', stopDrag);
    }
  } else if (solveToggle) {
    solveToggle.style.display = 'none';
  }

  if (grid) {
    sideToggle.onclick = function () { applySide(grid.classList.contains('side-collapsed')); };
    applySide(true);                        /* 默认展开 */
    /* 标签组锚在画布垂直中心(画布高度随 fitCanvas/resize 变化, 需 JS 定位) */
    function placeTabs() {
      tabs.style.top = (canvas.offsetTop + canvas.offsetHeight / 2 - tabs.offsetHeight / 2) + 'px';
    }
    placeTabs();
    window.addEventListener('resize', placeTabs);
  } else {
    tabs.style.display = 'none';
  }

  return {
    syncRun: function () { syncRunToggle('run', state.running, o.runLabel, '⏸ 暂停'); }
  };
}
