import type { AssignmentAction } from '../types/inventory'
import { verb } from './format'

/** Label + pill class for where an item ends up. */
export function actionPill(action: AssignmentAction, [a, b]: [string, string]) {
  switch (action) {
    case 'party_a':
      return { text: `${a} 100%`, cls: 'bg-[#ffdad4] text-[#8a1c10]' }
    case 'party_b':
      return { text: `${b} 100%`, cls: 'pill-settled' }
    case 'sell_split':
      return { text: 'Sell & split', cls: 'pill-draft' }
    case 'keep_a_buy_new_b':
      return { text: `${a} ${verb(a, 'keeps', 'keep')} · ${b} ${verb(b, 'buys', 'buy')} new`, cls: 'pill-live' }
    case 'keep_b_buy_new_a':
      return { text: `${b} ${verb(b, 'keeps', 'keep')} · ${a} ${verb(a, 'buys', 'buy')} new`, cls: 'pill-live' }
  }
}
