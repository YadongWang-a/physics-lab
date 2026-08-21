/**
 * agent 调用链路错误分类：把模型/网络/配置类错误翻译成用户能看懂的中文提示。
 * 模型 API 抛出的错误多为带状态码的纯文本（如 "402 ... Insufficient Balance"、
 * "ENOTFOUND ..."、"401 Unauthorized"），这里按关键字归并。
 */

export type ErrorKind = 'balance' | 'auth' | 'notfound' | 'rate' | 'connect' | 'unknown'

export interface ClassifiedError {
  kind: ErrorKind
  title: string
  detail: string
  hint: string
}

function rawText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}

export function classifyError(err: unknown): ClassifiedError {
  const raw = rawText(err)
  const low = raw.toLowerCase()

  if (raw.includes('工作目录') || low.includes('workspace')) {
    return { kind: 'unknown', title: '请先选择工作目录', detail: raw, hint: '点击左上角选择工作目录后重试。' }
  }
  if (raw.includes('402') || low.includes('insufficient') || low.includes('余额')) {
    return { kind: 'balance', title: 'API Key 余额不足（402）', detail: raw, hint: '请到对应平台（opencode / DeepSeek）控制台充值后重试。' }
  }
  if (raw.includes('401') || low.includes('unauthorized') || low.includes('invalid api key') || low.includes('authentication')) {
    return { kind: 'auth', title: 'API Key 无效或未授权（401）', detail: raw, hint: '请到设置页检查 Key 是否正确并已保存。' }
  }
  if (raw.includes('429') || low.includes('rate limit') || low.includes('too many requests')) {
    return { kind: 'rate', title: '请求过于频繁（429）', detail: raw, hint: '请稍等几秒后再试。' }
  }
  if (raw.includes('404') || low.includes('not found')) {
    return { kind: 'notfound', title: '接口或模型不存在（404）', detail: raw, hint: '请确认设置页的模型 id 与供应商配置正确。' }
  }
  if (
    low.includes('enotfound') || low.includes('econnrefused') || low.includes('etimedout') ||
    low.includes('timeout') || low.includes('fetch failed') || low.includes('econnreset') ||
    low.includes('network') || low.includes('无法连接') || low.includes('无法联通') || low.includes('proxy')
  ) {
    return { kind: 'connect', title: '无法连接模型服务', detail: raw, hint: '请检查网络连接、代理或防火墙设置后重试。' }
  }
  return { kind: 'unknown', title: '生成失败', detail: raw, hint: '如持续失败，请检查 API Key 与模型配置，或查看应用日志。' }
}

/** 面向用户的单行/多行友好文案（标题 + 处置建议；未知错误附原始信息） */
export function friendlyErrorMessage(err: unknown): string {
  const c = classifyError(err)
  if (c.kind === 'unknown') return `⚠️ ${c.title}：${c.detail}\n${c.hint}`
  return `⚠️ ${c.title}\n${c.hint}`
}
