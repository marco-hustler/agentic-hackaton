import { useEffect, useId, useRef, useState } from 'react'
import type { AccountInfo } from '../types/process'
import { LogoMark } from './LogoMark'
import { ViewSwitch, type ProcessView } from './ViewSwitch'

type AppHeaderProps = {
  account: AccountInfo
  processCount: number
  onSignOut: () => void
  view: ProcessView
  onViewChange: (view: ProcessView) => void
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function AppHeader({ account, processCount, onSignOut, view, onViewChange }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

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

      <div className="pointer-events-auto relative justify-self-end" ref={menuRef}>
        <button
          type="button"
          className="panel flex items-center gap-3 px-3 py-2 text-left transition hover:bg-white/90"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-bold text-petrol">{account.name}</p>
            <p className="truncate text-xs text-ink2">{account.email}</p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-petrol text-xs font-bold text-white" aria-hidden>
            {account.initials}
          </div>
        </button>

        {menuOpen && (
          <div id={menuId} role="menu" className="panel absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[10.5rem] overflow-hidden p-1" style={{ background: '#ffffff' }}>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-petrol transition hover:bg-surface-low"
              onClick={() => {
                setMenuOpen(false)
                onSignOut()
              }}
            >
              <LogoutIcon className="h-4 w-4 text-muted" />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
