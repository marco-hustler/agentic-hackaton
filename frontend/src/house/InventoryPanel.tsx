import { useEffect, useMemo, useState } from 'react'
import { catalogItem, searchCatalog, type CatalogHit } from '../api/client'
import type { DemoScenario, ValuedItem } from '../types/inventory'
import { categoryColor } from '../world/palette'
import { formatEur } from './format'
import { HouseToolbar } from './HouseToolbar'
import type { HouseTab } from './HouseViewSwitch'

type InventoryPanelProps = {
  processTitle: string
  demo: DemoScenario | null
  error: string | null
  filter: string
  addingOpen: boolean
  onAddingOpenChange: (open: boolean) => void
  tab: HouseTab
  onTab: (tab: HouseTab) => void
  onBackToWorld: () => void
  inventoryCount?: number | null
  onInventoryFilter: (value: string) => void
  onAddObject: () => void
  /** Open an item's details (they live in the Split view). */
  onOpenItem: (id: string) => void
  onAdd: (vi: ValuedItem) => void
  onRemove: (id: string) => void
}

const SEARCH_DEBOUNCE_MS = 200

type Found = { query: string; hits: CatalogHit[]; error: string | null }

/** House inventory: title notch + toolbar + cards in one white shell. */
export function InventoryPanel({
  processTitle,
  demo,
  error,
  filter,
  addingOpen,
  onAddingOpenChange,
  tab,
  onTab,
  onBackToWorld,
  inventoryCount,
  onInventoryFilter,
  onAddObject,
  onOpenItem,
  onAdd,
  onRemove,
}: InventoryPanelProps) {
  const items = useMemo(() => demo?.valued_items ?? [], [demo])
  const q = filter.trim().toLowerCase()
  const owned = q
    ? items.filter((vi) =>
        `${vi.item.name} ${vi.item.category} ${vi.valuation.matched_title}`.toLowerCase().includes(q),
      )
    : items

  return (
    <section className="inventory-page inventory-page-unified" aria-label="Inventory">
      <div className="inventory-shell inventory-shell-notched">
        <h1 className="inventory-title-notch" title={processTitle}>
          {processTitle}
        </h1>
        <div className="inventory-shell-inner">
          <div className="inventory-shell-top">
            <HouseToolbar
              variant="embedded"
              tab={tab}
              onTab={onTab}
              onBackToWorld={onBackToWorld}
              inventoryCount={inventoryCount}
              inventoryFilter={filter}
              onInventoryFilter={onInventoryFilter}
              onAddObject={onAddObject}
            />
          </div>

          <div className="inventory-shell-body">
            {error && <p className="mb-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the inventory: {error}</p>}

            {demo && owned.length === 0 && (
              <Empty>{q ? 'Nothing in this house matches.' : 'No items yet. Add an object from idealo.'}</Empty>
            )}
            <ul className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
              {!demo && !error && <SkeletonCards n={6} />}
              {owned.map((vi) => (
                <OwnedCard key={vi.item.id} vi={vi} onOpen={() => onOpenItem(vi.item.id)} onRemove={() => onRemove(vi.item.id)} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      {addingOpen && (
        <AddObjectModal
          ownedRefs={new Set(items.map((vi) => vi.valuation.product_ref).filter((r): r is string => !!r))}
          onClose={() => onAddingOpenChange(false)}
          onAdd={onAdd}
        />
      )}
    </section>
  )
}

type AddObjectModalProps = {
  ownedRefs: Set<string>
  onClose: () => void
  onAdd: (vi: ValuedItem) => void
}

function AddObjectModal({ ownedRefs, onClose, onAdd }: AddObjectModalProps) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const q = query.trim().toLowerCase()

  useEffect(() => {
    if (q.length < 2) {
      setFound(null)
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      searchCatalog(q, ctrl.signal)
        .then((hits) => setFound({ query: q, hits, error: null }))
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setFound({ query: q, hits: [], error: e instanceof Error ? e.message : String(e) })
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const searching = q.length >= 2
  const results = searching && found?.query === q ? found : null

  async function add(hit: CatalogHit) {
    setAdding(hit.product_ref)
    setAddError(null)
    try {
      onAdd(await catalogItem(hit))
      onClose()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Add object">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-midnight/40 backdrop-blur-sm" onClick={onClose} />
      <div className="pop-in relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-line bg-canvas shadow-[0_24px_60px_-16px_rgba(15,23,42,0.45)] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-petrol">Add object</h3>
            <p className="mt-0.5 text-sm text-muted">Search idealo and add a valued item to this house.</p>
          </div>
          <button type="button" className="btn btn-ghost h-9 w-9 rounded-full px-0" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="border-b border-line px-5 py-3">
          <label className="relative block">
            <span className="sr-only">Search idealo</span>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a product on idealo…"
              className="field h-12 w-full rounded-xl pl-10 pr-3"
            />
          </label>
          {addError && <p className="mt-2 text-sm text-error">Could not add the item: {addError}</p>}
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {!searching && <Empty>Type at least 2 characters to search the idealo catalog.</Empty>}
          {searching && !results && (
            <ul className="columns-1 gap-4 sm:columns-2">
              <SkeletonCards n={3} />
            </ul>
          )}
          {results?.error && <Empty>idealo search failed: {results.error}</Empty>}
          {results && results.hits.length === 0 && !results.error && (
            <Empty>No idealo products for “{query.trim()}”. Offline, only products from earlier idealo searches are available.</Empty>
          )}
          {results && results.hits.length > 0 && (
            <ul className="columns-1 gap-4 sm:columns-2">
              {results.hits.map((hit) => (
                <FoundCard
                  key={hit.product_ref}
                  hit={hit}
                  inHouse={ownedRefs.has(hit.product_ref)}
                  adding={adding === hit.product_ref}
                  onAdd={() => add(hit)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</p>
  )
}

function SkeletonCards({ n }: { n: number }) {
  const heights = ['h-80', 'h-96', 'h-72', 'h-[26rem]']
  return Array.from({ length: n }, (_, i) => (
    <li key={i} className={`mb-5 break-inside-avoid animate-pulse rounded-3xl bg-surface-low ${heights[i % heights.length]}`} aria-hidden />
  ))
}

function Photo({ src, category }: { src: string | null | undefined; category: string }) {
  return (
    <span className="flex w-full items-center justify-center overflow-hidden bg-white">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="block max-h-[28rem] w-full object-contain p-6 transition duration-300 group-hover:scale-105"
        />
      ) : (
        <span className="flex h-48 w-full items-center justify-center">
          <span className="h-10 w-10 rounded-xl" style={{ background: categoryColor(category) }} />
        </span>
      )}
    </span>
  )
}

const CARD =
  'group pop-in relative mb-5 flex break-inside-avoid flex-col overflow-hidden rounded-3xl border border-line bg-surface text-left shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-10px_rgba(15,23,42,0.25)]'

function OwnedCard({ vi, onOpen, onRemove }: { vi: ValuedItem; onOpen: () => void; onRemove: () => void }) {
  return (
    <li className={CARD}>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left active:scale-[0.98]">
        <Photo src={vi.valuation.image_url} category={vi.item.category} />
        <span className="flex flex-1 flex-col gap-1 border-t border-line p-4">
          <span className="line-clamp-2 text-base font-bold text-ink">{vi.item.name}</span>
          <span className="mt-1 text-2xl font-extrabold text-petrol">{formatEur(vi.valuation.fair_value_eur)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${vi.item.name}`}
        title="Remove from the house"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-muted opacity-0 shadow-sm transition hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
      >
        ✕
      </button>
    </li>
  )
}

function FoundCard({ hit, inHouse, adding, onAdd }: { hit: CatalogHit; inHouse: boolean; adding: boolean; onAdd: () => void }) {
  return (
    <li className={CARD}>
      <a href={hit.url ?? undefined} target="_blank" rel="noreferrer" className="block" title="Open on idealo">
        <Photo src={hit.image_url} category={hit.category} />
      </a>
      <span className="flex flex-1 flex-col gap-1 border-t border-line p-4">
        <span className="line-clamp-2 text-base font-bold text-ink">{hit.name}</span>
        {hit.variant && <span className="truncate text-sm text-muted">{hit.variant}</span>}
        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-extrabold text-petrol">{formatEur(hit.price_eur)}</span>
          {hit.offer_count > 0 && <span className="text-xs text-muted">{hit.offer_count} {hit.offer_count === 1 ? 'offer' : 'offers'}</span>}
        </span>
        <button type="button" onClick={onAdd} disabled={inHouse || adding} className="btn btn-primary mt-3 h-11 w-full">
          {inHouse ? 'In the house ✓' : adding ? 'Valuing…' : '+ Add to house'}
        </button>
      </span>
    </li>
  )
}
