import { useEffect, useState } from 'react'

const IDEALO_PHRASES = [
  'Asking idealo MCP for matching products…',
  'Pulling offers from trusted shops…',
  'Reading product details and photos…',
  'Checking 30-day price history…',
  'Applying age and condition depreciation…',
  'Almost there — finishing the idealo lookup…',
]

/**
 * Full-bleed valuing overlay: idealo wordmark + orange progress sweep + rotating status lines.
 * Shown while a new inventory item is being priced — nothing is added until this succeeds.
 */
export function IdealoLoadingOverlay({ label }: { label?: string } = {}) {
  const [phraseIdx, setPhraseIdx] = useState(0)
  const text = label ?? IDEALO_PHRASES[phraseIdx % IDEALO_PHRASES.length]

  useEffect(() => {
    if (label) return
    const id = window.setInterval(() => setPhraseIdx((i) => i + 1), 2200)
    return () => window.clearInterval(id)
  }, [label])

  return (
    <div className="idealo-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="idealo-loading-card pop-in">
        <div className="idealo-loading-mark">
          <img src="/idealo-logo.png" alt="idealo" className="idealo-loading-logo" width={200} height={93} />
          <span className="idealo-loading-bar" aria-hidden />
        </div>
        <p key={text} className="idealo-loading-label idealo-loading-label-swap">
          {text}
        </p>
        <span className="idealo-loading-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  )
}

/** Keep the overlay on screen long enough to read, even when the API is instant. */
export async function holdIdealoMoment<T>(work: () => Promise<T>, minMs = 1400): Promise<T> {
  const started = performance.now()
  try {
    return await work()
  } finally {
    const left = minMs - (performance.now() - started)
    if (left > 0) await new Promise((r) => setTimeout(r, left))
  }
}
