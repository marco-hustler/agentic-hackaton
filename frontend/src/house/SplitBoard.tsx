import { useState } from 'react'
import type { Assignment, AssignmentAction, DemoScenario, SplitMode, ValuedItem } from '../types/inventory'
import { participantColor } from '../world/rooms'
import { formatEur, pct, verb } from './format'

type SplitBoardProps = {
  scenario: DemoScenario | null
  error: string | null
  names: [string, string]
  solving: boolean
  onSetMode: (mode: SplitMode) => void
  onOpenItem: (id: string) => void
  onForce: (id: string, action: AssignmentAction | null) => void
}

const MODES: { value: SplitMode; label: string; hint: string }[] = [
  { value: 'balanced', label: 'Balanced', hint: 'Closest to a 50/50 value split' },
  { value: 'min_cash', label: 'Less cash', hint: 'Fewer euros changing hands' },
  { value: 'liquidate_contested', label: 'Sell contested', hint: 'Sell what both want and split the money' },
]

const SIDE_TINT = ['bg-[#ffdad4] text-[#8a1c10]', 'bg-[#d1fae5] text-[#065f46]'] as const

function sideOf(action: AssignmentAction): 0 | 1 | null {
  if (action === 'party_a' || action === 'keep_a_buy_new_b') return 0
  if (action === 'party_b' || action === 'keep_b_buy_new_a') return 1
  return null
}

function Photo({ vi, className }: { vi: ValuedItem; className: string }) {
  return (
    <span className={`flex items-center justify-center overflow-hidden bg-white ${className}`} aria-hidden>
      {vi.valuation.image_url ? (
        <img src={vi.valuation.image_url} alt="" loading="lazy" className="h-full w-full object-contain p-2" />
      ) : (
        <span className="h-6 w-6 rounded-md bg-clay" />
      )}
    </span>
  )
}

/** Minimal tile: photo, name, price. A lock dot when the user pinned it. */
function ItemCard({ vi, a, onOpen }: { vi: ValuedItem; a: Assignment; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-10px_rgba(15,23,42,0.25)] active:scale-[0.98]"
      >
        <Photo vi={vi} className="aspect-[16/10] w-full border-b border-line" />
        {vi.item.forced_action && (
          <span className="absolute right-2 top-2 rounded-full bg-midnight px-2 py-0.5 text-[10px] font-bold text-white">Locked</span>
        )}
        <span className="flex flex-1 flex-col justify-between gap-1 p-2.5">
          <span className="line-clamp-2 text-sm font-bold leading-snug text-ink">{vi.item.name}</span>
          <span className="text-base font-extrabold text-petrol">{formatEur(a.fair_value_eur)}</span>
        </span>
      </button>
    </li>
  )
}

/** Contested tile: same card, plus one-tap decisions. */
function ContestedCard({
  vi,
  a,
  names,
  onOpen,
  onForce,
}: {
  vi: ValuedItem
  a: Assignment
  names: [string, string]
  onOpen: () => void
  onForce: (action: AssignmentAction | null) => void
}) {
  const side = sideOf(a.action)
  const forced = vi.item.forced_action ?? null
  const choices: { action: AssignmentAction; label: string; cls: string }[] = [
    { action: 'party_a', label: names[0], cls: SIDE_TINT[0] },
    { action: 'party_b', label: names[1], cls: SIDE_TINT[1] },
    { action: 'sell_split', label: 'Sell', cls: 'bg-clay text-petrol' },
  ]
  return (
    <li className="overflow-hidden rounded-2xl border border-[#fecaca] bg-surface shadow-[0_8px_20px_-12px_rgba(186,26,26,0.35)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <Photo vi={vi} className="aspect-[16/10] w-full border-b border-line" />
        <span className="block p-2.5 pb-1.5">
          <span className="line-clamp-2 text-sm font-bold leading-snug text-ink">{vi.item.name}</span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="text-base font-extrabold text-petrol">{formatEur(a.fair_value_eur)}</span>
            <span className="truncate text-[11px] font-bold text-muted">
              → {side === null ? 'sold' : names[side]}
            </span>
          </span>
        </span>
      </button>
      <div className="grid grid-cols-3 gap-1 p-2 pt-0">
        {choices.map((c) => (
          <button
            key={c.action}
            type="button"
            onClick={() => onForce(forced === c.action ? null : c.action)}
            aria-pressed={forced === c.action}
            className={`truncate rounded-lg px-1.5 py-1.5 text-[11px] font-bold transition ${c.cls} ${
              forced === c.action ? 'ring-2 ring-petrol' : 'opacity-80 hover:opacity-100'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </li>
  )
}

function ColumnHeader({ name, color, count, total, share }: { name: string; color: string; count: number; total: number; share: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-low px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-extrabold text-white" style={{ background: color }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-extrabold tracking-tight text-petrol">{name}</p>
          <p className="text-xs text-muted">
            {count} {count === 1 ? 'item' : 'items'} · {share}%
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xl font-extrabold tracking-tight" style={{ color }}>
        {formatEur(total)}
      </span>
    </div>
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
        <p className="mt-1 text-sm text-ink2">Prices come from idealo offers by well-rated shops, minus age and condition.</p>
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

/**
 * The split board: one column per person, contested items in the middle with
 * one-tap decisions, and a dock with the balance, the cash transfer and the mode.
 */
export function SplitBoard({ scenario, error, names, solving, onSetMode, onOpenItem, onForce }: SplitBoardProps) {
  const [showDetails, setShowDetails] = useState(false)

  if (!scenario) {
    return <div className="split-board flex items-center justify-center text-sm text-muted">{error ? `Could not load the split: ${error}` : 'Loading the split…'}</div>
  }

  const split = scenario.split
  const byId = new Map(scenario.valued_items.map((vi) => [vi.item.id, vi]))
  const cols: Assignment[][] = [[], []]
  const middle: Assignment[] = []
  const owned = [0, 0]
  for (const a of split.assignments) {
    const side = sideOf(a.action)
    if (side !== null) owned[side] += 1
    if (a.is_contested || side === null) middle.push(a)
    else cols[side].push(a)
  }
  const goods = [split.party_a_received_goods_eur, split.party_b_received_goods_eur]
  const aPct = pct(goods[0], goods[0] + goods[1])
  const shares = [aPct, 100 - aPct]
  const gap = Math.abs(goods[0] - goods[1])
  const cash = split.cash_transfer_a_to_b_eur
  const payer = cash >= 0 ? names[0] : names[1]
  const payee = cash >= 0 ? names[1] : names[0]
  const color = [participantColor(0), participantColor(1)]

  const card = (a: Assignment, contested: boolean) => {
    const vi = byId.get(a.item_id)
    if (!vi) return null
    return contested ? (
      <ContestedCard key={a.item_id} vi={vi} a={a} names={names} onOpen={() => onOpenItem(a.item_id)} onForce={(act) => onForce(a.item_id, act)} />
    ) : (
      <ItemCard key={a.item_id} vi={vi} a={a} onOpen={() => onOpenItem(a.item_id)} />
    )
  }

  return (
    <>
      <div className="split-board">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {[0, 1].map((side) => (
            <section key={side} className={`flex flex-col gap-3 lg:col-span-4 ${side === 1 ? 'lg:order-3' : 'lg:order-1'}`} aria-label={names[side]}>
              <ColumnHeader name={names[side]} color={color[side]} count={owned[side]} total={goods[side]} share={shares[side]} />
              {cols[side].length > 0 ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">{cols[side].map((a) => card(a, false))}</ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">Nothing uncontested yet</p>
              )}
            </section>
          ))}

          <section className="flex flex-col gap-3 lg:order-2 lg:col-span-4" aria-label="Contested">
            <div className="rounded-2xl bg-[#ffdad6]/50 px-3 py-3 text-center">
              <p className="text-sm font-extrabold tracking-tight text-[#93000a]">Contested</p>
              <p className="text-xs text-ink2">
                {middle.length} · {formatEur(middle.reduce((s, a) => s + a.fair_value_eur, 0))}
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">{middle.map((a) => card(a, true))}</ul>
            {middle.length === 0 && <p className="text-center text-xs text-muted">Nothing contested</p>}
          </section>
        </div>
      </div>

      {/* Dock */}
      <div className="split-dock pop-in-late">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color[0] }} />
                {names[0]} <span className="font-extrabold text-terracotta">{shares[0]}%</span>
              </span>
              <span className={`pill ${gap < 50 ? 'pill-settled' : 'pill-draft'}`}>
                {solving ? 'Re-balancing…' : `Gap ${formatEur(gap)}`}
              </span>
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <span className="font-extrabold text-sage">{shares[1]}%</span> {names[1]}
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color[1] }} />
              </span>
            </div>
            <div className="relative mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-clay">
              <div className="bg-terracotta transition-all duration-500" style={{ width: `${shares[0]}%` }} />
              <div className="flex-1 bg-sage" />
              <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white shadow" aria-hidden />
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl bg-surface-low px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-midnight text-sm font-extrabold text-white" aria-hidden>
              €
            </span>
            <span className="text-sm">
              <span className="label-sm block text-muted">Cash to even out</span>
              {Math.abs(cash) < 1 ? (
                <span className="font-bold text-petrol">Nothing to pay</span>
              ) : (
                <span className="text-petrol">
                  <b>{payer}</b> {verb(payer, 'pays', 'pay')} <b>{payee}</b> <b className="text-terracotta">{formatEur(Math.abs(cash))}</b>
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-clay/60 p-1" role="radiogroup" aria-label="Split mode">
              {MODES.map((m) => {
                const active = split.mode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={m.hint}
                    onClick={() => onSetMode(m.value)}
                    className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      active ? 'bg-white text-petrol shadow-sm' : 'text-ink2 hover:bg-white/50'
                    }`}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={() => setShowDetails(true)} className="btn btn-primary h-10 whitespace-nowrap px-4 text-sm">
              How it's calculated
            </button>
          </div>
        </div>
      </div>

      {showDetails && <DetailsModal scenario={scenario} names={names} onClose={() => setShowDetails(false)} />}
    </>
  )
}
