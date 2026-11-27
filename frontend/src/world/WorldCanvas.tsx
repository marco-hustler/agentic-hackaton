import type { ProcessSummary } from '../types/process'
import { HouseLot } from './HouseLot'
import { EmptyPlusLot } from './EmptyPlusLot'

type WorldCanvasProps = {
  processes: ProcessSummary[]
  onCreateProcess: () => void
  onOpenProcess: (id: string) => void
}

/** Permanent world layer: grass neighbourhood, houses = processes. */
export function WorldCanvas({
  processes,
  onCreateProcess,
  onOpenProcess,
}: WorldCanvasProps) {
  const empty = processes.length === 0

  return (
    <div className="absolute inset-0 overflow-hidden bg-grass">
      {/* Soft terrain texture */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 30% 40%, var(--grass-dark) 0%, transparent 55%), radial-gradient(ellipse at 70% 70%, var(--earth) 0%, transparent 45%)',
        }}
      />
      {/* Road / path suggestion */}
      <div className="absolute left-1/2 top-0 h-full w-16 -translate-x-1/2 bg-earth/40" />
      <div className="absolute left-0 top-1/2 h-12 w-full -translate-y-1/2 bg-earth/30" />

      <div className="relative z-10 flex h-full items-center justify-center p-8">
        {empty ? (
          <EmptyPlusLot onCreate={onCreateProcess} />
        ) : (
          <div className="flex flex-wrap items-end justify-center gap-10 max-w-5xl">
            {processes.map((p) => (
              <HouseLot
                key={p.id}
                process={p}
                onOpen={() => onOpenProcess(p.id)}
              />
            ))}
            <button
              type="button"
              onClick={onCreateProcess}
              className="flex h-28 w-28 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/25 bg-card/50 text-ink2 transition hover:border-accent hover:text-accent-text hover:bg-card/80"
              aria-label="Create a new process"
            >
              <span className="text-4xl font-light leading-none">+</span>
              <span className="mt-2 text-xs font-medium">New process</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
