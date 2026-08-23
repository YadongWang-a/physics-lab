# 绘制细则与 lib API 参考 (drawing)

SKILL.md「绘制」节的细则部分, 绘制场景时按需读取(2D 与 3D 通用规则; 冲突以模板槽位注释为准)。
`lib/common.js` 是唯一真相源: 本文件 API 参考以它为准, 改动 common.js 必须同步本文件。

## 0. 助手优先

所有标准件(球/物块/绳/弹簧/轨道/力箭头/虚线/角度弧/守恒监测/主循环)用 lib 助手与公式库, 禁止手写等价代码。
助手内置样式与题面/推导需求不符时(见 §10 怪癖), 手写**该元素**, 风格与助手一致; 不要为对齐风格整段手写。

## 1. 单位约定(2D, 防"尺寸写成像素"类 bug)

- transform 之后**所有尺寸(线宽/半径/字号/虚线间隔)一律用世界单位**, 1 世界单位 = V.s 像素; 坐标用 `X(x)` 原样、`Y(y)` = −y(y 上正→画布下正)。
- 像素↔世界的换算只在 transform 处发生一次; 画布内任何"px"出现即视为错误, 例外: font 字符串如 `'0.11px sans-serif'` 中字号 `0.11` 是世界单位的标准写法。
- 每个 `ctx.fillText` 前显式设置 font/textAlign/textBaseline(drawArrow 等助手会改动这些状态, 画完复位)。

## 2. scale 约定(助手调用, 第一陷阱)

- 世界变换(translate(V.ox,V.oy)+scale(V.s,V.s))内调用助手**必须传 `scale=V.s`**; 屏幕空间/图表面板调用传 1 或不传。
- 助手内部像素常量(线宽/箭头/字号/标签偏移/**dash 数组**)一律 ÷scale, 屏幕上保持恒定像素。
- **opts.lw / opts.dash 传屏幕像素**(如 `lw:2.2`, `dash:[6,5]`)——世界单位 × V.s 换算(如规则表线宽 0.022 → `lw:0.022*V.s`), 或直接给目标屏幕 px。
- **几何尺寸(r/hw/hh/长度/角度弧半径)是世界单位**, 不换算。
- 漏传 `scale=V.s` 的症状: 线细到看不见、箭头/字号小到不可读——自检必查项。

## 3. 视觉规则表(2D, 世界单位)

| 元素 | 规则 | 助手 |
|---|---|---|
| 小球 | 半径 0.045~0.06 恒定(≈4.5~6px), **禁止随运动/质量改变大小**; 径向渐变填充 + 细描边(≈r·0.15); 标签 r≥6px 内置白字, 否则球旁偏移 | `ball`(r 世界单位) |
| 方块物块(重物/滑块) | 边长 0.22~0.26(≈30px) 恒定; 上浅下深线性渐变 + 描边 0.022; 标签居中内置; 绳系物块时接顶边中心 | `block`(hw,hh 世界单位) |
| 辅助线(虚线/参照/网格) | 线宽 ≤0.016(≈1.6px); 参照虚线/虚影轮廓一律黑色(轨迹按图例配色) | `dashLine`/`dashRect`/`dashCircle` |
| 轻绳 | 线宽 0.015(≈2px), 黑色 | `rope` |
| 主线(轨道/杆) | 线宽 0.02~0.025(≈2.2px) | `track`/`rod`/`ground`/`inclinedPlane`/`wall` |
| 弹簧 | 13 圈, 振幅 0.07, 直线导程 0.11, 线宽 0.022 | `spring`(coils:13, amp:0.07, lead:0.11*V.s, lw:0.022*V.s) |
| 字号 | 0.1~0.13(≈10~13px) | 手写 fillText 或 `multiLabel`(size px) |
| 矢量箭头 | `drawArrow`/`forceArrows` 保持 2.5px 线宽/10px 箭头/10px 标签 | 助手内置 |

- **缩放钳制(防"机构太大、物块变小")**: 机构尺度(绳长/摆长/行程)远大于物块时, fitView 会把物块放大到过小; 把 `view()` 的 s 钳制在合理区间(如 2D s∈[55,160], 物块 ≥ ~25px), 保证物块可辨识; 用户仍可用视口按钮缩放。
- 规则表数值是世界单位; 传给助手 `lw`/`dash` 时 ×V.s 转 px(见 §2)。

## 4. 绘制助手 API (lib/common.js, 全量)

统一约定: 颜色未指定取内置默认; 需要主题色时调 `palette()` 变量(`C.ballLo`/`C.red`/`C.txt`/…)。每个助手绘制后复位 `textBaseline='alphabetic'`。opts 未列键取默认; `lw`/`dash` 屏幕像素、几何尺寸世界单位、`scale` 默认 1。

### 顶层工具

- `$(id)` → 元素(getElementById 简写)
- `clamp(v,a,b)` → 数值钳制
- `palette()` → C: 一次性缓存全部 CSS 画布变量(静态, 加载后不变)。顶层 `C.ballHi`/`C.ballLo`/`C.ballSt`/`C.ballTxt`/`C.ground`/`C.groundHatch`/`C.ruler`/`C.rulerTick`/`C.dimTxt`/`C.txt`/`C.arcFill`/`C.arcStroke`/`C.traj`/`C.para`/`C.base`/`C.spring`/`C.grid` + `C.canvas.*` 同值 + 主题 `C.red`/`C.blue`/`C.green`/`C.orange`/`C.purple`/`C.cyan`
- `fitView(w,h,xMin,xMax,yMin,yMax,pad?)` → `{s,ox,oy}`; pad 默认 `{l:40,r:20,t:20,b:30}`, `s=min(sx,sy)` 保持纵横比
- `fitCanvas(c)` → `{ctx,w,h}`: DPR 适配; 高度 = max(HTML height 属性, 65% 视口高)
- `deg2rad(d)` / `rad2deg(r)` / `lerp(a,b,t)`

### A. 刚体与机构

- **A1 `ball(ctx,x,y,r,opts)`** 渐变球。opts: `hi,lo`(径向渐变),`st`(描边色),`txt`(标签色),`lw`, `label`(字符串或 parts 数组),`font`, `ghost`(true=虚线轮廓),`color`(ghost 色),`dash`, `gx,gy`(渐变中心偏移, 默认 r*0.4),`r0`(渐变内半径, 默认 r*0.15),`scale`
- **A2 `block(ctx,x,y,hw,hh,opts)`** 方块物块, 中心 (x,y)。opts: `hi,lo`(上浅下深线性渐变),`st,txt,lw`, `label,labelY,font`, `dash`(虚线状态框),`scale`
- **A3 `rod(ctx,x1,y1,x2,y2,opts)`** 轻杆, **圆端帽**(lineCap:round)。opts: `color,lw,scale`
- **A4 `rope(ctx,pts,opts)`** 绳/软线折线(pts 世界坐标数组); pts.length===2 且 `opts.sag` 给定 → 中点垂线下坠(sag 世界单位)。opts: `color,lw,sag,dash,scale`
- **A5 `spring(ctx,x1,y1,x2,y2,opts)`** 弹簧线圈。opts: `coils`(6),`amp`(振幅, 世界单位, 默认 span*0.05),`lead`(直线导程 px, 默认 min(10, len*0.08)),`N`(采样段数, 默认 max(60, coils*12)),`color,lw,scale`
- **A6 `pulley(ctx,x,y,r,opts)`** 定滑轮(外圈+轮毂+轴心)。opts: `color,fill,hub`(r*0.35),`axle`(r*0.12), `rope:[a0,a1]`(绳绕弧, 世界弧度),`ropeColor,ropeGap,ccw,lw,scale`
- **A7 `roller(ctx,x,y,r,opts)`** 滚筒/滚轮。opts: `color,spokes`(0=无辐条),`lw,scale`
- **A8 `track(ctx,x1,y1,x2,y2,opts)`** 轨道, 默认双线。opts: `width`(轨距, 世界单位, 默认 0.08),`single`(true=单线),`ticks`(端刻线),`tickLen`, `color,lw,scale`
- **A9 `ground(ctx,x1,x2,y,opts)`** 地面横线+剖面斜线。opts: `color,lw,hatch`(默认 true),`hatchStep`(世界单位, 默认 0.06), `label,labelColor,font,labelDy`(世界单位),`scale`
- **A10 `inclinedPlane(ctx,x1,y1,x2,y2,opts)`** 斜面+法向剖面线。opts: `color,lw,hatchStep`(默认 L/10), `label,labelColor,font,labelDx,labelDy`, `scale`
- **A11 `wall(ctx,x,y1,y2,opts)`** 墙壁竖线+剖面线(向 side 侧)。opts: `color,lw,hatch`(默认 true),`hatchStep`(0.08),`side`(-1), `label,font`, `scale`
- **A12 `joint(ctx,x,y,r,opts)`** 结点/铰接/轴心, 实心圆+描边(r 世界单位)。opts: `fill,color,lw,scale`
- **A13 `poly(ctx,pts,opts)`** 闭合多边形/面片(3D 桌面/墙面)。opts: `fill,stroke,lw,scale`

### B. 矢量与力

- **`drawArrow(ctx,x1,y1,x2,y2,color,label,scale?,dash?)`** 独立签名(非 opts): 杆+箭头+可选标签。label 传 null 不画; dash 像素数组; 内置 2.5px 线宽/10px 箭头/10px bold 标签, 每个 fillText 前设 font/textAlign/textBaseline 后复位。
- **B1 `forceArrows(ctx,ox,oy,forces,opts)`** 共点力系束(同物体诸力共一个受力点)。`forces=[{x,y,color,label}]` 终点世界坐标; label 为字符串 → drawArrow 标签, 为 parts 数组 → 端点旁 multiLabel。opts: `font,scale`
- **B2 `vecComp(ctx,ox,oy,vx,vy,opts)`** 正交分解(力平行四边形): 主矢量实线 + 两虚线分量箭头 + 平行四边形补边。opts: `color,compColor,dash`(px),`lw,label`(主矢量),`compLabels:[h,v]`, `font,scale`
- **B3 `forceTriangle(ctx,pts,opts)`** 力三角形: 沿顶点依次画箭头, **默认只画 n−1 支**(闭合边须 `closed:true` 才画, 虚线)。`pts=[{x,y,color,label}]`。opts: `closed,dash,lw,scale`
- **B4 `arcArrow(ctx,x,y,r,a0,a1,opts)`** 圆弧箭头(力矩/转动): 半径 r 世界单位, a0→a1 弧度(ccw 反向绕), 末端切线箭头。opts: `color,lw,dash,ccw,label,font,labelR`(标签半径系数 1.3),`scale`
- **B5 `traj(ctx,pts,opts)`** 轨迹折线(pts 世界坐标数组)。opts: `color,dash,lw,scale`

### C. 标注与几何

- **C1 `multiLabel(ctx,x,y,parts,opts)`** 多段标签(主+下标+尾注), 恒 **bold**。`parts=[{t,sub,color}]` 或字符串; 下标 0.62× 字号、下沉 subDy× 字号。opts: `size`(主字号 px, 默认 11),`scale,align`('c'|'l'|'r'),`gap`(0.16),`subDy`(0.28),`baseline`('middle'|'alphabetic', 默认 **alphabetic**)
- **C2 `label(ctx,x,y,text,opts)`** multiLabel 单段便捷形式
- **C3 `dimLine(ctx,x1,y1,x2,y2,lbl,opts)`** 尺寸线: 主线 + 两端垂直刻线 + 标签(沿线法向偏置)。opts: `color,lw,font,tick`(刻线半长 px 4),`labelOffset`(px 10),`align,dash,scale`
- **C4 `angleArc(ctx,x,y,r,a0,a1,opts)`** 角度弧 + 标签(角平分线外侧)。opts: `color,label,labelColor,font,dash,ccw,rFactor`(1.3),`lw,scale`
- **C5 `dashLine(ctx,x1,y1,x2,y2,opts)`** 虚线线段。opts: `color,lw,dash`(px, 默认 [8,6]),`scale`
- **C6 `dashRect(ctx,x,y,w,h,opts)`** 虚线矩形(状态框), 中心 (x,y)。opts 同 dashLine
- **C7 `dashCircle(ctx,x,y,r,opts)`** 虚线圆(参考/状态轮廓)。opts 同 dashLine
- **C8 `dot(ctx,x,y,opts)`** 关键点。opts: `color,r`(px, 默认 2.5),`scale`
- **C9 `marker(ctx,x,y,kind,opts)`** 特殊标记: kind='cross'|'star'|'tri'|'ring'。opts: `color,size`(px, 默认 7),`lw,scale`
- **C10 `axis(ctx,x0,y0,opts)`** 坐标轴(图线用): +x/−y 两轴 + 箭头 + 刻度。opts: `color,lw,font,xLen,yLen,ticks:[nx,ny],labels:[xLabel,yLabel],arrow`(默认 true),`scale`

### D. 图线与面板

- **D1 `plotLine(ctx,map,fn,t0,t1,n,opts)`** 函数曲线: `map={x:v=>px, y:v=>px}`(chartPanel 返回或手写), `fn(t)→值`, 采样 n 段。opts: `color,lw,dash,scale`
- **D2 `plotPoints(ctx,map,pts,opts)`** 数据点: `pts=[{x,y}]`(值域, 经 map 映射)。opts: `color,r`(px 2.5),`scale`
- **D3 `chartPanel(ctx,x,y,w,h,opts)`** 图表面板(**屏幕空间**, 面板外调用): 面板底+边框+标题+网格, 返回映射器 `{x(v),y(v),x0,x1,y0,y1}`。opts: `title,xMin,xMax,yMin,yMax`(必需),`pad:{l,r,t,b}`, `bg,border,font,titleColor,grid`(默认 true),`gridColor,xTicks`(5),`yTicks`(4),`scale`
- **D4 `grid(ctx,x0,y0,x1,y1,step,opts)`** 网格背景(世界坐标)。opts: `color,lw,scale`

### E. 状态与特效

- **E1 `glow(ctx,x,y,r,f,opts)`** 碰撞发光/冲击波: f∈[0,1] 进度, 径向渐变光圈+膨胀环。opts: `stops:[内,外]`(默认白→橙透明),`fill`(默认 true; false=只画环),`spread`(环膨胀, 默认 r*1.6),`ring,lw,scale`
- **E2 `ghost(ctx,x,y,w,h,opts)`** 状态虚线参照(末态轮廓): 虚线框+顶部标签。opts: `color,lw,dash,label,labelColor,font,labelDy`(px, 默认 8),`scale`

### F. 场与电路

- **F1 `fieldArrow(ctx,x1,y1,x2,y2,opts)`** 场线箭头(匀强场/磁感线): 细、低对比灰; 杆+头同一条闭合路径(像素稳定)。opts: `color`(默认 #808692),`head`(px 4),`headW`(px 1.8),`scale`
- **F2 `fieldEnd(ctx,x,y,opts)`** 场线端视: ⊙(出纸面)/ ×(入纸面)。opts: `r`(px 3),`dir`('out'|'in'),`color,lw,scale`

## 5. 物理公式与计算库 (lib/common.js, 全量)

角度一律弧度(deg2rad 转换)。返回对象命名: `{x,v}` / `{vA,vB}` / `{Fx,Fy}` 等。页面禁止重写等价公式。

### G. 公式

- 一维碰撞: `elastic1D(vA,vB,mA,mB)` → `{vA,vB}`(完全弹性: 动量+动能守恒); `inelastic1D(vA,vB,mA,mB)` → `{vA,vB}`(完全非弹性: 粘连共速); `eRestitution(vA,vB,vA2,vB2)` → e(恢复系数)
- 运动学: `uniformMotion(v0,a,t)` → `{x,v}`(匀变速); `freeFall(t,g)` → `{y,v}`(静止下落); `vFromHeight(h,g)`; `hFromSpeed(v,g)`; `effGravity(g,th)`(斜面有效重力); `projXY(v0,th,h0,g,t)` → `{x,y}`(抛体轨迹点); `projFlight(v0,th,h0,g)`(落地时间); `projRange(v0,th,h0,g)`; `projMaxH(v0,th,h0,g)`; `criticalSpeed(g,R)`(竖直圆周最高点临界 v=√(gR))
- 简谐: `omega(k,m)`; `shmPeriod(k,m)`; `suggestSubstep(k,m)`(ω·dt<0.1 子步长)
- 能量: `KE(m,v)`; `PEg(m,g,h)`; `PEs(k,x)`
- 分解: `resolve(F,th)` → `{Fx,Fy}`

### H. 数值方法

- `bisect(fn,lo,hi,tol=1e-9)` → 根或 null(fn 单调变号)
- `solveQuad(a,b,c)` → 实根数组或 null
- `rk4(deriv,y,t,h)` → 推进后 y; `deriv(t,y)→dy/dt`, y 可为标量或数组(通用 RK4)
- `verlet2(accel,x,v,h)` → `{x,v}`: Velocity Verlet, **保守力系首选**(能量长期稳定)

## 6. 主循环与标准绑定 (lib/common.js)

- **`startLoop(S,{sub,step,render,postStep?,stopCheck?,mode?})`** 标准主循环, 各页不再手写 frame:
  - S 需含 `{running,last,speed?}`(speed 缺省按 1)
  - `sub`: 子步长(秒); 0/缺省 = 每帧调一次 step(dt)(解析单步)
  - `step(h)`: 物理推进, 只写这里
  - `postStep?`: 子步循环结束后钩子(如碰撞后处理、历史记录)
  - `stopCheck?`: 子步内提前停止判据(返回 true → running=false)
  - `mode?`: 仅 S.mode === mode 时推进(模式门控, 如 'anim')
  - dt≤0.05 限幅与 ×S.speed 已内置, 各页不得重写。
- `bindRangeNumber(rId,nId,parse,onChange)` 滑块↔数字输入双向绑定
- `setupKeyboard(state,resetFn,onResume?)` → cleanup(空格暂停/运行, R 重置)
- `setupViewport(canvas,vp,onChange,opts)` → `{zoomIn,zoomOut,reset,pan}`; opts.panDrag=false 时不绑拖拽平移(3D 拖拽留给旋转)
- `applyViewport(ctx,w,h,vp)` 应用视口变换(画布中心锚点), 调用方 ctx.save()/restore() 包裹; 页面坐标一律写世界值, zoom/pan 由本函数统一施加(元素间相对关系不畸变), 勿在坐标上手动换算
- `bindViewportButtons(canvas,vp,onChange,opts)` 绑定按钮 id: vpIn/vpOut/vpReset/vpUp/vpDown/vpLeft/vpRight
- `setupLegend(containerId,showObj,renderFn)` 图例条点击切换(S.show[k])
- `syncRunToggle(id,running,runLabel,pauseLabel)` 运行按钮文案同步(SC.syncRun 内部用)
- `panStep(canvas,dir)` → `{dx,dy}` 平移步长(画布尺寸 8%; dir: up/down/left/right), 供方向按钮用
- `startAnimation(frameFn)` 旧版动画启动(仅兼容存量页, 新页一律 startLoop)
- `setupConservation(parent,{items:[{label,getValue}],tol,ids:{panel}})` → `{check}` 守恒监测; render() 每帧调 check()
- **`setupScene(o)`** → `{syncRun}` 场景标准件注入(各页只调一次):
  - o = `{canvas, vp, state, render, resetFn, runLabel, panDrag, legend, onBeforeRun?, extraActions?, pen?}`
  - 注入 `.scene-actions`(运行/暂停+重置+缩放＋－还原+平移↑↓←→+画笔标注+动画倍速)到 canvas 之前; `.legendbar` 到 canvas 之后(legend 配置生成 → `state.show`; **无可切换量传 `legend:null`, 不生成图例栏**); `.side-tabs` 到画布右缘(齿轮=参数侧栏收起/展开, 书=解析弹层 .mpop 开/关; 页面无 .mpop 时「解析」标签自动隐藏)
  - 绑定: 运行切换/重置/视口(滚轮+拖拽+按钮)/键盘(空格/R)/倍速(绑 state.speed); 页面在 render() 末尾调返回的 `SC.syncRun()`
  - `onBeforeRun`: 从结束态重启钩子; `extraActions`: 额外动作组(如 3D 三视图 seg); `runLabel`: 运行按钮文案(如 '▶ 运行'/'▶ 同时释放'); `panDrag`: 2D=true 拖拽平移, 3D=false(拖拽留给旋转); `pen`: 默认 true 注入「✎ 画笔」标注(覆盖画布, 屏幕空间笔迹; 开启时接管鼠标画线、拖拽平移让位, 滚轮缩放仍可用; 再点一次退出并清空笔迹; 传 false 时按钮隐藏)

## 7. 力箭头

- 用 lib 助手(drawArrow/forceArrows/vecComp/forceTriangle, 见 §4.B), 世界变换内必须传 `scale=V.s`。
- **调用方**按最大力≈120px 给定长度(世界系 ≈1.0~1.1 单位)。
- 画布标签禁用 `F_N`/`F_f` 下划线写法: 用 multiLabel parts 下标(`[{t:'F'},{t:'N',sub:true}]`)或大小号两段绘制。
- 颜色: `palette()` 一次缓存所有 CSS 画布变量(静态, 加载后不变)。
- 三力平衡 → 力三角形或正交分解, 判据与画法见 SKILL.md 内容规则。

## 8. 守恒监测

用 lib 的 `setupConservation(parent,{items:[{label,getValue}],tol})` 实时算守恒量漂移, 超阈标红; render() 每帧调返回的 `check()`。按题配守恒律(无摩擦列能量/动量; 有摩擦不列能量)。

## 9. 积分器

- 保守力系用 Velocity Verlet(`verlet2(accel,x,v,h)`), 能量长期稳定。
- 子步长按刚度调: ω·dt < 0.1, ω=√(k/m) — 用 `suggestSubstep(k,m)`。
- 多变量耦合系统用 `rk4(deriv,y,t,h)`。

## 10. 助手风格怪癖(已知, 避免无谓手写/对抗)

- `multiLabel`/`label` 恒 **bold** 且默认 baseline='alphabetic'(非 middle): 需要与页面细体/middle 标签一致时, 单段标签直接手写 fillText。
- `rod` 圆端帽(lineCap:round): 需要平端主线(如粗糙水平杆)时手写 stroke。
- `forceTriangle` 默认只画 n−1 支箭头, 闭合边要 `closed:true`(虚线); 需要三支实线箭头闭合时, 用三次 drawArrow 手写。
- `ball`/`block` 内置标签走 multiLabel(bold): 与页面细体标签混排时, 标签手写 fillText, 本体仍用助手。

## 11. 3D 相机约定(template-3d)

- **坐标系**: 世界 y 竖直向上, x/z 为水平(半球/竖直面场景按此摆)。屏幕空间绘制, 助手 `scale` 传 1。
- **az/el 语义**(project3): `az` = 轨道方位角, 绕**世界竖直轴 y**(左右拖拽 → 水平环绕); `el` = 俯仰, 绕水平 X 轴(上下拖拽 → 垂直俯仰)。`el≈0` → 俯视(横 x 纵 z, 高度作深度); `el≈π/2` → 正对 x-y 竖直面(横 x 纵 y)。
- **三视图**(viewDefaults): 主=az 0/el 1.35, 俯=az 0/el 0.10, 侧=az π/2/el π/2(绕竖直轴转 90° 后正对 y-z 平面)。el 小=俯视、el 大=正视, 勿写反。
- **拖拽行为**(模板内置, 勿另写): 左右=水平环绕、上下=俯仰; 拖拽期间 `VLock` 锁定视口 fit(旋转轴不漂移、松手不跳变), 三视图切换 / 窗口 resize 时 `VLock=null` 重新 fit; 光标悬停 grab、拖拽 grabbing。
- **投影调用**: 场景平面坐标用 `w2s(u,v)`(@slot 决定 u,v→X,Y,Z); 任意 3D 点自写 `P(x,y,z)`(同 w2s 的换算, 见模板)。
