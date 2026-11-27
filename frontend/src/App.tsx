import { useEffect, useState } from 'react'
import { getHealth } from './api/client'
import { AppHeader } from './chrome/AppHeader'
import { CreateProcessWizard } from './overlays/CreateProcessWizard'
import { OnboardingModal } from './overlays/OnboardingModal'
import type { ProcessSummary } from './types/process'
import { WorldCanvas } from './world/WorldCanvas'
import { STATUS_META } from './world/palette'
import { WorldLegend } from './chrome/WorldLegend'

const ONBOARDING_KEY = 'cleanbreak.onboarding.seen'

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
  const [processes, setProcesses] = useState<ProcessSummary[]>([])
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingSeen())
  const [showWizard, setShowWizard] = useState(false)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then(() => {
        if (!cancelled) setApiOk(true)
      })
      .catch(() => {
        if (!cancelled) setApiOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <div className="relative h-full min-h-screen overflow-hidden bg-canvas text-ink">
      {/* Layer: world (always under) */}
      <WorldCanvas
        processes={processes}
        onCreateProcess={openWizard}
        onOpenProcess={setActiveProcessId}
      />

      {/* Layer: chrome above world */}
      <AppHeader apiOk={apiOk} processCount={processes.length} onCreateProcess={openWizard} />
      <WorldLegend />

      {/* Inside-house stub overlay — detail UI comes next */}
      {activeProcess && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center p-4 sm:p-8">
          <div className="panel pointer-events-auto w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-sm text-muted">Inside the house</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-petrol">{activeProcess.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`pill ${STATUS_META[activeProcess.status].pill}`}>
                    {STATUS_META[activeProcess.status].label}
                  </span>
                  <span className="pill pill-neutral">
                    {1 + activeProcess.participantEmails.length} people
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink2">
                  Inventory and split views land here next. The backend split API stays at{' '}
                  <code className="text-xs font-semibold">/api/*</code>.
                </p>
              </div>
              <button type="button" onClick={() => setActiveProcessId(null)} className="btn btn-ghost h-9 shrink-0">
                Back to world
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Layer: modals */}
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
