type AppHeaderProps = {
  apiOk: boolean | null
}

export function AppHeader({ apiOk }: AppHeaderProps) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-4 p-4 sm:p-6">
      <div className="pointer-events-auto rounded-xl bg-card/90 border border-line px-4 py-3 shadow-sm backdrop-blur">
        <h1 className="text-lg font-medium leading-none text-ink">CleanBreak</h1>
        <p className="mt-1 text-xs text-ink2">Your processes live in this world</p>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        <a
          href="/legacy"
          className="rounded-lg bg-card/90 border border-line px-3 py-2 text-xs font-medium text-ink2 hover:text-ink hover:bg-card"
          title="Open the previous Split Board UI"
        >
          Legacy demo
        </a>
        <span
          className={`rounded-lg border px-3 py-2 font-mono text-xs ${
            apiOk === null
              ? 'border-line bg-card/90 text-muted'
              : apiOk
                ? 'border-line bg-card/90 text-pos'
                : 'border-line bg-card/90 text-neg'
          }`}
        >
          API {apiOk === null ? '…' : apiOk ? 'ok' : 'down'}
        </span>
      </div>
    </header>
  )
}
