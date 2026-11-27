import { useState } from 'react'
import { setHoverCursor } from './cursor'
import { LOT_SIZE, type Vec2 } from './layout'
import { WORLD } from './palette'

/** A free lot pad: highlights on hover, click starts a new process. */
export function FreeLot({ position, interactive, onCreate }: { position: Vec2; interactive: boolean; onCreate: () => void }) {
  const [hovered, setHovered] = useState(false)
  const lit = hovered && interactive
  return (
    <mesh
      position={[position[0], 0.06, position[1]]}
      receiveShadow
      onPointerOver={(e) => {
        if (!interactive) return
        e.stopPropagation()
        setHovered(true)
        setHoverCursor(true)
      }}
      onPointerOut={() => {
        setHovered(false)
        setHoverCursor(false)
      }}
      onClick={(e) => {
        if (!interactive) return
        e.stopPropagation()
        onCreate()
      }}
    >
      <boxGeometry args={[LOT_SIZE - 0.2, 0.08, LOT_SIZE - 0.2]} />
      <meshStandardMaterial color={lit ? WORLD.lot : WORLD.lawnDark} roughness={1} />
    </mesh>
  )
}
