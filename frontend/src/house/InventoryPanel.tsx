import { useEffect, useMemo, useState } from 'react'
import { catalogItem, searchCatalog, type CatalogHit } from '../api/client'
import type { DemoScenario, ValuedItem } from '../types/inventory'
import { categoryColor } from '../world/palette'
import { formatEur } from './format'

type InventoryPanelProps = {
  demo: DemoScenario | null
  error: string | null
  /** Open an item's details (they live in the Split view). */
  onOpenItem: (id: string) => void
  onAdd: (vi: ValuedItem) => void
  onRemove: (id: string) => void
}

const SEARCH_DEBOUNCE_MS = 200

type Found = { query: string; hits: CatalogHit[]; error: string | null }

/**
 * Search first: one field looks through the house and the idealo catalog.
 * Items already in the house and products found on idealo are both cards.
 */
export function InventoryPanel({ demo, error, onOpenItem, onAdd, onRemove }: InventoryPanelProps) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const items = useMemo(() => demo?.valued_items ?? [], [demo])
  const total = items.reduce((sum, vi) => sum + vi.valuation.fair_value_eur, 0)
  const q = query.trim().toLowerCase()
  const owned = q
    ? items.filter((vi) =>
        `${vi.item.name} ${vi.item.category} ${vi.valuation.matched_title}`.toLowerCase().includes(q),
      )
    : items
  const ownedRefs = useMemo(() => new Set(items.map((vi) => vi.valuation.product_ref).filter(Boolean)), [items])

  useEffect(() => {
    if (q.length < 2) return
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

  const searching = q.length >= 2
  const results = searching && found?.query === q ? found : null

  async function add(hit: CatalogHit) {
    setAdding(hit.product_ref)
    setAddError(null)
    try {
      onAdd(await catalogItem(hit))
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(null)
    }
  }

  return (
    <section className="inventory-page" aria-label="Inventory">
      <div className="mx-auto w-full max-w-6xl">
        <label className="pop-in sticky top-0 z-10 -mx-2 block bg-canvas/90 px-2 py-2 backdrop-blur">
          <span className="sr-only">Search items and idealo products</span>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-7 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden>
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your items or find a product on idealo…"
            className="field h-16 w-full rounded-2xl pl-14 pr-5 text-lg shadow-[0_12px_28px_-14px_rgba(15,23,42,0.3)]"
          />
        </label>
        <p className="mt-2 px-1 text-sm text-muted">
          {demo ? `${items.length} items in this house · ${formatEur(total)}` : 'Loading the house…'}
        </p>

        {error && <p className="mt-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the inventory: {error}</p>}
        {addError && <p className="mt-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not add the item: {addError}</p>}

        {searching && (
          <Section
            title="Found on idealo"
            count={results?.hits.length}
            empty={
              results?.error ? (
                <Empty>idealo search failed: {results.error}</Empty>
              ) : results && results.hits.length === 0 ? (
                <Empty>No idealo products for “{query.trim()}”. Offline, only products from earlier idealo searches are available.</Empty>
              ) : null
            }
          >
            {!results && <SkeletonCards n={4} />}
            {results?.hits.map((hit) => (
              <FoundCard
                key={hit.product_ref}
                hit={hit}
                inHouse={ownedRefs.has(hit.product_ref)}
                adding={adding === hit.product_ref}
                onAdd={() => add(hit)}
              />
            ))}
          </Section>
        )}

        <Section
          title="In this house"
          count={demo ? owned.length : undefined}
          empty={
            demo && owned.length === 0 ? (
              <Empty>{q ? 'Nothing in this house matches.' : 'No items yet. Search above to add one from idealo.'}</Empty>
            ) : null
          }
        >
          {!demo && !error && <SkeletonCards n={6} />}
          {owned.map((vi) => (
            <OwnedCard key={vi.item.id} vi={vi} onOpen={() => onOpenItem(vi.item.id)} onRemove={() => onRemove(vi.item.id)} />
          ))}
        </Section>
      </div>
    </section>
  )
}

type SectionProps = { title: string; count?: number; empty?: React.ReactNode; children: React.ReactNode }

/** Masonry: CSS columns, cards keep their photo's natural height. */
function Section({ title, count, empty, children }: SectionProps) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-baseline gap-2 px-1 text-xl font-extrabold tracking-tight text-petrol">
        {title}
        {count !== undefined && <span className="text-sm font-bold text-muted">{count}</span>}
      </h2>
      {empty}
      <ul className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">{children}</ul>
    </section>
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
        <button
          type="button"
          onClick={onAdd}
          disabled={inHouse || adding}
          className="btn btn-primary mt-3 h-11 w-full"
        >
          {inHouse ? 'In the house ✓' : adding ? 'Adding…' : '+ Add to house'}
        </button>
      </span>
    </li>
  )
}
