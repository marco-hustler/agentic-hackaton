/** Isometric cube mark — one block of the Dividealo diorama. */
export function LogoMark({ className = 'h-9 w-9 shrink-0' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 3 28 10 16 17 4 10Z" fill="#e05a47" />
      <path d="M4 10 16 17v12L4 22Z" fill="#1e293b" />
      <path d="M28 10 16 17v12l12-7Z" fill="#059669" />
    </svg>
  )
}
