import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ProcessSummary } from '../types/process'
import { setHoverCursor } from './cursor'
import { Ground } from './Ground'
import { House } from './House'
import { LabelProjector, type LabelAnchor, type LabelRegistry } from './labels'
import { LOT_SLOTS, MAX_LOTS } from './layout'
import { STATUS_META, WORLD } from './palette'
import { PlusLot } from './PlusLot'

type WorldCanvasProps = {
  processes: ProcessSummary[]
  onCreateProcess: () => void
  onOpenProcess: (id: string) => void
}

const PLUS_ID = '__plus__'

/** Isometric camera whose zoom fits the whole plate to the viewport. */
function IsoCamera() {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  // The plate's isometric footprint is roughly 30 units wide, 22 tall.
  const zoom = Math.max(14, Math.min(width / 30, height / 22))
  return <OrthographicCamera makeDefault position={[20, 18, 20]} zoom={zoom} near={-100} far={200} />
}

/**
 * Landing world: an isometric 3D neighbourhood where every house is a process.
 * Always rendered under the DOM chrome and overlays.
 */
export function WorldCanvas({ processes, onCreateProcess, onOpenProcess }: WorldCanvasProps) {
  const placed = processes.slice(0, MAX_LOTS)
  const empty = placed.length === 0
  const plusSlot = placed.length < MAX_LOTS ? LOT_SLOTS[placed.length] : null
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const anchors: LabelAnchor[] = placed.map((p, i) => ({
    id: p.id,
    position: [LOT_SLOTS[i][0], 3.9, LOT_SLOTS[i][1] - 0.3],
  }))
  if (plusSlot) anchors.push({ id: PLUS_ID, position: [plusSlot[0], empty ? 4.6 : 2.1, plusSlot[1]] })

  const anchorsRef = useRef<LabelAnchor[]>(anchors)
  useLayoutEffect(() => {
    anchorsRef.current = anchors
  })
  const registry = useRef<LabelRegistry>(new Map())
  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) registry.current.set(id, el)
    else registry.current.delete(id)
  }

  const hoverHandler = (id: string) => (on: boolean) =>
    setHoveredId((cur) => (on ? id : cur === id ? null : cur))

  return (
    <div className="absolute inset-0" style={{ background: WORLD.background }}>
      <Canvas shadows dpr={[1, 2]} onPointerMissed={() => setHoverCursor(false)}>
        <IsoCamera />
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 2.6}
          minZoom={14}
          maxZoom={120}
          screenSpacePanning
        />

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

        {placed.map((p, i) => (
          <House
            key={p.id}
            process={p}
            position={LOT_SLOTS[i]}
            onOpen={() => onOpenProcess(p.id)}
            onHover={hoverHandler(p.id)}
          />
        ))}

        {plusSlot && (
          <PlusLot position={plusSlot} hero={empty} onCreate={onCreateProcess} onHover={hoverHandler(PLUS_ID)} />
        )}

        <LabelProjector anchors={anchorsRef} registry={registry} />
      </Canvas>

      {/* World-anchored labels, positioned every frame by LabelProjector */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
        {placed.map((p) => {
          const status = STATUS_META[p.status]
          return (
            <div
              key={p.id}
              ref={register(p.id)}
              className="absolute left-0 top-0"
              style={{ visibility: 'hidden', willChange: 'transform' }}
            >
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
        {plusSlot && (
          <div
            ref={register(PLUS_ID)}
            className="absolute left-0 top-0"
            style={{ visibility: 'hidden', willChange: 'transform' }}
          >
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
      <ul className="sr-only">
        {placed.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onOpenProcess(p.id)}>
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
    </div>
  )
}
