import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ProcessSummary } from '../types/process'
import { Tree } from './Ground'
import type { Vec2 } from './layout'
import { KIND_META, PAWN_COLORS, WORLD } from './palette'
import { setHoverCursor } from './cursor'

type HouseProps = {
  process: ProcessSummary
  position: Vec2
  onOpen: () => void
  onHover: (hovered: boolean) => void
}

const BODY = { w: 2.2, h: 1.3, d: 1.8 }
const ROOF_H = 0.9

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

/** A process as a little house on its lot. Hover lifts it; click enters it. */
export function House({ process, position, onOpen, onHover }: HouseProps) {
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const roofGeo = useRoofGeometry()
  const kind = KIND_META[process.kind]
  const pawns = Math.min(1 + process.participantEmails.length, PAWN_COLORS.length)

  // Spawn "snap" + hover lift, eased every frame.
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const k = 1 - Math.exp(-dt * 10)
    const targetY = hovered ? 0.25 : 0
    g.position.y += (targetY - g.position.y) * k
    const s = g.scale.x + (1 - g.scale.x) * (1 - Math.exp(-dt * 7))
    g.scale.setScalar(s)
  })

  return (
    <group position={[position[0], 0.04, position[1]]}>
      <group
        ref={group}
        scale={0.01}
        onPointerOver={(e) => {
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
          e.stopPropagation()
          onOpen()
        }}
      >
        {/* Foundation */}
        <RoundedBox args={[BODY.w + 0.4, 0.16, BODY.d + 0.4]} radius={0.06} position={[0, 0.08, -0.3]} castShadow receiveShadow>
          <meshStandardMaterial color={WORLD.lot} roughness={0.9} />
        </RoundedBox>

        {/* Walls */}
        <RoundedBox
          args={[BODY.w, BODY.h, BODY.d]}
          radius={0.08}
          position={[0, 0.16 + BODY.h / 2, -0.3]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={hovered ? WORLD.houseTrim : WORLD.houseWall} roughness={0.7} />
        </RoundedBox>

        {/* Roof */}
        <mesh geometry={roofGeo} position={[0, 0.16 + BODY.h, -0.3]} castShadow>
          <meshStandardMaterial color={kind.roof} roughness={0.6} flatShading />
        </mesh>

        {/* Chimney */}
        <mesh position={[0.6, 0.16 + BODY.h + 0.55, -0.6]} castShadow>
          <boxGeometry args={[0.24, 0.6, 0.24]} />
          <meshStandardMaterial color={WORLD.houseTrim} roughness={0.8} />
        </mesh>

        {/* Door + windows on the front (+z) face */}
        <mesh position={[0, 0.16 + 0.38, -0.3 + BODY.d / 2 + 0.005]}>
          <boxGeometry args={[0.42, 0.76, 0.02]} />
          <meshStandardMaterial color={WORLD.door} roughness={0.6} />
        </mesh>
        {[-0.68, 0.68].map((x) => (
          <mesh key={x} position={[x, 0.16 + 0.8, -0.3 + BODY.d / 2 + 0.005]}>
            <boxGeometry args={[0.4, 0.36, 0.02]} />
            <meshStandardMaterial color={WORLD.window} emissive={WORLD.window} emissiveIntensity={0.25} />
          </mesh>
        ))}
        {/* Side window (+x face) */}
        <mesh position={[BODY.w / 2 + 0.005, 0.16 + 0.8, -0.3]}>
          <boxGeometry args={[0.02, 0.36, 0.5]} />
          <meshStandardMaterial color={WORLD.window} emissive={WORLD.window} emissiveIntensity={0.25} />
        </mesh>

        {/* Participants as pawns on the front path */}
        {Array.from({ length: pawns }, (_, i) => {
          const x = (i - (pawns - 1) / 2) * 0.42
          return (
            <group key={i} position={[x, 0, 1.25]}>
              <mesh position={[0, 0.2, 0]} castShadow>
                <cylinderGeometry args={[0.1, 0.14, 0.4, 12]} />
                <meshStandardMaterial color={PAWN_COLORS[i]} roughness={0.5} />
              </mesh>
              <mesh position={[0, 0.5, 0]} castShadow>
                <sphereGeometry args={[0.11, 14, 10]} />
                <meshStandardMaterial color={PAWN_COLORS[i]} roughness={0.5} />
              </mesh>
            </group>
          )
        })}

        <Tree x={-1.65} z={0.95} scale={0.55} variant={1} />

      </group>
    </group>
  )
}
