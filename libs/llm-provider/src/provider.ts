export interface LlmMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface LlmRequest {
  readonly system: string
  readonly messages: readonly LlmMessage[]
  /** Schéma JSON passé au modèle pour contraindre la sortie (mode JSON structuré). */
  readonly jsonSchema?: object
  readonly maxTokens: number
}

export interface LlmUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface LlmResponse {
  readonly text: string
  readonly usage: LlmUsage
}

export interface LlmProvider {
  complete(req: LlmRequest): Promise<LlmResponse>
}

/** Le fournisseur n'a pas pu répondre : timeout, réseau, 5xx après retry, ou réponse illisible. */
export class LlmUnavailableError extends Error {
  override readonly name = 'LlmUnavailableError'
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
  }
}
