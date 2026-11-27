import type { AssignmentAction, Condition, DemoScenario } from '../types/inventory'

/** One flat row per item: what the table shows and what goes into Excel. */
export type ExportRow = {
  id: string
  name: string
  category: string
  year: number
  condition: string
  newPrice: number
  depreciationPct: number
  fairValue: number
  pointsA: number
  pointsB: number
  goesTo: string
  contested: boolean
  locked: boolean
  source: string
  link: string
}

const CONDITION_LABEL: Record<Condition, string> = { like_new: 'Like new', good: 'Good', fair: 'Fair', worn: 'Worn' }

function goesTo(action: AssignmentAction | undefined, [a, b]: [string, string]) {
  switch (action) {
    case 'party_a':
      return a
    case 'party_b':
      return b
    case 'keep_a_buy_new_b':
      return `${a} (${b} buys new)`
    case 'keep_b_buy_new_a':
      return `${b} (${a} buys new)`
    case 'sell_split':
      return 'Sell & split'
    default:
      return '—'
  }
}

export function buildRows(s: DemoScenario, names: [string, string]): ExportRow[] {
  const assignment = new Map(s.split.assignments.map((a) => [a.item_id, a]))
  return s.valued_items.map(({ item, valuation: v }) => {
    const a = assignment.get(item.id)
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      year: item.purchase_year,
      condition: CONDITION_LABEL[item.condition],
      newPrice: v.trusted_market_price_eur,
      depreciationPct: Math.round((1 - v.depreciation_factor) * 100),
      fairValue: v.fair_value_eur,
      pointsA: item.party_a_points,
      pointsB: item.party_b_points,
      goesTo: goesTo(a?.action, names),
      contested: a?.is_contested ?? false,
      locked: Boolean(item.forced_action),
      source: v.data_source === 'idealo_live' ? 'idealo live' : v.data_source === 'idealo_cached' ? 'idealo cache' : 'Estimate',
      link: v.product_url ?? '',
    }
  })
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'split'
}

/** Two sheets: every item, and the verdict. SheetJS is loaded only on demand. */
export async function downloadXlsx(title: string, s: DemoScenario, names: [string, string]) {
  const XLSX = await import('xlsx')
  const rows = buildRows(s, names)
  const items = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Item: r.name,
      Category: r.category,
      'Bought in': r.year,
      Condition: r.condition,
      'New on idealo (€)': r.newPrice,
      'Depreciation (%)': r.depreciationPct,
      'Fair value (€)': r.fairValue,
      [`${names[0]} points`]: r.pointsA,
      [`${names[1]} points`]: r.pointsB,
      'Goes to': r.goesTo,
      Contested: r.contested ? 'yes' : '',
      Locked: r.locked ? 'yes' : '',
      Source: r.source,
      'idealo link': r.link,
    })),
  )
  items['!cols'] = [36, 16, 10, 10, 16, 15, 14, 12, 12, 26, 10, 8, 12, 50].map((wch) => ({ wch }))

  const sp = s.split
  const cash = sp.cash_transfer_a_to_b_eur
  const summary = XLSX.utils.aoa_to_sheet([
    ['Process', title],
    ['Mode', sp.mode],
    ['Total fair value (€)', sp.total_fair_value_eur],
    [`${names[0]} receives (€)`, sp.party_a_received_goods_eur],
    [`${names[0]} fair share (€)`, sp.party_a_entitled_eur],
    [`${names[1]} receives (€)`, sp.party_b_received_goods_eur],
    [`${names[1]} fair share (€)`, sp.party_b_entitled_eur],
    ['Sold and split (€)', sp.sell_pool_eur],
    ['Cash transfer', Math.abs(cash) < 1 ? 'none' : `${cash >= 0 ? names[0] : names[1]} pays ${cash >= 0 ? names[1] : names[0]}`],
    ['Cash amount (€)', Math.round(Math.abs(cash) * 100) / 100],
    ['Fairness score (%)', Math.round(sp.fairness_score_pct)],
    ['Envy-free', sp.is_envy_free ? 'yes' : 'no'],
    ['Prices', 'idealo price comparison, minus age and condition'],
  ])
  summary['!cols'] = [{ wch: 24 }, { wch: 48 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, items, 'Items')
  XLSX.utils.book_append_sheet(wb, summary, 'Split')
  XLSX.writeFile(wb, `dividealo-${slug(title)}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
