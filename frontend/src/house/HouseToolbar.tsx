import { HouseViewSwitch, type HouseTab } from './HouseViewSwitch'

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

type HouseToolbarProps = {
  tab: HouseTab
  onTab: (tab: HouseTab) => void
  onBackToWorld: () => void
  inventoryCount?: number | null
  /** When set, show search + Add object on the right (inventory tab). */
  inventoryFilter?: string
  onInventoryFilter?: (value: string) => void
  onAddObject?: () => void
  /** Overlay uses absolute positioning; embedded sits in the white inventory shell. */
  variant?: 'overlay' | 'embedded'
}

/** Back + view switch, optionally inventory search/add. */
export function HouseToolbar({
  tab,
  onTab,
  onBackToWorld,
  inventoryCount = null,
  inventoryFilter = '',
  onInventoryFilter,
  onAddObject,
  variant = 'overlay',
}: HouseToolbarProps) {
  const showInventoryTools = tab === 'inventory' && onInventoryFilter && onAddObject

  if (variant === 'embedded') {
    return (
      <div className="inventory-toolbar">
        <button type="button" onClick={onBackToWorld} className="inventory-toolbar-back" title="Back to home">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-petrol shadow-[0_2px_8px_-2px_rgba(15,23,42,0.15)] transition hover:bg-surface-low">
            <BackIcon className="h-5 w-5" />
          </span>
          <span className="sr-only">Back to home</span>
        </button>

        <div className="inventory-toolbar-switch">
          <HouseViewSwitch value={tab} onChange={onTab} inventoryCount={inventoryCount} />
        </div>

        {showInventoryTools && (
          <div className="inventory-toolbar-tools">
            <label className="relative w-full min-w-0 sm:w-36 lg:w-44">
              <span className="sr-only">Search inventory</span>
              <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
                <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={inventoryFilter}
                onChange={(e) => onInventoryFilter(e.target.value)}
                placeholder="Search…"
                className="field h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm"
              />
            </label>
            <button type="button" className="btn btn-primary h-10 shrink-0 px-3.5" onClick={onAddObject}>
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Add object</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-4 pb-3 sm:px-6">
      <button
        type="button"
        onClick={onBackToWorld}
        className="pointer-events-auto justify-self-start flex items-center gap-2"
        title="Back to home"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white/90 text-petrol shadow-[0_8px_20px_-8px_rgba(15,23,42,0.25)] backdrop-blur transition hover:bg-white">
          <BackIcon className="h-5 w-5" />
        </span>
        <span className="hidden text-sm font-bold text-petrol sm:inline">Back to home</span>
      </button>

      <div className="pointer-events-auto justify-self-center">
        <HouseViewSwitch value={tab} onChange={onTab} inventoryCount={inventoryCount} />
      </div>

      {showInventoryTools ? (
        <div className="pointer-events-auto justify-self-end flex items-center gap-2">
          <label className="relative w-36 sm:w-44 lg:w-56">
            <span className="sr-only">Search inventory</span>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={inventoryFilter}
              onChange={(e) => onInventoryFilter(e.target.value)}
              placeholder="Search…"
              className="field h-10 w-full rounded-xl border border-line bg-white/90 pl-9 pr-3 text-sm shadow-[0_8px_20px_-8px_rgba(15,23,42,0.25)] backdrop-blur"
            />
          </label>
          <button type="button" className="btn btn-primary h-10 shrink-0 px-3.5 shadow-[0_8px_20px_-8px_rgba(224,90,71,0.45)]" onClick={onAddObject}>
            <span className="text-base leading-none">+</span>
            <span className="hidden sm:inline">Add object</span>
          </button>
        </div>
      ) : (
        <span aria-hidden className="justify-self-end" />
      )}
    </div>
  )
}
