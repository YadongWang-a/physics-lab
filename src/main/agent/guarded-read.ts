import { statSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { Type } from 'typebox'
import {
  createReadToolDefinition,
  defineTool
} from '@earendil-works/pi-coding-agent'

/**
 * read 工具拦截：`lib/*.js` 源码对 agent 不可读（ADR-0003 修订）。
 *
 * 背景（实测）：一回合 42–43 次工具调用里 23–27 次花在分段读/grep `common.js`——每轮一次
 * 模型往返（约 6–14 s），且这些内容每轮重付上下文。模型要的是"有哪些、签名如何"，由 seed
 * 生成的 `lib/INDEX.md` 与 skill 的 drawing.md §4/§5 回答；行为/时序问题用 `check_demo`
 * 在沙箱里真跑页面确认。
 *
 * CSS 与其它文件不受影响（类名等标记信息仍在 lib/common.css 与模板里）。
 */
export const LIB_READ_LIMIT_BYTES = 64 * 1024

/** 定向读允许的最大行数：非 js 的大文件仍可传 limit 只看一段 */
export const LIB_READ_MAX_LINES = 60

const TIP =
  '源码索引见 `lib/INDEX.md`(自动生成: 全部助手与签名); 参数细节见 skill 的 `drawing.md` §4/§5; ' +
  '行为或时序拿不准时, 调 `check_demo` 拿沙箱实测。'

/** 与 SDK 内建 read 同形的参数（同名覆盖时 schema 必须一致） */
const readParameters = Type.Object({
  path: Type.String({ description: '要读取的文件路径（相对工作目录或绝对路径）' }),
  offset: Type.Optional(Type.Number({ description: '起始行，1 基' })),
  limit: Type.Optional(Type.Number({ description: '最多读取行数' }))
})

const isLibJs = (abs: string): boolean => /\.js$/i.test(abs) && basename(dirname(abs)) === 'lib'

/**
 * 命中返回给模型的拦截文案；未命中返回 null。
 * lib/*.js 一律拦截（不给分段读的口子——分段读同样是一次往返，且模型会用它替代验证）；
 * 其它 `lib/` 下超过 64KB 的文件整读拦截、带 `limit ≤ 60` 的定向读放行。
 * 文件不存在时返回 null 是故意的：让原生 read 去报它自己的错误。
 */
export function blockedLibRead(cwd: string, target: string, limit?: number): string | null {
  const abs = isAbsolute(target) ? target : resolve(cwd, target)
  if (isLibJs(abs)) return `已拦截: lib/*.js 源码不可读。${TIP}`
  if (basename(dirname(abs)) !== 'lib') return null
  if (limit !== undefined && limit <= LIB_READ_MAX_LINES) return null
  let size: number
  try {
    size = statSync(abs).size
  } catch {
    return null
  }
  if (size <= LIB_READ_LIMIT_BYTES) return null
  return `已拦截整读 lib/${basename(abs)}（${Math.round(size / 1024)} KB）。定向读: \`read(path, offset, limit≤60)\` 只看某一段。${TIP}`
}

/**
 * 以 SDK 自带的 read 定义为基座包一层：命中拦截规则返回提示，其余原样交给原生实现。
 * 注册进 `customTools` 时同名（`read`）覆盖内建工具（SDK 按名注册，自定义者后置生效）；
 * 经 `defineTool` 包一层是因为 `customTools` 数组要求 AnyToolDefinition 兼容签名。
 */
export function guardedReadTool(cwd: string) {
  const base = createReadToolDefinition(cwd)
  return defineTool({
    ...base,
    description: `${base.description}（lib/ 下 >64KB 的文件需传 offset+limit≤${LIB_READ_MAX_LINES} 定向读，或改用 grep 与 drawing.md）`,
    parameters: readParameters,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const blocked = blockedLibRead(ctx.cwd ?? cwd, params.path, params.limit)
      if (blocked) return { content: [{ type: 'text' as const, text: blocked }], details: undefined }
      return base.execute(toolCallId, params, signal, onUpdate, ctx)
    }
  })
}
