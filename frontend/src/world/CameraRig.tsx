import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Vec2 } from './layout'

export type CameraShot = 'world' | 'focus' | 'interior'

type CameraRigProps = {
  shot: CameraShot
  /** Lot centre to frame for focus / interior shots. */
  focus: Vec2 | null
  /** Increment to turn the view a quarter around the target. */
  spinRequest: number
}

const UP = new THREE.Vector3(0, 1, 0)
const offset = new THREE.Vector3()

/**
 * Flies the orbit target and zoom between shots, keeping whatever angle the
 * user orbited to. Stops steering once it arrives, so manual orbit/pan/zoom
 * stays free between shots.
 */
export function CameraRig({ shot, focus, spinRequest }: CameraRigProps) {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const flying = useRef(true)
  const spinLeft = useRef(0)

  const goal = useMemo(() => {
    const fit = Math.max(14, Math.min(width / 30, height / 22))
    if (shot === 'world' || !focus) return { target: new THREE.Vector3(0, 0, 0), zoom: fit }
    if (shot === 'focus') return { target: new THREE.Vector3(focus[0], 0.8, focus[1]), zoom: Math.min(fit * 1.8, 90) }
    // Interior: the cutaway (about 4.3 x 3.7 units) fills the view.
    return { target: new THREE.Vector3(focus[0], 0.5, focus[1]), zoom: Math.max(20, Math.min(width / 7, height / 6)) }
  }, [shot, focus, width, height])

  useEffect(() => {
    flying.current = true
  }, [goal])

  useEffect(() => {
    if (spinRequest > 0) {
      spinLeft.current += Math.PI / 2
      flying.current = true
    }
  }, [spinRequest])

  // Read camera and controls from frame state: they are mutated here every frame.
  useFrame((state, dt) => {
    const controls = state.controls as OrbitControlsImpl | null
    if (!controls || !flying.current) return
    const cam = state.camera as THREE.OrthographicCamera
    const k = 1 - Math.exp(-dt * 4)

    offset.copy(cam.position).sub(controls.target)
    if (spinLeft.current > 0) {
      const step = Math.min(spinLeft.current, dt * 2.5)
      offset.applyAxisAngle(UP, step)
      spinLeft.current -= step
    }
    controls.target.lerp(goal.target, k)
    cam.position.copy(controls.target).add(offset)
    cam.zoom += (goal.zoom - cam.zoom) * k
    cam.updateProjectionMatrix()
    controls.update()

    const arrived =
      spinLeft.current <= 0 && controls.target.distanceTo(goal.target) < 0.005 && Math.abs(goal.zoom - cam.zoom) < 0.1
    if (arrived) flying.current = false
  })

  return null
}
