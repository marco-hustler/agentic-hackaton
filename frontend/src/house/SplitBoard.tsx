import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Assignment, AssignmentAction, DemoScenario, ValuedItem } from '../types/inventory'
import { participantColor } from '../world/rooms'
import { formatEur, pct, verb } from './format'

type SplitBoardProps = {
  scenario: DemoScenario | null
  error: string | null
  /** The two people the solver splits between. */
  names: [string, string]
  /** Everyone in the process; people beyond the first two get an empty box for now. */
  people: string[]
  solving: boolean
  /** Items waiting in the middle for the next Split. */
  unsplit: ValuedItem[]
  onSplit: () => void
  onOpenItem: (id: string) => void
}

type Phase = 'idle' | 'thinking' | 'flying'
/** A short beat before the cards leave, even if the agent answers instantly. */
const THINK_MIN_MS = 350
const FLY_MS = 820
const FLY_STAGGER_MS = 120
/** Size of a card once it sits on a room floor. */
const MINI_PX = 56

const MODE_LABEL: Record<string, string> = {
  balanced: 'Closest to 50/50',
  min_cash: 'Least cash',
  liquidate_contested: 'Sell what both want',
}

function sideOf(action: AssignmentAction): 0 | 1 | null {
  if (action === 'party_a' || action === 'keep_a_buy_new_b') return 0
  if (action === 'party_b' || action === 'keep_b_buy_new_a') return 1
  return null
}

function Thumb({ vi }: { vi: ValuedItem }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white" aria-hidden>
      {vi.valuation.image_url ? (
        <img src={vi.valuation.image_url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
      ) : (
        <span className="h-4 w-4 rounded-md bg-clay" />
      )}
    </span>
  )
}

/** One item row in a person's box: photo, name, value. */
function ItemRow({ vi, a, note, onOpen }: { vi: ValuedItem; a: Assignment; note?: string; onOpen: () => void }) {
  return (
    <li className="pop-in">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-low active:scale-[0.99]"
      >
        <Thumb vi={vi} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{vi.item.name}</span>
          {note && <span className="block truncate text-xs text-muted">{note}</span>}
        </span>
        <span className="shrink-0 font-extrabold text-petrol">{formatEur(a.fair_value_eur)}</span>
      </button>
    </li>
  )
}

type BoxProps = {
  /** Where flying cards land: "0", "1" or "sold". */
  dropKey?: string
  name: string
  color: string
  total?: number
  share?: number
  approved: boolean
  onApprove?: () => void
  children: React.ReactNode
}

/** A person's box: name, approve tick, their items, their total. */
function PersonBox({ dropKey, name, color, total, share, approved, onApprove, children }: BoxProps) {
  return (
    <section
      data-split-box={dropKey}
      className="panel pop-in flex min-h-0 flex-col overflow-hidden"
      style={{ background: '#ffffff' }}
      aria-label={name}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight text-petrol">{name}</h3>
        {onApprove && (
          <button
            type="button"
            onClick={onApprove}
            aria-pressed={approved}
            title={approved ? `${name} approved this split` : `Approve as ${name}`}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition active:scale-95 ${
              approved ? 'bg-sage text-white' : 'border border-line text-ink2 hover:border-sage hover:text-sage'
            }`}
          >
            ✓ <span>{approved ? 'Approved' : 'Approve'}</span>
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      {total !== undefined && (
        <footer className="flex items-baseline justify-between border-t border-line px-4 py-3">
          <span className="text-sm text-muted">{share}% of the value</span>
          <span className="text-xl font-extrabold tracking-tight" style={{ color }}>
            {formatEur(total)}
          </span>
        </footer>
      )}
    </section>
  )
}

function DetailsModal({ scenario, names, onClose }: { scenario: DemoScenario; names: [string, string]; onClose: () => void }) {
  const s = scenario.split
  const cash = s.cash_transfer_a_to_b_eur
  const rows: [string, string, string?][] = [
    ['Total fair value', formatEur(s.total_fair_value_eur)],
    [`${names[0]} ${verb(names[0], 'receives', 'receive')}`, `${formatEur(s.party_a_received_goods_eur)} of ${formatEur(s.party_a_entitled_eur)}`, 'text-terracotta'],
    [`${names[1]} ${verb(names[1], 'receives', 'receive')}`, `${formatEur(s.party_b_received_goods_eur)} of ${formatEur(s.party_b_entitled_eur)}`, 'text-sage'],
    ...(s.sell_pool_eur > 0 ? ([['Sold and split', formatEur(s.sell_pool_eur)]] as [string, string][]) : []),
    [
      'Cash transfer',
      Math.abs(cash) < 1 ? 'None' : `${cash >= 0 ? names[0] : names[1]} → ${cash >= 0 ? names[1] : names[0]} ${formatEur(Math.abs(cash))}`,
    ],
    ['Wishes met', `${names[0]} ${pct(s.party_a_points_won, s.party_a_points_total)}% · ${names[1]} ${pct(s.party_b_points_won, s.party_b_points_total)}%`],
    ['Fairness', `${Math.round(s.fairness_score_pct)}%${s.is_envy_free ? ' · envy-free' : ''}`],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="fade-in absolute inset-0 bg-midnight/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="How the split is calculated" className="panel pop-in relative z-10 max-h-[85vh] w-full max-w-xl overflow-y-auto p-6" style={{ background: '#ffffff' }}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-extrabold tracking-tight text-petrol">How the split is calculated</h3>
          <button type="button" onClick={onClose} className="btn btn-ghost h-8 px-2.5 text-xs">
            Close
          </button>
        </div>
        {s.agent_note && <p className="mt-2 rounded-2xl bg-midnight px-4 py-3 text-sm text-white">{s.agent_note}</p>}
        <p className="mt-2 text-sm text-ink2">Prices come from idealo offers by well-rated shops, minus age and condition.</p>
        <dl className="mt-4 divide-y divide-line rounded-2xl bg-surface-low px-4 text-sm">
          {rows.map(([k, v, cls]) => (
            <div key={k} className="flex justify-between gap-3 py-2.5">
              <dt className="text-ink2">{k}</dt>
              <dd className={`text-right font-bold ${cls ?? 'text-petrol'}`}>{v}</dd>
            </div>
          ))}
        </dl>

        {s.arbitrage_highlights.length > 0 && (
          <div className="mt-5">
            <p className="label-sm text-ink2">Smart buys</p>
            <ul className="mt-2 space-y-2">
              {s.arbitrage_highlights.map((h) => (
                <li key={h.item_id} className="rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
                  <p className="font-bold text-ink">{h.item_name}</p>
                  {h.buy_new_savings_note && <p className="mt-0.5 text-xs text-ink2">{h.buy_new_savings_note}</p>}
                  {h.buy_new_url && (
                    <a href={h.buy_new_url} target="_blank" rel="noreferrer" className="btn btn-agent mt-2 h-7 px-2.5 text-xs">
                      Buy new on idealo
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.replacement_basket.length > 0 && (
          <div className="mt-5">
            <p className="label-sm text-ink2">Replace what you give up</p>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line text-sm">
              {s.replacement_basket.map((r) => {
                const who = r.for_party === 'party_a' ? names[0] : names[1]
                return (
                  <li key={`${r.for_party}-${r.item_name}`} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">{r.matched_title}</span>
                      <span className="block text-[11px] text-muted">
                        For {who}
                        {r.is_deal ? ' · deal' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 font-extrabold text-petrol">{formatEur(r.replacement_price_eur)}</span>
                    {r.offer_url && (
                      <a href={r.offer_url} target="_blank" rel="noreferrer" className="btn btn-ghost h-7 shrink-0 px-2 text-xs" aria-label={`Open ${r.matched_title} on idealo`}>
                        ↗
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/** A small card in the middle pile: photo, name, value. */
function PileCard({ vi, waiting, index, count, cardRef, onOpen }: {
  vi: ValuedItem
  waiting: boolean
  index: number
  count: number
  cardRef: (el: HTMLElement | null) => void
  onOpen: () => void
}) {
  // Fanned like a hand of cards: a small tilt and a lift towards the middle.
  const PER_ROW = 10
  const rowStart = index - (index % PER_ROW)
  const mid = (Math.min(count - rowStart, PER_ROW) - 1) / 2
  const k = (index % PER_ROW) - mid
  return (
    <li className="pile-slot" style={{ rotate: `${k * 4}deg`, translate: `0 ${Math.abs(k) * 5}px`, zIndex: 10 - Math.abs(Math.round(k)) }}>
      <button
        ref={cardRef}
        type="button"
        onClick={onOpen}
        disabled={waiting}
        className={`pile-card flex w-24 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[0_10px_24px_-12px_rgba(15,23,42,0.35)] pop-in transition hover:-translate-y-2 xl:w-28`}
      >
        <span className="relative flex aspect-square w-full items-center justify-center bg-white">
          {vi.valuation.image_url ? (
            <img src={vi.valuation.image_url} alt="" className="absolute inset-0 h-full w-full object-contain p-2" />
          ) : (
            <span className="h-6 w-6 rounded-md bg-clay" />
          )}
        </span>
        <span className="border-t border-line px-2 py-1.5">
          <span className="block truncate text-xs font-bold text-ink">{vi.item.name}</span>
          <span className="block text-sm font-extrabold text-petrol">{formatEur(vi.valuation.fair_value_eur)}</span>
        </span>
      </button>
    </li>
  )
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Where a card lands: a room floor point (stays small) or a side box. */
type Landing = { x: number; y: number; scale: number; bump: Element | null }

function landingFor(target: Element, fromWidth: number): Landing {
  const to = target.getBoundingClientRect()
  if (target.hasAttribute('data-room-floor')) {
    return { x: to.left, y: to.top, scale: MINI_PX / fromWidth, bump: null }
  }
  return { x: to.left + to.width / 2, y: to.top + Math.min(to.height / 2, 180), scale: 0.3, bump: target }
}

/** Glide a copy of `el` along an arc to its landing; resolves when it lands. No spinning. */
function flyCard(el: HTMLElement, target: Element, delay: number, clones: Set<HTMLElement>): Promise<void> {
  const from = el.getBoundingClientRect()
  const land = landingFor(target, from.width)
  const clone = el.cloneNode(true) as HTMLElement
  clone.classList.remove('pop-in')
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '60',
    pointerEvents: 'none',
    animation: 'none',
    rotate: '0deg',
  })
  document.body.appendChild(clone)
  clones.add(clone)
  const dx = land.x - (from.left + from.width / 2)
  const dy = land.y - (from.top + from.height / 2)
  const lift = Math.min(160, 60 + Math.abs(dx) * 0.15)
  const anim = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1)', boxShadow: '0 10px 24px -12px rgba(15,23,42,0.35)' },
      { transform: 'translate(0, -18px) scale(1.08)', boxShadow: '0 26px 40px -14px rgba(15,23,42,0.45)', offset: 0.15 },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(${(1 + land.scale) / 1.6})`,
        boxShadow: '0 30px 48px -16px rgba(15,23,42,0.45)',
        offset: 0.6,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${land.scale})`, boxShadow: '0 4px 10px -4px rgba(15,23,42,0.4)' },
    ],
    { duration: FLY_MS, delay, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'both' },
  )
  el.style.visibility = 'hidden'
  return anim.finished
    .catch(() => undefined)
    .then(() => {
      clone.remove()
      clones.delete(clone)
      land.bump?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      )
    })
}

/**
 * The items on a room floor, as a stack of photo cards (portalled into the room's floor anchor).
 * Hovering the stack fans the cards out so each one can be seen and opened.
 */
function RoomStack({ items, color, onOpen }: { items: ValuedItem[]; color: string; onOpen: (id: string) => void }) {
  if (items.length === 0) return null
  const n = items.length
  const mid = (n - 1) / 2
  const spread = Math.min(46, 260 / Math.max(n - 1, 1))
  return (
    <div className="room-stack pointer-events-auto absolute left-0 top-0" style={{ width: MINI_PX, height: MINI_PX }}>
      {items.map((vi, i) => {
        const k = i - mid
        const vars = {
          // stacked: a slightly messy pile, newest on top
          '--sx': `${(i - (n - 1)) * 2}px`,
          '--sy': `${(i - (n - 1)) * 3}px`,
          '--sr': `${((i * 37) % 9) - 4}deg`,
          // fanned: an arc opening upwards
          '--fx': `${k * spread}px`,
          '--fy': `${Math.abs(k) * Math.abs(k) * 4 - 34}px`,
          '--fr': `${k * 9}deg`,
          '--d': `${i * 18}ms`,
          width: MINI_PX,
          height: MINI_PX,
          zIndex: i,
        } as React.CSSProperties
        return (
          <button
            key={vi.item.id}
            type="button"
            onClick={() => onOpen(vi.item.id)}
            title={`${vi.item.name} · ${formatEur(vi.valuation.fair_value_eur)}`}
            className="room-card absolute -left-1/2 -top-1/2 flex items-center justify-center overflow-hidden rounded-xl border-2 bg-white shadow-[0_6px_14px_-6px_rgba(15,23,42,0.5)]"
            style={{ ...vars, borderColor: color }}
          >
            {vi.valuation.image_url ? (
              <img src={vi.valuation.image_url} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="h-4 w-4 rounded-md bg-clay" />
            )}
          </button>
        )
      })}
      <span
        className="room-stack-count pointer-events-none absolute flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-extrabold text-white shadow"
        style={{ background: color, zIndex: n + 1, left: MINI_PX / 2 - 14, top: -MINI_PX / 2 - 12 }}
      >
        {n}
      </span>
    </div>
  )
}

/** The room floor anchors the 3D scene exposes, found once they are mounted. */
function useRoomFloors(): Element[] {
  const [floors, setFloors] = useState<Element[]>([])
  useEffect(() => {
    let raf = 0
    let tries = 0
    const look = () => {
      const found = [...document.querySelectorAll('[data-room-floor]')].sort(
        (a, b) => Number(a.getAttribute('data-room-floor')) - Number(b.getAttribute('data-room-floor')),
      )
      if (found.length > 0) setFloors(found)
      else if (tries++ < 120) raf = requestAnimationFrame(look)
    }
    look()
    return () => cancelAnimationFrame(raf)
  }, [])
  return floors
}

/**
 * The split page. New items wait in a pile in the middle; Split asks the agent,
 * the cards spin while it thinks and then fly into each person's box.
 * Meter on top, the house in the middle (the 3D frame), one box per person on the sides.
 */
export function SplitBoard({ scenario, error, names, people, solving, unsplit, onSplit, onOpenItem }: SplitBoardProps) {
  const [showDetails, setShowDetails] = useState(false)
  /** Who approved which proposal; a new proposal needs new approvals. */
  const [approvals, setApprovals] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<Phase>('idle')
  /** The pile as it was when Split was pressed (the live list empties straight away). */
  const [pile, setPile] = useState<ValuedItem[]>([])
  /** Cards that already landed in a box during this Split. */
  const [landed, setLanded] = useState<Set<string>>(new Set())
  const startedAt = useRef(0)
  const floors = useRoomFloors()
  const cardEls = useRef(new Map<string, HTMLElement>())
  const clones = useRef(new Set<HTMLElement>())
  /** Latest scenario for the flight, which must not restart when a save refreshes it. */
  const scenarioRef = useRef(scenario)
  useEffect(() => {
    scenarioRef.current = scenario
  }, [scenario])

  // Spinning → flying once the agent answered with every card in it.
  useEffect(() => {
    if (phase !== 'thinking' || !scenario || solving) return
    const assigned = new Set(scenario.split.assignments.map((a) => a.item_id))
    if (!pile.every((vi) => assigned.has(vi.item.id))) return
    const wait = Math.max(0, THINK_MIN_MS - (performance.now() - startedAt.current))
    const t = setTimeout(() => setPhase('flying'), wait)
    return () => clearTimeout(t)
  }, [phase, scenario, solving, pile])

  // Flying: every card spins to its box, one after the other.
  useEffect(() => {
    const current = scenarioRef.current
    if (phase !== 'flying' || !current) return
    let cancelled = false
    const byItem = new Map(current.split.assignments.map((a) => [a.item_id, a]))
    const flights = pile.map((vi, i) => {
      const a = byItem.get(vi.item.id)
      const el = cardEls.current.get(vi.item.id)
      const side = a ? sideOf(a.action) : null
      const target =
        side === null
          ? document.querySelector('[data-split-box="sold"]')
          : (document.querySelector(`[data-room-floor="${side}"]`) ?? document.querySelector(`[data-split-box="${side}"]`))
      const done = () => !cancelled && setLanded((prev) => new Set(prev).add(vi.item.id))
      if (!el || !target) {
        done()
        return Promise.resolve()
      }
      return flyCard(el, target, i * FLY_STAGGER_MS, clones.current).then(done)
    })
    Promise.all(flights).then(() => {
      if (cancelled) return
      setPhase('idle')
      setPile([])
      setLanded(new Set())
    })
    const live = clones.current
    return () => {
      cancelled = true
      live.forEach((c) => c.remove())
      live.clear()
    }
  }, [phase, pile])

  function startSplit() {
    setPile(unsplit)
    setLanded(new Set())
    startedAt.current = performance.now()
    setPhase(reducedMotion() ? 'idle' : 'thinking')
    onSplit()
  }

  if (!scenario) {
    return (
      <div className="split-meter panel flex items-center justify-center text-sm text-muted" style={{ background: '#ffffff' }}>
        {error ? `Could not load the split: ${error}` : 'The agent is preparing a split…'}
      </div>
    )
  }

  const busy = phase !== 'idle'
  const shownPile = busy ? pile : unsplit
  const hidden = new Set(busy ? pile.filter((vi) => !landed.has(vi.item.id)).map((vi) => vi.item.id) : [])

  const split = scenario.split
  const byId = new Map(scenario.valued_items.map((vi) => [vi.item.id, vi]))
  const mine: Assignment[][] = [[], []]
  const sold: Assignment[] = []
  for (const a of split.assignments) {
    if (hidden.has(a.item_id)) continue
    const side = sideOf(a.action)
    if (side === null) sold.push(a)
    else mine[side].push(a)
  }
  const anySplit = split.assignments.length > 0
  const anySold = split.assignments.some((a) => sideOf(a.action) === null)
  // While cards fly, the meter only counts what already landed, so it moves card by card.
  const landedGoods = [0, 1].map((side) =>
    split.assignments
      .filter((a) => !hidden.has(a.item_id) && sideOf(a.action) === side)
      .reduce((sum, a) => sum + a.fair_value_eur, 0),
  )
  const goods = busy ? landedGoods : [split.party_a_received_goods_eur, split.party_b_received_goods_eur]
  const aPct = pct(goods[0], goods[0] + goods[1])
  const shares = [aPct, 100 - aPct]
  const cash = split.cash_transfer_a_to_b_eur
  const payer = cash >= 0 ? names[0] : names[1]
  const payee = cash >= 0 ? names[1] : names[0]
  const proposal = `${split.assignments.map((a) => `${a.item_id}:${a.action}`).join(',')}|${Math.round(cash)}`
  const isApproved = (name: string) => anySplit && approvals[name] === proposal
  const approvedCount = names.filter(isApproved).length
  const toggle = (name: string) =>
    setApprovals((prev) => ({ ...prev, [name]: prev[name] === proposal ? '' : proposal }))

  const note = (a: Assignment, side: 0 | 1) => {
    if (a.action === 'keep_a_buy_new_b' || a.action === 'keep_b_buy_new_a') {
      return `${names[1 - side]} ${verb(names[1 - side], 'buys', 'buy')} a new one on idealo`
    }
    return a.is_contested ? 'Both wanted it' : undefined
  }

  const row = (a: Assignment, n?: string) => {
    const vi = byId.get(a.item_id)
    return vi ? <ItemRow key={a.item_id} vi={vi} a={a} note={n} onOpen={() => onOpenItem(a.item_id)} /> : null
  }

  const box = (name: string, i: number) =>
    i < 2 ? (
      <PersonBox
        key={name}
        dropKey={String(i)}
        name={name}
        color={participantColor(i)}
        total={busy ? undefined : goods[i]}
        share={shares[i]}
        approved={isApproved(name)}
        onApprove={anySplit && !busy ? () => toggle(name) : undefined}
      >
        {mine[i].length ? (
          <ul>{mine[i].map((a) => row(a, note(a, i as 0 | 1)))}</ul>
        ) : (
          <p className="p-4 text-center text-sm text-muted">
            {anySplit || busy ? `Nothing for ${name} yet` : 'Press Split to let the agent decide'}
          </p>
        )}
      </PersonBox>
    ) : (
      <PersonBox key={name} name={name} color={participantColor(i)} approved={false}>
        <p className="p-4 text-center text-sm text-muted">The agent splits between two people for now.</p>
      </PersonBox>
    )

  // Boxes alternate sides: 1st left, 2nd right, 3rd left…
  const all = people.length >= 2 ? people : names
  const left = all.map(box).filter((_, i) => i % 2 === 0)
  const right = all.map(box).filter((_, i) => i % 2 === 1)
  const soldBox = anySold && (
    <PersonBox key="sold" dropKey="sold" name="Sold and split" color="#64748b" approved={false}>
      {sold.length ? <ul>{sold.map((a) => row(a, 'Sold, money split by share'))}</ul> : null}
    </PersonBox>
  )

  const pillText =
    phase === 'thinking'
      ? 'Agent deciding…'
      : phase === 'flying'
        ? 'Splitting…'
        : solving
          ? 'Agent re-balancing…'
          : !anySplit
            ? 'Not split yet'
            : approvedCount === 2
              ? 'Agreed ✓'
              : `${approvedCount}/2 approved`

  return (
    <>
      {/* Meter */}
      <div className="split-meter panel pop-in" style={{ background: '#ffffff' }}>
        <div className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: participantColor(0) }} />
            {names[0]} <span className="font-extrabold text-terracotta">{shares[0]}%</span>
          </span>
          <span className={`pill ${approvedCount === 2 && !busy ? 'pill-settled' : 'pill-draft'}`}>{pillText}</span>
          <span className="flex items-center gap-1.5">
            <span className="font-extrabold text-sage">{shares[1]}%</span> {names[1]}
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: participantColor(1) }} />
          </span>
        </div>
        <div className="relative mt-2 flex h-3 overflow-hidden rounded-full bg-clay">
          <div className="bg-terracotta transition-all duration-700" style={{ width: `${shares[0]}%` }} />
          <div className="flex-1 bg-sage" />
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white shadow" aria-hidden />
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-midnight px-2.5 py-0.5 text-xs font-bold text-white">Agent</span>
          <span className="min-w-0 flex-1 truncate text-ink2">
            {busy ? (
              phase === 'thinking' ? 'Weighing every item…' : 'Handing out the items…'
            ) : !anySplit ? (
              'Waiting for you to press Split'
            ) : (
              <>
                {MODE_LABEL[split.mode] ?? split.mode} ·{' '}
                {Math.abs(cash) < 1 ? (
                  'no cash to pay'
                ) : (
                  <>
                    <b className="text-petrol">{payer}</b> {verb(payer, 'pays', 'pay')} <b className="text-petrol">{payee}</b>{' '}
                    <b className="text-terracotta">{formatEur(Math.abs(cash))}</b>
                  </>
                )}
              </>
            )}
          </span>
          {anySplit && !busy && (
            <button type="button" onClick={() => setShowDetails(true)} className="btn btn-ghost h-8 shrink-0 px-3 text-xs">
              Why?
            </button>
          )}
        </div>
      </div>

      {/* Pile: items waiting for the next Split, over the house */}
      {shownPile.length > 0 && (
        <div className="split-tray pop-in" data-phase={phase}>
          <button type="button" onClick={startSplit} disabled={busy} className="split-button">
            {busy ? 'Splitting…' : `Split ${shownPile.length} ${shownPile.length === 1 ? 'item' : 'items'}`}
          </button>
          <ul className="flex max-h-full flex-wrap items-end justify-center gap-y-4 px-5 pb-1 pt-3">
            {shownPile.map((vi, i) => (
              <PileCard
                key={vi.item.id}
                vi={vi}
                index={i}
                count={shownPile.length}
                waiting={busy}
                cardRef={(el) => {
                  if (el) cardEls.current.set(vi.item.id, el)
                  else cardEls.current.delete(vi.item.id)
                }}
                onOpen={() => onOpenItem(vi.item.id)}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="split-sides">
        <div className="split-side split-side-left">
          {left}
          {right.length < left.length && soldBox}
        </div>
        <div className="split-side split-side-right">
          {right}
          {right.length >= left.length && soldBox}
        </div>
      </div>

      {/* Split items sit on their owner's room floor in the house */}
      {floors.slice(0, 2).map((floor, side) =>
        createPortal(
          <RoomStack
            items={mine[side].map((a) => byId.get(a.item_id)).filter((vi): vi is ValuedItem => !!vi)}
            color={participantColor(side)}
            onOpen={onOpenItem}
          />,
          floor,
          `room-${side}`,
        ),
      )}

      {showDetails && <DetailsModal scenario={scenario} names={names} onClose={() => setShowDetails(false)} />}
    </>
  )
}
