import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  clearIdealoCredentials,
  clearLlmCredentials,
  idealoConfiguredInSession,
  llmConfiguredInSession,
  loadIdealoCredentials,
  loadLlmCredentials,
  parseIdealoTokenInput,
  saveIdealoCredentials,
  saveLlmCredentials,
  type LlmCredentials,
} from '../auth/credentials'
import type { AccountInfo } from '../types/process'

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function IdealoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

const IDEALO_AUTH_URL = 'https://mcp.idealo.com/mcp'

type AccountMenuProps = {
  account: AccountInfo
  onSignOut: () => void
  /** Fires when Idealo session credentials are saved or cleared. */
  onIdealoChange?: (ready: boolean) => void
}

export function AccountMenu({ account, onSignOut, onIdealoChange }: AccountMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [idealoOpen, setIdealoOpen] = useState(false)
  const [aiKeysOpen, setAiKeysOpen] = useState(false)
  const [idealoReady, setIdealoReady] = useState(() => idealoConfiguredInSession())
  const [aiReady, setAiReady] = useState(() => llmConfiguredInSession())
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  function setIdealo(ready: boolean) {
    setIdealoReady(ready)
    onIdealoChange?.(ready)
  }

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <div className="pointer-events-auto relative justify-self-end" ref={menuRef}>
      <button
        type="button"
        className="panel flex items-center gap-3 px-3 py-2 text-left transition hover:bg-white/90"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-bold text-petrol">{account.name}</p>
          <p className="truncate text-xs text-ink2">{account.email}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-petrol text-xs font-bold text-white" aria-hidden>
          {account.initials}
        </div>
      </button>

      {menuOpen && (
        <div id={menuId} role="menu" className="panel absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[14.5rem] overflow-hidden p-1" style={{ background: '#ffffff' }}>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-petrol transition hover:bg-clay/70"
            onClick={() => {
              setMenuOpen(false)
              setIdealoOpen(true)
            }}
          >
            <IdealoIcon className="h-4 w-4 text-sky" />
            <span className="min-w-0 flex-1">Authenticate with Idealo</span>
            {idealoReady && <span className="text-[10px] font-extrabold uppercase tracking-wide text-sage">On</span>}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-petrol transition hover:bg-clay/70"
            onClick={() => {
              setMenuOpen(false)
              setAiKeysOpen(true)
            }}
          >
            <KeyIcon className="h-4 w-4 text-amber" />
            <span className="min-w-0 flex-1">Configure AI keys</span>
            {aiReady && <span className="text-[10px] font-extrabold uppercase tracking-wide text-sage">On</span>}
          </button>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl bg-terracotta px-3 py-2.5 text-left text-sm font-bold text-white transition hover:brightness-95"
            onClick={() => {
              setMenuOpen(false)
              onSignOut()
            }}
          >
            <LogoutIcon className="h-4 w-4 text-white" />
            Logout
          </button>
        </div>
      )}

      {idealoOpen && (
        <IdealoAuthModal
          onClose={() => setIdealoOpen(false)}
          onSaved={() => setIdealo(true)}
          onCleared={() => setIdealo(false)}
        />
      )}
      {aiKeysOpen && (
        <AiKeysModal
          onClose={() => setAiKeysOpen(false)}
          onSaved={() => setAiReady(true)}
          onCleared={() => setAiReady(false)}
        />
      )}
    </div>
  )
}

function IdealoAuthModal({
  onClose,
  onSaved,
  onCleared,
}: {
  onClose: () => void
  onSaved: () => void
  onCleared: () => void
}) {
  const existing = loadIdealoCredentials()?.accessToken ?? ''
  const [code, setCode] = useState(existing)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(Boolean(existing))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function openAuthTab() {
    window.open(IDEALO_AUTH_URL, 'idealo-auth', 'noopener,noreferrer')
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    const token = parseIdealoTokenInput(code)
    if (!token) {
      setError('Paste the Idealo access token, callback URL (?code=…), or .idealo_tokens.json.')
      setSaved(false)
      return
    }
    saveIdealoCredentials({ accessToken: token })
    setCode(token)
    setError(null)
    setSaved(true)
    onSaved()
  }

  function handleClear() {
    clearIdealoCredentials()
    setCode('')
    setSaved(false)
    setError(null)
    onCleared()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="idealo-auth-title">
      <button type="button" className="absolute inset-0 bg-midnight/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSave}
        className="panel pop-in relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl p-0 sm:rounded-3xl"
        style={{ background: '#ffffff' }}
      >
        <div className="border-b border-line px-5 py-4">
          <p className="label-sm text-sky">Idealo MCP</p>
          <h2 id="idealo-auth-title" className="mt-1 text-xl font-extrabold tracking-tight text-petrol">
            Authenticate with Idealo
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Open the Idealo auth tab, then paste the returned code here. It stays in this browser session only — server env on Vercel is unchanged.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <button type="button" className="btn btn-slate w-full" onClick={openAuthTab}>
            Open Idealo authentication
          </button>

          <label className="block">
            <span className="label-sm text-muted">Authorization code / access token</span>
            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setSaved(false)
                setError(null)
              }}
              rows={4}
              className="field mt-1 w-full resize-y font-mono text-xs"
              placeholder="Paste access_token, callback URL, or .idealo_tokens.json"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          {error && <p className="text-sm font-semibold text-error">{error}</p>}
          {saved && !error && <p className="text-sm font-semibold text-sage">Saved in this session.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <button type="button" className="btn btn-ghost" onClick={handleClear} disabled={!code && !saved}>
            Clear
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn btn-primary">
              Save to session
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function AiKeysModal({
  onClose,
  onSaved,
  onCleared,
}: {
  onClose: () => void
  onSaved: () => void
  onCleared: () => void
}) {
  const initial = loadLlmCredentials()
  const [form, setForm] = useState<LlmCredentials>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(llmConfiguredInSession())

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function setField<K extends keyof LlmCredentials>(key: K, value: LlmCredentials[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
    setError(null)
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.model.trim() || !form.apiKey.trim()) {
      setError('LLM_MODEL and LLM_API_KEY are required.')
      return
    }
    saveLlmCredentials(form)
    setError(null)
    setSaved(true)
    onSaved()
  }

  function handleClear() {
    clearLlmCredentials()
    setForm({ model: '', apiKey: '', apiBase: '' })
    setSaved(false)
    setError(null)
    onCleared()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="ai-keys-title">
      <button type="button" className="absolute inset-0 bg-midnight/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSave}
        className="panel pop-in relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl p-0 sm:rounded-3xl"
        style={{ background: '#ffffff' }}
      >
        <div className="border-b border-line px-5 py-4">
          <p className="label-sm text-amber">LLM</p>
          <h2 id="ai-keys-title" className="mt-1 text-xl font-extrabold tracking-tight text-petrol">
            Configure AI keys
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Stored in this browser session. Server env on Vercel remains the fallback when these are empty.
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="label-sm text-muted">LLM_MODEL=</span>
            <input
              type="text"
              value={form.model}
              onChange={(e) => setField('model', e.target.value)}
              className="field mt-1 h-11 w-full font-mono text-sm"
              placeholder="openai/gpt-4o-mini"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="label-sm text-muted">LLM_API_KEY=</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setField('apiKey', e.target.value)}
              className="field mt-1 h-11 w-full font-mono text-sm"
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="label-sm text-muted">LLM_API_BASE=</span>
            <input
              type="url"
              value={form.apiBase}
              onChange={(e) => setField('apiBase', e.target.value)}
              className="field mt-1 h-11 w-full font-mono text-sm"
              placeholder="https://api.studio.nebius.com/v1 (optional)"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          {error && <p className="text-sm font-semibold text-error">{error}</p>}
          {saved && !error && <p className="text-sm font-semibold text-sage">Saved in this session.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-4">
          <button type="button" className="btn btn-ghost" onClick={handleClear}>
            Clear
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn btn-primary">
              Save to session
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
