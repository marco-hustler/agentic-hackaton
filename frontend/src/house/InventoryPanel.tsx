import { useEffect, useMemo, useRef, useState } from 'react'
import type { Assignment, DemoScenario, ValuedItem } from '../types/inventory'
import { categoryColor } from '../world/palette'
import { actionPill } from './assignment'
import { formatEur } from './format'

type InventoryPanelProps = {
  processTitle: string
  demo: DemoScenario | null
  error: string | null
  names: [string, string]
  /** Expanded card (controlled, so the diorama can highlight its crate). */
  openId: string | null
  onOpenChange: (id: string | null) => void
  onOpenItem: (id: string) => void
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
      <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" fill="currentColor" />
    </svg>
  )
}

function ItemCard({
  vi,
  assignment,
  names,
  open,
  onToggle,
  onOpen,
}: {
  vi: ValuedItem
  assignment: Assignment | undefined
  names: [string, string]
  open: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { item, valuation: v } = vi
  const checked = v.data_source !== 'demo_fallback'
  const drop = Math.round((1 - v.depreciation_factor) * 100)
  const lost = v.trusted_market_price_eur - v.fair_value_eur
  const totalPts = item.party_a_points + item.party_b_points
  const aShare = totalPts > 0 ? (item.party_a_points / totalPts) * 100 : 50
  const pill = assignment ? actionPill(assignment.action, names) : null

  return (
    <li data-item-id={item.id} className="rounded-2xl border border-line bg-surface-low p-3 transition hover:bg-[#f0eee8]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <span
          className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface"
          aria-hidden
        >
          <span className="h-3.5 w-3.5 rounded-[4px]" style={{ background: categoryColor(item.category) }} />
          <span className="label-sm mt-1 text-[9px] text-muted">{item.category.slice(0, 7)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold tracking-tight text-ink">{item.name}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {pill && <span className={`pill ${pill.cls}`}>{pill.text}</span>}
            {checked ? (
              <span className="pill pill-live">
                <SparkIcon /> idealo fair check
              </span>
            ) : (
              <span className="pill pill-neutral" title={v.source_note ?? undefined}>
                Estimate
              </span>
            )}
            {assignment?.is_contested && <span className="pill pill-draft">Contested</span>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-extrabold text-petrol">{formatEur(v.fair_value_eur)}</span>
          {drop > 0 && <span className="block text-xs font-bold text-terracotta">−{drop}%</span>}
        </span>
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="label-sm text-ink2">Valuation & depreciation</p>
            {checked && (
              <span className="pill pill-live">{v.data_source === 'idealo_live' ? 'idealo MCP live' : 'idealo cache'}</span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-surface-low p-2.5">
            <div>
              <dt className="text-xs text-muted">New on idealo</dt>
              <dd className="font-extrabold text-ink">{formatEur(v.trusted_market_price_eur)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Depreciation</dt>
              <dd className="font-extrabold text-terracotta">
                −{formatEur(lost)} (−{drop}%)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Fair value</dt>
              <dd className="font-extrabold text-sage">{formatEur(v.fair_value_eur)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ink2">{v.depreciation_explanation}</p>
          {assignment?.rationale && <p className="dashed-rule mt-2 pt-2 text-xs text-ink2">{assignment.rationale}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onOpen} className="btn btn-primary h-8 px-3 text-xs">
              Details & edit →
            </button>
            {v.product_url && (
              <a href={v.product_url} target="_blank" rel="noreferrer" className="btn btn-agent h-8 px-3 text-xs">
                View on idealo
              </a>
            )}
          </div>
        </div>
      )}

      {/* How much each side cares, from their priority points */}
      <div className="mt-3 flex items-center gap-2 text-xs font-bold">
        <span className="w-20 truncate text-terracotta">
          {names[0]} {item.party_a_points}
        </span>
        <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-clay">
          <span className="bg-terracotta" style={{ width: `${aShare}%` }} />
          <span className="flex-1 bg-sage" />
        </span>
        <span className="w-20 truncate text-right text-sage">
          {names[1]} {item.party_b_points}
        </span>
      </div>
    </li>
  )
}

/** Right-hand inventory: search, category filter, idealo-backed item cards. */
export function InventoryPanel({
  processTitle,
  demo,
  error,
  names,
  openId,
  onOpenChange,
  onOpenItem,
}: InventoryPanelProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const items = useMemo(() => demo?.valued_items ?? [], [demo])
  const assignments = useMemo(
    () => new Map((demo?.split.assignments ?? []).map((a) => [a.item_id, a])),
    [demo],
  )
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const vi of items) counts.set(vi.item.category, (counts.get(vi.item.category) ?? 0) + 1)
    return [...counts.entries()]
  }, [items])

  const q = query.trim().toLowerCase()
  const visible = items.filter(
    (vi) =>
      (!category || vi.item.category === category) &&
      (!q || vi.item.name.toLowerCase().includes(q) || vi.item.category.toLowerCase().includes(q)),
  )
  const checkedCount = items.filter((vi) => vi.valuation.data_source !== 'demo_fallback').length
  const effectiveOpen = openId
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!openId) return
    listRef.current
      ?.querySelector(`[data-item-id="${CSS.escape(openId)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [openId])

  return (
    <section className="panel flex h-full flex-col overflow-hidden" style={{ background: '#ffffff' }} aria-label="Inventory">
      <div className="flex items-center gap-3 px-5 pt-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-petrol sm:text-3xl">Inventory ({items.length})</h2>
        <span className="pill pill-neutral max-w-40 truncate">{processTitle}</span>
        <button
          type="button"
          disabled
          title="Adding items comes next"
          className="btn btn-primary ml-auto h-11 w-11 rounded-full p-0 text-2xl leading-none"
          aria-label="Add item"
        >
          +
        </button>
      </div>

      <div className="space-y-3 px-5 pt-4">
        <label className="relative block">
          <span className="sr-only">Search items</span>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${items.length} items…`}
            className="field w-full pl-10"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`pill cursor-pointer normal-case tracking-normal ${!category ? 'bg-petrol text-white' : 'pill-neutral'}`}
          >
            All ({items.length})
          </button>
          {categories.map(([c, n]) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c === category ? null : c)}
              className={`pill cursor-pointer normal-case tracking-normal ${c === category ? 'bg-petrol text-white' : 'pill-neutral'}`}
            >
              {c} ({n})
            </button>
          ))}
        </div>
        {demo && (
          <div className="pill pill-live h-auto w-full justify-start py-2 normal-case tracking-normal">
            <span className="pulse-dot" />
            <span className="truncate">
              Powered by idealo MCP · {checkedCount}/{items.length} prices from idealo
              {demo.warning ? ` · ${demo.warning}` : ''}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {error && <p className="rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the inventory: {error}</p>}
        {!demo && !error && <p className="text-sm text-muted">Loading inventory…</p>}
        {demo && visible.length === 0 && <p className="text-sm text-muted">No items match.</p>}
        <ul ref={listRef} className="space-y-2.5">
          {visible.map((vi) => (
            <ItemCard
              key={vi.item.id}
              vi={vi}
              assignment={assignments.get(vi.item.id)}
              names={names}
              open={effectiveOpen === vi.item.id}
              onToggle={() => onOpenChange(effectiveOpen === vi.item.id ? null : vi.item.id)}
              onOpen={() => onOpenItem(vi.item.id)}
            />
          ))}
        </ul>
        {demo && (
          <p className="mt-4 text-xs text-muted">
            Demo inventory ({demo.scenario_name}) until the process API stores items per house.
          </p>
        )}
      </div>
    </section>
  )
}
