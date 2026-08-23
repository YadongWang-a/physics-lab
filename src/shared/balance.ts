/** DeepSeek 账户余额不足（402）判断 —— main 与测试共用 */
export function isInsufficientBalance(lastMessage: unknown): boolean {
  if (!lastMessage || typeof lastMessage !== 'object') return false
  const m = lastMessage as { role?: string; errorMessage?: unknown }
  if (m.role !== 'assistant' || typeof m.errorMessage !== 'string') return false
  return m.errorMessage.includes('402') || m.errorMessage.includes('Insufficient Balance')
}
