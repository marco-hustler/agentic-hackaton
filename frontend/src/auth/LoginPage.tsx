import { useState, type FormEvent } from 'react'
import { LogoMark } from '../chrome/LogoMark'
import type { AccountInfo } from '../types/process'
import { fakeSignIn } from './session'

type LoginPageProps = {
  onSignedIn: (account: AccountInfo) => void
}

export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [email, setEmail] = useState('you@dividealo.app')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const account = await fakeSignIn(email, password)
      onSignedIn(account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-canvas px-4 py-10 text-ink">
      {/* Atmospheric ground plane — soft clay wash, same family as the world UI */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(234,224,213,0.9) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 80% 100%, rgba(245,243,237,0.95) 0%, transparent 50%), linear-gradient(180deg, #f5f3ed 0%, #ffffff 48%, #eae0d5 100%)',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(30,41,59,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(30,41,59,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 75%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="h-14 w-14" />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-petrol sm:text-4xl">
            Dividealo
          </h1>
          <p className="mt-2 max-w-sm text-sm text-ink2">
            Sign in to open your neighbourhood and keep splitting fair.
          </p>
        </div>

        <div className="panel p-6 sm:p-7" style={{ background: '#ffffff' }}>
          <p className="label-sm text-terracotta">Demo access</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-petrol">
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm text-ink2">
            Fake auth for the hackathon — any valid email and a non-empty password work.
          </p>

          <form className="mt-5 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <label className="block space-y-1.5">
              <span className="label-md text-muted">Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dividealo.app"
                className="field w-full"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="label-md text-muted">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Anything goes"
                className="field w-full"
                required
              />
            </label>

            {error && <p className="text-sm text-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary h-11 w-full"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="dashed-rule mt-5 pt-4">
            <p className="text-xs text-muted">
              Hint: try <span className="font-semibold text-ink2">you@dividealo.app</span> with
              any password.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
