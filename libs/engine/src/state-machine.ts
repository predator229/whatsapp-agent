import {
  appendTurn,
  expireConversation,
  type ConversationState,
  type MerchantProfile,
} from '@wa/domain'
import { activeProducts } from './catalogue'
import { collectAllowedNumbers, collectAllowedPhrases } from './allowed'
import type { Intent } from './intent-schema'
import type { TurnFact } from './facts'
import type { EngineEvent } from './events'
import type { Ctx, Draft } from './handlers/shared'
import { handleAskDelivery, handleAskProduct, handleBrowse, handleGreet } from './handlers/browsing'
import { handleAddToCart, handleRemoveFromCart } from './handlers/cart'
import { handleNegotiate } from './handlers/negotiate'
import {
  handleCancel,
  handleConfirmOrder,
  handleGiveAddress,
  handleOffTopic,
  handleUnclear,
} from './handlers/order'

export interface TransitionInput {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly intent: Intent
  /** Message brut du client : journalisé dans l'état et rapporté dans `IntentUnclear`. */
  readonly text: string
  readonly receivedAt: string
}

export interface TransitionResult {
  readonly state: ConversationState
  readonly facts: TurnFact[]
  readonly events: EngineEvent[]
  /** Nombres que le composer a le droit de citer ce tour-ci. */
  readonly allowedNumbers: number[]
  readonly allowedPhrases: string[]
}

const HANDLERS: Record<Intent['intent'], (ctx: Ctx) => Draft> = {
  greet: handleGreet,
  browse: handleBrowse,
  ask_product: handleAskProduct,
  ask_price: handleAskProduct,
  ask_delivery: handleAskDelivery,
  negotiate: handleNegotiate,
  add_to_cart: handleAddToCart,
  remove_from_cart: handleRemoveFromCart,
  give_address: handleGiveAddress,
  confirm_order: handleConfirmOrder,
  cancel: handleCancel,
  off_topic: handleOffTopic,
  unclear: handleUnclear,
}

/** Sans catalogue il n'y a rien de vrai à dire — sauf annuler, qui reste toujours possible. */
function catalogueEmptyDraft(state: ConversationState, receivedAt: string): Draft {
  return {
    state,
    facts: [{ kind: 'CatalogueEmpty' }],
    events: [{ type: 'CatalogueEmpty', at: receivedAt, merchantId: state.merchantId }],
  }
}

/**
 * Le cœur déterministe : ce qui est vrai et permis. Fonction pure — pas d'horloge,
 * pas d'aléatoire, aucun argument muté. Le tour bot est ajouté par le pipeline.
 */
export function transition(input: TransitionInput): TransitionResult {
  const { profile, intent, text, receivedAt } = input
  const state = appendTurn(expireConversation(input.state, receivedAt), {
    role: 'customer',
    text,
    at: receivedAt,
  })

  const draft: Draft =
    activeProducts(profile).length === 0 && intent.intent !== 'cancel'
      ? catalogueEmptyDraft(state, receivedAt)
      : HANDLERS[intent.intent]({ profile, state, intent, text, receivedAt })

  return {
    state: draft.state,
    facts: draft.facts,
    events: draft.events,
    allowedNumbers: collectAllowedNumbers(draft.facts),
    allowedPhrases: collectAllowedPhrases(draft.facts),
  }
}
