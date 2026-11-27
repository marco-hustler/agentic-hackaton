import { useEffect, useMemo, useRef, useState } from 'react'
import {
  catalogItem,
  createManualItem,
  draftItemTurn,
  getIdealoStatus,
  getLlmStatus,
  searchCatalog,
  type CatalogHit,
  type IdealoStatus,
  type ItemDraft,
  type ItemDraftMessage,
} from '../api/client'
import type { Condition, DemoScenario, ValuedItem } from '../types/inventory'
import { categoryColor } from '../world/palette'
import { formatEur } from './format'
import { HouseToolbar } from './HouseToolbar'
import type { HouseTab } from './HouseViewSwitch'
import { holdIdealoMoment, IdealoLoadingOverlay } from './IdealoLoading'

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
  /** When false, Add object is replaced by an Idealo auth hint. */
  idealoReady?: boolean
  /** Open an item's details. */
  onOpenItem: (id: string) => void
  onAdd: (vi: ValuedItem) => void
  onRemove: (id: string) => void
}

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
  idealoReady = true,
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
              idealoReady={idealoReady}
            />
          </div>

          <div className="inventory-shell-body">
            {error && <p className="mb-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the inventory: {error}</p>}

            {!error && inventoryCount === 0 && (
              <Empty>
                {q
                  ? 'Nothing in this house matches.'
                  : idealoReady
                    ? 'No items yet. Add an object to get started.'
                    : 'Authenticate with Idealo from your account menu above to add objects.'}
              </Empty>
            )}
            <ul className="columns-1 gap-5 sm:columns-2 lg:columns-3 2xl:columns-4">
              {inventoryCount == null && !error && <SkeletonCards n={6} />}
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

type CreateMode = 'idealo' | 'ai' | 'static'

type AddObjectModalProps = {
  ownedRefs?: Set<string>
  onClose: () => void
  onAdd: (vi: ValuedItem) => void
  onValuingChange?: (valuing: boolean) => void
}

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
]

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 30 }, (_, i) => THIS_YEAR - i)

function AddObjectModal({ ownedRefs, onClose, onAdd }: Omit<AddObjectModalProps, 'onValuingChange'>) {
  const [mode, setMode] = useState<CreateMode>('idealo')
  const [valuing, setValuing] = useState(false)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    getLlmStatus()
      .then((s) => {
        if (!cancelled) setAiAvailable(s.configured)
      })
      .catch(() => {
        if (!cancelled) setAiAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !valuing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, valuing])

  const aiDisabled = aiAvailable !== true

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Add object">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-midnight/40 backdrop-blur-sm"
        onClick={onClose}
        disabled={valuing}
      />
      <div
        className={`pop-in relative z-10 flex w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-canvas shadow-[0_24px_60px_-16px_rgba(15,23,42,0.45)] sm:rounded-3xl ${
          mode === 'ai' ? 'max-h-[92vh] max-w-lg sm:h-[min(720px,92vh)]' : 'max-h-[88vh] max-w-2xl'
        }`}
      >
        {valuing && <IdealoLoadingOverlay />}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-petrol">Add object</h3>
            <p className="mt-0.5 text-sm text-muted">
              {mode === 'idealo'
                ? 'Search idealo MCP directly (cached or live) to price and add an object.'
                : mode === 'ai'
                  ? 'Chat with AI to draft the object, then we price it on idealo.'
                  : 'Fill the form — we look it up on idealo on save.'}
            </p>
          </div>
          <button type="button" className="btn btn-ghost h-9 w-9 rounded-full px-0" onClick={onClose} disabled={valuing} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="shrink-0 border-b border-line px-5 py-3">
          <div className="view-switch inline-flex w-full items-center gap-1 p-1" role="group" aria-label="Creation mode">
            <button
              type="button"
              className={`view-switch-option min-w-0 flex-1 ${mode === 'idealo' ? 'view-switch-option-active' : ''}`}
              aria-pressed={mode === 'idealo'}
              disabled={valuing}
              onClick={() => setMode('idealo')}
            >
              idealo MCP
            </button>
            <button
              type="button"
              className={`view-switch-option min-w-0 flex-1 ${mode === 'ai' ? 'view-switch-option-active' : ''} ${aiDisabled ? 'opacity-45' : ''}`}
              aria-pressed={mode === 'ai'}
              disabled={valuing || aiDisabled}
              title={aiDisabled ? 'Configure AI keys from the account menu to enable AI creation' : 'Describe the object in chat'}
              onClick={() => !aiDisabled && setMode('ai')}
            >
              AI chat
            </button>
            <button
              type="button"
              className={`view-switch-option min-w-0 flex-1 ${mode === 'static' ? 'view-switch-option-active' : ''}`}
              aria-pressed={mode === 'static'}
              disabled={valuing}
              onClick={() => setMode('static')}
            >
              Manual
            </button>
          </div>
          {aiDisabled && aiAvailable === false && (
            <p className="mt-2 text-xs text-muted">AI needs LLM keys — open Account → Configure AI keys, or use idealo MCP / Manual.</p>
          )}
        </div>

        <div className={`min-h-0 flex-1 ${mode === 'ai' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          {mode === 'idealo' ? (
            <IdealoSearchTab ownedRefs={ownedRefs ?? new Set()} onClose={onClose} onAdd={onAdd} onValuingChange={setValuing} />
          ) : mode === 'ai' ? (
            <AiCreateChat onClose={onClose} onAdd={onAdd} onValuingChange={setValuing} />
          ) : (
            <StaticCreateForm onClose={onClose} onAdd={onAdd} onValuingChange={setValuing} />
          )}
        </div>
      </div>
    </div>
  )
}

const QUICK_SEARCHES = ['Dyson', 'Sonos', 'LG OLED', 'Bosch', 'KitchenAid', 'Nintendo']

function extractApiDetail(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  try {
    const parsed = JSON.parse(raw) as { detail?: string }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* plain text */
  }
  return raw
}

function IdealoSearchTab({
  ownedRefs,
  onClose,
  onAdd,
  onValuingChange,
}: {
  ownedRefs: Set<string>
  onClose: () => void
  onAdd: (vi: ValuedItem) => void
  onValuingChange?: (valuing: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<IdealoStatus | null>(null)
  const [found, setFound] = useState<{ query: string; hits: CatalogHit[]; source: 'cache' | 'live' } | null>(null)
  const [liveBusy, setLiveBusy] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingRef, setAddingRef] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    getIdealoStatus().then(setStatus).catch(() => undefined)
  }, [])

  const q = query.trim()

  useEffect(() => {
    if (q.length < 2) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      searchCatalog(q, { signal: ctrl.signal })
        .then((res) => {
          setSearchError(null)
          setFound({ query: q, hits: res, source: 'cache' })
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setSearchError(extractApiDetail(e))
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q])

  const activeResult = q.length >= 2 && found?.query === q ? found : null
  const hits = activeResult?.hits ?? []
  const source = activeResult?.source ?? null
  const loading = q.length >= 2 && !activeResult && !searchError

  function updateQuery(next: string) {
    setQuery(next)
    setSearchError(null)
    if (next.trim().length < 2) setFound(null)
  }

  async function searchLive() {
    if (q.length < 2 || liveBusy) return
    setLiveBusy(true)
    setSearchError(null)
    try {
      const res = await searchCatalog(q, { live: true })
      setFound({ query: q, hits: res, source: 'live' })
      getIdealoStatus().then(setStatus).catch(() => undefined)
    } catch (e) {
      setSearchError(extractApiDetail(e))
    } finally {
      setLiveBusy(false)
    }
  }

  async function addHit(hit: CatalogHit) {
    setAddingRef(hit.product_ref)
    setAddError(null)
    onValuingChange?.(true)
    try {
      const vi = await holdIdealoMoment(() => catalogItem(hit))
      onAdd(vi)
      onClose()
    } catch (e) {
      setAddError(extractApiDetail(e))
    } finally {
      setAddingRef(null)
      onValuingChange?.(false)
    }
  }

  const liveReady = Boolean(status?.live_enabled && status?.logged_in)

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={`pill ${liveReady ? 'pill-live' : 'pill-neutral'}`}>
          {liveReady ? 'idealo MCP live ready' : status?.live_enabled ? 'idealo login needed' : 'idealo cache mode'}
        </span>
        {status?.remaining != null && status?.cap != null && (
          <span className="text-muted">
            MCP budget: {status.remaining}/{status.cap} left today
          </span>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void searchLive()
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">Search idealo</span>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="Search idealo (e.g. PlayStation 5, Dyson, Sonos)…"
            className="field h-11 w-full pl-10 pr-3"
          />
        </label>
        <button
          type="submit"
          disabled={q.length < 2 || liveBusy}
          title={liveReady ? 'Query idealo MCP live for any product' : 'Query idealo MCP live (requires IDEALO_LIVE_ENABLED=true + OAuth login)'}
          className="btn btn-agent h-11 shrink-0 px-3.5 text-xs"
        >
          {liveBusy ? 'Searching…' : 'Live MCP'}
        </button>
      </form>

      {q.length < 2 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Instant cached:</span>
          {QUICK_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => updateQuery(term)}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-petrol transition hover:bg-surface-low"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {searchError && <p className="rounded-xl bg-[#ffdad6] px-3 py-2 text-xs text-[#93000a]">{searchError}</p>}
      {addError && <p className="rounded-xl bg-[#ffdad6] px-3 py-2 text-xs text-[#93000a]">{addError}</p>}

      {q.length < 2 && (
        <Empty>Type a product name for instant cached idealo results, or press Enter / Live MCP to query idealo.de live.</Empty>
      )}
      {q.length >= 2 && (loading || liveBusy) && hits.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">{liveBusy ? 'Querying idealo MCP live…' : 'Searching cached idealo catalog…'}</p>
      )}
      {q.length >= 2 && !loading && !liveBusy && hits.length === 0 && !searchError && (
        <Empty>
          No cached idealo match for “{q}”.{' '}
          <button type="button" onClick={() => void searchLive()} className="font-bold text-petrol underline">
            Search live on idealo MCP
          </button>
        </Empty>
      )}

      {hits.length > 0 && (
        <>
          <p className="text-xs text-muted">
            {hits.length} {hits.length === 1 ? 'product' : 'products'} from{' '}
            <strong className="text-petrol">{source === 'live' ? 'idealo MCP live' : 'idealo cache'}</strong>
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {hits.map((hit) => {
              const inHouse = ownedRefs.has(hit.product_ref)
              const busy = addingRef === hit.product_ref
              return (
                <li
                  key={hit.product_ref}
                  className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                >
                  <div className="flex h-32 items-center justify-center bg-white p-3">
                    {hit.image_url ? (
                      <img src={hit.image_url} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <span className="h-8 w-8 rounded-lg" style={{ background: categoryColor(hit.category) }} />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 border-t border-line p-3">
                    <p className="line-clamp-2 text-sm font-bold text-ink">{hit.name}</p>
                    {hit.variant && <p className="truncate text-xs text-muted">{hit.variant}</p>}
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="text-lg font-extrabold text-petrol">{formatEur(hit.price_eur)}</span>
                      {hit.offer_count > 0 && <span className="text-[11px] text-muted">{hit.offer_count} offers</span>}
                    </div>
                    <button
                      type="button"
                      disabled={inHouse || busy}
                      onClick={() => void addHit(hit)}
                      className="btn btn-primary mt-2 h-9 w-full text-xs"
                    >
                      {inHouse ? 'In the house ✓' : busy ? 'Valuing…' : '+ Add to house'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function StaticCreateForm({ onClose, onAdd, onValuingChange }: AddObjectModalProps) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [year, setYear] = useState(THIS_YEAR - 2)
  const [condition, setCondition] = useState<Condition>('good')
  const [category, setCategory] = useState('General')
  const [importance, setImportance] = useState(5)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priceNum = Number(price.replace(',', '.'))
  const canSubmit = name.trim().length >= 2 && Number.isFinite(priceNum) && priceNum >= 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    onValuingChange?.(true)
    setError(null)
    try {
      // Only add to inventory after idealo succeeds — errors leave the house unchanged.
      const vi = await holdIdealoMoment(() =>
        createManualItem({
          name: name.trim(),
          price_eur: priceNum,
          purchase_year: year,
          condition,
          category: category.trim() || 'General',
          importance,
          notes: notes.trim(),
        }),
      )
      onAdd(vi)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      onValuingChange?.(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
      <label className="block">
        <span className="label-sm text-muted">Object name</span>
        <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className="field mt-1 h-11 w-full" placeholder="e.g. Bosch dishwasher" required maxLength={120} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label-sm text-muted">Price (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="field mt-1 h-11 w-full"
            placeholder="499"
            required
          />
        </label>
        <label className="block">
          <span className="label-sm text-muted">Year of use</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="field mt-1 h-11 w-full">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label-sm text-muted">Condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)} className="field mt-1 h-11 w-full">
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-sm text-muted">Category</span>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="field mt-1 h-11 w-full" placeholder="Appliance" maxLength={60} />
        </label>
      </div>

      <label className="block">
        <span className="flex items-baseline justify-between text-sm">
          <span className="label-sm text-muted">Importance</span>
          <span className="font-extrabold text-petrol">{importance}/10</span>
        </span>
        <input
          type="range"
          min={1}
          max={10}
          value={importance}
          onChange={(e) => setImportance(Number(e.target.value))}
          className="mt-2 w-full"
          style={{ accentColor: 'var(--petrol)' }}
        />
      </label>

      <label className="block">
        <span className="label-sm text-muted">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="field mt-1 min-h-[4.5rem] w-full resize-y py-2" maxLength={500} />
      </label>

      {error && (
        <p className="rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]" role="alert">
          {error}
          <span className="mt-1 block text-xs opacity-80">Nothing was added to the inventory.</span>
        </p>
      )}

      <button type="submit" className="btn btn-primary h-11 w-full" disabled={!canSubmit || busy}>
        {busy ? 'Asking idealo…' : 'Add to house'}
      </button>
    </form>
  )
}

function AiCreateChat({ onClose, onAdd, onValuingChange }: AddObjectModalProps) {
  const [messages, setMessages] = useState<ItemDraftMessage[]>([])
  const [draft, setDraft] = useState<ItemDraft>({})
  const [missing, setMissing] = useState<string[]>([])
  const [status, setStatus] = useState<'need_info' | 'ready' | 'rejected'>('need_info')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'booting' | 'chat' | 'idealo'>('booting')
  const started = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, status, error])

  useEffect(() => {
    if (started.current) return
    started.current = true
    setBusy(true)
    setPhase('booting')
    // Conversation turns hit /api/items/draft (LLM). Final confirm hits /api/items/manual (idealo).
    draftItemTurn({ messages: [], draft: {} })
      .then((res) => {
        setMessages([{ role: 'assistant', content: res.assistant_message }])
        setDraft(res.draft)
        setMissing(res.missing_fields)
        setStatus(res.status)
        setPhase('chat')
        if (res.status === 'rejected') {
          setError(res.assistant_message || 'AI rejected this request.')
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('chat')
      })
      .finally(() => setBusy(false))
  }, [])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy || adding || status === 'ready') return
    const nextThread: ItemDraftMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextThread)
    setInput('')
    setBusy(true)
    setPhase('chat')
    setError(null)
    try {
      // Full chat transcript → /api/items/draft (LLM). Confirm later → /api/items/manual (idealo).
      const res = await draftItemTurn({ messages: nextThread, draft })
      setMessages([...nextThread, { role: 'assistant', content: res.assistant_message }])
      setDraft(res.draft)
      setMissing(res.missing_fields)
      setStatus(res.status)
      if (res.status === 'rejected') {
        setError(res.assistant_message || 'AI rejected this request.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  async function confirmAdd() {
    const { name, price_eur, purchase_year, condition, importance, category, notes } = draft
    if (status !== 'ready' || !name || price_eur == null || purchase_year == null || !condition || importance == null) return
    setAdding(true)
    setPhase('idealo')
    onValuingChange?.(true)
    setError(null)
    try {
      const vi = await holdIdealoMoment(() =>
        createManualItem({
          name,
          price_eur,
          purchase_year,
          condition,
          category: category ?? 'General',
          importance,
          notes: notes ?? '',
        }),
      )
      onAdd(vi)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('chat')
    } finally {
      setAdding(false)
      onValuingChange?.(false)
    }
  }

  const fieldNames: Record<string, string> = {
    name: 'name',
    price_eur: 'price',
    purchase_year: 'year',
    condition: 'condition',
    importance: 'importance',
  }
  const filled = (['name', 'price_eur', 'purchase_year', 'condition', 'importance'] as const).filter((k) => draft[k] != null && draft[k] !== '')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-low/70 px-4 py-2">
        <span className="label-sm text-muted">AI chat · /api/items/draft</span>
        <span className="text-xs font-semibold text-ink2">
          {phase === 'booting' || busy ? 'AI is typing…' : phase === 'idealo' ? 'Looking up on idealo…' : status === 'ready' ? 'Ready to confirm' : 'Your turn'}
        </span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}-${m.content.slice(0, 24)}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                m.role === 'user'
                  ? 'rounded-br-md bg-midnight text-white'
                  : 'rounded-bl-md border border-line bg-surface text-ink'
              }`}
            >
              {m.role === 'assistant' && <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">AI</span>}
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-sm text-muted shadow-sm">
              <span className="inline-flex gap-1" aria-label="AI is typing">
                <i className="ai-typing-dot" />
                <i className="ai-typing-dot" />
                <i className="ai-typing-dot" />
              </span>
            </div>
          </div>
        )}

        {filled.length > 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-canvas/80 px-3 py-2">
            <p className="label-sm mb-1.5 text-muted">Draft so far</p>
            <div className="flex flex-wrap gap-1.5">
              {filled.map((k) => (
                <span key={k} className="rounded-full bg-petrol/10 px-2 py-0.5 text-xs font-semibold text-petrol">
                  {fieldNames[k]}: {String(draft[k])}
                </span>
              ))}
              {missing.map((k) => (
                <span key={k} className="rounded-full bg-amber/15 px-2 py-0.5 text-xs font-semibold text-amber">
                  need {fieldNames[k] ?? k}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]" role="alert">
            {error}
            <span className="mt-1 block text-xs opacity-80">Nothing was added to the inventory.</span>
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
        {status === 'ready' ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">AI draft is complete. Confirm to look it up on idealo (nothing is saved if idealo fails).</p>
            <button type="button" className="btn btn-primary h-11 w-full" disabled={adding} onClick={confirmAdd}>
              {adding ? 'Asking idealo…' : 'Confirm & price on idealo'}
            </button>
          </div>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <textarea
              ref={inputRef}
              autoFocus
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              disabled={busy || adding}
              maxLength={2000}
              placeholder="e.g. Bosch dishwasher, €499, bought 2022, good condition, importance 8"
              className="field min-h-[2.75rem] min-w-0 flex-1 resize-none py-2.5 text-sm"
            />
            <button type="submit" className="btn btn-primary h-11 shrink-0 self-stretch px-4" disabled={busy || adding || !input.trim()}>
              Send
            </button>
          </form>
        )}
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

