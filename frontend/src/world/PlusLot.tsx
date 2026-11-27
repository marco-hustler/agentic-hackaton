import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type * as THREE from 'three'
import { setHoverCursor } from './cursor'
import { LOT_SIZE, type Vec2 } from './layout'
import { OUT, POP, safeScale, spring, stepSpring } from './motion'
import { WORLD } from './palette'

type PlusLotProps = {
  position: Vec2
  /** Hero variant for the empty world: bigger token and a call to action. */
  hero?: boolean
  onCreate: () => void
  onHover: (hovered: boolean) => void
  hidden?: boolean
}

const EDGE = LOT_SIZE - 0.5
const DASH_COUNT = 7

/** An empty lot with a floating terracotta "+" token. Click starts the wizard. */
export function PlusLot({ position, hero = false, onCreate, onHover, hidden = false }: PlusLotProps) {
  const root = useRef<THREE.Group>(null)
  const token = useRef<THREE.Group>(null)
  const rootSpring = useRef(spring(0))
  const tokenSpring = useRef(spring(1))
  const [hovered, setHovered] = useState(false)
  const size = hero ? 2.0 : 0.95

  useFrame(({ clock }, dt) => {
    const r = root.current
    if (r) {
      const s = stepSpring(rootSpring.current, hidden ? 0 : 1, dt, hidden ? OUT : POP)
      r.scale.setScalar(safeScale(s))
      r.visible = s > 0.02
    }
    const g = token.current
    if (!g) return
    const t = clock.getElapsedTime()
    g.position.y = (hero ? 1.9 : 1.1) + Math.sin(t * 1.8) * 0.12
    g.rotation.y += dt * (hovered ? 1.6 : 0.5)
    const target = hovered ? 1.15 : 1
    g.scale.setScalar(safeScale(stepSpring(tokenSpring.current, target, dt)))
  })

  const dashes = []
  const step = EDGE / DASH_COUNT
  for (let i = 0; i < DASH_COUNT; i++) {
    const o = -EDGE / 2 + step * (i + 0.5)
    const len = step * 0.6
    dashes.push(
      <mesh key={`n${i}`} position={[o, 0.1, -EDGE / 2]}>
        <boxGeometry args={[len, 0.02, 0.08]} />
        <meshBasicMaterial color={WORLD.terracotta} />
      </mesh>,
      <mesh key={`s${i}`} position={[o, 0.1, EDGE / 2]}>
        <boxGeometry args={[len, 0.02, 0.08]} />
        <meshBasicMaterial color={WORLD.terracotta} />
      </mesh>,
      <mesh key={`w${i}`} position={[-EDGE / 2, 0.1, o]}>
        <boxGeometry args={[0.08, 0.02, len]} />
        <meshBasicMaterial color={WORLD.terracotta} />
      </mesh>,
      <mesh key={`e${i}`} position={[EDGE / 2, 0.1, o]}>
        <boxGeometry args={[0.08, 0.02, len]} />
        <meshBasicMaterial color={WORLD.terracotta} />
      </mesh>,
    )
  }

  return (
    <group
      ref={root}
      position={[position[0], 0, position[1]]}
      onPointerOver={(e) => {
        if (hidden) return
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
        if (hidden) return
        e.stopPropagation()
        onCreate()
      }}
    >
      {/* Clay plot, slightly raised, with a dashed terracotta outline */}
      <RoundedBox args={[EDGE + 0.2, 0.08, EDGE + 0.2]} radius={0.04} position={[0, 0.04, 0]} receiveShadow>
        <meshStandardMaterial color={WORLD.lot} roughness={1} />
      </RoundedBox>
      {dashes}

      {/* Shadow disc under the token */}
      <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[size * 0.5, 32]} />
        <meshBasicMaterial color={WORLD.petrol} transparent opacity={0.12} />
      </mesh>

      <group ref={token}>
        <RoundedBox args={[size, size * 0.3, size * 0.3]} radius={size * 0.08} castShadow>
          <meshStandardMaterial color={WORLD.terracotta} roughness={0.45} />
        </RoundedBox>
        <RoundedBox args={[size * 0.3, size, size * 0.3]} radius={size * 0.08} castShadow>
          <meshStandardMaterial color={WORLD.terracotta} roughness={0.45} />
        </RoundedBox>
      </group>
    </group>
  )
}
