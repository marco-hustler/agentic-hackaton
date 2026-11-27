/** Process types for the SimCity world — stubs until the BE process API lands. */

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
}
