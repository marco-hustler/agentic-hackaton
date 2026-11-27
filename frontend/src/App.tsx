import { useEffect, useState } from 'react'
import { getHealth } from './api/client'
import { AppHeader } from './chrome/AppHeader'
import { CreateProcessWizard } from './overlays/CreateProcessWizard'
import { OnboardingModal } from './overlays/OnboardingModal'
import type { ProcessSummary } from './types/process'
import { WorldCanvas } from './world/WorldCanvas'

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
    <div className="relative h-full min-h-screen overflow-hidden bg-page text-ink">
      {/* Layer: world (always under) */}
      <WorldCanvas
        processes={processes}
        onCreateProcess={openWizard}
        onOpenProcess={setActiveProcessId}
      />

      {/* Layer: chrome above world */}
      <AppHeader apiOk={apiOk} />

      {/* Inside-house stub overlay — detail UI comes next */}
      {activeProcess && (
        <div className="absolute inset-0 z-30 flex items-end justify-center p-4 sm:p-8 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-card border border-line p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-muted">Inside the house</p>
                <h2 className="text-lg font-medium text-ink">{activeProcess.title}</h2>
                <p className="mt-1 text-sm text-ink2">
                  Inventory & separation views land here next. Backend split API stays at{' '}
                  <code className="font-mono text-xs">/api/*</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveProcessId(null)}
                className="h-8 px-3 rounded-lg border border-line bg-raised text-sm font-medium text-ink hover:bg-card"
              >
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
