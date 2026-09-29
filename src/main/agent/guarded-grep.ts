import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { Type } from 'typebox'
import { createGrepToolDefinition, defineTool } from '@earendil-works/pi-coding-agent'

/**
 * grep 工具拦截：`lib/*.js` 源码不可检索（ADR-0003 修订，与 guarded-read 同一策略）。
 *
 * 实测：模型被拦住整读后会改成反复 grep 同一个文件（一回合 5–12 次），同样是一次模型往返；
 * 因此 read 与 grep 一起收口，把"有哪些助手、签名如何"引到 `lib/INDEX.md` 与 drawing.md §4/§5，
 * 把"行为/时序"引到 `check_demo` 的沙箱实测。
 */
const TIP =
  '助手清单见 `lib/INDEX.md`(自动生成: 全部助手与签名); 参数细节见 skill 的 `drawing.md` §4/§5; ' +
  '行为或时序拿不准时, 调 `check_demo` 拿沙箱实测。页面代码与模板仍可正常检索。'

/** 与 SDK 内建 grep 同形的参数（同名覆盖时 schema 必须一致） */
const grepParameters = Type.Object({
  pattern: Type.String({ description: '正则（默认）；literal: true 时按字面量' }),
  path: Type.Optional(Type.String({ description: '搜索路径：文件或目录，默认工作目录' })),
  glob: Type.Optional(Type.String({ description: '限定文件 glob，如 **/*.html' })),
  ignoreCase: Type.Optional(Type.Boolean({ description: '忽略大小写' })),
  literal: Type.Optional(Type.Boolean({ description: '按字面量而非正则' })),
  context: Type.Optional(Type.Number({ description: '上下文行数' })),
  limit: Type.Optional(Type.Number({ description: '最多返回条数' }))
})

/** 命中返回拦截文案；未命中返回 null */
export function blockedLibGrep(cwd: string, target?: string): string | null {
  if (!target) return null
  const abs = isAbsolute(target) ? target : resolve(cwd, target)
  const dir = basename(dirname(abs))
  const isLibDir = basename(abs) === 'lib' && dir !== 'lib'
  if ((/\.js$/i.test(abs) && dir === 'lib') || isLibDir) {
    return `已拦截: lib/*.js 源码不可检索。${TIP}`
  }
  return null
}

/** 以 SDK 自带的 grep 定义为基座包一层：命中拦截规则返回提示，其余原样交给原生实现 */
export function guardedGrepTool(cwd: string) {
  const base = createGrepToolDefinition(cwd)
  return defineTool({
    ...base,
    description: `${base.description}（lib/*.js 源码不可检索：助手清单见 lib/INDEX.md，行为用 check_demo 实测）`,
    parameters: grepParameters,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const blocked = blockedLibGrep(ctx.cwd ?? cwd, params.path)
      if (blocked) return { content: [{ type: 'text' as const, text: blocked }], details: undefined }
      return base.execute(toolCallId, params, signal, onUpdate, ctx)
    }
  })
}
