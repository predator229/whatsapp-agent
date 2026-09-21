import type { LlmProvider, LlmRequest, LlmResponse } from './provider'

export type MockScript = string | LlmResponse | Error | ((req: LlmRequest) => LlmResponse)

const NO_USAGE = { inputTokens: 0, outputTokens: 0 } as const

/** Fournisseur scripté pour les tests : consomme une entrée de script par appel. */
export class MockProvider implements LlmProvider {
  readonly calls: LlmRequest[] = []
  private readonly script: MockScript[]

  constructor(script: readonly MockScript[] = []) {
    this.script = [...script]
  }

  pushScript(...entries: MockScript[]): void {
    this.script.push(...entries)
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req)
    const entry = this.script.shift()
    if (entry === undefined) {
      throw new Error(`MockProvider script exhausted after ${this.calls.length} call(s)`)
    }
    if (entry instanceof Error) throw entry
    if (typeof entry === 'string') return { text: entry, usage: NO_USAGE }
    if (typeof entry === 'function') return entry(req)
    return entry
  }
}
