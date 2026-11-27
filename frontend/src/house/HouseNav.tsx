import { AccountMenu } from '../chrome/AccountMenu'
import { LogoMark } from '../chrome/LogoMark'
import type { AccountInfo } from '../types/process'
import { type HouseTab } from './HouseViewSwitch'
import { HouseToolbar } from './HouseToolbar'

export type { HouseTab }

type HouseNavProps = {
  processTitle: string
  account: AccountInfo
  tab: HouseTab
  onTab: (tab: HouseTab) => void
  onBackToWorld: () => void
  onSignOut: () => void
  /** Inventory overlay controls (only used on split/export; inventory tab uses a title notch + embedded toolbar). */
  inventoryFilter?: string
  onInventoryFilter?: (value: string) => void
  onAddObject?: () => void
  inventoryCount?: number | null
}

/** Top chrome inside a house: logo / process title / account, then back + view switch. */
export function HouseNav({
  processTitle,
  account,
  tab,
  onTab,
  onBackToWorld,
  onSignOut,
  inventoryFilter = '',
  onInventoryFilter,
  onAddObject,
  inventoryCount = null,
}: HouseNavProps) {
  /* Inventory: title lives as a notch on the white shell; chrome is logo + account only. */
  const inventoryNotchTitle = tab === 'inventory'

  return (
    <header
      className={`house-chrome pointer-events-none absolute inset-x-0 top-0 z-40 ${inventoryNotchTitle ? 'house-chrome-compact' : ''}`}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="panel pointer-events-auto flex items-center gap-3 justify-self-start px-3 py-2.5 sm:px-4 sm:py-3">
          <LogoMark className="h-8 w-8" />
          <span className="hidden text-lg font-extrabold tracking-tight text-petrol sm:inline">Dividealo</span>
        </div>

        {!inventoryNotchTitle ? (
          <h1 className="max-w-[min(40vw,20rem)] truncate text-center text-base font-extrabold tracking-tight text-petrol sm:max-w-md sm:text-xl">
            {processTitle}
          </h1>
        ) : (
          <span aria-hidden className="justify-self-center" />
        )}

        <div className="justify-self-end">
          <AccountMenu account={account} onSignOut={onSignOut} />
        </div>
      </div>

      {!inventoryNotchTitle && (
        <HouseToolbar
          tab={tab}
          onTab={onTab}
          onBackToWorld={onBackToWorld}
          inventoryCount={inventoryCount}
          inventoryFilter={inventoryFilter}
          onInventoryFilter={onInventoryFilter}
          onAddObject={onAddObject}
        />
      )}
    </header>
  )
}