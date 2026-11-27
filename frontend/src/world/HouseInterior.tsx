import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { WORLD } from './palette'
import { INTERIOR, ROOM_PLANS, roomBounds, type RoomInfo } from './rooms'

const FLOOR_Y = 0.1
const WALL_COLOR = '#fbf9f3'
const WALL_TOP = '#eae0d5'
/** Partitions between rooms: solid, thicker and darker so each room reads as its own space. */
const PARTITION_COLOR = '#d9cbb9'
const PARTITION_TOP = '#1e293b'
const PARTITION_T = 0.14
const WOOD = '#c9a77c'

type Segment = { x: number; z: number; len: number; alongX: boolean; h: number; partition?: boolean }

/** Interior walls for a plan: tall back walls, low front walls, solid partitions between rooms. */
function useWalls(count: number): Segment[] {
  return useMemo(() => {
    const { w, d, wallH, lowWallH, partitionH } = INTERIOR
    const segs: Segment[] = [
      { x: 0, z: -d / 2, len: w, alongX: true, h: wallH },
      { x: -w / 2, z: 0, len: d, alongX: false, h: wallH },
      { x: 0, z: d / 2, len: w, alongX: true, h: lowWallH },
      { x: w / 2, z: 0, len: d, alongX: false, h: lowWallH },
    ]
    // One solid partition per shared edge (no door gap): rooms read as separate spaces.
    const split = (a0: number, a1: number, fixed: number, alongX: boolean) => {
      const c = (a0 + a1) / 2
      segs.push(
        alongX
          ? { x: c, z: fixed, len: a1 - a0, alongX: true, h: partitionH, partition: true }
          : { x: fixed, z: c, len: a1 - a0, alongX: false, h: partitionH, partition: true },
      )
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
  const t = s.partition ? PARTITION_T : INTERIOR.wall
  const args: [number, number, number] = s.alongX ? [s.len + t, s.h, t] : [t, s.h, s.len + t]
  return (
    <group position={[s.x, FLOOR_Y, s.z]}>
      <mesh position={[0, s.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial color={s.partition ? PARTITION_COLOR : WALL_COLOR} roughness={0.9} />
      </mesh>
      {/* Cut edge, like a sectioned architectural model */}
      <mesh position={[0, s.h + 0.004, 0]}>
        <boxGeometry args={[args[0], 0.008, args[2]]} />
        <meshBasicMaterial color={s.partition ? PARTITION_TOP : WALL_TOP} />
      </mesh>
    </group>
  )
}

function tint(hex: string, amount: number) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount).getHexString()
}

/** Fit factor so props stay in proportion in narrow rooms of the 4/5-person plans. */
function fitScale(w: number, d: number) {
  return Math.min(1.1, Math.max(0.68, Math.min(w / 1.9, d / 1.7)))
}

/**
 * A person's own room: everything soft is in their colour, so the room reads
 * as theirs at a glance. Props hug the walls; the middle stays free for the pawn.
 */
function PersonalRoom({ color, w, d, index }: { color: string; w: number; d: number; index: number }) {
  const k = fitScale(w, d)
  const left = -w / 2
  const back = -d / 2
  const pad = 0.1
  const blanket = tint(color, 0.15)
  const soft = tint(color, 0.55)
  const roomy = w >= 1.45
  // Alternate the bed side so neighbouring rooms don't look copy-pasted.
  const flip = index % 2 === 1 ? -1 : 1
  const bedX = flip * (left + pad + 0.3 * k)
  const deskX = -flip * (left + pad + 0.32 * k)

  return (
    <group>
      {/* Rug */}
      <RoundedBox
        args={[Math.min(w - 0.5, 1.0 * k), 0.012, Math.min(d - 0.6, 0.7 * k)]}
        radius={0.006}
        position={[w * 0.12 * flip, 0.012, d * 0.12]}
        receiveShadow
      >
        <meshStandardMaterial color={soft} roughness={1} />
      </RoundedBox>

      {/* Bed: frame, mattress, blanket in the person's colour, pillow */}
      <group position={[bedX, 0, back + pad + 0.45 * k]} scale={k}>
        <RoundedBox args={[0.6, 0.14, 0.9]} radius={0.03} position={[0, 0.07, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={WOOD} roughness={0.8} />
        </RoundedBox>
        <RoundedBox args={[0.62, 0.3, 0.06]} radius={0.025} position={[0, 0.15, -0.45]} castShadow>
          <meshStandardMaterial color={WOOD} roughness={0.8} />
        </RoundedBox>
        <RoundedBox args={[0.54, 0.07, 0.84]} radius={0.03} position={[0, 0.17, 0.01]} castShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </RoundedBox>
        <RoundedBox args={[0.58, 0.05, 0.56]} radius={0.025} position={[0, 0.215, 0.15]} castShadow>
          <meshStandardMaterial color={blanket} roughness={0.85} />
        </RoundedBox>
        <RoundedBox args={[0.38, 0.07, 0.15]} radius={0.03} position={[0, 0.235, -0.3]} castShadow>
          <meshStandardMaterial color="#f8fafc" roughness={0.9} />
        </RoundedBox>
      </group>

      {/* Nightstand + lamp with a warm glow */}
      <group position={[bedX + flip * 0.42 * k, 0, back + pad + 0.12 * k]} scale={k}>
        <RoundedBox args={[0.2, 0.2, 0.2]} radius={0.02} position={[0, 0.1, 0]} castShadow>
          <meshStandardMaterial color={WOOD} roughness={0.75} />
        </RoundedBox>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.015, 0.03, 0.08, 8]} />
          <meshStandardMaterial color={WORLD.petrol} />
        </mesh>
        <mesh position={[0, 0.31, 0]} castShadow>
          <coneGeometry args={[0.07, 0.08, 14, 1, true]} />
          <meshStandardMaterial color="#fff4d6" emissive="#ffd48a" emissiveIntensity={0.9} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Desk + chair, when the room is wide enough */}
      {roomy && (
        <group position={[deskX, 0, back + pad + 0.16 * k]} scale={k}>
          <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.56, 0.03, 0.26]} />
            <meshStandardMaterial color={WOOD} roughness={0.6} />
          </mesh>
          {[-0.25, 0.25].map((o) => (
            <mesh key={o} position={[o, 0.13, 0]} castShadow>
              <boxGeometry args={[0.03, 0.26, 0.22]} />
              <meshStandardMaterial color={WOOD} roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[-0.1, 0.36, -0.05]} castShadow>
            <boxGeometry args={[0.22, 0.15, 0.015]} />
            <meshStandardMaterial color={WORLD.petrol} roughness={0.35} />
          </mesh>
          <mesh position={[0.17, 0.3, 0.02]} castShadow>
            <boxGeometry args={[0.07, 0.035, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {/* Chair */}
          <group position={[0, 0, 0.27]}>
            <RoundedBox args={[0.2, 0.03, 0.2]} radius={0.01} position={[0, 0.16, 0]} castShadow>
              <meshStandardMaterial color={blanket} roughness={0.7} />
            </RoundedBox>
            <RoundedBox args={[0.2, 0.18, 0.03]} radius={0.01} position={[0, 0.26, 0.09]} castShadow>
              <meshStandardMaterial color={blanket} roughness={0.7} />
            </RoundedBox>
            <mesh position={[0, 0.075, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 0.15, 6]} />
              <meshStandardMaterial color={WORLD.petrol} />
            </mesh>
          </group>
        </group>
      )}

      {/* Plant in the front corner */}
      <group position={[-flip * (left + pad + 0.1 * k), 0, d / 2 - pad - 0.12 * k]} scale={k}>
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.06, 0.16, 12]} />
          <meshStandardMaterial color="#c2703d" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.25, 0]} castShadow>
          <icosahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color={WORLD.sage} roughness={0.8} flatShading />
        </mesh>
        <mesh position={[0.05, 0.36, 0.02]} castShadow>
          <icosahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial color="#3f9a6e" roughness={0.8} flatShading />
        </mesh>
      </group>
    </group>
  )
}

/** Roofless cutaway of a house: one room per person, furnished in their colour. */
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
              <meshStandardMaterial color={tint(room.color, 0.5)} roughness={0.95} />
            </mesh>
            <PersonalRoom color={room.color} w={b.w} d={b.d} index={i} />
          </group>
        )
      })}

      {walls.map((s, i) => (
        <Wall key={i} s={s} />
      ))}
    </group>
  )
}
