import type { ValuedItem } from '../types/inventory'
import { categoryColor } from '../world/palette'

/** Product photo from idealo, or a category swatch when there is none. */
export function Thumb({ vi, size = 'md' }: { vi: ValuedItem; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-14 w-14 rounded-2xl'
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-line bg-white ${box}`} aria-hidden>
      {vi.valuation.image_url ? (
        <img src={vi.valuation.image_url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
      ) : (
        <span className="h-4 w-4 rounded-[5px]" style={{ background: categoryColor(vi.item.category) }} />
      )}
    </span>
  )
}
