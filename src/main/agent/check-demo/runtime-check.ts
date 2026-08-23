import { BrowserWindow } from 'electron'
import { delay, withTimeout } from '../../../shared/async'
import type { CheckIssue } from './static-check'

/**
 * check_demo 运行时断言（Electron 主进程）。
 * 复用单个隐藏沙箱窗口执行检查（避免连续创建/销毁窗口的加载竞态），
 * 内部串行队列防止并发 check 互相干扰（stop/loadFile/probe 交错）。
 * 捕获 console 错误、状态 NaN/发散、画布非空白，并执行自定义断言片段。
 */

const STATE_PROBE = `(() => {
  try {
    if (typeof S === 'undefined') return { found: false };
    const nan = [], inf = [];
    for (const [k, v] of Object.entries(S)) {
      if (typeof v !== 'number') continue;
      if (Number.isNaN(v)) nan.push(k);
      else if (!Number.isFinite(v)) inf.push(k);
    }
    return { found: true, nan, inf };
  } catch (e) { return { found: false, error: String(e) }; }
})()`

const CANVAS_PROBE = `(() => {
  const c = document.getElementById('scene');
  if (!c) return { canvas: false };
  let ctx = null;
  try { ctx = c.getContext('2d'); } catch (e) { /* 忽略，走 context:false */ }
  if (!ctx) return { canvas: true, context: false };
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonBlank = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] !== 0) { nonBlank++; if (nonBlank > 200) break; }
  }
  return { canvas: true, nonBlank };
})()`

export interface RuntimeCheckOptions {
  htmlPath: string
  /** agent 传入的自定义断言 JS 表达式（返回 truthy 通过） */
  assertions?: string[]
  /** 加载后等待帧数时间（ms），默认 800 */
  settleMs?: number
}

export class DemoChecker {
  private readonly win: BrowserWindow
  /** 串行队列：并发 check 排队执行，避免共享窗口竞态 */
  private queue: Promise<unknown> = Promise.resolve()

  constructor() {
    this.win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // 固定 partition：会话复用，避免反复新建 session 的加载抖动
        partition: 'persist:check-demo'
      }
    })
  }

  check(options: RuntimeCheckOptions): Promise<CheckIssue[]> {
    const run = this.queue.then(() => this.doCheck(options))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async tryLoad(htmlPath: string): Promise<true | false | 'timeout'> {
    return Promise.race([
      this.win.loadFile(htmlPath).then(
        () => true,
        () => false
      ),
      delay(20000).then(() => 'timeout' as const)
    ])
  }

  private async doCheck(options: RuntimeCheckOptions): Promise<CheckIssue[]> {
    const { htmlPath, assertions = [], settleMs = 800 } = options
    const issues: CheckIssue[] = []
    const consoleErrors: string[] = []
    const onConsole = (_e: unknown, level: number, message: string): void => {
      if (level >= 3) consoleErrors.push(message)
    }
    this.win.webContents.on('console-message', onConsole)
    try {
      // 清掉上一次可能残留的导航，避免排队卡死
      this.win.webContents.stop()
      const loadResult = await this.tryLoad(htmlPath)
      if (loadResult !== true) {
        // 间歇性加载失败：重试一次（仍失败才报告）
        const retry = await this.tryLoad(htmlPath)
        if (retry !== true) {
          issues.push({
            level: 'error',
            code: 'load-failed',
            message: `文件加载失败或超时：${retry === 'timeout' ? '20s 超时（已重试一次）' : htmlPath}`
          })
          return issues
        }
      }
      await delay(settleMs)

      if (consoleErrors.length > 0) {
        issues.push({
          level: 'error',
          code: 'console-error',
          message: `console 错误：${consoleErrors.slice(0, 5).join(' | ')}`
        })
      }

      const state = (await withTimeout(this.win.webContents.executeJavaScript(STATE_PROBE), 5000)) as {
        found: boolean
        nan?: string[]
        inf?: string[]
      }
      if (state.found && state.nan && state.nan.length > 0) {
        issues.push({
          level: 'error',
          code: 'state-nan',
          message: `演示状态含 NaN：${state.nan.join(', ')}`
        })
      }
      if (state.found && state.inf && state.inf.length > 0) {
        issues.push({
          level: 'warning',
          code: 'state-infinity',
          message: `演示状态含 ±Infinity（可能是哨兵，如未找到极值；确认是否预期）：${state.inf.join(', ')}`
        })
      }

      const canvas = (await withTimeout(this.win.webContents.executeJavaScript(CANVAS_PROBE), 5000)) as {
        canvas?: boolean
        context?: boolean
        nonBlank?: number
      }
      if (!canvas.canvas) {
        issues.push({ level: 'error', code: 'no-canvas', message: '未找到 <canvas id="scene">' })
      } else if (canvas.context === false) {
        issues.push({ level: 'error', code: 'no-canvas-context', message: 'canvas 2D 上下文不可用' })
      } else if ((canvas.nonBlank ?? 0) === 0) {
        issues.push({ level: 'error', code: 'blank-canvas', message: '画布全空白（未绘制任何内容）' })
      }

      for (const [i, expr] of assertions.entries()) {
        try {
          const ok = await withTimeout(this.win.webContents.executeJavaScript(`Boolean(${expr})`), 5000)
          if (!ok) {
            issues.push({
              level: 'error',
              code: 'assertion-failed',
              message: `自定义断言失败（第 ${i + 1} 条）：${expr.slice(0, 120)}`
            })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          issues.push({
            level: 'error',
            code: 'assertion-error',
            message: `自定义断言执行出错（第 ${i + 1} 条）：${message}`
          })
        }
      }
    } finally {
      this.win.webContents.removeListener('console-message', onConsole)
    }
    return issues
  }

  destroy(): void {
    this.win.destroy()
  }
}
