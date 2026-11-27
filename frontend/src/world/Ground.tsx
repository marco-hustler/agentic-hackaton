import { RoundedBox } from '@react-three/drei'
import { LOT_SIZE, LOT_SLOTS, PLATE_HALF, ROAD_LINES, ROAD_WIDTH, TREE_SPOTS } from './layout'
import { WORLD } from './palette'

const PLATE = PLATE_HALF * 2
const DASHES = Array.from({ length: 9 }, (_, i) => -PLATE_HALF + 1.1 + i * 2.2)

/** The diorama stage: petrol base block, lawn, roads, lot pads and trees. */
export function Ground() {
  return (
    <group>
      {/* Base block, like the stand of a scale model */}
      <RoundedBox args={[PLATE + 0.8, 1.6, PLATE + 0.8]} radius={0.35} position={[0, -1.05, 0]} receiveShadow>
        <meshStandardMaterial color={WORLD.plateBase} roughness={0.85} />
      </RoundedBox>

      {/* Lawn */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[PLATE, 0.24, PLATE]} />
        <meshStandardMaterial color={WORLD.lawn} roughness={1} />
      </mesh>

      {/* Roads, both axes */}
      {ROAD_LINES.map((c) => (
        <group key={`road-${c}`}>
          <mesh position={[c, 0.01, 0]} receiveShadow>
            <boxGeometry args={[ROAD_WIDTH, 0.02, PLATE]} />
            <meshStandardMaterial color={WORLD.road} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.012, c]} receiveShadow>
            <boxGeometry args={[PLATE, 0.02, ROAD_WIDTH]} />
            <meshStandardMaterial color={WORLD.road} roughness={0.9} />
          </mesh>
          {DASHES.map((d) =>
            ROAD_LINES.some((o) => Math.abs(d - o) < ROAD_WIDTH) ? null : (
              <group key={`dash-${c}-${d}`}>
                <mesh position={[c, 0.025, d]}>
                  <boxGeometry args={[0.08, 0.01, 0.7]} />
                  <meshBasicMaterial color={WORLD.roadMark} />
                </mesh>
                <mesh position={[d, 0.025, c]}>
                  <boxGeometry args={[0.7, 0.01, 0.08]} />
                  <meshBasicMaterial color={WORLD.roadMark} />
                </mesh>
              </group>
            ),
          )}
        </group>
      ))}

      {/* Lot pads */}
      {LOT_SLOTS.map(([x, z]) => (
        <mesh key={`lot-${x}-${z}`} position={[x, 0.02, z]} receiveShadow>
          <boxGeometry args={[LOT_SIZE, 0.04, LOT_SIZE]} />
          <meshStandardMaterial color={WORLD.lawnDark} roughness={1} />
        </mesh>
      ))}

      {TREE_SPOTS.map(({ pos, scale }, i) => (
        <Tree key={`tree-${i}`} x={pos[0]} z={pos[1]} scale={scale} variant={i % 3} />
      ))}
    </group>
  )
}

export function Tree({ x, z, scale = 1, variant = 0 }: { x: number; z: number; scale?: number; variant?: number }) {
  const canopy = WORLD.canopy[variant % WORLD.canopy.length]
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 0.6, 8]} />
        <meshStandardMaterial color={WORLD.trunk} roughness={0.9} />
      </mesh>
      {variant === 1 ? (
        <mesh position={[0, 0.95, 0]} castShadow>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshStandardMaterial color={canopy} roughness={0.8} flatShading />
        </mesh>
      ) : (
        <mesh position={[0, 1.0, 0]} castShadow>
          <coneGeometry args={[0.48, 1.2, 8]} />
          <meshStandardMaterial color={canopy} roughness={0.8} flatShading />
        </mesh>
      )}
    </group>
  )
}
