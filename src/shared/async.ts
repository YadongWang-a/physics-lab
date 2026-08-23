function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

/** 给异步操作加超时，防页面主线程卡死拖住调用方 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw new Error('页面执行超时')
    })
  ])
}

export { delay, withTimeout }
