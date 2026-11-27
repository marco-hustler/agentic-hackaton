import { useEffect, useMemo, useRef, useState } from 'react'
import { getHealth } from './api/client'
import { AppHeader } from './chrome/AppHeader'
import { WorldLegend } from './chrome/WorldLegend'
import { BalanceCard } from './house/BalanceCard'
import { formatEur, pct } from './house/format'
import { HouseNav } from './house/HouseNav'
import { InventoryPanel } from './house/InventoryPanel'
import { ItemDetail } from './house/ItemDetail'
import { useHouseInventory } from './house/useHouseInventory'
import { CreateProcessWizard } from './overlays/CreateProcessWizard'
import { OnboardingModal } from './overlays/OnboardingModal'
import type { ProcessSummary } from './types/process'
import { buildRooms, participantNames } from './world/rooms'
import { WorldCanvas, type WorldMode } from './world/WorldCanvas'

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
  const [mode, setMode] = useState<WorldMode>('world')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [spinRequest, setSpinRequest] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  /** Card expanded in the list; kept when coming back from the detail. */
  const [listId, setListId] = useState<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then(() => !cancelled && setApiOk(true))
      .catch(() => !cancelled && setApiOk(false))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || showWizard || showOnboarding) return
      if (mode === 'confirm') {
        setMode('world')
        setFocusId(null)
      } else if (mode === 'house' && detailId) {
        setListId(detailId)
        setDetailId(null)
      } else if (mode === 'house') {
        setMode('world')
        setFocusId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, showWizard, showOnboarding, detailId])

  const focusProcess = processes.find((p) => p.id === focusId) ?? null
  const names = useMemo<[string, string]>(() => {
    const n = focusProcess ? participantNames(focusProcess) : ['You']
    return [n[0], n[1] ?? 'Invite someone']
  }, [focusProcess])

  // Editable inventory for the house we're in. Seeded from the demo scenario
  // (idealo cache only, zero MCP calls); edits re-run the deterministic solver.
  const inventory = useHouseInventory(focusId, names, mode === 'house')
  const demo = inventory.scenario
  const demoError = inventory.error

  const focusRooms = useMemo(() => (focusProcess ? buildRooms(focusProcess) : null), [focusProcess])

  const balance = useMemo<[number, number] | null>(() => {
    if (!demo) return null
    const a = pct(demo.split.party_a_received_goods_eur, demo.split.party_a_received_goods_eur + demo.split.party_b_received_goods_eur)
    return [a, 100 - a]
  }, [demo])

  function openWizard() {
    setShowOnboarding(false)
    markOnboardingSeen()
    setShowWizard(true)
  }

  function backToWorld() {
    setDetailId(null)
    setListId(null)
    setMode('world')
    setFocusId(null)
  }

  const inside = mode === 'house' && focusProcess !== null
  const detailVi = detailId ? (demo?.valued_items.find((vi) => vi.item.id === detailId) ?? null) : null

  return (
    <div className="relative h-full min-h-screen overflow-hidden bg-canvas text-ink">
      {/* Layer: world. Full screen in the neighbourhood, left stage inside a house. */}
      <div className="world-stage">
        <WorldCanvas
          processes={processes}
          mode={mode}
          focusId={focusId}
          focusRooms={focusRooms}
          spinRequest={spinRequest}
          frameRef={frameRef}
          onCreateProcess={openWizard}
          onRequestOpen={(id) => {
            setFocusId(id)
            setMode('confirm')
          }}
          onConfirmEnter={() => setMode('house')}
          onCancel={backToWorld}
        />
      </div>
      <div ref={frameRef} className="world-frame" data-mode={inside ? 'house' : 'world'}>
        {inside && focusProcess && (
          <div className="pop-in-late pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
            <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-midnight/95 px-4 py-3 text-white shadow-[0_12px_28px_-6px_rgba(15,23,42,0.2)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10" aria-hidden>
                <svg viewBox="0 0 20 20" className="h-5 w-5">
                  <path d="M10 2 17 6 10 10 3 6Z M3 6v8l7 4V10 M17 6v8l-7 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">Diorama view: {focusProcess.title}</span>
                <span className="block truncate text-xs text-white/60">
                  {demo
                    ? `Estimated total value ${formatEur(demo.split.total_fair_value_eur)} · ${demo.valued_items.length} items mapped`
                    : `${focusRooms?.length ?? 0} rooms · loading items…`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSpinRequest((n) => n + 1)}
                className="btn h-8 border border-white/15 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              >
                ⟳ Rotate
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Layer: chrome */}
      {inside && focusProcess ? (
        <>
          <HouseNav processTitle={focusProcess.title} balance={balance} onBackToWorld={backToWorld} />
          <div className="house-balance pop-in">
            <BalanceCard split={demo?.split ?? null} names={names} />
          </div>
          <div className="house-panel pop-in-late">
            {detailVi ? (
              <ItemDetail
                key={detailVi.item.id}
                vi={detailVi}
                assignment={demo?.split.assignments.find((a) => a.item_id === detailVi.item.id)}
                names={names}
                solving={inventory.solving}
                onBack={() => {
                  setListId(detailVi.item.id)
                  setDetailId(null)
                }}
                onUpdate={(patch) => inventory.updateItem(detailVi.item.id, patch)}
              />
            ) : (
              <InventoryPanel
                processTitle={focusProcess.title}
                demo={demo}
                error={demoError}
                names={names}
                openId={listId}
                onOpenChange={setListId}
                onOpenItem={setDetailId}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <AppHeader apiOk={apiOk} processCount={processes.length} onCreateProcess={openWizard} />
          {mode === 'world' && <WorldLegend />}
        </>
      )}

      {/* Layer: modals */}
      <OnboardingModal
        open={showOnboarding}
        onClose={() => {
          setShowOnboarding(false)
          markOnboardingSeen()
        }}
        onStart={openWizard}
      />
      <CreateProcessWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={(process) => {
          setProcesses((prev) => [...prev, process])
          setFocusId(process.id)
          setMode('house')
        }}
      />
    </div>
  )
}
