type OnboardingModalProps = {
  open: boolean
  onClose: () => void
  onStart: () => void
  /** Idealo session auth is required before creating a process. */
  idealoReady?: boolean
}

const STEPS = [
  {
    title: 'Authenticate with Idealo',
    body: 'Open your account menu (top right) and connect Idealo MCP — required to price items and create processes.',
  },
  {
    title: 'Optional: add an LLM',
    body: 'Configure AI keys in the same menu if you want chat-assisted drafting. Without an LLM, manual add still works.',
  },
  {
    title: 'Build and split',
    body: 'Create a house, fill the inventory together, and Dividealo proposes a fair division from idealo prices.',
  },
]

export function OnboardingModal({ open, onClose, onStart, idealoReady = false }: OnboardingModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="fade-in absolute inset-0 bg-midnight/40" aria-label="Close onboarding" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="panel pop-in relative z-10 w-full max-w-md p-6"
        style={{ background: '#ffffff' }}
      >
        <p className="label-sm text-terracotta">Welcome</p>
        <h2 id="onboarding-title" className="mt-1 text-2xl font-extrabold tracking-tight text-petrol">
          Welcome to Dividealo
        </h2>
        <ol className="mt-5 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay text-sm font-extrabold text-petrol">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-ink">{s.title}</p>
                <p className="text-sm text-ink2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Explore first
          </button>
          {idealoReady ? (
            <button type="button" onClick={onStart} className="btn btn-primary">
              Create your first process
            </button>
          ) : (
            <p className="max-w-[16rem] text-right text-xs font-semibold leading-snug text-ink2">
              Authenticate with Idealo from your account menu above to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
