// A/B 对比（一次性）：读 .scratch/perf/session-<arm>.txt 与 trace-<arm>.log
// 用法: node .scratch/perf/compare.mjs before after
import { readFileSync } from 'node:fs'

const arms = process.argv.slice(2)
const num = (s, re) => {
  const m = s.match(re)
  return m ? Number(m[1]) : 0
}

const rows = arms.map((arm) => {
  let summary = ''
  try {
    summary = readFileSync(`.scratch/perf/session-${arm}.txt`, 'utf8')
  } catch {
    summary = ''
  }
  let trace = ''
  try {
    trace = readFileSync(`.scratch/perf/trace-${arm}.log`, 'utf8')
  } catch {
    trace = ''
  }
  const ends = [...trace.matchAll(/← 流结束 chunk=(\d+) 字节=(\d+) 用时=([\d.]+)s 最大块间间隔=([\d.]+)s/g)]
  const bytes = ends.map((m) => Number(m[2]))
  const durs = ends.map((m) => Number(m[3]))
  const reqs = num(trace, /(?:^|\n)→ POST/g) === 0 ? ends.length : trace.split('→ POST').length - 1
  return {
    arm,
    wall: num(summary, /墙钟=([\d.]+)s/),
    reqs: num(summary, /请求=(\d+)/) || reqs,
    out: num(summary, /输出=(\d+)tok/),
    reason: num(summary, /推理=(\d+)tok/),
    streams: ends.length,
    totalMB: (bytes.reduce((a, b) => a + b, 0) / 1e6).toFixed(1),
    maxMB: ((bytes.length ? Math.max(...bytes) : 0) / 1e6).toFixed(1),
    slowest: (durs.length ? Math.max(...durs) : 0).toFixed(1)
  }
})

const pad = (v, w) => String(v).padEnd(w)
console.log(pad('arm', 8) + pad('墙钟s', 9) + pad('请求', 6) + pad('输出tok', 10) + pad('推理tok', 10) + pad('流数', 6) + pad('总MB', 8) + pad('最大MB', 8) + '最慢单流s')
for (const r of rows) {
  console.log(
    pad(r.arm, 8) + pad(r.wall, 9) + pad(r.reqs, 6) + pad(r.out, 10) + pad(r.reason, 10) + pad(r.streams, 6) + pad(r.totalMB, 8) + pad(r.maxMB, 8) + r.slowest
  )
}
