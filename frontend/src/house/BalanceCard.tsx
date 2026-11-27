import type { SplitResult } from '../types/inventory'
import { formatEur, pct, verb } from './format'

type BalanceCardProps = {
  split: SplitResult | null
  names: [string, string]
}

/** Split balance header: who receives how much, with a centred fairness needle. */
export function BalanceCard({ split, names }: BalanceCardProps) {
  if (!split) {
    return (
      <div className="panel flex h-full items-center px-4 text-sm text-muted">Loading the split balance…</div>
    )
  }
  const a = split.party_a_received_goods_eur
  const b = split.party_b_received_goods_eur
  const aPct = pct(a, a + b)
  const bPct = 100 - aPct
  const fair = split.fairness_score_pct
  const cash = split.cash_transfer_a_to_b_eur
  const payer = cash >= 0 ? names[0] : names[1]
  const payee = cash >= 0 ? names[1] : names[0]

  return (
    <div className="panel px-4 py-3" style={{ background: '#ffffff' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="h-2.5 w-2.5 self-center rounded-full bg-terracotta" />
          <span className="text-sm font-bold text-ink">{names[0]}</span>
          <span className="text-lg font-extrabold text-terracotta">{aPct}%</span>
          <span className="text-xs text-muted">({formatEur(a)})</span>
        </div>
        <span className={`pill ${fair >= 90 ? 'pill-settled' : 'pill-draft'}`}>
          {fair >= 90 ? 'Near-perfect balance' : 'Balance in progress'} · {Math.round(fair)}%
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted">({formatEur(b)})</span>
          <span className="text-lg font-extrabold text-sage">{bPct}%</span>
          <span className="text-sm font-bold text-ink">{names[1]}</span>
          <span className="h-2.5 w-2.5 self-center rounded-full bg-sage" />
        </div>
      </div>
      <div className="relative mt-2 flex h-2.5 overflow-hidden rounded-full bg-clay">
        <div className="bg-terracotta transition-all duration-500" style={{ width: `${aPct}%` }} />
        <div className="flex-1 bg-sage" />
        <span className="absolute left-1/2 top-[-2px] h-[14px] w-0.5 -translate-x-1/2 rounded bg-petrol" aria-hidden />
      </div>
      {Math.abs(cash) >= 1 && (
        <p className="mt-1.5 text-xs text-ink2">
          Cash equalisation: <span className="font-bold text-ink">{payer}</span> {verb(payer, 'pays', 'pay')}{' '}
          <span className="font-bold text-ink">{payee}</span> {formatEur(Math.abs(cash))}
        </p>
      )}
    </div>
  )
}
