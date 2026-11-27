type EmptyPlusLotProps = {
  onCreate: () => void
}

export function EmptyPlusLot({ onCreate }: EmptyPlusLotProps) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="group flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-ink/20 bg-card/60 px-12 py-10 text-center shadow-sm transition hover:border-accent hover:bg-card"
    >
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-on-accent text-6xl font-light leading-none transition group-hover:scale-105">
        +
      </span>
      <div>
        <p className="text-lg font-medium text-ink">Create your first process</p>
        <p className="mt-1 text-sm text-ink2">
          A house will appear here for every split you start.
        </p>
      </div>
    </button>
  )
}
