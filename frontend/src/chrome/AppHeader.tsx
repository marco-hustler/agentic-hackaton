import { LogoMark } from './LogoMark'

type AppHeaderProps = {
  apiOk: boolean | null
  processCount: number
  onCreateProcess: () => void
}

export function AppHeader({ apiOk, processCount, onCreateProcess }: AppHeaderProps) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
      <div className="panel pointer-events-auto flex items-center gap-3 px-4 py-3">
        <LogoMark />
        <div>
          <h1 className="text-xl font-extrabold leading-none tracking-tight text-petrol">Dividealo</h1>
          <p className="mt-1 text-xs text-ink2">
            {processCount === 0
              ? 'Your neighbourhood is empty'
              : `${processCount} ${processCount === 1 ? 'process' : 'processes'} in your neighbourhood`}
          </p>
        </div>
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        <span
          className={`pill ${apiOk === null ? 'pill-neutral' : apiOk ? 'pill-settled' : 'pill-error'}`}
          title="FastAPI backend status"
        >
          {apiOk && <span className="pulse-dot" />}
          API {apiOk === null ? '…' : apiOk ? 'online' : 'offline'}
        </span>
        <a href="/legacy" className="btn btn-ghost h-9 text-xs" title="Open the previous Split Board UI">
          Legacy demo
        </a>
        <button type="button" onClick={onCreateProcess} className="btn btn-primary h-9">
          <span className="text-base leading-none">+</span> New process
        </button>
      </div>
    </header>
  )
}
