import type { ProcessSummary } from '../types/process'
import { KIND_META, STATUS_META } from '../world/palette'

type ProcessListProps = {
  processes: ProcessSummary[]
  onOpenProcess: (id: string) => void
}

export function ProcessList({ processes, onOpenProcess }: ProcessListProps) {
  return (
    <main className="absolute inset-0 overflow-y-auto bg-canvas px-4 pb-28 pt-60 sm:px-6 sm:pt-40 lg:pt-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-line-strong pb-5">
          <div>
            <p className="label-sm text-muted">Process overview</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-petrol">Processes</h2>
            <p className="mt-2 text-sm text-ink2">A structured overview of every split process.</p>
          </div>
          <span className="label-md rounded-lg bg-surface-low px-3 py-2 text-petrol">
            {processes.length} {processes.length === 1 ? 'process' : 'processes'}
          </span>
        </div>

        {processes.length === 0 ? (
          <div className="panel flex flex-col items-start gap-4 p-7 sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-low text-xl text-petrol" aria-hidden="true">▤</div>
            <div>
              <h3 className="text-lg font-bold text-petrol">No processes yet</h3>
              <p className="mt-1 text-sm text-ink2">Create a process to see its status and participants here.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3">
            {processes.map((process, index) => (
              <li key={process.id}>
                <button
                  type="button"
                  onClick={() => onOpenProcess(process.id)}
                  className="process-list-card panel group w-full p-5 text-left sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="label-sm text-muted">Process {String(index + 1).padStart(2, '0')}</p>
                      <h3 className="mt-2 truncate text-lg font-bold tracking-tight text-petrol sm:text-xl">{process.title}</h3>
                    </div>
                    <span className={`pill ${STATUS_META[process.status].pill}`}>{STATUS_META[process.status].label}</span>
                  </div>
                  <div className="mt-5 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div>
                      <p className="label-sm text-muted">Type</p>
                      <p className="mt-1 font-semibold text-ink">{KIND_META[process.kind].label}</p>
                    </div>
                    <div>
                      <p className="label-sm text-muted">Participants</p>
                      <p className="mt-1 font-semibold text-ink">
                        {1 + process.participantEmails.length} {process.participantEmails.length === 0 ? 'person' : 'people'}
                      </p>
                    </div>
                    <span className="font-semibold text-petrol group-hover:underline">Open process <span aria-hidden="true">↗</span></span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
