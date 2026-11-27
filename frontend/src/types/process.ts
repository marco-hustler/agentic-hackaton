/** Frontend process types. API uses snake_case; client maps to these. */

export type ProcessKind = 'separation' | 'inheritance' | 'other'

export type ProcessStatus =
  | 'draft'
  | 'collecting'
  | 'ready'
  | 'resolved'
  | 'closed'

export type ProcessSummary = {
  id: string
  title: string
  kind: ProcessKind
  status: ProcessStatus
  participantEmails: string[]
  createdAt?: string | null
  updatedAt?: string | null
}

export type ProcessCreatePayload = {
  kind: ProcessKind
  title?: string | null
  participantEmails?: string[]
}

export type AccountInfo = {
  id: string
  name: string
  email: string
  initials: string
}
