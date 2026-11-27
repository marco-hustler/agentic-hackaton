import { useEffect, useState } from 'react'
import { listProcesses } from './api/client'
import { LoginPage } from './auth/LoginPage'
import { clearSession, loadSession } from './auth/session'
import { AppHeader } from './chrome/AppHeader'
import { ProcessList } from './chrome/ProcessList'
import type { ProcessView } from './chrome/ViewSwitch'
import { CreateProcessWizard } from './overlays/CreateProcessWizard'
import { OnboardingModal } from './overlays/OnboardingModal'
import type { AccountInfo, ProcessSummary } from './types/process'
import { WorldCanvas } from './world/WorldCanvas'
import { STATUS_META } from './world/palette'

const ONBOARDING_KEY = 'dividealo.onboarding.seen'

function loadOnboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return false
  }
}

function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1')
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [account, setAccount] = useState<AccountInfo | null>(() => loadSession())
  const [processes, setProcesses] = useState<ProcessSummary[]>([])
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingSeen())
  const [showWizard, setShowWizard] = useState(false)
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<ProcessView>('world')

  useEffect(() => {
    if (!account) {
      setProcesses([])
      setLoadError(null)
      setActiveProcessId(null)
      return
    }

    let cancelled = false
    listProcesses()
      .then((list) => {
        if (cancelled) return
        setProcesses(list)
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load')
      })
    return () => {
      cancelled = true
    }
  }, [account])

  const activeProcess = processes.find((p) => p.id === activeProcessId) ?? null

  function openWizard() {
    setShowOnboarding(false)
    markOnboardingSeen()
    setShowWizard(true)
  }

  function dismissOnboarding() {
    setShowOnboarding(false)
    markOnboardingSeen()
  }

  function signOut() {
    clearSession()
    setAccount(null)
    setShowWizard(false)
    setActiveProcessId(null)
  }

  if (!account) {
    return <LoginPage onSignedIn={setAccount} />
  }

  return (
    <div className="relative h-full min-h-screen overflow-hidden bg-canvas text-ink">
      {view === 'world' ? (
        <WorldCanvas
          processes={processes}
          onCreateProcess={openWizard}
          onOpenProcess={setActiveProcessId}
        />
      ) : (
        <ProcessList
          processes={processes}
          onOpenProcess={setActiveProcessId}
        />
      )}

      <AppHeader
        account={account}
        processCount={processes.length}
        onSignOut={signOut}
        view={view}
        onViewChange={(nextView) => {
          setActiveProcessId(null)
          setView(nextView)
        }}
      />

      {!showWizard && !showOnboarding && !activeProcess && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 sm:bottom-8">
          <button
            type="button"
            onClick={openWizard}
            className="btn btn-slate pointer-events-auto h-11 px-5 shadow-[0_12px_28px_-6px_rgba(15,23,42,0.35)]"
          >
            <span className="text-base leading-none">+</span> New process
          </button>
        </div>
      )}

      {loadError && (
        <div className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-error/30 bg-white px-3 py-2 text-xs text-error shadow-sm">
          {loadError}
        </div>
      )}

      {activeProcess && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4 sm:p-6">
          <div className="panel pointer-events-auto w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-sm text-muted">Process</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-petrol">{activeProcess.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`pill ${STATUS_META[activeProcess.status].pill}`}>
                    {STATUS_META[activeProcess.status].label}
                  </span>
                  <span className="pill pill-neutral">
                    {1 + activeProcess.participantEmails.length} {activeProcess.participantEmails.length === 0 ? 'person' : 'people'}
                  </span>
                </div>
                {activeProcess.participantEmails.length > 0 && (
                  <p className="mt-3 text-sm text-ink2">
                    Invites: {activeProcess.participantEmails.join(', ')}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setActiveProcessId(null)} className="btn btn-ghost h-9 shrink-0">
                Back to {view}
              </button>
            </div>
          </div>
        </div>
      )}

      <OnboardingModal
        open={showOnboarding}
        onClose={dismissOnboarding}
        onStart={openWizard}
      />
      <CreateProcessWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={(process) => {
          setProcesses((prev) => [...prev, process])
          setActiveProcessId(process.id)
        }}
      />
    </div>
  )
}
