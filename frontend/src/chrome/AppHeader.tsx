import type { AccountInfo } from '../types/process'
import { AccountMenu } from './AccountMenu'
import { LogoMark } from './LogoMark'
import { ViewSwitch, type ProcessView } from './ViewSwitch'

type AppHeaderProps = {
  account: AccountInfo
  processCount: number
  onSignOut: () => void
  view: ProcessView
  onViewChange: (view: ProcessView) => void
}

export function AppHeader({ account, processCount, onSignOut, view, onViewChange }: AppHeaderProps) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 grid grid-cols-1 items-start gap-3 p-4 sm:grid-cols-[1fr_auto] sm:p-6 lg:grid-cols-[1fr_auto_1fr]">
      <div className="panel pointer-events-auto flex items-center gap-3 justify-self-start px-4 py-3">
        <LogoMark />
        <div>
          <h1 className="text-xl font-extrabold leading-none tracking-tight text-petrol">Dividealo</h1>
          <p className="mt-1 text-xs text-ink2">
            {processCount === 0
              ? view === 'world' ? 'Your neighbourhood is empty' : 'No processes yet'
              : `${processCount} ${processCount === 1 ? 'process' : 'processes'}${view === 'world' ? ' in your neighbourhood' : ''}`}
          </p>
        </div>
      </div>

      <div className="order-3 justify-self-center sm:col-span-2 lg:order-none lg:col-span-1">
        <ViewSwitch value={view} onChange={onViewChange} />
      </div>

      <AccountMenu account={account} onSignOut={onSignOut} />
    </header>
  )
}
