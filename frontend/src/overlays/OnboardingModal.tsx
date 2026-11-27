type OnboardingModalProps = {
  open: boolean
  onClose: () => void
  onStart: () => void
}

export function OnboardingModal({ open, onClose, onStart }: OnboardingModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close onboarding"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative z-10 w-full max-w-md rounded-2xl bg-card border border-line p-6 shadow-lg"
      >
        <h2 id="onboarding-title" className="text-lg font-medium text-ink">
          Welcome to CleanBreak
        </h2>
        <ol className="mt-4 space-y-3 text-sm text-ink2 list-decimal list-inside">
          <li>This world is your neighbourhood — each house is a split process.</li>
          <li>Create a house, invite people, and fill the inventory together.</li>
          <li>idealo prices the items; CleanBreak proposes a fair division.</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-lg bg-card border border-line text-ink font-medium hover:bg-raised"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onStart}
            className="h-9 px-4 rounded-lg bg-accent text-on-accent font-medium hover:opacity-90"
          >
            Create your first process
          </button>
        </div>
      </div>
    </div>
  )
}
