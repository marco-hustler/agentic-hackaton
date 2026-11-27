import { useEffect, useMemo, useRef, useState } from 'react'
import { listProcesses } from './api/client'
import { LoginPage } from './auth/LoginPage'
import { clearSession, loadSession } from './auth/session'
import { AppHeader } from './chrome/AppHeader'
import { ProcessList } from './chrome/ProcessList'
import type { ProcessView } from './chrome/ViewSwitch'
import { ExportPanel } from './house/ExportPanel'
import { HouseNav, type HouseTab } from './house/HouseNav'
import { InventoryPanel } from './house/InventoryPanel'
import { ItemDetail } from './house/ItemDetail'
import { SplitBoard } from './house/SplitBoard'
import type { ValuedItem } from './types/inventory'
import { useHouseInventory } from './house/useHouseInventory'
import { CreateProcessWizard } from './overlays/CreateProcessWizard'
import { OnboardingModal } from './overlays/OnboardingModal'
import type { AccountInfo, ProcessSummary } from './types/process'
import { buildRooms, participantNames } from './world/rooms'
import { WorldCanvas, type WorldMode } from './world/WorldCanvas'

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
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Neighbourhood as a 3D world or as a plain list. */
  const [view, setView] = useState<ProcessView>('world')
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingSeen())
  const [showWizard, setShowWizard] = useState(false)
  const [mode, setMode] = useState<WorldMode>('world')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  /** Right-hand view inside a house. Item details live under Split. */
  const [tab, setTab] = useState<HouseTab>('inventory')
  const [inventoryFilter, setInventoryFilter] = useState('')
  const [addingObject, setAddingObject] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)

  // Processes are stored server-side per account (demo sign-in).
  useEffect(() => {
    if (!account) return
    let cancelled = false
    listProcesses()
      .then((list) => {
        if (cancelled) return
        setProcesses(list)
        setLoadError(null)
      })
      .catch((err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Failed to load'))
    return () => {
      cancelled = true
    }
  }, [account])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || showWizard || showOnboarding) return
      if (mode === 'confirm') {
        setMode('world')
        setFocusId(null)
      } else if (mode === 'house' && detailId) {
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

  function openWizard() {
    setShowOnboarding(false)
    markOnboardingSeen()
    setShowWizard(true)
  }

  function backToWorld() {
    setDetailId(null)
    setTab('inventory')
    setInventoryFilter('')
    setAddingObject(false)
    setMode('world')
    setFocusId(null)
  }

  const inside = mode === 'house' && focusProcess !== null
  const detailVi = detailId ? (demo?.valued_items.find((vi) => vi.item.id === detailId) ?? null) : null

  function itemDetail(vi: ValuedItem, backLabel: string) {
    return (
      <ItemDetail
        key={vi.item.id}
        vi={vi}
        assignment={demo?.split.assignments.find((a) => a.item_id === vi.item.id)}
        names={names}
        solving={inventory.solving}
        backLabel={backLabel}
        onBack={() => setDetailId(null)}
        onUpdate={(patch) => inventory.updateItem(vi.item.id, patch)}
      />
    )
  }

  function signOut() {
    clearSession()
    setAccount(null)
    setProcesses([])
    setShowWizard(false)
    backToWorld()
  }

  function enterProcess(id: string) {
    setView('world')
    setFocusId(id)
    setMode('house')
  }

  if (!account) {
    return <LoginPage onSignedIn={setAccount} />
  }

  return (
    <div className="relative h-full min-h-screen overflow-hidden bg-canvas text-ink">
      {/* Layer: world. Full screen in the neighbourhood, left stage inside a house. */}
      <div className="world-stage">
        <WorldCanvas
          processes={processes}
          mode={mode}
          focusId={focusId}
          focusRooms={focusRooms}
          spinRequest={0}
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
      <div ref={frameRef} className="world-frame" data-mode={inside ? 'house' : 'world'} data-tab={tab} />

      {/* Layer: chrome */}
      {inside && focusProcess ? (
        <>
          <HouseNav
            processTitle={focusProcess.title}
            account={account}
            tab={tab}
            onTab={(t) => {
              setDetailId(null)
              setAddingObject(false)
              setTab(t)
            }}
            onBackToWorld={backToWorld}
            onSignOut={signOut}
            inventoryFilter={inventoryFilter}
            onInventoryFilter={setInventoryFilter}
            onAddObject={() => setAddingObject(true)}
            inventoryCount={inventory.itemCount}
          />
          {tab === 'split' ? (
            <>
              <SplitBoard
                scenario={demo}
                error={demoError}
                names={names}
                people={participantNames(focusProcess)}
                solving={inventory.solving}
                unsplit={inventory.unsplit}
                onSplit={inventory.splitAll}
                onOpenItem={setDetailId}
              />
              {detailVi && (
                <>
                  <button
                    type="button"
                    aria-label="Close item"
                    className="fade-in fixed inset-0 z-40 bg-midnight/40 backdrop-blur-sm"
                    onClick={() => setDetailId(null)}
                  />
                  <div className="item-modal" role="dialog" aria-modal="true">
                    <div className="pop-in flex flex-col">{itemDetail(detailVi, '✕ Close')}</div>
                  </div>
                </>
              )}
            </>
          ) : tab === 'export' ? (
            <ExportPanel
              title={focusProcess.title}
              demo={demo}
              error={demoError}
              names={names}
              onOpenItem={(id) => {
                setTab('split')
                setDetailId(id)
              }}
            />
          ) : (
            <InventoryPanel
              processTitle={focusProcess.title}
              demo={demo}
              error={demoError}
              filter={inventoryFilter}
              addingOpen={addingObject}
              onAddingOpenChange={setAddingObject}
              tab={tab}
              onTab={(t) => {
                setDetailId(null)
                setAddingObject(false)
                setTab(t)
              }}
              onBackToWorld={backToWorld}
              inventoryCount={inventory.itemCount}
              onInventoryFilter={setInventoryFilter}
              onAddObject={() => setAddingObject(true)}
              onAdd={inventory.addItem}
              onRemove={inventory.removeItem}
              onOpenItem={(id) => {
                setTab('split')
                setDetailId(id)
              }}
            />
          )}
        </>
      ) : (
        <>
          {view === 'list' && <ProcessList processes={processes} onOpenProcess={enterProcess} />}
          <AppHeader
            account={account}
            processCount={processes.length}
            onSignOut={signOut}
            view={view}
            onViewChange={(next) => {
              backToWorld()
              setView(next)
            }}
          />
          {mode === 'world' && !showWizard && !showOnboarding && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 sm:bottom-8">
              <button
                type="button"
                onClick={openWizard}
                className="btn btn-slate pop-in pointer-events-auto h-11 px-5 shadow-[0_12px_28px_-6px_rgba(15,23,42,0.35)]"
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
          enterProcess(process.id)
        }}
      />
    </div>
  )
}
