// 会话时间去向分析（一次性诊断脚本，非产品代码）
// 用法: node .scratch/perf/timeline.mjs <session.jsonl> [--top N]
// 把一次生成拆成：模型请求延迟 / 工具执行 / 用户等待，并按「轮」汇总。
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const TOP = Number(process.argv[process.argv.indexOf('--top') + 1]) || 10
const raw = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))

const events = raw
  .filter((r) => r.type === 'message')
  .map((r) => {
    const m = r.message ?? {}
    const blocks = m.content ?? []
    const calls = blocks.filter((b) => b.type === 'toolCall')
    return {
      t: Date.parse(r.timestamp),
      role: m.role,
      tools: calls.map((c) => c.name),
      argsChars: calls.reduce((a, c) => a + JSON.stringify(c.arguments ?? {}).length, 0),
      textChars: blocks.filter((b) => b.type === 'text').reduce((a, b) => a + String(b.text ?? '').length, 0),
      stop: m.stopReason ?? '',
      err: m.errorMessage ?? '',
      u: m.usage
    }
  })
  .sort((a, b) => a.t - b.t)

const sec = (ms) => (ms / 1000).toFixed(1)

// 按「用户消息」切轮
const turns = []
for (const e of events) {
  if (e.role === 'user') turns.push({ start: e.t, events: [e] })
  else if (turns.length) turns[turns.length - 1].events.push(e)
}

console.log(`文件: ${file.split(/[\\/]/).pop()}  轮数: ${turns.length}`)
turns.forEach((turn, i) => {
  const ev = turn.events
  let model = 0
  let tool = 0
  let out = 0
  let hung = 0
  const reqs = []
  for (let k = 1; k < ev.length; k++) {
    const dt = ev[k].t - ev[k - 1].t
    if (ev[k].role === 'assistant') {
      model += dt
      const tok = ev[k].u?.totalTokens ?? 0
      out += ev[k].u?.output ?? 0
      if (!tok && dt > 60_000) hung += dt
      reqs.push({ dt, tok, cache: ev[k].u?.cacheRead ?? 0, o: ev[k].u?.output ?? 0, r: ev[k].u?.reasoning ?? 0, tools: ev[k].tools, args: ev[k].argsChars, stop: ev[k].stop, err: ev[k].err })
    } else if (ev[k].role === 'toolResult') tool += dt
  }
  const wall = ev[ev.length - 1].t - ev[0].t
  const outTok = out
  console.log(
    `\n轮 ${i + 1}: 墙钟 ${sec(wall)}s = 模型 ${sec(model)}s (${reqs.length} 次请求, 输出 ${outTok} tok) + 工具 ${sec(tool)}s` +
      (hung ? `  ⚠ 无 usage 的挂起请求合计 ${sec(hung)}s` : '')
  )
  for (const r of [...reqs].sort((a, b) => b.dt - a.dt).slice(0, TOP)) {
    console.log(
      `    ${sec(r.dt).padStart(7)}s  出${String(r.o).padStart(6)} 推理${String(r.r).padStart(5)} 总${String(r.tok).padStart(7)} 缓存${String(r.cache).padStart(7)}  参数${String(r.args).padStart(7)}字符  ${r.tools.join('+') || '文本'}` +
        (r.err ? `  错误=${r.err.slice(0, 60)}` : '') +
        (r.stop && r.stop !== 'stop' ? `  stop=${r.stop}` : '')
    )
  }
})
