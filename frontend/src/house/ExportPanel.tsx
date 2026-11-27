import { useMemo, useState } from 'react'
import type { DemoScenario } from '../types/inventory'
import { buildRows, downloadXlsx } from './exportRows'
import { formatEur } from './format'

type ExportPanelProps = {
  title: string
  demo: DemoScenario | null
  error: string | null
  names: [string, string]
  onOpenItem: (id: string) => void
}

export function ExportPanel({ title, demo, error, names, onOpenItem }: ExportPanelProps) {
  const [busy, setBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const rows = useMemo(() => (demo ? buildRows(demo, names) : []), [demo, names])
  const total = rows.reduce((sum, r) => sum + r.fairValue, 0)

  async function onExport() {
    if (!demo) return
    setBusy(true)
    setExportError(null)
    try {
      await downloadXlsx(title, demo, names)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="inventory-page" aria-label="List and export">
      <div className="inventory-shell">
        <div className="inventory-title-insert">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold tracking-tight text-petrol sm:text-lg">List & Export</h2>
            <p className="text-xs font-semibold text-muted sm:text-sm">
              {demo ? `${rows.length} items · ${formatEur(total)} fair value` : 'Loading…'}
            </p>
          </div>
          <button type="button" className="btn btn-primary h-9 shrink-0 px-4" disabled={!demo || busy} onClick={onExport}>
            {busy ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>

        <div className="inventory-shell-body">
          {error && <p className="mb-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not load the list: {error}</p>}
          {exportError && <p className="mb-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">Could not export: {exportError}</p>}

          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-line bg-surface-low text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Fair value</th>
                    <th className="px-4 py-3">Goes to</th>
                  </tr>
                </thead>
                <tbody>
                  {!demo && !error && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {demo && rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted">
                        No items yet. Add some from Inventory.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onOpenItem(row.id)} className="font-bold text-petrol hover:underline">
                          {row.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink2">{row.category}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-petrol">{formatEur(row.fairValue)}</td>
                      <td className="px-4 py-3 text-ink2">{row.goesTo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
