import type { ProcessSummary } from '../types/process'

type HouseLotProps = {
  process: ProcessSummary
  onOpen: () => void
}

const KIND_LABEL: Record<ProcessSummary['kind'], string> = {
  separation: 'Separation',
  inheritance: 'Inheritance',
  other: 'Other split',
}

export function HouseLot({ process, onOpen }: HouseLotProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-36 flex-col items-center text-left transition hover:-translate-y-1"
      title={process.title}
    >
      {/* Simple flat isometric-ish house */}
      <div className="relative">
        <div
          className="h-0 w-0 border-l-[48px] border-r-[48px] border-b-[36px] border-l-transparent border-r-transparent border-b-roof transition group-hover:brightness-110"
          aria-hidden
        />
        <div className="mx-auto -mt-1 flex h-20 w-24 flex-col items-center justify-end rounded-b-md bg-card border border-line shadow-sm">
          <div className="mb-3 h-8 w-6 rounded-t-sm bg-earth/80 border border-line" />
        </div>
      </div>
      <div className="mt-3 w-full text-center">
        <p className="truncate text-sm font-medium text-ink">{process.title}</p>
        <p className="text-xs text-muted">
          {KIND_LABEL[process.kind]} · {process.status}
        </p>
      </div>
    </button>
  )
}
