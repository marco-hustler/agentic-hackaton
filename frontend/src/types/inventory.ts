/**
 * Subset of the FastAPI `/api/demo` payload the house view reads.
 * Mirrors src/cleanbreak/models.py (ValuedItem, SplitResult).
 */

export type DataSource = 'idealo_live' | 'idealo_cached' | 'demo_fallback'

export type AssignmentAction = 'party_a' | 'party_b' | 'sell_split' | 'keep_a_buy_new_b' | 'keep_b_buy_new_a'

export type HouseholdItem = {
  id: string
  name: string
  category: string
  purchase_year: number
  condition: 'like_new' | 'good' | 'fair' | 'worn'
  party_a_points: number
  party_b_points: number
  notes: string
}

export type ItemValuation = {
  item_id: string
  matched_title: string
  image_url: string | null
  product_url: string | null
  trusted_market_price_eur: number
  depreciation_factor: number
  depreciation_explanation: string
  fair_value_eur: number
  offer_count: number
  data_source: DataSource
  source_note: string | null
  is_buy_new_deal: boolean
  deal_headline: string | null
}

export type ValuedItem = { item: HouseholdItem; valuation: ItemValuation }

export type Assignment = {
  item_id: string
  action: AssignmentAction
  fair_value_eur: number
  is_contested: boolean
  rationale: string
}

export type SplitResult = {
  party_a_name: string
  party_b_name: string
  assignments: Assignment[]
  total_fair_value_eur: number
  party_a_received_goods_eur: number
  party_b_received_goods_eur: number
  sell_pool_eur: number
  cash_transfer_a_to_b_eur: number
  cash_transfer_summary: string
  fairness_score_pct: number
  is_envy_free: boolean
}

export type DemoScenario = {
  scenario_name: string
  party_a_name: string
  party_b_name: string
  valued_items: ValuedItem[]
  split: SplitResult
  warning: string | null
}

/** Which room (participant index) an item ends up in; null = sold and split. */
export function roomForAction(action: AssignmentAction): number | null {
  switch (action) {
    case 'party_a':
    case 'keep_a_buy_new_b':
      return 0
    case 'party_b':
    case 'keep_b_buy_new_a':
      return 1
    case 'sell_split':
      return null
  }
}
