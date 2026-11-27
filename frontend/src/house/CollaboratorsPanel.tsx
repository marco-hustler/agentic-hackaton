import { useMemo, useState } from 'react'
import { HouseToolbar } from './HouseToolbar'
import type { HouseTab } from './HouseViewSwitch'
import { participantColor } from '../world/rooms'

type CollaboratorsPanelProps = {
  processTitle: string
  /** Collaborator emails (owner is always included separately as "You"). */
  emails: string[]
  filter: string
  onFilter: (value: string) => void
  inviting: boolean
  onInvitingChange: (open: boolean) => void
  saving: boolean
  error: string | null
  tab: HouseTab
  onTab: (tab: HouseTab) => void
  onBackToWorld: () => void
  inventoryCount?: number | null
  onInvite: (email: string) => Promise<void> | void
  onRemove: (email: string) => Promise<void> | void
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function displayName(email: string) {
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  return local ? local[0].toUpperCase() + local.slice(1) : email
}

/** People on this process: search, list, invite. */
export function CollaboratorsPanel({
  processTitle,
  emails,
  filter,
  onFilter,
  inviting,
  onInvitingChange,
  saving,
  error,
  tab,
  onTab,
  onBackToWorld,
  inventoryCount,
  onInvite,
  onRemove,
}: CollaboratorsPanelProps) {
  const q = filter.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? emails.filter((e) => `${e} ${displayName(e)}`.toLowerCase().includes(q)) : emails),
    [emails, q],
  )

  return (
    <section className="inventory-page inventory-page-unified" aria-label="Collaborators">
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
              collaboratorsFilter={filter}
              onCollaboratorsFilter={onFilter}
              onInviteCollaborator={() => onInvitingChange(true)}
            />
          </div>

          <div className="inventory-shell-body">
            {error && <p className="mb-4 rounded-xl bg-[#ffdad6] p-3 text-sm text-[#93000a]">{error}</p>}

            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface-low px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: participantColor(0) }}>
                You
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">You</p>
                <p className="truncate text-sm text-muted">Owner · always on this process</p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-petrol">
                You
              </span>
            </div>

            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
                {q
                  ? 'No collaborator matches that search.'
                  : 'No collaborators yet. Invite someone to split with.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((email, i) => (
                  <li
                    key={email}
                    className="pop-in flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                      style={{ background: participantColor(i + 1) }}
                      aria-hidden
                    >
                      {displayName(email).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{displayName(email)}</p>
                      <p className="truncate text-sm text-muted">{email}</p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void onRemove(email)}
                      className="btn btn-ghost h-9 shrink-0 px-3 text-xs text-muted hover:text-error"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {inviting && (
        <InviteModal
          existing={emails}
          busy={saving}
          onClose={() => onInvitingChange(false)}
          onInvite={async (email) => {
            await onInvite(email)
            onInvitingChange(false)
          }}
        />
      )}
    </section>
  )
}

function InviteModal({
  existing,
  busy,
  onClose,
  onInvite,
}: {
  existing: string[]
  busy: boolean
  onClose: () => void
  onInvite: (email: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const email = value.trim().toLowerCase()
    if (!email) return
    if (!isEmail(email)) {
      setError('Enter a valid email')
      return
    }
    if (existing.includes(email)) {
      setError('Already invited')
      return
    }
    setError(null)
    try {
      await onInvite(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not invite')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="fade-in absolute inset-0 bg-midnight/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} disabled={busy} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        className="panel pop-in relative z-10 w-full max-w-md p-6"
        style={{ background: '#ffffff' }}
      >
        <h2 id="invite-title" className="text-xl font-extrabold tracking-tight text-petrol">
          Invite collaborator
        </h2>
        <p className="mt-1 text-sm text-ink2">They will appear on the split and can help fill the inventory.</p>
        <label className="mt-4 block space-y-1.5">
          <span className="label-md text-muted">Email</span>
          <input
            autoFocus
            type="email"
            value={value}
            disabled={busy}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder="name@email.com"
            className="field w-full"
          />
        </label>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? 'Inviting…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
