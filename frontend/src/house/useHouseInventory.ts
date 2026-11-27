import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentSplit, getProcessInventory, reapplyDepreciation, saveProcessInventory } from '../api/client'
import type {
  AssignmentAction,
  DemoScenario,
  HouseholdItem,
  SplitMode,
  SplitResult,
  ValuedItem,
} from '../types/inventory'

/**
 * Editable inventory per house (process), stored in the backend DB.
 *
 * - Load: GET /api/processes/{id}/inventory (per process; new houses start empty).
 * - Edit: local state first, then a debounced re-solve and a debounced save.
 * - Leave the house or close the page: any pending save is flushed.
 *
 * Nothing here calls idealo: depreciation is recomputed server-side from the
 * stored valuation, and the split agent (deterministic) picks the strategy.
 */

type Entry = {
  valuedItems: ValuedItem[]
  /** Items the last Split included. New items wait in the middle until the next Split. */
  splitIds: string[]
  mode: SplitMode
  /** Null until the first solve with this house's names. */
  split: SplitResult | null
  /** Bumped on every item edit; solver results and saves are tagged with it. */
  version: number
  /** `version|mode|names` of the last applied solve. */
  solvedKey: string | null
  /** `version|mode` last written to the DB. */
  savedKey: string
}

const SOLVE_DEBOUNCE_MS = 250
const SAVE_DEBOUNCE_MS = 600
const REVALUE_FIELDS: (keyof HouseholdItem)[] = ['condition', 'purchase_year', 'depreciation_override']

const solveKeyOf = (e: Entry, names: [string, string]) => `${e.version}|${e.mode}|${names[0]}|${names[1]}`
const saveKeyOf = (e: Entry) => `${e.version}|${e.mode}`
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Placeholder split so the inventory tab can render before the first solve finishes. */
function pendingEmptySplit(mode: SplitMode, names: [string, string]): SplitResult {
  return {
    mode,
    party_a_name: names[0],
    party_b_name: names[1],
    assignments: [],
    total_fair_value_eur: 0,
    party_a_received_goods_eur: 0,
    party_b_received_goods_eur: 0,
    party_a_entitled_eur: 0,
    party_b_entitled_eur: 0,
    sell_pool_eur: 0,
    cash_transfer_a_to_b_eur: 0,
    cash_transfer_summary: 'Add household items to calculate a fair split.',
    party_a_points_won: 0,
    party_a_points_total: 0,
    party_b_points_won: 0,
    party_b_points_total: 0,
    fairness_score_pct: 100,
    is_envy_free: true,
    arbitrage_highlights: [],
    replacement_basket: [],
    mediator_summary: 'Add household items to calculate a fair split.',
  }
}

export type HouseInventory = {
  /** Same shape as /api/demo so the views read it unchanged. */
  scenario: DemoScenario | null
  /** Inventoried objects, available as soon as the house inventory has loaded. */
  itemCount: number | null
  error: string | null
  solving: boolean
  saving: boolean
  solveError: string | null
  updateItem: (id: string, patch: Partial<HouseholdItem>) => void
  setPoints: (id: string, a: number, b: number) => void
  forceAction: (id: string, action: AssignmentAction | null) => void
  setMode: (mode: SplitMode) => void
  addItem: (vi: ValuedItem) => void
  removeItem: (id: string) => void
  /** Items not split yet (added since the last Split). */
  unsplit: ValuedItem[]
  /** Ask the agent to split every item, including the waiting ones. */
  splitAll: () => void
}

type PendingSave = { pid: string; key: string; mode: SplitMode; items: ValuedItem[]; splitIds: string[] }

export function useHouseInventory(processId: string | null, names: [string, string], enabled: boolean): HouseInventory {
  const [byProcess, setByProcess] = useState<Record<string, Entry>>({})
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({})
  const [solveError, setSolveError] = useState<string | null>(null)
  /** Latest revalue request per item, so a slow response never overwrites a newer one. */
  const revalueSeq = useRef(new Map<string, number>())
  const pendingSave = useRef<PendingSave | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const entry = processId ? (byProcess[processId] ?? null) : null
  const loadError = processId ? (loadErrors[processId] ?? null) : null

  // ---- load ----------------------------------------------------------------
  const needLoad = enabled && processId !== null && !entry && !loadError
  useEffect(() => {
    if (!needLoad || !processId) return
    const pid = processId
    let cancelled = false
    getProcessInventory(pid)
      .then((inv) => {
        if (cancelled) return
        const loaded: Entry = {
          valuedItems: inv.valued_items,
          splitIds: inv.split_ids ?? [],
          mode: inv.mode,
          split: null,
          version: 0,
          solvedKey: null,
          savedKey: '',
        }
        loaded.savedKey = saveKeyOf(loaded)
        setByProcess((prev) => (prev[pid] ? prev : { ...prev, [pid]: loaded }))
      })
      .catch((e: unknown) => !cancelled && setLoadErrors((prev) => ({ ...prev, [pid]: errText(e) })))
    return () => {
      cancelled = true
    }
  }, [needLoad, processId])

  // ---- solve (debounced; immediate for the first one) -------------------------
  const wantSolveKey = entry ? solveKeyOf(entry, names) : null
  const solving = entry !== null && entry.solvedKey !== wantSolveKey

  useEffect(() => {
    if (!processId || !entry || !wantSolveKey || entry.solvedKey === wantSolveKey) return
    const pid = processId
    const { mode, version } = entry
    const inSplit = new Set(entry.splitIds)
    const valuedItems = entry.valuedItems.filter((vi) => inSplit.has(vi.item.id))
    const timer = setTimeout(
      () => {
        agentSplit({ party_a_name: names[0], party_b_name: names[1], valued_items: valuedItems })
          .then((split) => {
            setSolveError(null)
            setByProcess((prev) => {
              const cur = prev[pid]
              if (!cur || cur.version !== version || cur.mode !== mode) return prev // a newer edit is on its way
              return { ...prev, [pid]: { ...cur, split, solvedKey: wantSolveKey } }
            })
          })
          .catch((e: unknown) => setSolveError(errText(e)))
      },
      entry.split ? SOLVE_DEBOUNCE_MS : 0,
    )
    return () => clearTimeout(timer)
  }, [processId, entry, wantSolveKey, names])

  // ---- save (debounced, flushed on leave / page close) ------------------------
  const flushSave = useCallback((keepalive = false) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const p = pendingSave.current
    if (!p) return
    pendingSave.current = null
    saveProcessInventory(p.pid, { mode: p.mode, valued_items: p.items, split_ids: p.splitIds }, keepalive)
      .then(() =>
        setByProcess((prev) => {
          const cur = prev[p.pid]
          return cur && saveKeyOf(cur) === p.key ? { ...prev, [p.pid]: { ...cur, savedKey: p.key } } : prev
        }),
      )
      .catch((e: unknown) => setSolveError(`Could not save: ${errText(e)}`))
  }, [])

  const wantSaveKey = entry ? saveKeyOf(entry) : null
  const saving = entry !== null && entry.savedKey !== wantSaveKey

  useEffect(() => {
    if (!processId || !entry || !wantSaveKey || entry.savedKey === wantSaveKey) return
    pendingSave.current = { pid: processId, key: wantSaveKey, mode: entry.mode, items: entry.valuedItems, splitIds: entry.splitIds }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => flushSave(), SAVE_DEBOUNCE_MS)
  }, [processId, entry, wantSaveKey, flushSave])

  // Leaving the house (or unmounting) writes whatever is still pending.
  useEffect(() => () => flushSave(), [processId, flushSave])

  useEffect(() => {
    const onHide = () => flushSave(true)
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flushSave])

  // ---- edits ---------------------------------------------------------------
  const edit = useCallback(
    (fn: (e: Entry) => Entry) => {
      if (!processId) return
      const pid = processId
      setByProcess((prev) => (prev[pid] ? { ...prev, [pid]: fn(prev[pid]) } : prev))
    },
    [processId],
  )

  const updateItem = useCallback(
    (id: string, patch: Partial<HouseholdItem>) => {
      edit((e) => ({
        ...e,
        version: e.version + 1,
        valuedItems: e.valuedItems.map((vi) => (vi.item.id === id ? { ...vi, item: { ...vi.item, ...patch } } : vi)),
      }))

      if (!REVALUE_FIELDS.some((k) => k in patch) || !entry) return
      const current = entry.valuedItems.find((vi) => vi.item.id === id)
      if (!current) return
      const key = `${processId}:${id}`
      const seq = (revalueSeq.current.get(key) ?? 0) + 1
      revalueSeq.current.set(key, seq)
      reapplyDepreciation({ ...current.item, ...patch }, current.valuation)
        .then((valuation) => {
          if (revalueSeq.current.get(key) !== seq) return
          edit((e) => ({
            ...e,
            version: e.version + 1,
            valuedItems: e.valuedItems.map((vi) => (vi.item.id === id ? { ...vi, valuation } : vi)),
          }))
        })
        .catch((err: unknown) => setSolveError(errText(err)))
    },
    [edit, entry, processId],
  )

  const setPoints = useCallback(
    (id: string, a: number, b: number) => updateItem(id, { party_a_points: a, party_b_points: b }),
    [updateItem],
  )

  const forceAction = useCallback(
    (id: string, action: AssignmentAction | null) => updateItem(id, { forced_action: action }),
    [updateItem],
  )

  const setMode = useCallback((mode: SplitMode) => edit((e) => ({ ...e, mode })), [edit])

  const addItem = useCallback(
    (vi: ValuedItem) => edit((e) => ({ ...e, version: e.version + 1, valuedItems: [vi, ...e.valuedItems] })),
    [edit],
  )

  const removeItem = useCallback(
    (id: string) =>
      edit((e) => ({
        ...e,
        version: e.version + 1,
        valuedItems: e.valuedItems.filter((vi) => vi.item.id !== id),
        splitIds: e.splitIds.filter((s) => s !== id),
      })),
    [edit],
  )

  const splitAll = useCallback(
    () => edit((e) => ({ ...e, version: e.version + 1, splitIds: e.valuedItems.map((vi) => vi.item.id) })),
    [edit],
  )

  const unsplit = useMemo(() => {
    if (!entry) return []
    const inSplit = new Set(entry.splitIds)
    return entry.valuedItems.filter((vi) => !inSplit.has(vi.item.id))
  }, [entry])

  const scenario = useMemo<DemoScenario | null>(() => {
    if (!entry) return null
    // Inventory is ready as soon as the process loads (may be empty). Split can lag behind.
    return {
      scenario_name: '',
      party_a_name: names[0],
      party_b_name: names[1],
      valued_items: entry.valuedItems,
      split: entry.split ?? pendingEmptySplit(entry.mode, names),
      warning: null,
    }
  }, [entry, names])

  return {
    scenario,
    itemCount: entry ? entry.valuedItems.length : null,
    error: loadError,
    solving,
    saving,
    solveError,
    updateItem,
    setPoints,
    forceAction,
    setMode,
    addItem,
    removeItem,
    unsplit,
    splitAll,
  }
}
