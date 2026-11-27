import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createManualItem,
  draftItemTurn,
  type ItemDraft,
  type ItemDraftMessage,
} from '../api/client'
import type { Condition, DemoScenario, ValuedItem } from '../types/inventory'
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

            {!error && inventoryCount === 0 && (
              <Empty>{q ? 'Nothing in this house matches.' : 'No items yet. Add an object to get started.'}</Empty>
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

      {addingOpen && <AddObjectModal onClose={() => onAddingOpenChange(false)} onAdd={onAdd} />}
    </section>
  )
}

type CreateMode = 'static' | 'ai'

type AddObjectModalProps = {
  onClose: () => void
  onAdd: (vi: ValuedItem) => void
}

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
]

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 30 }, (_, i) => THIS_YEAR - i)

function AddObjectModal({ onClose, onAdd }: AddObjectModalProps) {
  const [mode, setMode] = useState<CreateMode>('static')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Add object">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-midnight/40 backdrop-blur-sm" onClick={onClose} />
      <div className="pop-in relative z-10 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line bg-canvas shadow-[0_24px_60px_-16px_rgba(15,23,42,0.45)] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-petrol">Add object</h3>
            <p className="mt-0.5 text-sm text-muted">Manual form or short description.</p>
          </div>
          <button type="button" className="btn btn-ghost h-9 w-9 rounded-full px-0" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="border-b border-line px-5 py-3">
          <div className="view-switch inline-flex w-full items-center gap-1 p-1" role="group" aria-label="Creation mode">
            <button
              type="button"
              className={`view-switch-option min-w-0 flex-1 ${mode === 'static' ? 'view-switch-option-active' : ''}`}
              aria-pressed={mode === 'static'}
              onClick={() => setMode('static')}
            >
              Manual
            </button>
            <button
              type="button"
              className={`view-switch-option min-w-0 flex-1 ${mode === 'ai' ? 'view-switch-option-active' : ''}`}
              aria-pressed={mode === 'ai'}
              onClick={() => setMode('ai')}
            >
              AI
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'static' ? <StaticCreateForm onClose={onClose} onAdd={onAdd} /> : <AiCreateChat onClose={onClose} onAdd={onAdd} />}
        </div>
      </div>
    </div>
  )
}

function StaticCreateForm({ onClose, onAdd }: AddObjectModalProps) {
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
    setError(null)
    try {
      onAdd(
        await createManualItem({
          name: name.trim(),
          price_eur: priceNum,
          purchase_year: year,
          condition,
          category: category.trim() || 'General',
          importance,
          notes: notes.trim(),
        }),
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
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

      {error && <p className="text-sm text-error">{error}</p>}

      <button type="submit" className="btn btn-primary h-11 w-full" disabled={!canSubmit || busy}>
        {busy ? 'Adding…' : 'Add to house'}
      </button>
    </form>
  )
}

function AiCreateChat({ onClose, onAdd }: AddObjectModalProps) {
  const [messages, setMessages] = useState<ItemDraftMessage[]>([])
  const [draft, setDraft] = useState<ItemDraft>({})
  const [missing, setMissing] = useState<string[]>([])
  const [status, setStatus] = useState<'need_info' | 'ready' | 'rejected'>('need_info')
  const [prompt, setPrompt] = useState('Name, price, year, condition, importance (1–10).')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    setBusy(true)
    draftItemTurn({ messages: [], draft: {} })
      .then((res) => {
        setPrompt(res.assistant_message)
        setDraft(res.draft)
        setMissing(res.missing_fields)
        setStatus(res.status)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }, [])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy || status === 'ready') return
    const nextMessages: ItemDraftMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const res = await draftItemTurn({ messages: nextMessages, draft })
      setMessages([...nextMessages, { role: 'assistant', content: res.assistant_message }])
      setPrompt(res.assistant_message)
      setDraft(res.draft)
      setMissing(res.missing_fields)
      setStatus(res.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmAdd() {
    if (status !== 'ready' || !draft.name || draft.price_eur == null || draft.purchase_year == null || !draft.condition || draft.importance == null) return
    setBusy(true)
    setError(null)
    try {
      onAdd(
        await createManualItem({
          name: draft.name,
          price_eur: draft.price_eur,
          purchase_year: draft.purchase_year,
          condition: draft.condition,
          category: draft.category ?? 'General',
          importance: draft.importance,
          notes: draft.notes ?? '',
        }),
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const fieldNames: Record<string, string> = {
    name: 'name',
    price_eur: 'price',
    purchase_year: 'year',
    condition: 'condition',
    importance: 'importance',
  }
  const missingLabel = missing.length > 0 ? missing.map((k) => fieldNames[k] ?? k).join(', ') : null

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <p className="text-sm text-ink2">{prompt}</p>
      {missingLabel && status !== 'ready' && <p className="label-sm text-muted">Still need: {missingLabel}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      {status === 'ready' ? (
        <button type="button" className="btn btn-primary h-11 w-full" disabled={busy} onClick={confirmAdd}>
          {busy ? 'Adding…' : 'Add to house'}
        </button>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder="Describe the object"
            className="field h-11 min-w-0 flex-1"
          />
          <button type="submit" className="btn btn-primary h-11 shrink-0 px-4" disabled={busy || !input.trim()}>
            {busy ? '…' : 'Send'}
          </button>
        </form>
      )}
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

