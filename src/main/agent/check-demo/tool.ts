import { Type } from 'typebox'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { DemoChecker } from './runtime-check'
import { runChecks } from './run-checks'

/**
 * check_demo —— agent 的唯一自定义工具（ADR-0003）。
 * 静态检查（语法/ID/骨架）+ 运行时断言（沙箱加载/状态/画布/自定义断言），
 * 返回结构化 {ok, issues[]}；检查失败不视为工具错误（agent 据此修复重跑）。
 */
let checker: DemoChecker | null = null
// 惰性创建：模块顶层在 app ready 前，BrowserWindow 必须 ready 后才可建
function getChecker(): DemoChecker {
  if (!checker) checker = new DemoChecker()
  return checker
}

export const checkDemoTool = defineTool({
  name: 'check_demo',
  label: '检查演示',
  description:
    '对生成的演示 HTML 做自检（skill 第 7 步的机械化部分，取代 node --check）：' +
    '静态检查（末段 script 语法编译、$(\'id\')↔id 交叉核对、骨架标记 startLoop/setupScene、禁手写动画循环）' +
    '与运行时断言（沙箱加载 console 错误、演示状态 NaN、画布非空白、可选自定义断言片段）。' +
    '返回 JSON：{ok: boolean, issues: [{level, code, message}]}。' +
    '失败时根据 issues 修复后重新调用 check_demo，直到 ok=true 为止。' +
    '参数：file 为相对工作目录的 HTML 文件名；assertions 为可选 JS 表达式数组（truthy 通过，可写能量守恒等物理断言）。',
  promptSnippet: 'check_demo(file, assertions?) — 自检演示 HTML（语法/ID/骨架/运行时），返回 {ok, issues}，失败修复重跑',
  parameters: Type.Object({
    file: Type.String({ description: '相对工作目录的演示 HTML 文件名' }),
    assertions: Type.Optional(
      Type.Array(Type.String({ description: '在页面上下文执行的 JS 表达式（truthy 通过）' }))
    )
  }),
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const result = await runChecks(ctx.cwd, params.file, getChecker(), params.assertions)
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      details: result
    }
  }
})
