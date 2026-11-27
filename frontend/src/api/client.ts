/** Thin fetch helper for the FastAPI backend (proxied in Vite dev). */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export type HealthResponse = {
  status: string
  service: string
}

export function getHealth() {
  return api<HealthResponse>('/api/health')
}

/** Preloaded demo scenario. Server reads idealo from cache only: no live calls. */
export function getDemo() {
  return api<import('../types/inventory').DemoScenario>('/api/demo')
}
