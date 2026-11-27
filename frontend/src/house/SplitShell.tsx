import { HouseToolbar } from './HouseToolbar'
import type { HouseTab } from './HouseViewSwitch'

type SplitShellProps = {
  processTitle: string
  tab: HouseTab
  onTab: (tab: HouseTab) => void
  onBackToWorld: () => void
  inventoryCount?: number | null
}

/**
 * Same two boxes as the inventory page (title notch + white shell with the
 * embedded toolbar), drawn *behind* the world stage: the stage is clipped to
 * the diorama frame, so the shell shows around the house without covering it.
 */
export function SplitShell({ processTitle, tab, onTab, onBackToWorld, inventoryCount }: SplitShellProps) {
  return (
    <section className="inventory-page inventory-page-unified split-shell" aria-label="Split">
      <div className="inventory-shell inventory-shell-notched">
        <h1 className="inventory-title-notch" title={processTitle}>
          {processTitle}
        </h1>
        <div className="inventory-shell-inner">
          <div className="inventory-shell-top">
            <HouseToolbar
              variant="embedded"
              tab={tab}
              onTab={onTab}
              onBackToWorld={onBackToWorld}
              inventoryCount={inventoryCount}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
