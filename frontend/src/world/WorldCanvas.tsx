import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ProcessSummary } from '../types/process'
import { setHoverCursor } from './cursor'
import { Ground } from './Ground'
import { House } from './House'
import { LabelProjector, type LabelAnchor, type LabelRegistry } from './labels'
import { LOT_SIZE, LOT_SLOTS, MAX_LOTS, type Vec2 } from './layout'
import { STATUS_META, WORLD } from './palette'

type WorldCanvasProps = {
  processes: ProcessSummary[]
  onCreateProcess: () => void
  onOpenProcess: (id: string) => void
}

/** Isometric camera whose zoom fits the whole plate to the viewport. */
function IsoCamera() {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  // The plate's isometric footprint is roughly 30 units wide, 22 tall.
  const zoom = Math.max(14, Math.min(width / 30, height / 22))
  return <OrthographicCamera makeDefault position={[20, 18, 20]} zoom={zoom} near={-100} far={200} />
}

/** Invisible (but hoverable) hit area on a free lot — opens the create wizard. */
function FreeLot({
  position,
  onCreate,
}: {
  position: Vec2
  onCreate: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <mesh
      position={[position[0], 0.06, position[1]]}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        setHoverCursor(true)
      }}
      onPointerOut={() => {
        setHovered(false)
        setHoverCursor(false)
      }}
      onClick={(e) => {
        e.stopPropagation()
        onCreate()
      }}
    >
      <boxGeometry args={[LOT_SIZE - 0.2, 0.08, LOT_SIZE - 0.2]} />
      <meshStandardMaterial
        color={hovered ? WORLD.lot : WORLD.lawnDark}
        roughness={1}
      />
    </mesh>
  )
}

/**
 * Landing world: an isometric 3D neighbourhood where every house is a process.
 * Click any free lot pad to start a new process.
 */
export function WorldCanvas({ processes, onCreateProcess, onOpenProcess }: WorldCanvasProps) {
  const placed = processes.slice(0, MAX_LOTS)
  const freeSlots = LOT_SLOTS.slice(placed.length)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const anchors: LabelAnchor[] = placed.map((p, i) => ({
    id: p.id,
    position: [LOT_SLOTS[i][0], 3.9, LOT_SLOTS[i][1] - 0.3],
  }))

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
    <div className="absolute inset-0 bg-transparent" style={{ background: WORLD.background }}>
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

        {freeSlots.map(([x, z]) => (
          <FreeLot key={`free-${x}-${z}`} position={[x, z]} onCreate={onCreateProcess} />
        ))}

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
        {freeSlots.length > 0 && (
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
