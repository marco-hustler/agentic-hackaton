import { useEffect, useMemo, useRef, useState } from 'react'
import { listProcesses, updateProcess } from './api/client'
import { LoginPage } from './auth/LoginPage'
import { clearSession, loadSession } from './auth/session'
import { AppHeader } from './chrome/AppHeader'
import { ProcessList } from './chrome/ProcessList'
import type { ProcessView } from './chrome/ViewSwitch'
import { CollaboratorsPanel } from './house/CollaboratorsPanel'
import { ExportPanel } from './house/ExportPanel'
import { HouseNav, type HouseTab } from './house/HouseNav'
import { InventoryPanel } from './house/InventoryPanel'
import { ItemDetail } from './house/ItemDetail'
import { SplitBoard } from './house/SplitBoard'
import { SplitShell } from './house/SplitShell'
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

/** Where we are inside the app, kept in the URL hash so a reload lands in the same place. */
type Place = { focusId: string; tab: HouseTab } | null
const TABS: HouseTab[] = ['inventory', 'split', 'export', 'collaborators']

function readPlace(): Place {
  const m = /^#\/house\/([^/]+)(?:\/([a-z]+))?/.exec(window.location.hash)
  if (!m) return null
  const tab = TABS.includes(m[2] as HouseTab) ? (m[2] as HouseTab) : 'inventory'
  return { focusId: decodeURIComponent(m[1]), tab }
}

function writePlace(place: Place) {
  const hash = place ? `#/house/${encodeURIComponent(place.focusId)}/${place.tab}` : ''
  if (window.location.hash === hash) return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
}

export default function App() {
  const [initialPlace] = useState(readPlace)
  const [account, setAccount] = useState<AccountInfo | null>(() => loadSession())
  const [processes, setProcesses] = useState<ProcessSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Neighbourhood as a 3D world or as a plain list. */
  const [view, setView] = useState<ProcessView>('world')
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingSeen())
  const [showWizard, setShowWizard] = useState(false)
  const [mode, setMode] = useState<WorldMode>(initialPlace ? 'house' : 'world')
  const [focusId, setFocusId] = useState<string | null>(initialPlace?.focusId ?? null)
  const [detailId, setDetailId] = useState<string | null>(null)
  /** Right-hand view inside a house. */
  const [tab, setTab] = useState<HouseTab>(initialPlace?.tab ?? 'inventory')
  const [inventoryFilter, setInventoryFilter] = useState('')
  const [addingObject, setAddingObject] = useState(false)
  const [collaboratorsFilter, setCollaboratorsFilter] = useState('')
  const [invitingCollaborator, setInvitingCollaborator] = useState(false)
  const [collaboratorsSaving, setCollaboratorsSaving] = useState(false)
  const [collaboratorsError, setCollaboratorsError] = useState<string | null>(null)
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
        // A remembered house that no longer exists (or belongs to someone else): back to the world.
        setFocusId((cur) => {
          if (cur && !list.some((p) => p.id === cur)) {
            setMode('world')
            return null
          }
          return cur
        })
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

  // Keep the URL in sync with the house + tab we're in.
  useEffect(() => {
    writePlace(mode === 'house' && focusId ? { focusId, tab } : null)
  }, [mode, focusId, tab])

  const people = useMemo(() => (focusProcess ? participantNames(focusProcess) : ['You']), [focusProcess])
  const needsCollaborator = Boolean(focusProcess && focusProcess.participantEmails.length === 0)
  const names = useMemo<[string, string]>(
    () => [people[0] ?? 'You', people[1] ?? (needsCollaborator ? 'Invite someone' : 'Partner')],
    [people, needsCollaborator],
  )

  // Editable inventory for the house we're in (per process, starts empty).
  // Edits re-run the deterministic solver.
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
    setCollaboratorsFilter('')
    setInvitingCollaborator(false)
    setCollaboratorsError(null)
    setMode('world')
    setFocusId(null)
  }

  function goToTab(next: HouseTab) {
    setDetailId(null)
    setAddingObject(false)
    setInvitingCollaborator(false)
    setTab(next)
  }

  async function saveParticipants(emails: string[]) {
    if (!focusProcess) return
    setCollaboratorsSaving(true)
    setCollaboratorsError(null)
    try {
      const updated = await updateProcess(focusProcess.id, { participantEmails: emails })
      setProcesses((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setCollaboratorsError(err instanceof Error ? err.message : 'Could not update collaborators')
      throw err
    } finally {
      setCollaboratorsSaving(false)
    }
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
      {/* Split: inventory-style shell painted under the (clipped) world stage. */}
      {inside && focusProcess && tab === 'split' && (
        <SplitShell
          processTitle={focusProcess.title}
          tab={tab}
          onTab={goToTab}
          onBackToWorld={backToWorld}
          inventoryCount={inventory.itemCount}
        />
      )}
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
            onTab={goToTab}
            onBackToWorld={backToWorld}
            onSignOut={signOut}
            inventoryFilter={inventoryFilter}
            onInventoryFilter={setInventoryFilter}
            onAddObject={() => setAddingObject(true)}
            inventoryCount={inventory.itemCount}
          />
          {tab === 'split' ? (
            <SplitBoard
              scenario={demo}
              error={demoError}
              names={names}
              people={people}
              needsCollaborator={needsCollaborator}
              onInviteCollaborator={() => {
                goToTab('collaborators')
                setInvitingCollaborator(true)
              }}
              solving={inventory.solving}
              unsplit={inventory.unsplit}
              onSplit={inventory.splitAll}
              onOpenItem={setDetailId}
              onMoveItem={inventory.forceAction}
              processId={focusProcess.id}
            />
          ) : tab === 'export' ? (
            <ExportPanel
              title={focusProcess.title}
              demo={demo}
              error={demoError}
              names={names}
              tab={tab}
              onTab={goToTab}
              onBackToWorld={backToWorld}
              inventoryCount={inventory.itemCount}
              onOpenItem={(id) => {
                setTab('split')
                setDetailId(id)
              }}
            />
          ) : tab === 'collaborators' ? (
            <CollaboratorsPanel
              processTitle={focusProcess.title}
              emails={focusProcess.participantEmails}
              filter={collaboratorsFilter}
              onFilter={setCollaboratorsFilter}
              inviting={invitingCollaborator}
              onInvitingChange={setInvitingCollaborator}
              saving={collaboratorsSaving}
              error={collaboratorsError}
              tab={tab}
              onTab={goToTab}
              onBackToWorld={backToWorld}
              inventoryCount={inventory.itemCount}
              onInvite={async (email) => {
                await saveParticipants([...focusProcess.participantEmails, email])
              }}
              onRemove={async (email) => {
                await saveParticipants(focusProcess.participantEmails.filter((e) => e !== email))
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
              onTab={goToTab}
              onBackToWorld={backToWorld}
              inventoryCount={inventory.itemCount}
              onInventoryFilter={setInventoryFilter}
              onAddObject={() => setAddingObject(true)}
              onAdd={inventory.addItem}
              onRemove={inventory.removeItem}
              onOpenItem={setDetailId}
            />
          )}
          {detailVi && (tab === 'inventory' || (tab === 'split' && !needsCollaborator)) && (
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
