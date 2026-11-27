import type { ReactNode } from 'react'

export type HouseTab = 'inventory' | 'split' | 'export'

type HouseViewSwitchProps = {
  value: HouseTab
  onChange: (tab: HouseTab) => void
  /** Inventoried object count shown on the Inventory tab label. */
  inventoryCount?: number | null
}

function InventoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

function SplitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M12 3v18" />
      <path d="M4 7h6v10H4zM14 7h6v10h-6z" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

const OPTIONS: { id: HouseTab; label: string; icon: () => ReactNode }[] = [
  { id: 'inventory', label: 'Inventory', icon: InventoryIcon },
  { id: 'split', label: 'Split', icon: SplitIcon },
  { id: 'export', label: 'List & Export', icon: ExportIcon },
]

export function HouseViewSwitch({ value, onChange, inventoryCount = null }: HouseViewSwitchProps) {
  return (
    <div className="view-switch pointer-events-auto inline-flex items-center gap-1 p-1" role="group" aria-label="House view">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon
        const label =
          opt.id === 'inventory' && inventoryCount !== null && inventoryCount !== undefined
            ? `${opt.label} (${inventoryCount})`
            : opt.label
        return (
          <button
            key={opt.id}
            type="button"
            className={`view-switch-option ${opt.id === 'export' ? 'min-w-[8.5rem]' : opt.id === 'inventory' ? 'min-w-[7.5rem]' : ''} ${value === opt.id ? 'view-switch-option-active' : ''}`}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            <Icon />
            {label}
          </button>
        )
      })}
    </div>
  )
}
