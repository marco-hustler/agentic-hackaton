/** Browser-session overrides for LLM + idealo (env on the server stays the fallback). */

const LLM_KEY = 'dividealo.creds.llm'
const IDEALO_KEY = 'dividealo.creds.idealo'

export type LlmCredentials = {
  model: string
  apiKey: string
  apiBase: string
}

export type IdealoCredentials = {
  /** Bearer access token (or pasted `.idealo_tokens.json` access_token). */
  accessToken: string
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadLlmCredentials(): LlmCredentials {
  const parsed = readJson<Partial<LlmCredentials>>(LLM_KEY)
  return {
    model: typeof parsed?.model === 'string' ? parsed.model : '',
    apiKey: typeof parsed?.apiKey === 'string' ? parsed.apiKey : '',
    apiBase: typeof parsed?.apiBase === 'string' ? parsed.apiBase : '',
  }
}

export function saveLlmCredentials(creds: LlmCredentials) {
  sessionStorage.setItem(
    LLM_KEY,
    JSON.stringify({
      model: creds.model.trim(),
      apiKey: creds.apiKey.trim(),
      apiBase: creds.apiBase.trim(),
    }),
  )
}

export function clearLlmCredentials() {
  try {
    sessionStorage.removeItem(LLM_KEY)
  } catch {
    /* ignore */
  }
}

export function llmConfiguredInSession(): boolean {
  const c = loadLlmCredentials()
  return Boolean(c.model.trim() && c.apiKey.trim())
}

export function loadIdealoCredentials(): IdealoCredentials | null {
  const parsed = readJson<Partial<IdealoCredentials>>(IDEALO_KEY)
  if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) return null
  return { accessToken: parsed.accessToken.trim() }
}

export function saveIdealoCredentials(creds: IdealoCredentials) {
  sessionStorage.setItem(IDEALO_KEY, JSON.stringify({ accessToken: creds.accessToken.trim() }))
}

export function clearIdealoCredentials() {
  try {
    sessionStorage.removeItem(IDEALO_KEY)
  } catch {
    /* ignore */
  }
}

export function idealoConfiguredInSession(): boolean {
  return Boolean(loadIdealoCredentials()?.accessToken)
}

/** Accept a raw token, a callback URL with ?code=, or `.idealo_tokens.json` text. */
export function parseIdealoTokenInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        tokens?: { access_token?: string }
        access_token?: string
      }
      const fromNested = parsed.tokens?.access_token
      const fromTop = parsed.access_token
      const token = (typeof fromNested === 'string' && fromNested) || (typeof fromTop === 'string' && fromTop) || ''
      return token.trim() || null
    } catch {
      return null
    }
  }

  try {
    const url = new URL(trimmed)
    const code = url.searchParams.get('code')
    if (code?.trim()) return code.trim()
  } catch {
    /* not a URL — treat as bare token */
  }

  return trimmed
}

export function clearAllCredentials() {
  clearLlmCredentials()
  clearIdealoCredentials()
}

/** Headers the API client attaches so the server prefers session creds over env. */
export function credentialHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const llm = loadLlmCredentials()
  if (llm.model) headers['X-LLM-Model'] = llm.model
  if (llm.apiKey) headers['X-LLM-Api-Key'] = llm.apiKey
  if (llm.apiBase) headers['X-LLM-Api-Base'] = llm.apiBase
  const idealo = loadIdealoCredentials()
  if (idealo?.accessToken) headers['X-Idealo-Access-Token'] = idealo.accessToken
  return headers
}
