/** Simulates network latency for mock service calls so loading states can be exercised in the UI. */
export function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
