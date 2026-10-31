/**
 * 并发控制工具。
 *
 * 刻意不用第三方库：需求只有两个——保序映射、限额遍历，
 * 自己实现能保证「中断即停止调度」这一语义可控。
 */

/**
 * 保序并发映射：最多 `limit` 个任务同时执行，结果按输入顺序返回。
 *
 * 任一项抛错则立即停止派发新任务，并把异常向上抛（已在执行的任务不会被打断）。
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  if (items.length === 0) return results

  const workerCount = Math.min(Math.max(1, Math.floor(limit) || 1), items.length)
  let cursor = 0
  let stopped = false

  const worker = async (): Promise<void> => {
    while (!stopped) {
      const index = cursor++
      if (index >= items.length) return
      try {
        results[index] = await fn(items[index], index)
      } catch (err) {
        stopped = true
        throw err
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}

/**
 * 限额遍历（不收集结果），用于「每项独立处理、单项失败不影响其他」的场景。
 *
 * - `fn` 内部的异常由调用方自行捕获，本函数不吞异常也不中断其他任务；
 * - `signal` 触发后不再派发新任务，已在执行的任务自然结束。
 */
export async function forEachLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (items.length === 0) return

  const workerCount = Math.min(Math.max(1, Math.floor(limit) || 1), items.length)
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (!signal?.aborted) {
      const index = cursor++
      if (index >= items.length) return
      await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
}
