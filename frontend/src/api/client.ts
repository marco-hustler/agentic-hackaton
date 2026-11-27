import type { DemoScenario, HouseholdItem, ItemValuation, SplitMode, SplitResult, ValuedItem } from '../types/inventory'

/** Thin fetch helper for the FastAPI backend (proxied in Vite dev). */

import type {
  AccountInfo,
  ProcessCreatePayload,
  ProcessKind,
  ProcessStatus,
  ProcessSummary,
} from '../types/process'

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

type ApiProcess = {
  id: string
  title: string
  kind: ProcessKind
  status: ProcessStatus
  participant_emails: string[]
  created_at?: string | null
  updated_at?: string | null
}

function mapProcess(p: ApiProcess): ProcessSummary {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    status: p.status,
    participantEmails: p.participant_emails ?? [],
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
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
  return api<DemoScenario>('/api/demo')
}

/** Deterministic solver, a few ms. Never touches idealo or an LLM. */
export function solveSplit(body: {
  party_a_name: string
  party_b_name: string
  mode: SplitMode
  valued_items: ValuedItem[]
}) {
  return api<SplitResult>('/api/solve', { method: 'POST', body: JSON.stringify(body) })
}

/** Recompute depreciation + fair value after a condition/year edit (0 MCP calls). */
export function reapplyDepreciation(item: HouseholdItem, valuation: ItemValuation) {
  return api<ItemValuation>('/api/reapply-depreciation', {
    method: 'POST',
    body: JSON.stringify({ item, valuation }),
  })
}

export type IdealoStatus = { live_enabled: boolean; logged_in: boolean; used?: number; limit?: number }

/** Live flag + today's budget. Reads local state only. */
export function getIdealoStatus() {
  return api<IdealoStatus>('/api/idealo/status')
}

export function getMe() {
  return api<AccountInfo>('/api/me')
}

export async function listProcesses() {
  const rows = await api<ApiProcess[]>('/api/processes')
  return rows.map(mapProcess)
}

export async function createProcess(payload: ProcessCreatePayload) {
  const created = await api<ApiProcess>('/api/processes', {
    method: 'POST',
    body: JSON.stringify({
      kind: payload.kind,
      title: payload.title ?? null,
      participant_emails: payload.participantEmails ?? [],
    }),
  })
  return mapProcess(created)
}

export async function getProcess(id: string) {
  const row = await api<ApiProcess>(`/api/processes/${id}`)
  return mapProcess(row)
}
