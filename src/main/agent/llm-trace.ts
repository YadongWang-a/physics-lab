/**
 * 调试模式：把与 LLM 的原始交互（请求摘要 / 响应头耗时 / 每个 chunk 的字节数与块间间隔 /
 * 流中断时的错误 name·message·cause）实时投给渲染层并落盘。
 *
 * 实现方式：包一层 `globalThis.fetch`。SDK 与 OpenAI 客户端在**调用时**才取 globalThis.fetch，
 * 所以运行中开关即时生效，不必重建会话；也不碰 SDK 内部（SDK 的 http-dispatcher 未从包入口导出）。
 *
 * 记录里不含密钥：Authorization 在请求头，摘要只读 body（模型/流式/思考档/消息数/工具数）。
 * 只在调试模式打开时产生输出；关掉后 fetch 原样透传。
 */
type Sink = (line: string) => void

let sink: Sink | null = null
let installed = false

const origFetch = globalThis.fetch
const sec = (ms: number): string => (ms / 1000).toFixed(1)

/** 错误摘要：cause.code 是区分"客户端超时掐"与"对端切流"的唯一线索（都是 message=terminated） */
function errText(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  const cause = err?.cause?.code ?? err?.cause?.message ?? ''
  return `name=${err?.name ?? '?'} message=${err?.message ?? '?'}${cause ? ` cause=${cause}` : ''}`
}

/** 请求体摘要（只读关键字段，不落全文） */
function bodySummary(body: unknown): string {
  if (typeof body !== 'string') return '(body 非字符串)'
  try {
    const j = JSON.parse(body) as Record<string, unknown>
    const msgs = Array.isArray(j.messages) ? j.messages.length : 0
    const tools = Array.isArray(j.tools) ? j.tools.length : 0
    return `model=${String(j.model)} stream=${String(j.stream)} thinking=${JSON.stringify(j.thinking)} effort=${String(j.reasoning_effort ?? '-')} max_tokens=${String(j.max_tokens ?? '-')} messages=${msgs} tools=${tools} body=${body.length}B`
  } catch {
    return `(body 非 JSON ${body.length}B)`
  }
}

/** 包一层响应体：逐 chunk 记录时间线，并捕获中断错误的 cause */
function tracedBody(res: Response): Response {
  if (!res.body) return res
  const reader = res.body.getReader()
  const started = Date.now()
  let last = started
  let chunks = 0
  let bytes = 0
  let maxGap = 0
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          sink?.(
            `  ← 流结束 chunk=${chunks} 字节=${bytes} 用时=${sec(Date.now() - started)}s 最大块间间隔=${sec(maxGap)}s`
          )
          controller.close()
          return
        }
        const now = Date.now()
        const gap = now - last
        if (gap > maxGap) maxGap = gap
        last = now
        chunks++
        bytes += value?.length ?? 0
        if (chunks === 1 || gap > 2000 || chunks % 100 === 0) {
          sink?.(
            `  chunk#${chunks} +${value?.length ?? 0}B 间隔=${sec(gap)}s 累计=${bytes}B @${sec(now - started)}s`
          )
        }
        controller.enqueue(value)
      } catch (e) {
        sink?.(
          `  ✗ 流中断 @${sec(Date.now() - started)}s chunk=${chunks} 字节=${bytes} 最大块间间隔=${sec(maxGap)}s ${errText(e)}`
        )
        controller.error(e)
      }
    },
    cancel(reason) {
      void reader.cancel(reason)
    }
  })
  return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers })
}

/** 打开/关闭调试追踪；首次打开时安装 fetch 包装（幂等，只装一次） */
export function setLlmTraceSink(next: Sink | null): void {
  sink = next
  if (installed) return
  installed = true
  type FetchArgs = Parameters<typeof fetch>
  globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response> => {
    if (!sink) return origFetch(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    sink(`→ ${init?.method ?? 'GET'} ${url} ${bodySummary(init?.body)}`)
    const t0 = Date.now()
    let res: Response
    try {
      res = await origFetch(input, init)
    } catch (e) {
      sink(`  ✗ 请求失败 @${sec(Date.now() - t0)}s ${errText(e)}`)
      throw e
    }
    sink(`  ← ${res.status} 首包=${sec(Date.now() - t0)}s type=${res.headers.get('content-type') ?? '-'}`)
    return tracedBody(res)
  }) as typeof fetch
}
