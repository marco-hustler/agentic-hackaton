export type ProcessView = 'world' | 'list'

type ViewSwitchProps = {
  value: ProcessView
  onChange: (view: ProcessView) => void
}

function WorldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <rect x="3" y="15" width="18" height="5" rx="1.5" />
      <path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6" />
    </svg>
  )
}

export function ViewSwitch({ value, onChange }: ViewSwitchProps) {
  return (
    <div className="view-switch pointer-events-auto inline-flex items-center gap-1 p-1" role="group" aria-label="Process view">
      <button
        type="button"
        className={`view-switch-option ${value === 'world' ? 'view-switch-option-active' : ''}`}
        aria-pressed={value === 'world'}
        onClick={() => onChange('world')}
      >
        <WorldIcon />
        World
      </button>
      <button
        type="button"
        className={`view-switch-option ${value === 'list' ? 'view-switch-option-active' : ''}`}
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <ListIcon />
        List
      </button>
    </div>
  )
}
