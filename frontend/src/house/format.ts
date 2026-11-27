const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function formatEur(value: number) {
  return eur.format(Math.round(value))
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 50
}

/** Third-person verb, except for "You": verb("You", "pays", "pay"). */
export function verb(name: string, third: string, base: string) {
  return name === 'You' ? base : third
}
