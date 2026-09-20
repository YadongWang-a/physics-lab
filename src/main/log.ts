/**
 * 主进程执行过程日志（唯一入口）。
 *
 * 背景：agent 回合、工具调用、自检、会话绑定这些业务链路此前零日志，只有窗口/崩溃
 * 事件走 console；打包后 Windows GUI 无控制台，现场故障（"生成完了但列表没联动"、
 * "图片识别失败"）事后完全查不到。这里提供统一落点：
 * - 同时写 stderr（dev 终端可见）与 `<userData>/logs/app-YYYYMMDD.log`（按天分文件）
 * - 级别过滤：环境变量 `PHYSICS_LAB_LOG=debug|info|warn|error|off`，缺省 info
 * - 每行带本地时间戳/级别/scope，字段 `k=v` 追加（长值与堆栈截断，避免落 HTML 正文）
 *
 * 不 import electron：便于 vitest 直接调用；落盘目录由 main 在 app ready 后 initFileLog。
 * 写日志失败绝不抛出——日志是旁路，不能反过来打断业务。
 */
import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
/** 普通字段值上限：write/edit 的 HTML 正文可达数百 KB，只留摘要 */
const MAX_FIELD_CHARS = 400
/** 堆栈上限（第一手排障信息，给宽一些） */
const MAX_STACK_CHARS = 2000
/** 日志保留天数，init 时清理过期文件 */
const KEEP_DAYS = 7

let threshold = resolveThreshold()
let dir: string | null = null
let fileDisabled = false
let currentDay = ''
let currentFile = ''

function resolveThreshold(): number {
  const raw = (process.env.PHYSICS_LAB_LOG ?? 'info').trim().toLowerCase()
  if (raw === 'off' || raw === 'silent' || raw === 'none') return Number.POSITIVE_INFINITY
  return WEIGHT[raw as LogLevel] ?? WEIGHT.info
}

/** 初始化落盘目录；未调用时只写 stderr（冒烟/单测无需落盘） */
export function initFileLog(logDir: string): void {
  threshold = resolveThreshold()
  try {
    mkdirSync(logDir, { recursive: true })
    pruneOldFiles(logDir)
    dir = logDir
    fileDisabled = false
  } catch (err) {
    emit('warn', 'log', '日志目录不可用，降级为仅 stderr', { dir: logDir, error: err }, false)
  }
}

export function log(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: Record<string, unknown>
): void {
  emit(level, scope, message, fields, true)
}

/** 错误专用：字段序列化会带上 message + stack */
export function logError(
  scope: string,
  message: string,
  error: unknown,
  fields?: Record<string, unknown>
): void {
  emit('error', scope, message, { ...fields, error }, true)
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields: Record<string, unknown> | undefined,
  toFile: boolean
): void {
  if (WEIGHT[level] < threshold) return
  const line = `${stamp()} ${level.toUpperCase().padEnd(5)} ${scope}: ${message}${formatFields(fields)}\n`
  process.stderr.write(line)
  if (!toFile || !dir || fileDisabled) return
  try {
    appendFileSync(fileForToday(), line)
  } catch (err) {
    // 只降级一次，避免每条日志都刷一行失败
    fileDisabled = true
    process.stderr.write(`${stamp()} WARN  log: 落盘失败，本次运行仅 stderr ${formatFields({ error: err })}\n`)
  }
}

function fileForToday(): string {
  const now = new Date()
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  if (day !== currentDay) {
    currentDay = day
    currentFile = join(dir!, `app-${day}.log`)
  }
  return currentFile
}

function pruneOldFiles(logDir: string): void {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000
  for (const name of readdirSync(logDir)) {
    const m = /^app-(\d{4})(\d{2})(\d{2})\.log$/.exec(name)
    if (!m) continue
    const fileDay = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    if (fileDay < cutoff) rmSync(join(logDir, name), { force: true })
  }
}

function stamp(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatFields(fields: Record<string, unknown> | undefined): string {
  if (!fields) return ''
  let out = ''
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    const text = clip(fieldText(value), value instanceof Error ? MAX_STACK_CHARS : MAX_FIELD_CHARS)
    out += /[\s"]/.test(text) ? ` ${key}="${text.replace(/"/g, "'")}"` : ` ${key}=${text}`
  }
  return out
}

function fieldText(value: unknown): string {
  if (value instanceof Error) {
    // stack 首行已含 message；自身可枚举属性（code/syscall/path 等排障关键字段）附在末尾
    let extra = ''
    try {
      const own = Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== 'message' && key !== 'stack')
      )
      if (Object.keys(own).length > 0) extra = ` ${JSON.stringify(own)}`
    } catch {
      /* 循环引用等：只留 stack */
    }
    return `${value.stack ?? value.message}${extra}`
  }
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** 折叠换行（一条日志一行）并按上限截断 */
function clip(text: string, max: number): string {
  const flat = text.replace(/\s*\r?\n\s*/g, '\\n')
  return flat.length > max ? `${flat.slice(0, max)}…(+${flat.length - max})` : flat
}
