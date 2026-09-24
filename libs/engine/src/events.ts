import type { Order } from '@wa/domain'

/** Ce que `apps/api` journalise et notifie (plan 3). */
export type EngineEvent =
  | { type: 'ReplySent'; at: string; inputTokens: number; outputTokens: number }
  | { type: 'QuotaExceeded'; at: string; merchantId: string }
  | { type: 'GuardrailTripped'; at: string; offending: number[]; draft: string }
  | { type: 'ProviderDown'; at: string; stage: 'intent' | 'composer'; message: string }
  | { type: 'IntentUnclear'; at: string; text: string }
  | { type: 'CatalogueEmpty'; at: string; merchantId: string }
  | { type: 'OrderConfirmed'; at: string; order: Order }
