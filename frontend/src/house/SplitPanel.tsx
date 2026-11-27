import type { Assignment, DemoScenario, SplitMode, ValuedItem } from '../types/inventory'
import { formatEur, pct, verb } from './format'
import { Thumb } from './Thumb'

type SplitPanelProps = {
  scenario: DemoScenario | null
  error: string | null
  names: [string, string]
  solving: boolean
  onSetMode: (mode: SplitMode) => void
  onOpenItem: (id: string) => void
}

const MODES: { value: SplitMode; label: string; hint: string }[] = [
  { value: 'balanced', label: 'Balanced', hint: 'Closest to a 50/50 value split' },
  { value: 'min_cash', label: 'Less cash', hint: 'Fewer euros changing hands' },
  { value: 'liquidate_contested', label: 'Sell contested', hint: 'Sell what both want and split the money' },
]

const ACCENT = ['var(--terracotta)', 'var(--sage)'] as const

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="label-sm text-ink2">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function ItemRow({
  vi,
  a,
  names,
  onOpen,
}: {
  vi: ValuedItem
  a: Assignment
  names: [string, string]
  onOpen: () => void
}) {
  const buysNew =
    a.action === 'keep_a_buy_new_b' ? names[1] : a.action === 'keep_b_buy_new_a' ? names[0] : null
  const total = a.party_a_points + a.party_b_points
  const aShare = total > 0 ? (a.party_a_points / total) * 100 : 50
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-low active:scale-[0.99]"
      >
        <Thumb vi={vi} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{vi.item.name}</span>
          <span className="mt-1 flex items-center gap-1.5">
            <span className="flex h-1 w-16 overflow-hidden rounded-full bg-clay" title={`${names[0]} ${a.party_a_points} · ${names[1]} ${a.party_b_points} pts`}>
              <span className="bg-terracotta" style={{ width: `${aShare}%` }} />
              <span className="flex-1 bg-sage" />
            </span>
            {a.is_contested && <span className="text-[11px] font-bold text-amber">Contested</span>}
            {vi.item.forced_action && <span className="text-[11px] font-bold text-ink2">Locked</span>}
            {buysNew && (
              <span className="truncate text-[11px] font-bold text-sky">
                {buysNew} {verb(buysNew, 'buys', 'buy')} new
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 font-extrabold text-petrol">{formatEur(a.fair_value_eur)}</span>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </button>
    </li>
  )
}

/** The verdict: mode, who gets what, cash, fairness and the idealo shopping list. */
export function SplitPanel({ scenario, error, names, solving, onSetMode, onOpenItem }: SplitPanelProps) {
  if (!scenario) {
    return (
      <section className="panel flex h-full items-center justify-center p-6 text-sm text-muted" style={{ background: '#ffffff' }}>
        {error ? `Could not load the split: ${error}` : 'Loading the split…'}
      </section>
    )
  }

  const split = scenario.split
  const byId = new Map(scenario.valued_items.map((vi) => [vi.item.id, vi]))
  const groups: { key: string; title: string; color: string; list: Assignment[] }[] = [
    { key: 'a', title: names[0], color: ACCENT[0], list: [] },
    { key: 'b', title: names[1], color: ACCENT[1], list: [] },
    { key: 'sell', title: 'Sell & split the money', color: 'var(--amber)', list: [] },
  ]
  for (const a of split.assignments) {
    const g = a.action === 'party_a' || a.action === 'keep_a_buy_new_b' ? 0 : a.action === 'sell_split' ? 2 : 1
    groups[g].list.push(a)
  }

  const goods = [split.party_a_received_goods_eur, split.party_b_received_goods_eur]
  const entitled = [split.party_a_entitled_eur, split.party_b_entitled_eur]
  const points = [
    [split.party_a_points_won, split.party_a_points_total],
    [split.party_b_points_won, split.party_b_points_total],
  ]
  const cash = split.cash_transfer_a_to_b_eur
  const payer = cash >= 0 ? names[0] : names[1]
  const payee = cash >= 0 ? names[1] : names[0]
  const basket = [0, 1].map((i) =>
    split.replacement_basket.filter((r) => r.for_party === (i === 0 ? 'party_a' : 'party_b')),
  )

  return (
    <section className="panel flex h-full flex-col overflow-hidden" style={{ background: '#ffffff' }} aria-label="Split">
      <div className="flex items-center gap-3 px-5 pt-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-petrol sm:text-3xl">Split</h2>
        {solving && (
          <span className="pill pill-neutral">
            <span className="pulse-dot" /> Re-balancing…
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {/* Mode */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-clay/60 p-1" role="radiogroup" aria-label="Split mode">
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
                className={`truncate rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                  active ? 'bg-white text-petrol shadow-sm' : 'text-ink2 hover:bg-white/50'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>

        {/* Verdict */}
        <div className="mt-3 rounded-2xl bg-midnight p-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-white/60">Total fair value</span>
            <span className="flex gap-1.5">
              <span className="pill bg-white/10 text-white">Fairness {Math.round(split.fairness_score_pct)}%</span>
              {split.is_envy_free && <span className="pill bg-[#b7e4c7] text-[#064e3b]">Envy-free</span>}
            </span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight">{formatEur(split.total_fair_value_eur)}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl bg-white/5 p-2.5">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <span className="h-2 w-2 rounded-full" style={{ background: ACCENT[i] }} />
                  <span className="truncate">{names[i]}</span>
                </p>
                <p className="mt-1 text-lg font-extrabold">{formatEur(goods[i])}</p>
                <p className="text-[11px] text-white/60">
                  of {formatEur(entitled[i])} fair share · {pct(points[i][0], points[i][1])}% of wishes
                </p>
              </div>
            ))}
          </div>
          {Math.abs(cash) >= 1 && (
            <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm">
              <span className="font-bold">{payer}</span> {verb(payer, 'pays', 'pay')} <span className="font-bold">{payee}</span>{' '}
              <span className="font-extrabold text-[#b7e4c7]">{formatEur(Math.abs(cash))}</span>
            </p>
          )}
          {split.sell_pool_eur > 0 && (
            <p className="mt-2 text-xs text-white/70">Sold and split: {formatEur(split.sell_pool_eur)}</p>
          )}
        </div>

        {/* Who gets what */}
        {groups
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <Section
              key={g.key}
              title={g.title}
              aside={
                <span className="text-xs font-bold" style={{ color: g.color }}>
                  {g.list.length} · {formatEur(g.list.reduce((s, a) => s + a.fair_value_eur, 0))}
                </span>
              }
            >
              <ul className="-mx-2">
                {g.list.map((a) => {
                  const vi = byId.get(a.item_id)
                  return vi ? <ItemRow key={a.item_id} vi={vi} a={a} names={names} onOpen={() => onOpenItem(a.item_id)} /> : null
                })}
              </ul>
            </Section>
          ))}

        {/* Buy-new deals the solver used */}
        {split.arbitrage_highlights.length > 0 && (
          <Section title="Smart buys">
            <ul className="space-y-2">
              {split.arbitrage_highlights.map((h) => (
                <li key={h.item_id} className="rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
                  <p className="font-bold text-ink">{h.item_name}</p>
                  {h.buy_new_savings_note && <p className="mt-0.5 text-xs text-ink2">{h.buy_new_savings_note}</p>}
                  {h.buy_new_url && (
                    <a href={h.buy_new_url} target="_blank" rel="noreferrer" className="btn btn-agent mt-2 h-7 px-2.5 text-xs">
                      Buy new{h.buy_new_price_eur ? ` · ${formatEur(h.buy_new_price_eur)}` : ''} on idealo
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Replacement basket */}
        {basket.some((b) => b.length > 0) && (
          <Section title="Replace what you give up">
            <div className="space-y-3">
              {[0, 1].map((i) =>
                basket[i].length ? (
                  <div key={i}>
                    <p className="mb-1 text-xs font-bold" style={{ color: ACCENT[i] }}>
                      For {names[i]}
                    </p>
                    <ul className="divide-y divide-line rounded-2xl border border-line">
                      {basket[i].map((r) => (
                        <li key={r.item_name} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-ink">{r.matched_title}</span>
                            {r.is_deal && <span className="block truncate text-[11px] font-bold text-amber">{r.deal_headline ?? 'Deal'}</span>}
                          </span>
                          <span className="shrink-0 font-extrabold text-petrol">{formatEur(r.replacement_price_eur)}</span>
                          {r.offer_url && (
                            <a
                              href={r.offer_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-ghost h-7 shrink-0 px-2 text-xs"
                              aria-label={`Open ${r.matched_title} on idealo`}
                            >
                              ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          </Section>
        )}

        {split.mediator_summary && (
          <Section title="Why it's fair">
            <p className="text-sm leading-relaxed text-ink2">{split.mediator_summary}</p>
          </Section>
        )}
      </div>
    </section>
  )
}
