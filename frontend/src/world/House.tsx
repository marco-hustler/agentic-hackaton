import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ProcessSummary } from '../types/process'
import { setHoverCursor } from './cursor'
import { Tree } from './Ground'
import { HouseInterior } from './HouseInterior'
import type { Vec2 } from './layout'
import { OUT, POP, safeScale, spring, stepSpring, type Spring } from './motion'
import { KIND_META, WORLD } from './palette'
import { buildRooms, participantColor, participantNames, ROOM_PLANS, roomBounds, type RoomInfo } from './rooms'

type HouseProps = {
  process: ProcessSummary
  position: Vec2
  /** Rooms to show when opened; defaults to empty rooms for the participants. */
  rooms?: RoomInfo[]
  /** true = exterior away, interior visible. */
  open: boolean
  /** true = sink out of view (another house is open). */
  hidden: boolean
  interactive: boolean
  onOpen: () => void
  onHover: (hovered: boolean) => void
}

const BODY = { w: 2.2, h: 1.3, d: 1.8 }
const ROOF_H = 0.9
const BODY_Z = -0.3
function useRoofGeometry() {
  return useMemo(() => {
    const overhang = 0.18
    const half = BODY.w / 2 + overhang
    const shape = new THREE.Shape()
    shape.moveTo(-half, 0)
    shape.lineTo(half, 0)
    shape.lineTo(0, ROOF_H)
    shape.closePath()
    const depth = BODY.d + overhang * 2
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    geo.translate(0, 0, -depth / 2)
    return geo
  }, [])
}

/**
 * A process as a little house on its lot. Hover lifts it; click asks to enter.
 * When open, the exterior shrinks away and the cutaway interior (one room
 * per person) pops in with a spring; pawns pop into their rooms one by one.
 */
export function House({
  process,
  position,
  rooms,
  open,
  hidden,
  interactive,
  onOpen,
  onHover,
}: HouseProps) {
  const root = useRef<THREE.Group>(null)
  const shell = useRef<THREE.Group>(null)
  const interior = useRef<THREE.Group>(null)
  const pawnRefs = useRef<(THREE.Group | null)[]>([])
  const springs = useRef({ root: spring(0), shell: spring(1), interior: spring(0), lift: spring(0) })
  /** Per pawn: scale spring + whether it currently stands inside. */
  const pawnState = useRef<{ s: Spring; inside: boolean; wait: number }[]>([])
  const [hovered, setHovered] = useState(false)
  const roofGeo = useRoofGeometry()
  const kind = KIND_META[process.kind]

  const roomList = useMemo(() => rooms ?? buildRooms(process), [rooms, process])
  const people = Math.min(participantNames(process).length, roomList.length)

  // Pawn start (front path) and end (inside their room) positions.
  const pawnSpots = useMemo(() => {
    const plan = ROOM_PLANS[roomList.length]
    return Array.from({ length: people }, (_, i) => {
      const b = roomBounds(plan[i])
      return {
        from: new THREE.Vector3((i - (people - 1) / 2) * 0.42, 0, 1.25),
        // On the rug, which PersonalRoom mirrors on odd rooms.
        to: new THREE.Vector3(b.cx + b.w * 0.12 * (i % 2 === 1 ? -1 : 1), 0.1, b.cz + b.d * 0.12),
      }
    })
  }, [people, roomList.length])

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    const sp = springs.current

    // Spawn pop, hover lift, shrink away when another house is open.
    g.position.y = stepSpring(sp.lift, hovered && interactive && !open ? 0.25 : 0, dt)
    const s = stepSpring(sp.root, hidden ? 0 : 1, dt, hidden ? OUT : POP)
    g.scale.setScalar(safeScale(s))
    g.visible = s > 0.02

    // Open: exterior out first, then the interior pops in. Close: the reverse.
    const inX = sp.interior.x
    const shellX = stepSpring(sp.shell, open ? 0 : inX < 0.25 ? 1 : 0, dt, open ? OUT : POP)
    if (shell.current) {
      shell.current.scale.setScalar(safeScale(shellX))
      shell.current.visible = shellX > 0.01
    }
    const inS = stepSpring(sp.interior, open && shellX < 0.35 ? 1 : 0, dt, open ? POP : OUT)
    if (interior.current) {
      interior.current.scale.setScalar(safeScale(inS))
      interior.current.visible = inS > 0.01
    }

    // Pawns: shrink where they stand, reappear in place with a staggered pop.
    const wantInside = open && inS > 0.6
    pawnSpots.forEach((spot, i) => {
      const pawn = pawnRefs.current[i]
      if (!pawn) return
      const st = (pawnState.current[i] ??= { s: spring(1), inside: false, wait: 0 })
      let target = 1
      if (st.inside !== wantInside) {
        target = 0
        if (st.s.x < 0.05) {
          st.inside = wantInside
          st.wait = i * 0.07
          pawn.position.copy(wantInside ? spot.to : spot.from)
        }
      } else if (st.wait > 0) {
        st.wait -= dt
        target = 0
      }
      const ps = stepSpring(st.s, target, dt, target ? POP : OUT)
      pawn.scale.setScalar(safeScale(ps))
      pawn.visible = ps > 0.02
    })
  })

  return (
    <group position={[position[0], 0.04, position[1]]}>
      <group
        ref={root}
        scale={0.01}
        onPointerOver={(e) => {
          if (!interactive) return
          e.stopPropagation()
          setHovered(true)
          onHover(true)
          setHoverCursor(true)
        }}
        onPointerOut={() => {
          setHovered(false)
          onHover(false)
          setHoverCursor(false)
        }}
        onClick={(e) => {
          if (!interactive) return
          e.stopPropagation()
          onOpen()
        }}
      >
        {/* Exterior (walls + roof): shrinks away when the house opens */}
        <group ref={shell}>
          <RoundedBox
            args={[BODY.w + 0.4, 0.16, BODY.d + 0.4]}
            radius={0.06}
            position={[0, 0.08, BODY_Z]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={WORLD.lot} roughness={0.9} />
          </RoundedBox>
          <RoundedBox
            args={[BODY.w, BODY.h, BODY.d]}
            radius={0.08}
            position={[0, 0.16 + BODY.h / 2, BODY_Z]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={hovered && interactive ? WORLD.houseTrim : WORLD.houseWall} roughness={0.7} />
          </RoundedBox>
          <mesh position={[0.6, 0.16 + BODY.h + 0.55, BODY_Z - 0.3]} castShadow>
            <boxGeometry args={[0.24, 0.6, 0.24]} />
            <meshStandardMaterial color={WORLD.houseTrim} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.16 + 0.38, BODY_Z + BODY.d / 2 + 0.005]}>
            <boxGeometry args={[0.42, 0.76, 0.02]} />
            <meshStandardMaterial color={WORLD.door} roughness={0.6} />
          </mesh>
          {[-0.68, 0.68].map((x) => (
            <mesh key={x} position={[x, 0.16 + 0.8, BODY_Z + BODY.d / 2 + 0.005]}>
              <boxGeometry args={[0.4, 0.36, 0.02]} />
              <meshStandardMaterial color={WORLD.window} emissive={WORLD.window} emissiveIntensity={0.25} />
            </mesh>
          ))}
          <mesh position={[BODY.w / 2 + 0.005, 0.16 + 0.8, BODY_Z]}>
            <boxGeometry args={[0.02, 0.36, 0.5]} />
            <meshStandardMaterial color={WORLD.window} emissive={WORLD.window} emissiveIntensity={0.25} />
          </mesh>
          <Tree x={-1.65} z={1.0} scale={0.5} variant={1} />
          {/* Roof */}
          <group position={[0, 0.16 + BODY.h, BODY_Z]}>
            <mesh geometry={roofGeo} castShadow>
              <meshStandardMaterial color={kind.roof} roughness={0.6} flatShading />
            </mesh>
          </group>
        </group>

        {/* Cutaway interior: one room per person */}
        <group ref={interior} visible={false}>
          <HouseInterior rooms={roomList} />
        </group>

        {/* People as pawns: wait on the path, pop into their room on open */}
        {pawnSpots.map((spot, i) => (
          <group
            key={i}
            ref={(el) => {
              pawnRefs.current[i] = el
            }}
            position={spot.from.toArray()}
          >
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.14, 0.4, 12]} />
              <meshStandardMaterial color={participantColor(i)} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.5, 0]} castShadow>
              <sphereGeometry args={[0.11, 14, 10]} />
              <meshStandardMaterial color={participantColor(i)} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
