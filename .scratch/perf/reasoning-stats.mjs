// 会话推理成本统计（一次性诊断脚本，非产品代码）
// 用法: node .scratch/perf/reasoning-stats.mjs <session.jsonl> [...更多]
// 对应 ADR-0005 修订（S0/S1/S2）的验收指标：推理令牌 / 否决(✗)与犹豫(Hmm)计数 / 是否收敛 / 是否建文件。
import fs from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('用法: node .scratch/perf/reasoning-stats.mjs <session.jsonl> [...]')
  process.exit(1)
}

const pad = (v, w) => String(v).padEnd(w)
const num = (v, w) => String(v).padStart(w)

console.log(
  pad('会话', 26) + num('墙钟s', 8) + num('请求', 5) + num('输出tok', 9) + num('推理tok', 9) +
  num('think字', 9) + num('最大块', 9) + num('✗', 5) + num('Hmm', 6) + num('Let me', 7) + '  收尾/产物'
)

for (const f of files) {
  const rows = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  const msgs = rows.filter((r) => r.type === 'message')
  const user = msgs.find((m) => m.message.role === 'user')
  const asst = msgs.filter((m) => m.message.role === 'assistant')
  const think = asst.flatMap((a) => (a.message.content || []).filter((b) => b.type === 'thinking').map((b) => b.thinking))
  const all = think.join('\n')
  const tools = msgs.flatMap((m) => (m.message.content || []).filter((b) => b.type === 'toolCall'))
  const written = tools.filter((t) => ['write', 'edit'].includes(t.name)).map((t) => String(t.arguments?.path ?? '').split(/[\\/]/).pop())
  const usage = asst.map((a) => a.message.usage).filter(Boolean)
  const t0 = user ? Date.parse(user.timestamp) : 0
  const t1 = asst.length ? Date.parse(asst[asst.length - 1].timestamp) : 0
  const stops = asst.map((a) => a.message.stopReason).filter((s) => s && s !== 'toolUse')
  const start = (user?.message.content?.[0]?.text ?? '').split('\n')[0].slice(0, 24)

  console.log(
    pad(f.split(/[\\/]/).pop().slice(5, 26), 26) +
    num(((t1 - t0) / 1000).toFixed(1), 8) +
    num(asst.length, 5) +
    num(usage.reduce((a, u) => a + (u.output || 0), 0), 9) +
    num(usage.reduce((a, u) => a + (u.reasoning || 0), 0), 9) +
    num(all.length, 9) +
    num(Math.max(0, ...think.map((s) => s.length)), 9) +
    num((all.match(/✗/g) || []).length, 5) +
    num((all.match(/[Hh]mm/g) || []).length, 6) +
    num((all.match(/Let me/g) || []).length, 7) +
    `  ${stops.join(',') || 'toolUse'} | ${written.length ? [...new Set(written)].join(',') : '未建文件'} | ${start}`
  )
}
