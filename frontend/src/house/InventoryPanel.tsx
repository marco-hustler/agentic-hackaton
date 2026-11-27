import { useState } from 'react'
import type { DemoScenario } from '../types/inventory'
import { formatEur } from './format'
import { Thumb } from './Thumb'

type InventoryPanelProps = {
  demo: DemoScenario | null
  error: string | null
  /** Open an item's details (they live in the Split view). */
  onOpenItem: (id: string) => void
}

/** Minimal inventory: photo, name, fair value. Everything else is in Split. */
export function InventoryPanel({ demo, error, onOpenItem }: InventoryPanelProps) {
  const [query, setQuery] = useState('')
  const items = demo?.valued_items ?? []
  const q = query.trim().toLowerCase()
  const visible = q ? items.filter((vi) => vi.item.name.toLowerCase().includes(q)) : items
  const total = items.reduce((sum, vi) => sum + vi.valuation.fair_value_eur, 0)

  return (
    <section className="panel flex h-full flex-col overflow-hidden" style={{ background: '#ffffff' }} aria-label="Inventory">
      <div className="flex items-end justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-petrol sm:text-3xl">Inventory</h2>
          <p className="text-sm text-muted">
            {items.length} items · {formatEur(total)}
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Adding items comes next"
          className="btn btn-primary h-11 w-11 rounded-full p-0 text-2xl leading-none"
          aria-label="Add item"
        >
          +
        </button>
      </div>

      <label className="relative mx-5 mt-4 block">
        <span className="sr-only">Search items</span>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="field w-full pl-10" />
      </label>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {error && <p className="mx-2 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the inventory: {error}</p>}
        {!demo && !error && <p className="px-2 text-sm text-muted">Loading inventory…</p>}
        {demo && visible.length === 0 && <p className="px-2 text-sm text-muted">No items match.</p>}
        <ul>
          {visible.map((vi) => (
            <li key={vi.item.id}>
              <button
                type="button"
                onClick={() => onOpenItem(vi.item.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-low active:scale-[0.99]"
              >
                <Thumb vi={vi} />
                <span className="min-w-0 flex-1 truncate font-bold text-ink">{vi.item.name}</span>
                <span className="shrink-0 text-lg font-extrabold text-petrol">{formatEur(vi.valuation.fair_value_eur)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
