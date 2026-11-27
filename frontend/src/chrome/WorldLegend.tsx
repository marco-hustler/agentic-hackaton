import { KIND_META } from '../world/palette'

/** Bottom-left key: roof colour = process kind, plus navigation hints. */
export function WorldLegend() {
  return (
    <aside className="panel pointer-events-auto absolute bottom-4 left-4 z-30 hidden px-4 py-3 sm:block">
      <p className="label-sm text-muted">Roof = process type</p>
      <ul className="mt-2 space-y-1.5">
        {Object.entries(KIND_META).map(([id, k]) => (
          <li key={id} className="flex items-center gap-2 text-sm text-ink">
            <span className="h-3 w-3 rounded-sm" style={{ background: k.roof }} />
            {k.label}
          </li>
        ))}
      </ul>
      <div className="dashed-rule mt-3 pt-2 text-xs text-muted">Drag to orbit · right-drag to pan · scroll to zoom</div>
    </aside>
  )
}
