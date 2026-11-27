/**
 * Subset of the FastAPI `/api/demo` payload the house view reads.
 * Mirrors src/cleanbreak/models.py (ValuedItem, SplitResult).
 */

export type DataSource = 'idealo_live' | 'idealo_cached' | 'demo_fallback'

export type AssignmentAction = 'party_a' | 'party_b' | 'sell_split' | 'keep_a_buy_new_b' | 'keep_b_buy_new_a'

export type SplitMode = 'balanced' | 'min_cash' | 'liquidate_contested'

export type Condition = 'like_new' | 'good' | 'fair' | 'worn'

export type HouseholdItem = {
  id: string
  name: string
  category: string
  purchase_year: number
  condition: Condition
  party_a_points: number
  party_b_points: number
  notes: string
  /** Retained-value multiplier set by hand (0.1–1.0); null = computed from year + condition. */
  depreciation_override?: number | null
  /** Manual lock from the detail view; null = let the solver decide. */
  forced_action?: AssignmentAction | null
  // Other HouseholdItemInput fields (search_query, ownership…) pass through untouched.
}

export type IdealoOffer = {
  shop_name: string
  price_eur: number
  shipping_eur: number
  total_eur: number
  shop_rating: number | null
  delivery_text: string | null
  free_return_days: number | null
  offer_url: string | null
}

export type PriceHistoryStats = {
  current_eur: number | null
  min_30d_eur: number | null
  max_30d_eur: number | null
  avg_30d_eur: number | null
  pct_change_30d: number | null
  lowest_date: string | null
  highest_date: string | null
}

export type ItemValuation = {
  item_id: string
  matched_title: string
  image_url: string | null
  product_url: string | null
  category_label?: string | null
  is_substitute?: boolean
  substitute_reason?: string | null
  trusted_market_price_eur: number
  lowest_offer_eur: number
  depreciation_factor: number
  depreciation_explanation: string
  fair_value_eur: number
  offer_count: number
  trusted_offer_count: number
  scarcity_level: 'abundant' | 'moderate' | 'scarce'
  top_offers: IdealoOffer[]
  price_history: PriceHistoryStats | null
  data_source: DataSource
  source_note: string | null
  is_buy_new_deal: boolean
  deal_discount_pct: number
  deal_headline: string | null
  best_buy_new_url: string | null
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
  mode: SplitMode
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
