import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ProcessSummary } from '../types/process'
import { setHoverCursor } from './cursor'
import { Tree } from './Ground'
import { HouseInterior } from './HouseInterior'
import type { Vec2 } from './layout'
import { KIND_META, WORLD } from './palette'
import { buildRooms, participantColor, participantNames, ROOM_PLANS, roomBounds, type RoomInfo } from './rooms'

type HouseProps = {
  process: ProcessSummary
  position: Vec2
  /** Rooms to show when opened; defaults to empty rooms for the participants. */
  rooms?: RoomInfo[]
  /** true = roof off, interior visible. */
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
/** Seconds for the full open (or close) sequence. */
const OPEN_SECONDS = 1.4

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

/** 0 before a, 1 after b, smooth in between. */
function phase(p: number, a: number, b: number) {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * A process as a little house on its lot. Hover lifts it; click asks to enter.
 * When open, the roof lifts away, the shell folds down and the cutaway
 * interior (one room per person) rises in its place.
 */
export function House({ process, position, rooms, open, hidden, interactive, onOpen, onHover }: HouseProps) {
  const root = useRef<THREE.Group>(null)
  const roof = useRef<THREE.Group>(null)
  const roofMat = useRef<THREE.MeshStandardMaterial>(null)
  const shell = useRef<THREE.Group>(null)
  const interior = useRef<THREE.Group>(null)
  const pawnRefs = useRef<(THREE.Group | null)[]>([])
  const progress = useRef(0)
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
        to: new THREE.Vector3(b.cx + b.w * 0.22, 0.1, b.cz - b.d * 0.05),
      }
    })
  }, [people, roomList.length])

  useFrame((_, dt) => {
    const g = root.current
    if (!g) return

    // Spawn snap, hover lift, sink when hidden.
    const k = 1 - Math.exp(-dt * 10)
    const lift = hovered && interactive && !open ? 0.25 : 0
    g.position.y += (lift - g.position.y) * k
    const targetScale = hidden ? 0 : 1
    const s = g.scale.x + (targetScale - g.scale.x) * (1 - Math.exp(-dt * 7))
    g.scale.setScalar(s)
    g.visible = s > 0.02

    // Open / close sequence.
    const goal = open ? 1 : 0
    const step = dt / OPEN_SECONDS
    progress.current += Math.max(-step, Math.min(step, goal - progress.current))
    const p = progress.current

    const roofT = phase(p, 0, 0.45)
    if (roof.current && roofMat.current) {
      roof.current.position.y = 0.16 + BODY.h + roofT * 2.6
      roof.current.rotation.z = roofT * 0.35
      roofMat.current.opacity = 1 - phase(p, 0.15, 0.45)
      roof.current.visible = roofMat.current.opacity > 0.01
    }

    const shellT = phase(p, 0.25, 0.6)
    if (shell.current) {
      shell.current.scale.y = Math.max(0.001, 1 - shellT)
      shell.current.visible = shellT < 0.99
    }

    const inT = phase(p, 0.45, 1)
    if (interior.current) {
      interior.current.scale.set(0.6 + 0.4 * inT, Math.max(0.001, inT), 0.6 + 0.4 * inT)
      interior.current.visible = inT > 0.01
    }

    const walkT = phase(p, 0.55, 1)
    pawnSpots.forEach((spot, i) => {
      const pawn = pawnRefs.current[i]
      if (!pawn) return
      pawn.position.lerpVectors(spot.from, spot.to, walkT)
      // Little hop while walking in.
      pawn.position.y += Math.sin(walkT * Math.PI) * 0.35
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
        {/* Exterior shell: folds down when the house opens */}
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
        </group>

        {/* Roof: lifts and fades away when opening */}
        <group ref={roof} position={[0, 0.16 + BODY.h, BODY_Z]}>
          <mesh geometry={roofGeo} castShadow>
            <meshStandardMaterial ref={roofMat} color={kind.roof} roughness={0.6} flatShading transparent />
          </mesh>
        </group>

        {/* Cutaway interior: one room per person */}
        <group ref={interior} visible={false}>
          <HouseInterior rooms={roomList} />
        </group>

        {/* People as pawns: wait on the path, walk into their room on open */}
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
