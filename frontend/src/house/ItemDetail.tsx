import type { Assignment, AssignmentAction, Condition, HouseholdItem, PriceHistoryStats, ValuedItem } from '../types/inventory'
import { categoryColor } from '../world/palette'
import { actionPill } from './assignment'
import { formatEur } from './format'

type ItemDetailProps = {
  vi: ValuedItem
  assignment: Assignment | undefined
  names: [string, string]
  solving: boolean
  backLabel?: string
  onBack: () => void
  onUpdate: (patch: Partial<HouseholdItem>) => void
}

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'like_new', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Worn' },
]

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 20 }, (_, i) => THIS_YEAR - i)

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface-low p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="label-sm text-ink2">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function SourcePill({ vi }: { vi: ValuedItem }) {
  const v = vi.valuation
  if (v.data_source === 'idealo_live') return <span className="pill pill-live">idealo MCP live</span>
  if (v.data_source === 'idealo_cached') return <span className="pill pill-live">idealo cache</span>
  return (
    <span className="pill pill-neutral" title={v.source_note ?? undefined}>
      Estimate{v.source_note ? ` · ${v.source_note}` : ''}
    </span>
  )
}

/** 30-day range bar: min … max with avg tick and the current price marker. */
function PriceRange({ h }: { h: PriceHistoryStats }) {
  const { min_30d_eur: min, max_30d_eur: max, avg_30d_eur: avg, current_eur: cur } = h
  if (min == null || max == null) return null
  const span = max - min || 1
  const at = (x: number) => `${Math.min(100, Math.max(0, ((x - min) / span) * 100))}%`
  const change = h.pct_change_30d
  return (
    <div>
      <div className="relative mt-5 h-2 rounded-full bg-clay">
        <span className="absolute inset-y-0 left-0 rounded-full bg-sage/40" style={{ width: cur != null ? at(cur) : 0 }} />
        {avg != null && (
          <span className="absolute top-[-3px] h-[14px] w-px bg-ink2/50" style={{ left: at(avg) }} title={`Avg ${formatEur(avg)}`} />
        )}
        {cur != null && (
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-petrol shadow"
            style={{ left: at(cur) }}
          >
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-extrabold text-petrol">
              {formatEur(cur)}
            </span>
          </span>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>Low {formatEur(min)}</span>
        {change != null && (
          <span className={`font-bold ${change < 0 ? 'text-sage' : 'text-terracotta'}`}>
            {change < 0 ? '▼' : '▲'} {Math.abs(change).toFixed(1)}% in 30 days
          </span>
        )}
        <span>High {formatEur(max)}</span>
      </div>
    </div>
  )
}

function PointsSlider({
  name,
  value,
  accent,
  onChange,
}: {
  name: string
  value: number
  accent: string
  onChange: (n: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-bold text-ink">{name}</span>
        <span className="font-extrabold" style={{ color: accent }}>
          {value} pts
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
        style={{ accentColor: accent }}
      />
    </label>
  )
}

/** Right-column detail for one item: idealo evidence + every input the split depends on. */
export function ItemDetail({ vi, assignment, names, solving, backLabel = '← Back', onBack, onUpdate }: ItemDetailProps) {
  const { item, valuation: v } = vi
  const drop = Math.round((1 - v.depreciation_factor) * 100)
  const pill = assignment ? actionPill(assignment.action, names) : null
  const forced = item.forced_action ?? null
  const override = item.depreciation_override ?? null

  const lockOptions: { value: AssignmentAction | null; label: string }[] = [
    { value: null, label: 'Auto' },
    { value: 'party_a', label: names[0] },
    { value: 'party_b', label: names[1] },
    { value: 'sell_split', label: 'Sell' },
  ]

  return (
    <section className="panel flex min-h-0 w-full flex-col overflow-hidden" style={{ background: '#ffffff' }} aria-label={`Item: ${item.name}`}>
      {/* Title bar */}
      <div className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="label-sm text-muted">{item.category}</p>
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-petrol">{item.name}</h2>
          {v.matched_title && v.matched_title !== item.name && (
            <p className="truncate text-xs text-ink2" title={v.matched_title}>
              idealo match: {v.matched_title}
              {v.is_substitute ? ' (substitute)' : ''}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pill && <span className={`pill ${pill.cls}`}>{pill.text}</span>}
            {assignment?.is_contested && <span className="pill pill-draft">Contested</span>}
            <SourcePill vi={vi} />
            {solving && (
              <span className="pill pill-neutral">
                <span className="pulse-dot" /> Re-balancing…
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onBack} className="btn btn-ghost h-9 shrink-0 px-3 text-sm" aria-label="Close">
          {backLabel}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-6 md:grid-cols-2">
        {/* Product + idealo evidence */}
        <div className="order-2 space-y-3 md:order-1">
          <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
            {v.image_url ? (
              <img src={v.image_url} alt="" className="h-full w-full object-contain p-4" />
            ) : (
              <span className="h-10 w-10 rounded-xl" style={{ background: categoryColor(item.category) }} />
            )}
          </div>

          {/* Value */}
          <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-midnight p-3 text-white">
            <div>
              <dt className="text-xs text-white/60">New on idealo</dt>
              <dd className="text-lg font-extrabold">{formatEur(v.trusted_market_price_eur)}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/60">Depreciation</dt>
              <dd className="text-lg font-extrabold text-[#ffb4a2]">−{drop}%</dd>
            </div>
            <div>
              <dt className="text-xs text-white/60">Fair value</dt>
              <dd className="text-lg font-extrabold text-[#b7e4c7]">{formatEur(v.fair_value_eur)}</dd>
            </div>
          </dl>

          {/* idealo evidence */}
          <Section
            title="idealo evidence"
            aside={
              <button
                type="button"
                disabled
                title="Live refresh is off in the demo: prices come from the idealo cache, so no MCP calls are spent."
                className="btn btn-agent h-7 px-2.5 text-xs"
              >
                Refresh from idealo
              </button>
            }
          >
            {v.is_buy_new_deal && (
              <div className="mb-3 rounded-xl border border-amber/40 bg-amber/10 p-2.5 text-xs">
                <p className="font-extrabold text-ink">
                  Deal{v.deal_discount_pct > 0 ? ` −${Math.round(v.deal_discount_pct)}%` : ''}
                  {v.deal_headline ? ` · ${v.deal_headline}` : ''}
                </p>
                {v.best_buy_new_url && (
                  <a href={v.best_buy_new_url} target="_blank" rel="noreferrer" className="font-bold text-petrol underline">
                    Buy new on idealo
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="pill pill-neutral">{v.offer_count} offers</span>
              {v.trusted_offer_count > 0 && <span className="pill pill-neutral">{v.trusted_offer_count} trusted</span>}
              <span className={`pill ${v.scarcity_level === 'scarce' ? 'pill-draft' : 'pill-neutral'}`}>{v.scarcity_level}</span>
              {v.lowest_offer_eur > 0 && <span className="pill pill-neutral">Lowest {formatEur(v.lowest_offer_eur)}</span>}
            </div>

            {v.price_history && (
              <div className="mt-3">
                <p className="text-xs font-bold text-ink2">Price, last 30 days</p>
                <PriceRange h={v.price_history} />
              </div>
            )}

            {v.top_offers.length > 0 && (
              <ul className="dashed-rule mt-3 divide-y divide-line pt-1">
                {v.top_offers.map((o, i) => (
                  <li key={`${o.shop_name}-${i}`} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">{o.shop_name}</span>
                      <span className="block truncate text-xs text-muted">
                        {o.shop_rating != null ? `★ ${o.shop_rating.toFixed(1)}` : 'no rating'}
                        {o.delivery_text ? ` · ${o.delivery_text}` : ''}
                        {o.free_return_days ? ` · ${o.free_return_days}d returns` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-extrabold text-petrol">{formatEur(o.total_eur)}</span>
                      {o.shipping_eur > 0 && <span className="block text-[11px] text-muted">incl. {formatEur(o.shipping_eur)} ship.</span>}
                    </span>
                    {o.offer_url && (
                      <a
                        href={o.offer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost h-7 shrink-0 px-2 text-xs"
                        aria-label={`Open ${o.shop_name} offer`}
                      >
                        ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {v.product_url && (
              <a href={v.product_url} target="_blank" rel="noreferrer" className="btn btn-agent mt-2 h-8 px-3 text-xs">
                View on idealo
              </a>
            )}
          </Section>
        </div>

        {/* Decisions */}
        <div className="order-1 space-y-3 md:order-2">
          {/* Assignment */}
          <Section title="Who gets it" aside={forced ? <span className="pill pill-draft">Locked</span> : undefined}>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-clay/60 p-1" role="radiogroup" aria-label="Assignment">
              {lockOptions.map((o) => {
                const active = forced === o.value
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onUpdate({ forced_action: o.value })}
                    className={`truncate rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                      active ? 'bg-white text-petrol shadow-sm' : 'text-ink2 hover:bg-white/50'
                    }`}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
            {assignment?.rationale && <p className="mt-2 text-xs leading-relaxed text-ink2">{assignment.rationale}</p>}
          </Section>

          {/* Priority */}
          <Section title="How much each side wants it">
            <div className="space-y-2.5">
              <PointsSlider
                name={names[0]}
                value={item.party_a_points}
                accent="var(--terracotta)"
                onChange={(n) => onUpdate({ party_a_points: n })}
              />
              <PointsSlider
                name={names[1]}
                value={item.party_b_points}
                accent="var(--sage)"
                onChange={(n) => onUpdate({ party_b_points: n })}
              />
            </div>
          </Section>

          {/* Depreciation */}
          <Section title="Condition & age">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-muted">Condition</span>
                <select
                  value={item.condition}
                  onChange={(e) => onUpdate({ condition: e.target.value as Condition })}
                  className="field mt-0.5 w-full"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted">Bought in</span>
                <select
                  value={item.purchase_year}
                  onChange={(e) => onUpdate({ purchase_year: Number(e.target.value) })}
                  className="field mt-0.5 w-full"
                >
                  {(YEARS.includes(item.purchase_year) ? YEARS : [item.purchase_year, ...YEARS]).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block">
              <span className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Retained value {override === null ? '(computed)' : '(set by hand)'}</span>
                <span className="font-extrabold text-ink">{Math.round(v.depreciation_factor * 100)}%</span>
              </span>
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round((override ?? v.depreciation_factor) * 100)}
                onChange={(e) => onUpdate({ depreciation_override: Number(e.target.value) / 100 })}
                className="mt-1 w-full accent-[var(--petrol)]"
              />
            </label>
            <div className="mt-1 flex items-start justify-between gap-2">
              <p className="text-xs leading-relaxed text-ink2">{v.depreciation_explanation}</p>
              {override !== null && (
                <button
                  type="button"
                  onClick={() => onUpdate({ depreciation_override: null })}
                  className="btn btn-ghost h-7 shrink-0 px-2 text-xs"
                >
                  Reset
                </button>
              )}
            </div>
          </Section>
        </div>
      </div>
    </section>
  )
}
