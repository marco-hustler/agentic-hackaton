import { useMemo, useState } from 'react'
import type { Assignment, AssignmentAction, DemoScenario, ValuedItem } from '../types/inventory'
import { participantColor } from '../world/rooms'
import { downloadXlsx } from './exportRows'
import { formatEur, pct, verb } from './format'
import { HouseToolbar } from './HouseToolbar'
import type { HouseTab } from './HouseViewSwitch'
import { Thumb } from './Thumb'

type ExportPanelProps = {
  title: string
  demo: DemoScenario | null
  error: string | null
  names: [string, string]
  tab: HouseTab
  onTab: (tab: HouseTab) => void
  onBackToWorld: () => void
  inventoryCount?: number | null
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

/** List & Export: the official summary of the split, plus Excel / print. */
export function ExportPanel({ title, demo, error, names, tab, onTab, onBackToWorld, inventoryCount, onOpenItem }: ExportPanelProps) {
  const [busy, setBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const byId = useMemo(() => new Map((demo?.valued_items ?? []).map((vi) => [vi.item.id, vi])), [demo])
  const split = demo?.split
  const assignments = split?.assignments ?? []
  const anySplit = assignments.length > 0
  const mine = [0, 1].map((side) => assignments.filter((a) => sideOf(a.action) === side))
  const sold = assignments.filter((a) => sideOf(a.action) === null)
  const unsplit = (demo?.valued_items ?? []).filter((vi) => !assignments.some((a) => a.item_id === vi.item.id))

  const total = split && anySplit ? split.total_fair_value_eur : (demo?.valued_items ?? []).reduce((s, vi) => s + vi.valuation.fair_value_eur, 0)
  const goods = split ? [split.party_a_received_goods_eur, split.party_b_received_goods_eur] : [0, 0]
  const entitled = split ? [split.party_a_entitled_eur, split.party_b_entitled_eur] : [0, 0]
  const aPct = pct(goods[0], goods[0] + goods[1])
  const shares = [aPct, 100 - aPct]
  const cash = split?.cash_transfer_a_to_b_eur ?? 0
  const payer = cash >= 0 ? names[0] : names[1]
  const payee = cash >= 0 ? names[1] : names[0]
  const noCash = Math.abs(cash) < 1

  async function onExport() {
    if (!demo) return
    setBusy(true)
    setExportError(null)
    try {
      await downloadXlsx(title, demo, names)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="inventory-page inventory-page-unified" aria-label="List and export">
      <div className="inventory-shell inventory-shell-notched">
        <h1 className="inventory-title-notch" title={title}>
          {title}
        </h1>
        <div className="inventory-shell-inner">
          <div className="inventory-shell-top">
            <HouseToolbar variant="embedded" tab={tab} onTab={onTab} onBackToWorld={onBackToWorld} inventoryCount={inventoryCount} />
          </div>

          <div className="inventory-shell-body">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
              {/* Header */}
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e0f2fe] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#075985]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky" />
                    idealo MCP · fair-split agent
                  </span>
                  {split && anySplit && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{MODE_LABEL[split.mode] ?? split.mode}</span>
                  )}
                </div>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-petrol sm:text-[1.75rem]">Summary & split</h2>
                <p className="text-sm text-ink2">Fair values from idealo prices, minus age and condition.</p>
              </div>

              {error && <p className="rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the list: {error}</p>}
              {exportError && <p className="rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not export: {exportError}</p>}
              {!demo && !error && <div className="h-28 animate-pulse rounded-2xl bg-surface-low" aria-hidden />}

              {demo && (
                <>
                  {/* Totals + balance bar */}
                  <div className="grid grid-cols-1 items-center gap-6 rounded-2xl bg-surface-low p-5 md:grid-cols-12">
                    <Stat className="md:col-span-3" label="Total value" value={formatEur(total)} note={`${demo.valued_items.length} items valued`} />
                    <Stat
                      className="md:col-span-3"
                      label="Fair share (50%)"
                      value={formatEur(total / 2)}
                      valueClass="text-sage"
                      note="What each should get"
                    />
                    <div className="flex flex-col gap-1.5 md:col-span-6">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                        <span className="text-terracotta">
                          {names[0]} ({shares[0]}%)
                        </span>
                        {anySplit && (
                          <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-bold text-ink tabular-nums">
                            Net delta ±{formatEur(Math.abs(cash))}
                          </span>
                        )}
                        <span className="text-sage">
                          {names[1]} ({shares[1]}%)
                        </span>
                      </div>
                      <div className="relative flex h-3 overflow-hidden rounded-full bg-clay">
                        {anySplit && (
                          <>
                            <div className="bg-terracotta transition-all duration-500" style={{ width: `${shares[0]}%` }} />
                            <div className="flex-1 bg-sage" />
                          </>
                        )}
                        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-petrol" aria-hidden />
                      </div>
                      <div className="flex items-center justify-between text-xs text-ink2">
                        <span>{formatEur(goods[0])} assigned</span>
                        <span>{formatEur(goods[1])} assigned</span>
                      </div>
                    </div>
                  </div>

                  {!anySplit && (
                    <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
                      Not split yet. Open <b className="text-petrol">Split</b> and let the agent decide.
                    </p>
                  )}

                  {/* One column per person */}
                  {anySplit && (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {[0, 1].map((side) => {
                        const delta = goods[side] - entitled[side]
                        return (
                          <div key={side} className="flex flex-col gap-3 rounded-2xl bg-surface-low p-4">
                            <div className="flex items-center justify-between gap-2 pb-1">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
                                  style={{ background: participantColor(side) }}
                                >
                                  {names[side].slice(0, 1).toUpperCase()}
                                </span>
                                <div className="flex flex-col">
                                  <span className="text-lg font-bold text-petrol">{names[side]}</span>
                                  <span className="text-xs text-ink2">
                                    {mine[side].length} {mine[side].length === 1 ? 'item' : 'items'} assigned
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xl font-extrabold text-petrol tabular-nums">{formatEur(goods[side])}</span>
                                {Math.abs(delta) >= 1 && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                      delta > 0 ? 'bg-[#ffdad4] text-[#8a1c10]' : 'bg-[#d1fae5] text-[#065f46]'
                                    }`}
                                  >
                                    {delta > 0 ? `+${formatEur(delta)} over` : `${formatEur(delta)} credit`}
                                  </span>
                                )}
                              </div>
                            </div>
                            {mine[side].length ? (
                              <ul className="flex flex-col gap-2">
                                {mine[side].map((a) => (
                                  <Row key={a.item_id} a={a} vi={byId.get(a.item_id)} names={names} onOpen={() => onOpenItem(a.item_id)} />
                                ))}
                              </ul>
                            ) : (
                              <p className="rounded-xl bg-white p-4 text-center text-sm text-muted">Nothing for {names[side]}.</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Cash transfer + sold pool */}
                  {anySplit && (
                    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
                      <div
                        className={`flex items-center justify-between gap-3 rounded-2xl bg-[#d1fae5] p-4 ${
                          sold.length || unsplit.length ? 'lg:col-span-8' : 'lg:col-span-12'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#065f46] text-white" aria-hidden>
                            <BalanceIcon className="h-5 w-5" />
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#065f46]">Cash settlement</span>
                            <span className="text-sm font-bold text-[#002114]">
                              {noCash ? 'No cash to pay' : `${payer} ${verb(payer, 'pays', 'pay')} ${formatEur(Math.abs(cash))} to ${payee}`}
                            </span>
                            <span className="text-xs text-[#065f46]">
                              After settling: {formatEur(entitled[0])} · {formatEur(entitled[1])} each
                              {split ? ` (${Math.round(split.fairness_score_pct)}% fair)` : ''}
                            </span>
                          </div>
                        </div>
                        {split?.is_envy_free && (
                          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase text-[#065f46] sm:inline-flex">
                            ✓ Envy-free
                          </span>
                        )}
                      </div>
                      {(sold.length > 0 || unsplit.length > 0) && (
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-low p-4 lg:col-span-4">
                          <div className="flex min-w-0 flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                              {sold.length ? 'Sell & split' : 'Not split yet'}
                            </span>
                            <span className="mt-0.5 truncate text-sm font-bold text-petrol">
                              {(sold.length ? sold.map((a) => a.item_name) : unsplit.map((vi) => vi.item.name)).join(', ')}
                            </span>
                          </div>
                          <span className="shrink-0 text-lg font-bold text-ink tabular-nums">
                            {formatEur(
                              sold.length
                                ? (split?.sell_pool_eur ?? 0)
                                : unsplit.reduce((s, vi) => s + vi.valuation.fair_value_eur, 0),
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-surface-low px-5 py-4 md:flex-row">
                    <span className="text-xs font-semibold text-muted">
                      Excel has every item with idealo price, depreciation and points, plus the verdict.
                    </span>
                    <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
                      <button type="button" className="btn btn-ghost h-10 px-4" onClick={() => window.print()}>
                        Print / PDF
                      </button>
                      <button type="button" className="btn btn-primary h-10 px-5" disabled={busy} onClick={onExport}>
                        {busy ? 'Preparing…' : 'Export Excel (.xlsx)'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, note, valueClass = 'text-petrol', className = '' }: { label: string; value: string; note: string; valueClass?: string; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-[1.75rem] font-extrabold leading-9 tracking-tight tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-ink2">{note}</span>
    </div>
  )
}

function Row({ a, vi, names, onOpen }: { a: Assignment; vi: ValuedItem | undefined; names: [string, string]; onOpen: () => void }) {
  const buysNew =
    a.action === 'keep_a_buy_new_b' ? names[1] : a.action === 'keep_b_buy_new_a' ? names[0] : null
  const sub = [vi?.item.category, buysNew ? `${buysNew} ${verb(buysNew, 'buys', 'buy')} new` : a.is_contested ? 'Both wanted it' : null]
    .filter(Boolean)
    .join(' • ')
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:shadow-[0_6px_16px_-8px_rgba(15,23,42,0.25)]"
      >
        <span className="flex min-w-0 items-center gap-3">
          {vi ? <Thumb vi={vi} size="sm" /> : <span className="h-10 w-10 shrink-0 rounded-xl bg-surface-low" />}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold text-ink">{a.item_name}</span>
            {sub && <span className="truncate text-xs capitalize text-ink2">{sub}</span>}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold text-petrol tabular-nums">{formatEur(a.fair_value_eur)}</span>
      </button>
    </li>
  )
}

function BalanceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0L6 7zM18 7l-3 7a3 3 0 0 0 6 0l-3-7z" />
    </svg>
  )
}
