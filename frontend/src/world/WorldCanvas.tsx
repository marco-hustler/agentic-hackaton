import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ProcessSummary } from '../types/process'
import { CameraRig, type CameraShot } from './CameraRig'
import { setHoverCursor } from './cursor'
import { Ground } from './Ground'
import { House } from './House'
import { LabelProjector, type LabelAnchor, type LabelRegistry } from './labels'
import { LOT_SLOTS, MAX_LOTS } from './layout'
import { KIND_META, STATUS_META, WORLD } from './palette'
import { PlusLot } from './PlusLot'
import { INTERIOR, ROOM_PLANS, roomBounds, type RoomInfo } from './rooms'

export type WorldMode = 'world' | 'confirm' | 'house'

type WorldCanvasProps = {
  processes: ProcessSummary[]
  mode: WorldMode
  focusId: string | null
  /** Rooms (with items) for the focused house. */
  focusRooms: RoomInfo[] | null
  spinRequest: number
  /** Screen rect the scene is framed in; see CameraRig. */
  frameRef: RefObject<HTMLElement | null>
  onCreateProcess: () => void
  onRequestOpen: (id: string) => void
  onConfirmEnter: () => void
  onCancel: () => void
}

const PLUS_ID = '__plus__'
const CONFIRM_ID = '__confirm__'
const roomLabelId = (i: number) => `__room_${i}__`

const SHOT: Record<WorldMode, CameraShot> = { world: 'world', confirm: 'focus', house: 'interior' }

/**
 * The isometric 3D neighbourhood: every house is a process.
 * world → click a house → confirm (camera centres on it) → house (interior pops in, rooms).
 */
export function WorldCanvas({
  processes,
  mode,
  focusId,
  focusRooms,
  spinRequest,
  frameRef,
  onCreateProcess,
  onRequestOpen,
  onConfirmEnter,
  onCancel,
}: WorldCanvasProps) {
  const placed = processes.slice(0, MAX_LOTS)
  const empty = placed.length === 0
  const plusSlot = placed.length < MAX_LOTS ? LOT_SLOTS[placed.length] : null
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const focusIndex = placed.findIndex((p) => p.id === focusId)
  const focusProcess = focusIndex >= 0 ? placed[focusIndex] : null
  const focusSlot = focusIndex >= 0 ? LOT_SLOTS[focusIndex] : null
  const inside = mode === 'house' && focusProcess !== null

  // ---- label anchors -------------------------------------------------------
  const anchors: LabelAnchor[] = []
  if (!inside) {
    placed.forEach((p, i) => {
      if (mode === 'confirm' && p.id === focusId) return
      anchors.push({ id: p.id, position: [LOT_SLOTS[i][0], 3.9, LOT_SLOTS[i][1] - 0.3] })
    })
    if (mode === 'confirm' && focusSlot) anchors.push({ id: CONFIRM_ID, position: [focusSlot[0], 1.2, focusSlot[1] - 0.3] })
    if (plusSlot && mode === 'world')
      anchors.push({ id: PLUS_ID, position: [plusSlot[0], empty ? 4.6 : 2.1, plusSlot[1]] })
  } else if (focusSlot && focusRooms) {
    ROOM_PLANS[focusRooms.length].forEach((r, i) => {
      const b = roomBounds(r)
      anchors.push({ id: roomLabelId(i), position: [focusSlot[0] + b.cx, INTERIOR.wallH + 0.35, focusSlot[1] + b.cz] })
    })
  }

  const anchorsRef = useRef<LabelAnchor[]>(anchors)
  useLayoutEffect(() => {
    anchorsRef.current = anchors
  })
  const registry = useRef<LabelRegistry>(new Map())
  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) registry.current.set(id, el)
    else registry.current.delete(id)
  }
  const shown = new Set(anchors.map((a) => a.id))

  const hoverHandler = (id: string) => (on: boolean) => setHoveredId((cur) => (on ? id : cur === id ? null : cur))

  return (
    <div className="absolute inset-0" style={{ background: WORLD.background }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        onPointerMissed={() => {
          setHoverCursor(false)
          if (mode === 'confirm') onCancel()
        }}
      >
        <OrthographicCamera makeDefault position={[20, 18, 20]} zoom={20} near={-100} far={200} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.6}
          minZoom={14}
          maxZoom={160}
          screenSpacePanning
        />
        <CameraRig shot={SHOT[mode]} focus={focusSlot} spinRequest={spinRequest} frameRef={frameRef} />

        <color attach="background" args={[WORLD.background]} />
        <hemisphereLight args={['#ffffff', '#cfc6b8', 0.9]} />
        <directionalLight
          position={[12, 20, 8]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-bias={-0.0005}
        />

        <Ground />

        {placed.map((p, i) => {
          const isFocus = p.id === focusId
          return (
            <House
              key={p.id}
              process={p}
              position={LOT_SLOTS[i]}
              rooms={isFocus && focusRooms ? focusRooms : undefined}
              open={inside && isFocus}
              hidden={inside && !isFocus}
              interactive={mode === 'world'}
              onOpen={() => onRequestOpen(p.id)}
              onHover={hoverHandler(p.id)}
            />
          )
        })}

        {plusSlot && (
          <PlusLot
            position={plusSlot}
            hero={empty}
            hidden={mode !== 'world'}
            onCreate={onCreateProcess}
            onHover={hoverHandler(PLUS_ID)}
          />
        )}

        <LabelProjector anchors={anchorsRef} registry={registry} />
      </Canvas>

      {/* World-anchored DOM, positioned every frame by LabelProjector */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {placed.map((p) => {
          if (!shown.has(p.id)) return null
          const status = STATUS_META[p.status]
          return (
            <div key={p.id} ref={register(p.id)} className="absolute left-0 top-0" style={{ visibility: 'hidden' }} aria-hidden>
              <div
                className={`panel flex items-center gap-2 py-1 pl-3 pr-1 transition-transform duration-150 ${
                  hoveredId === p.id ? 'scale-110' : ''
                }`}
                style={{ borderRadius: 9999 }}
              >
                <span className="max-w-36 truncate text-xs font-bold tracking-tight text-petrol">{p.title}</span>
                <span className={`pill ${status.pill}`}>{status.label}</span>
              </div>
            </div>
          )
        })}

        {shown.has(CONFIRM_ID) && focusProcess && (
          <div ref={register(CONFIRM_ID)} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
            <div
              role="dialog"
              aria-label={`Enter ${focusProcess.title}`}
              className="panel pop-in pointer-events-auto w-72 p-4"
              style={{ background: '#ffffff', transform: 'translateX(calc(50% + 150px))' }}
            >
              <p className="label-sm text-terracotta">{KIND_META[focusProcess.kind].label}</p>
              <h3 className="mt-0.5 text-lg font-extrabold tracking-tight text-petrol">Enter {focusProcess.title}?</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`pill ${STATUS_META[focusProcess.status].pill}`}>
                  {STATUS_META[focusProcess.status].label}
                </span>
                <span className="pill pill-neutral">{1 + focusProcess.participantEmails.length} people</span>
              </div>
              <p className="mt-2 text-sm text-ink2">Step inside: one room per person, every item in its place.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost h-9" onClick={onCancel}>
                  Not now
                </button>
                <button type="button" className="btn btn-primary h-9" onClick={onConfirmEnter} autoFocus>
                  Enter house
                </button>
              </div>
            </div>
          </div>
        )}

        {focusRooms?.map((room, i) =>
          shown.has(roomLabelId(i)) ? (
            <div key={i} ref={register(roomLabelId(i))} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
              <div className="panel pop-in-late flex items-center gap-2 py-1 pl-2 pr-3" style={{ borderRadius: 9999 }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: room.color }} />
                <span className="text-xs font-bold text-petrol">{room.owner}</span>
              </div>
            </div>
          ) : null,
        )}

        {shown.has(PLUS_ID) && plusSlot && (
          <div ref={register(PLUS_ID)} className="absolute left-0 top-0" style={{ visibility: 'hidden' }} aria-hidden>
            {empty ? (
              <div
                className={`panel flex flex-col items-center px-5 py-3 text-center transition-transform duration-150 ${
                  hoveredId === PLUS_ID ? 'scale-105' : ''
                }`}
                style={{ minWidth: 240 }}
              >
                <span className="text-lg font-extrabold tracking-tight text-petrol">Create your first process</span>
                <span className="text-xs text-ink2">A house appears here for every split you start</span>
              </div>
            ) : (
              <span className={`pill ${hoveredId === PLUS_ID ? 'pill-draft' : 'pill-neutral'}`}>New process</span>
            )}
          </div>
        )}
      </div>

      {/* Keyboard / screen-reader path to the same actions as the 3D scene */}
      {mode === 'world' && (
        <ul className="sr-only">
          {placed.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onRequestOpen(p.id)}>
                Open process {p.title}
              </button>
            </li>
          ))}
          {plusSlot && (
            <li>
              <button type="button" onClick={onCreateProcess}>
                Create a new process
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
