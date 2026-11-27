import { useState } from 'react'
import type { ProcessKind, ProcessSummary } from '../types/process'

type CreateProcessWizardProps = {
  open: boolean
  onClose: () => void
  onCreated: (process: ProcessSummary) => void
}

const KINDS: { id: ProcessKind; title: string; blurb: string }[] = [
  {
    id: 'separation',
    title: 'Separation',
    blurb: 'Couple / household split',
  },
  {
    id: 'inheritance',
    title: 'Inheritance',
    blurb: 'Estate division among heirs',
  },
  {
    id: 'other',
    title: 'Other split',
    blurb: 'Flatmates, partners, co-owners…',
  },
]

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function CreateProcessWizard({
  open,
  onClose,
  onCreated,
}: CreateProcessWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [kind, setKind] = useState<ProcessKind | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [emails, setEmails] = useState<string[]>([])
  const [emailError, setEmailError] = useState<string | null>(null)

  if (!open) return null

  function resetAndClose() {
    setStep(1)
    setKind(null)
    setEmailInput('')
    setEmails([])
    setEmailError(null)
    onClose()
  }

  function addEmail() {
    const value = emailInput.trim().toLowerCase()
    if (!value) return
    if (!isEmail(value)) {
      setEmailError('Enter a valid email')
      return
    }
    if (emails.includes(value)) {
      setEmailError('Already added')
      return
    }
    setEmails((prev) => [...prev, value])
    setEmailInput('')
    setEmailError(null)
  }

  function create() {
    if (!kind) return
    const title =
      kind === 'separation'
        ? 'Separation'
        : kind === 'inheritance'
          ? 'Inheritance'
          : 'Household split'
    const process: ProcessSummary = {
      id: crypto.randomUUID(),
      title,
      kind,
      status: 'draft',
      participantEmails: emails,
    }
    onCreated(process)
    resetAndClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close wizard"
        onClick={resetAndClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        className="relative z-10 w-full max-w-lg rounded-2xl bg-card border border-line p-6 shadow-lg"
      >
        <p className="text-xs font-mono text-muted">Step {step} of 3</p>
        <h2 id="wizard-title" className="mt-1 text-lg font-medium text-ink">
          {step === 1 && 'Process type'}
          {step === 2 && 'Invite people'}
          {step === 3 && 'Confirm'}
        </h2>

        {step === 1 && (
          <div className="mt-4 grid gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  kind === k.id
                    ? 'border-accent bg-raised'
                    : 'border-line bg-card hover:bg-raised'
                }`}
              >
                <p className="font-medium text-ink">{k.title}</p>
                <p className="text-sm text-ink2">{k.blurb}</p>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink2">
              We will invite them to collaborate on this process.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addEmail()
                  }
                }}
                placeholder="name@email.com"
                className="flex-1 h-9 rounded-lg bg-page border border-line px-3 text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <button
                type="button"
                onClick={addEmail}
                className="h-9 px-3 rounded-lg bg-ink text-page font-medium hover:opacity-90"
              >
                Add
              </button>
            </div>
            {emailError && <p className="text-sm text-neg">{emailError}</p>}
            {emails.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {emails.map((email) => (
                  <li
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full bg-raised border border-line px-3 py-1 text-xs text-ink"
                  >
                    {email}
                    <button
                      type="button"
                      className="text-muted hover:text-neg"
                      onClick={() =>
                        setEmails((prev) => prev.filter((e) => e !== email))
                      }
                      aria-label={`Remove ${email}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="mt-4 space-y-2 text-sm text-ink2">
            <p>
              <span className="text-muted">Type:</span>{' '}
              <span className="text-ink font-medium">
                {KINDS.find((k) => k.id === kind)?.title}
              </span>
            </p>
            <p>
              <span className="text-muted">Invites:</span>{' '}
              <span className="text-ink font-medium">
                {emails.length ? emails.join(', ') : 'None yet (you can invite later)'}
              </span>
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (step === 1) resetAndClose()
              else setStep((s) => (s === 3 ? 2 : 1))
            }}
            className="h-9 px-3 rounded-lg border border-line bg-card text-ink font-medium hover:bg-raised"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && !kind}
              onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
              className="h-9 px-4 rounded-lg bg-accent text-on-accent font-medium hover:opacity-90 disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              className="h-9 px-4 rounded-lg bg-accent text-on-accent font-medium hover:opacity-90"
            >
              Create process
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
