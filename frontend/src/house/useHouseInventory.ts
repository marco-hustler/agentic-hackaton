import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDemo, reapplyDepreciation, solveSplit } from '../api/client'
import type {
  AssignmentAction,
  DemoScenario,
  HouseholdItem,
  SplitMode,
  SplitResult,
  ValuedItem,
} from '../types/inventory'

/**
 * Editable inventory per house (process). Each house starts as a copy of the
 * demo scenario; edits stay with that house and re-run the solver.
 *
 * Nothing here calls idealo: depreciation is recomputed server-side from the
 * cached valuation and the solver is deterministic.
 */

type Entry = {
  valuedItems: ValuedItem[]
  split: SplitResult
  mode: SplitMode
  /** Bumped on every item edit; the solver result is tagged with it. */
  version: number
  /** `version|mode|names` of the last applied solve. */
  solvedKey: string | null
}

const SOLVE_DEBOUNCE_MS = 250
const REVALUE_FIELDS: (keyof HouseholdItem)[] = ['condition', 'purchase_year', 'depreciation_override']

function fromDemo(demo: DemoScenario): Entry {
  return {
    valuedItems: structuredClone(demo.valued_items),
    split: demo.split,
    mode: demo.split.mode ?? 'balanced',
    version: 0,
    solvedKey: null,
  }
}

function keyOf(e: Entry, names: [string, string]) {
  return `${e.version}|${e.mode}|${names[0]}|${names[1]}`
}

export type HouseInventory = {
  /** Same shape as /api/demo so existing views read it unchanged. */
  scenario: DemoScenario | null
  error: string | null
  solving: boolean
  solveError: string | null
  updateItem: (id: string, patch: Partial<HouseholdItem>) => void
  setPoints: (id: string, a: number, b: number) => void
  forceAction: (id: string, action: AssignmentAction | null) => void
  setMode: (mode: SplitMode) => void
}

export function useHouseInventory(processId: string | null, names: [string, string], enabled: boolean): HouseInventory {
  const [base, setBase] = useState<DemoScenario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [byProcess, setByProcess] = useState<Record<string, Entry>>({})
  const [solveError, setSolveError] = useState<string | null>(null)
  /** Latest revalue request per item, so a slow response never overwrites a newer one. */
  const revalueSeq = useRef(new Map<string, number>())

  // The demo is the seed for every house; the server reads idealo from cache only.
  const needBase = enabled && !base && !error
  useEffect(() => {
    if (!needBase) return
    let cancelled = false
    getDemo()
      .then((d) => !cancelled && setBase(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [needBase])

  const entry = useMemo<Entry | null>(() => {
    if (!processId || !base) return null
    return byProcess[processId] ?? fromDemo(base)
  }, [processId, base, byProcess])

  const wantKey = entry ? keyOf(entry, names) : null
  const solving = entry !== null && entry.solvedKey !== wantKey

  // Re-solve (debounced) whenever items, mode or the party names change.
  useEffect(() => {
    if (!processId || !base || !entry || !wantKey || entry.solvedKey === wantKey) return
    const pid = processId
    const { valuedItems, mode, version } = entry
    const timer = setTimeout(() => {
      solveSplit({ party_a_name: names[0], party_b_name: names[1], mode, valued_items: valuedItems })
        .then((split) => {
          setSolveError(null)
          setByProcess((prev) => {
            const cur = prev[pid] ?? fromDemo(base)
            if (cur.version !== version || cur.mode !== mode) return prev // a newer edit is on its way
            return { ...prev, [pid]: { ...cur, split, solvedKey: wantKey } }
          })
        })
        .catch((e: unknown) => setSolveError(e instanceof Error ? e.message : String(e)))
    }, SOLVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [processId, base, entry, wantKey, names])

  const edit = useCallback(
    (fn: (e: Entry) => Entry) => {
      if (!processId || !base) return
      const pid = processId
      setByProcess((prev) => ({ ...prev, [pid]: fn(prev[pid] ?? fromDemo(base)) }))
    },
    [processId, base],
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
        .catch((err: unknown) => setSolveError(err instanceof Error ? err.message : String(err)))
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

  const scenario = useMemo<DemoScenario | null>(
    () =>
      base && entry
        ? {
            ...base,
            party_a_name: names[0],
            party_b_name: names[1],
            valued_items: entry.valuedItems,
            split: entry.split,
          }
        : null,
    [base, entry, names],
  )

  return { scenario, error, solving, solveError, updateItem, setPoints, forceAction, setMode }
}
