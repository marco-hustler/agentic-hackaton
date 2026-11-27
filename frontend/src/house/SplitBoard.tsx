import { useState } from 'react'
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
  onOpenItem: (id: string) => void
}

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
    <li>
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
  name: string
  color: string
  total?: number
  share?: number
  approved: boolean
  onApprove?: () => void
  children: React.ReactNode
}

/** A person's box: name, approve tick, their items, their total. */
function PersonBox({ name, color, total, share, approved, onApprove, children }: BoxProps) {
  return (
    <section className="panel pop-in flex min-h-0 flex-col overflow-hidden" style={{ background: '#ffffff' }} aria-label={name}>
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

/**
 * The split page: the agent's proposal. Meter on top, the house in the middle
 * (the 3D frame), one box per person on the sides. People approve with a tick.
 */
export function SplitBoard({ scenario, error, names, people, solving, onOpenItem }: SplitBoardProps) {
  const [showDetails, setShowDetails] = useState(false)
  /** Who approved which proposal; a new proposal needs new approvals. */
  const [approvals, setApprovals] = useState<Record<string, string>>({})

  if (!scenario) {
    return (
      <div className="split-meter panel flex items-center justify-center text-sm text-muted" style={{ background: '#ffffff' }}>
        {error ? `Could not load the split: ${error}` : 'The agent is preparing a split…'}
      </div>
    )
  }

  const split = scenario.split
  const byId = new Map(scenario.valued_items.map((vi) => [vi.item.id, vi]))
  const mine: Assignment[][] = [[], []]
  const sold: Assignment[] = []
  for (const a of split.assignments) {
    const side = sideOf(a.action)
    if (side === null) sold.push(a)
    else mine[side].push(a)
  }
  const goods = [split.party_a_received_goods_eur, split.party_b_received_goods_eur]
  const aPct = pct(goods[0], goods[0] + goods[1])
  const shares = [aPct, 100 - aPct]
  const cash = split.cash_transfer_a_to_b_eur
  const payer = cash >= 0 ? names[0] : names[1]
  const payee = cash >= 0 ? names[1] : names[0]
  const proposal = `${split.assignments.map((a) => `${a.item_id}:${a.action}`).join(',')}|${Math.round(cash)}`
  const isApproved = (name: string) => approvals[name] === proposal
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
        name={name}
        color={participantColor(i)}
        total={goods[i]}
        share={shares[i]}
        approved={isApproved(name)}
        onApprove={() => toggle(name)}
      >
        {mine[i].length ? (
          <ul>{mine[i].map((a) => row(a, note(a, i as 0 | 1)))}</ul>
        ) : (
          <p className="p-4 text-center text-sm text-muted">Nothing for {name} in this proposal</p>
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
  const soldBox = sold.length > 0 && (
    <PersonBox key="sold" name="Sold and split" color="#64748b" approved={false}>
      <ul>{sold.map((a) => row(a, 'Sold, money split by share'))}</ul>
    </PersonBox>
  )

  return (
    <>
      {/* Meter */}
      <div className="split-meter panel pop-in" style={{ background: '#ffffff' }}>
        <div className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: participantColor(0) }} />
            {names[0]} <span className="font-extrabold text-terracotta">{shares[0]}%</span>
          </span>
          <span className={`pill ${approvedCount === 2 ? 'pill-settled' : 'pill-draft'}`}>
            {solving ? 'Agent re-balancing…' : approvedCount === 2 ? 'Agreed ✓' : `${approvedCount}/2 approved`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-extrabold text-sage">{shares[1]}%</span> {names[1]}
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: participantColor(1) }} />
          </span>
        </div>
        <div className="relative mt-2 flex h-3 overflow-hidden rounded-full bg-clay">
          <div className="bg-terracotta transition-all duration-500" style={{ width: `${shares[0]}%` }} />
          <div className="flex-1 bg-sage" />
          <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white shadow" aria-hidden />
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-midnight px-2.5 py-0.5 text-xs font-bold text-white">Agent</span>
          <span className="min-w-0 flex-1 truncate text-ink2">
            {MODE_LABEL[split.mode] ?? split.mode} ·{' '}
            {Math.abs(cash) < 1 ? (
              'no cash to pay'
            ) : (
              <>
                <b className="text-petrol">{payer}</b> {verb(payer, 'pays', 'pay')} <b className="text-petrol">{payee}</b>{' '}
                <b className="text-terracotta">{formatEur(Math.abs(cash))}</b>
              </>
            )}
          </span>
          <button type="button" onClick={() => setShowDetails(true)} className="btn btn-ghost h-8 shrink-0 px-3 text-xs">
            Why?
          </button>
        </div>
      </div>

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

      {showDetails && <DetailsModal scenario={scenario} names={names} onClose={() => setShowDetails(false)} />}
    </>
  )
}
