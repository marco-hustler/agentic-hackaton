import type { DemoScenario, HouseholdItem, ItemValuation, SplitMode, SplitResult, ValuedItem } from '../types/inventory'

/** Thin fetch helper for the FastAPI backend (proxied in Vite dev). */

import { credentialHeaders, llmConfiguredInSession, loadLlmCredentials } from '../auth/credentials'
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
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...credentialHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, formatApiErrorDetail(text) || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** FastAPI often returns `{"detail":"..."}` — surface that string to the UI. */
function formatApiErrorDetail(raw: string): string {
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
        .join('; ')
    }
  } catch {
    /* plain text */
  }
  return trimmed
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

/** The split agent: tries every strategy and proposes the fairest (deterministic, no LLM). */
export function agentSplit(body: { party_a_name: string; party_b_name: string; valued_items: ValuedItem[] }) {
  return api<SplitResult>('/api/solve/agent', { method: 'POST', body: JSON.stringify(body) })
}

/** Recompute depreciation + fair value after a condition/year edit (0 MCP calls). */
export function reapplyDepreciation(item: HouseholdItem, valuation: ItemValuation) {
  return api<ItemValuation>('/api/reapply-depreciation', {
    method: 'POST',
    body: JSON.stringify({ item, valuation }),
  })
}

export type IdealoStatus = { live_enabled: boolean; logged_in: boolean; used?: number; cap?: number; remaining?: number }

/** Live flag + today's budget. Reads local state only. */
export function getIdealoStatus() {
  return api<IdealoStatus>('/api/idealo/status')
}

export type LlmStatus = { configured: boolean; model?: string | null }

/** Whether AI object creation can run (session keys or server env). */
export async function getLlmStatus(): Promise<LlmStatus> {
  if (llmConfiguredInSession()) {
    return { configured: true, model: loadLlmCredentials().model || null }
  }
  return api<LlmStatus>('/api/llm/status')
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

/** Patch status and/or collaborator emails on a process. */
export async function updateProcess(
  id: string,
  patch: { status?: ProcessStatus; participantEmails?: string[] },
) {
  const body: Record<string, unknown> = {}
  if (patch.status !== undefined) body.status = patch.status
  if (patch.participantEmails !== undefined) body.participant_emails = patch.participantEmails
  const row = await api<ApiProcess>(`/api/processes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return mapProcess(row)
}

/** A house's own items + solver mode, stored server-side per process. */
export type ProcessInventory = {
  mode: SplitMode
  valued_items: ValuedItem[]
  /** Items included in the last Split; null = never split. */
  split_ids?: string[] | null
  updated_at?: string | null
}

/** Load this process's inventory (empty for new processes; never shared across houses). */
export function getProcessInventory(processId: string) {
  return api<ProcessInventory>(`/api/processes/${processId}/inventory`)
}

/** `keepalive` lets the last save finish while the page is closing. */
export function saveProcessInventory(processId: string, inventory: ProcessInventory, keepalive = false) {
  return api<ProcessInventory>(`/api/processes/${processId}/inventory`, {
    method: 'PUT',
    body: JSON.stringify({ mode: inventory.mode, valued_items: inventory.valued_items, split_ids: inventory.split_ids ?? null }),
    keepalive,
  })
}

/** A product from cached idealo searches (offline catalog, 0 MCP calls). */
export type CatalogHit = {
  product_ref: string
  name: string
  variant: string
  price_eur: number
  image_url: string | null
  url: string | null
  offer_count: number
  rating: number | null
  review_count: number
  category: string
}

export function searchCatalog(q: string, options?: { live?: boolean; signal?: AbortSignal }) {
  const params = new URLSearchParams({ q })
  if (options?.live) params.set('live', 'true')
  return api<CatalogHit[]>(`/api/catalog/search?${params.toString()}`, { signal: options?.signal })
}

/** A new house item valued from idealo (full offers + 30d history when cached or live MCP is on). */
export function catalogItem(hit: CatalogHit) {
  return api<ValuedItem>('/api/catalog/item?enrich=true', { method: 'POST', body: JSON.stringify(hit) })
}

export type ItemDraft = {
  name?: string | null
  price_eur?: number | null
  purchase_year?: number | null
  condition?: 'like_new' | 'good' | 'fair' | 'worn' | null
  category?: string | null
  importance?: number | null
  notes?: string | null
}

export type ItemDraftMessage = { role: 'user' | 'assistant'; content: string }

export type ItemDraftTurnResponse = {
  status: 'need_info' | 'ready' | 'rejected'
  assistant_message: string
  draft: ItemDraft
  missing_fields: string[]
  guardrail?: string | null
}

/** One conversational turn for AI object creation (asks until every required field is present). */
export function draftItemTurn(body: {
  messages: ItemDraftMessage[]
  draft?: ItemDraft
  party_a_name?: string
  party_b_name?: string
}) {
  return api<ItemDraftTurnResponse>('/api/items/draft', {
    method: 'POST',
    body: JSON.stringify({
      messages: body.messages,
      draft: body.draft ?? {},
      party_a_name: body.party_a_name ?? 'Alex',
      party_b_name: body.party_b_name ?? 'Sam',
    }),
  })
}

/** Materialise a valued item from explicit fields (static form or confirmed AI draft). */
export function createManualItem(body: {
  name: string
  price_eur: number
  purchase_year: number
  condition?: 'like_new' | 'good' | 'fair' | 'worn'
  category?: string
  importance?: number
  notes?: string
}) {
  return api<ValuedItem>('/api/items/manual', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
