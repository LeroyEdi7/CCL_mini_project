import type { Handler } from 'hono'

export function asyncHandler<THandler extends Handler>(
  handler: THandler
): (...args: Parameters<THandler>) => Promise<Awaited<ReturnType<THandler>>> {
  const invoke = handler as (...args: Parameters<THandler>) => ReturnType<THandler>
  const wrapped = async (...args: Parameters<THandler>) => await invoke(...args)
  return wrapped as (...args: Parameters<THandler>) => Promise<Awaited<ReturnType<THandler>>>
}
