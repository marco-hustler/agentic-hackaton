import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { categoryColor, WORLD } from './palette'
import { INTERIOR, ROOM_PLANS, roomBounds, type RoomInfo, type RoomKind } from './rooms'

const FLOOR_Y = 0.1
const DOOR_GAP = 0.5
const WALL_COLOR = '#fbf9f3'
const WALL_TOP = '#eae0d5'
const WOOD = '#c9a77c'
const FABRIC = '#94a3b8'

type Segment = { x: number; z: number; len: number; alongX: boolean; h: number }

/** Interior walls for a plan: tall back walls, low front walls, partitions with door gaps. */
function useWalls(count: number): Segment[] {
  return useMemo(() => {
    const { w, d, wallH, lowWallH, partitionH } = INTERIOR
    const segs: Segment[] = [
      { x: 0, z: -d / 2, len: w, alongX: true, h: wallH },
      { x: -w / 2, z: 0, len: d, alongX: false, h: wallH },
      { x: 0, z: d / 2, len: w, alongX: true, h: lowWallH },
      { x: w / 2, z: 0, len: d, alongX: false, h: lowWallH },
    ]
    const split = (a0: number, a1: number, fixed: number, alongX: boolean) => {
      const mid = (a0 + a1) / 2
      const pieces: [number, number][] = [
        [a0, mid - DOOR_GAP / 2],
        [mid + DOOR_GAP / 2, a1],
      ]
      for (const [p0, p1] of pieces) {
        if (p1 - p0 < 0.05) continue
        const c = (p0 + p1) / 2
        segs.push(
          alongX
            ? { x: c, z: fixed, len: p1 - p0, alongX: true, h: partitionH }
            : { x: fixed, z: c, len: p1 - p0, alongX: false, h: partitionH },
        )
      }
    }
    for (const r of ROOM_PLANS[count]) {
      const b = roomBounds(r)
      if (r.u1 < 1) split(b.z0, b.z1, b.x1, false)
      if (r.v1 < 1) split(b.x0, b.x1, b.z1, true)
    }
    return segs
  }, [count])
}

function Wall({ s }: { s: Segment }) {
  const t = INTERIOR.wall
  const args: [number, number, number] = s.alongX ? [s.len + t, s.h, t] : [t, s.h, s.len + t]
  return (
    <group position={[s.x, FLOOR_Y, s.z]}>
      <mesh position={[0, s.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      {/* Cut edge, like a sectioned architectural model */}
      <mesh position={[0, s.h + 0.004, 0]}>
        <boxGeometry args={[args[0], 0.008, args[2]]} />
        <meshBasicMaterial color={WALL_TOP} />
      </mesh>
    </group>
  )
}

function tint(hex: string, amount: number) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount).getHexString()
}

/** Simple props per room kind, placed against the back corner of the room. */
function Furniture({ kind, w, d }: { kind: RoomKind; w: number; d: number }) {
  const bx = -w / 2 + 0.12
  const bz = -d / 2 + 0.12
  switch (kind) {
    case 'Living room':
      return (
        <group>
          <RoundedBox args={[0.9, 0.22, 0.34]} radius={0.05} position={[bx + 0.55, 0.11, bz + 0.2]} castShadow>
            <meshStandardMaterial color={FABRIC} roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.9, 0.2, 0.1]} radius={0.04} position={[bx + 0.55, 0.3, bz + 0.06]} castShadow>
            <meshStandardMaterial color={FABRIC} roughness={0.9} />
          </RoundedBox>
          <mesh position={[bx + 0.55, 0.012, bz + 0.62]} receiveShadow>
            <boxGeometry args={[0.8, 0.01, 0.45]} />
            <meshStandardMaterial color="#e7d5c0" roughness={1} />
          </mesh>
          <mesh position={[bx + 0.04, 0.15, bz + 0.75]} castShadow>
            <boxGeometry args={[0.08, 0.3, 0.6]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
          <mesh position={[bx + 0.04, 0.48, bz + 0.75]} castShadow>
            <boxGeometry args={[0.03, 0.3, 0.5]} />
            <meshStandardMaterial color={WORLD.petrol} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'Kitchen':
      return (
        <group>
          <mesh position={[bx + 0.5, 0.2, bz + 0.12]} castShadow>
            <boxGeometry args={[1.0, 0.4, 0.26]} />
            <meshStandardMaterial color="#f0eee8" roughness={0.7} />
          </mesh>
          <mesh position={[bx + 0.5, 0.41, bz + 0.12]}>
            <boxGeometry args={[1.02, 0.03, 0.28]} />
            <meshStandardMaterial color={WOOD} roughness={0.6} />
          </mesh>
          <mesh position={[bx + 0.55, 0.22, bz + 0.75]} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.03, 20]} />
            <meshStandardMaterial color={WOOD} roughness={0.6} />
          </mesh>
          <mesh position={[bx + 0.55, 0.11, bz + 0.75]}>
            <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
            <meshStandardMaterial color={WORLD.petrol} />
          </mesh>
        </group>
      )
    case 'Bedroom':
      return (
        <group>
          <RoundedBox args={[0.6, 0.18, 0.9]} radius={0.04} position={[bx + 0.36, 0.09, bz + 0.48]} castShadow>
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </RoundedBox>
          <RoundedBox args={[0.56, 0.06, 0.6]} radius={0.03} position={[bx + 0.36, 0.21, bz + 0.62]} castShadow>
            <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
          </RoundedBox>
          <RoundedBox args={[0.4, 0.08, 0.16]} radius={0.03} position={[bx + 0.36, 0.23, bz + 0.14]} castShadow>
            <meshStandardMaterial color="#ffffff" roughness={0.9} />
          </RoundedBox>
        </group>
      )
    case 'Studio':
      return (
        <group>
          <mesh position={[bx + 0.4, 0.3, bz + 0.15]} castShadow>
            <boxGeometry args={[0.7, 0.03, 0.3]} />
            <meshStandardMaterial color={WOOD} roughness={0.6} />
          </mesh>
          {[-0.3, 0.3].map((o) => (
            <mesh key={o} position={[bx + 0.4 + o, 0.15, bz + 0.15]}>
              <boxGeometry args={[0.03, 0.3, 0.26]} />
              <meshStandardMaterial color={WORLD.petrol} />
            </mesh>
          ))}
          <mesh position={[bx + 0.4, 0.42, bz + 0.08]} castShadow>
            <boxGeometry args={[0.3, 0.2, 0.02]} />
            <meshStandardMaterial color={WORLD.petrol} roughness={0.4} />
          </mesh>
          <mesh position={[bx + 0.06, 0.35, bz + 0.7]} castShadow>
            <boxGeometry args={[0.12, 0.7, 0.45]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
        </group>
      )
    case 'Hallway':
      return (
        <group>
          <mesh position={[bx + 0.3, 0.25, bz + 0.08]} castShadow>
            <boxGeometry args={[0.5, 0.5, 0.14]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
          <mesh position={[bx + 0.1, 0.1, bz + 0.5]} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.2, 10]} />
            <meshStandardMaterial color="#b45309" roughness={0.8} />
          </mesh>
          <mesh position={[bx + 0.1, 0.3, bz + 0.5]} castShadow>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color={WORLD.sage} roughness={0.8} flatShading />
          </mesh>
        </group>
      )
  }
}

/** Items in a room as small crates on the free front half of the floor. */
function Crates({ categories, w, d }: { categories: string[]; w: number; d: number }) {
  const size = 0.17
  const gap = 0.26
  const cols = Math.max(1, Math.floor((w - 0.3) / gap))
  return (
    <group position={[-((Math.min(cols, categories.length) - 1) * gap) / 2, 0, d / 2 - 0.3]}>
      {categories.slice(0, cols * 3).map((c, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        return (
          <RoundedBox
            key={i}
            args={[size, size, size]}
            radius={0.025}
            position={[col * gap, size / 2, -row * gap]}
            castShadow
          >
            <meshStandardMaterial color={categoryColor(c)} roughness={0.55} />
          </RoundedBox>
        )
      })}
    </group>
  )
}

/** Roofless cutaway of a house: one tinted room per person, with furniture and item crates. */
export function HouseInterior({ rooms }: { rooms: RoomInfo[] }) {
  const count = rooms.length
  const walls = useWalls(count)
  const plan = ROOM_PLANS[count]

  return (
    <group>
      {/* Floor slab */}
      <RoundedBox
        args={[INTERIOR.w + 0.3, 0.12, INTERIOR.d + 0.3]}
        radius={0.04}
        position={[0, 0.04, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={WORLD.lot} roughness={0.9} />
      </RoundedBox>

      {plan.map((r, i) => {
        const b = roomBounds(r)
        const room = rooms[i]
        return (
          <group key={i} position={[b.cx, FLOOR_Y, b.cz]}>
            <mesh position={[0, 0.005, 0]} receiveShadow>
              <boxGeometry args={[b.w - 0.04, 0.01, b.d - 0.04]} />
              <meshStandardMaterial color={tint(room.color, 0.7)} roughness={0.95} />
            </mesh>
            <Furniture kind={room.kind} w={b.w} d={b.d} />
            <Crates categories={room.itemCategories} w={b.w} d={b.d} />
          </group>
        )
      })}

      {walls.map((s, i) => (
        <Wall key={i} s={s} />
      ))}
    </group>
  )
}
