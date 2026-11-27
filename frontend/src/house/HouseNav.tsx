import { LogoMark } from '../chrome/LogoMark'

type HouseNavProps = {
  processTitle: string
  balance: [number, number] | null
  onBackToWorld: () => void
}

const TABS = [
  { id: 'world', label: 'World' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'split', label: 'Split' },
  { id: 'export', label: 'List & Export' },
] as const

/** Top bar inside a house: breadcrumb, view tabs and the live balance. */
export function HouseNav({ processTitle, balance, onBackToWorld }: HouseNavProps) {
  return (
    <header className="absolute inset-x-0 top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6">
      <button type="button" onClick={onBackToWorld} className="flex items-center gap-2" title="Back to the world">
        <LogoMark className="h-7 w-7" />
        <span className="hidden text-lg font-extrabold tracking-tight text-petrol sm:inline">Dividealo</span>
      </button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 rounded-full bg-clay px-3 py-1 text-xs font-semibold text-petrol md:flex">
        <button type="button" onClick={onBackToWorld} className="hover:underline">
          Neighbourhood
        </button>
        <span className="text-muted">/</span>
        <span className="truncate">{processTitle}</span>
      </nav>

      <nav aria-label="House views" className="mx-auto flex items-center gap-1">
        {TABS.map((t) => {
          const active = t.id === 'inventory'
          const soon = t.id === 'split' || t.id === 'export'
          return (
            <button
              key={t.id}
              type="button"
              disabled={soon}
              title={soon ? 'Coming next' : undefined}
              onClick={t.id === 'world' ? onBackToWorld : undefined}
              aria-current={active ? 'page' : undefined}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                active
                  ? 'bg-petrol text-white shadow-[0_12px_28px_-6px_rgba(15,23,42,0.2)]'
                  : soon
                    ? 'cursor-not-allowed text-muted'
                    : 'text-petrol hover:bg-surface-low'
              } ${t.id === 'export' ? 'hidden sm:block' : ''}`}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {balance && (
        <span className="pill pill-settled hidden sm:inline-flex">
          <span className="pulse-dot" /> Balance {balance[0]}/{balance[1]}
        </span>
      )}
    </header>
  )
}
