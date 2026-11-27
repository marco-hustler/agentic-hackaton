import type { AccountInfo } from '../types/process'

const SESSION_KEY = 'dividealo.auth.session'

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user'
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Demo User'
}

export function accountFromCredentials(email: string): AccountInfo {
  const normalized = email.trim().toLowerCase()
  const name = nameFromEmail(normalized)
  return {
    id: `local:${normalized}`,
    name,
    email: normalized,
    initials: initialsFrom(name),
  }
}

export function loadSession(): AccountInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AccountInfo>
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.initials !== 'string'
    ) {
      return null
    }
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      initials: parsed.initials,
    }
  } catch {
    return null
  }
}

export function saveSession(account: AccountInfo) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(account))
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** Fake sign-in: any plausible email + non-empty password. */
export async function fakeSignIn(email: string, password: string): Promise<AccountInfo> {
  const trimmedEmail = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error('Enter a valid email')
  }
  if (!password.trim()) {
    throw new Error('Enter a password')
  }
  // Tiny delay so the gate feels intentional in demos.
  await new Promise((r) => setTimeout(r, 420))
  const account = accountFromCredentials(trimmedEmail)
  saveSession(account)
  return account
}
