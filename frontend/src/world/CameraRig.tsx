import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
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
  /**
   * Screen rect the scene should live in (full screen in the world, the left
   * column inside a house). The canvas itself never resizes: the rig clips the
   * stage to this rect and offsets the projection so the target stays centred
   * in it, every frame. Resizing the canvas mid-transition is what made the
   * view jump at the end.
   */
  frameRef: RefObject<HTMLElement | null>
}

const UP = new THREE.Vector3(0, 1, 0)
const offset = new THREE.Vector3()
const goalTarget = new THREE.Vector3()
const CORNER = 16

function goalFor(shot: CameraShot, focus: Vec2 | null, w: number, h: number) {
  const fit = Math.max(14, Math.min(w / 30, h / 22))
  if (shot === 'world' || !focus) return { y: 0, x: 0, z: 0, zoom: fit }
  if (shot === 'focus') return { x: focus[0], y: 0.8, z: focus[1], zoom: Math.min(fit * 1.8, 90) }
  // Interior: the cutaway (about 4.3 x 3.7 units) fills the frame.
  return { x: focus[0], y: 0.5, z: focus[1], zoom: Math.max(20, Math.min(w / 7, h / 6)) }
}

/**
 * Flies the orbit target and zoom between shots, keeping whatever angle the
 * user orbited to. Stops steering once it arrives, so manual orbit/pan/zoom
 * stays free between shots.
 */
export function CameraRig({ shot, focus, spinRequest, frameRef }: CameraRigProps) {
  const flying = useRef(true)
  const spinLeft = useRef(0)
  const lastFrame = useRef({ w: 0, h: 0 })

  useEffect(() => {
    flying.current = true
  }, [shot, focus])

  useEffect(() => {
    if (spinRequest > 0) {
      spinLeft.current += Math.PI / 2
      flying.current = true
    }
  }, [spinRequest])

  // Read camera and controls from frame state: they are mutated here every frame.
  useFrame((state, dt) => {
    const cam = state.camera as THREE.OrthographicCamera
    const canvas = state.gl.domElement
    const W = state.size.width
    const H = state.size.height

    // ---- frame: clip the stage and shift the projection to its centre ----
    const c = canvas.getBoundingClientRect()
    const f = frameRef.current?.getBoundingClientRect()
    const fx = f ? f.left - c.left : 0
    const fy = f ? f.top - c.top : 0
    const fw = f ? f.width : W
    const fh = f ? f.height : H
    const inset = [fy, W - fx - fw, H - fy - fh, fx].map((v) => Math.max(0, v))
    const stage = canvas.closest<HTMLElement>('.world-stage')
    if (stage) {
      const radius = Math.min(CORNER, Math.max(...inset) * 1.5)
      stage.style.clipPath = `inset(${inset.map((v) => `${v.toFixed(1)}px`).join(' ')} round ${radius.toFixed(1)}px)`
    }
    cam.setViewOffset(W, H, -(fx + fw / 2 - W / 2), -(fy + fh / 2 - H / 2), W, H)

    // A real frame resize (window, layout) re-fits; the enter transition is a resize too.
    if (Math.abs(fw - lastFrame.current.w) > 0.5 || Math.abs(fh - lastFrame.current.h) > 0.5) {
      lastFrame.current = { w: fw, h: fh }
      flying.current = true
    }

    const controls = state.controls as OrbitControlsImpl | null
    if (!controls || !flying.current) {
      cam.updateProjectionMatrix()
      return
    }
    const goal = goalFor(shot, focus, fw, fh)
    goalTarget.set(goal.x, goal.y, goal.z)
    const k = 1 - Math.exp(-dt * 6)

    offset.copy(cam.position).sub(controls.target)
    if (spinLeft.current > 0) {
      const step = Math.min(spinLeft.current, dt * 2.5)
      offset.applyAxisAngle(UP, step)
      spinLeft.current -= step
    }
    controls.target.lerp(goalTarget, k)
    cam.position.copy(controls.target).add(offset)
    cam.zoom += (goal.zoom - cam.zoom) * k
    cam.updateProjectionMatrix()
    controls.update()

    const arrived =
      spinLeft.current <= 0 && controls.target.distanceTo(goalTarget) < 0.005 && Math.abs(goal.zoom - cam.zoom) < 0.1
    if (arrived) flying.current = false
  })

  return null
}
