import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import * as THREE from 'three'

/**
 * World-anchored DOM labels without a React root per label.
 * Labels are ordinary react-dom elements laid over the canvas; this
 * projector moves each one to its 3D anchor's screen position every frame.
 */
export type LabelAnchor = { id: string; position: [number, number, number] }

export type LabelRegistry = Map<string, HTMLElement>

const v = new THREE.Vector3()

export function LabelProjector({
  anchors,
  registry,
}: {
  anchors: RefObject<LabelAnchor[]>
  registry: RefObject<LabelRegistry>
}) {
  useFrame(({ camera, size }) => {
    for (const a of anchors.current) {
      const el = registry.current.get(a.id)
      if (!el) continue
      v.set(...a.position).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
      el.style.visibility = 'visible'
    }
  })
  return null
}
