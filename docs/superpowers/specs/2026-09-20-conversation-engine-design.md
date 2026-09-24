# Spec 2 — Moteur de conversation

Date : 2026-09-20. Statut : validé en brainstorming. Dépend de la spec 1 (`MerchantProfile`).

## Objectif

Un moteur qui, pour un commerçant donné, reçoit un message client et produit une réponse dans le style du commerçant, **strictement bornée au catalogue**, négocie dans les bornes définies, construit une commande et notifie le commerçant. Canal-agnostique : web chat et CLI maintenant, WhatsApp plus tard.

## Non-objectifs v1

- Paiement Mobile Money (v2). La commande se conclut par fiche au commerçant, paiement à la livraison ou hors bot.
- Ingestion Facebook, capture de style depuis historique (spec 3).
- Images entrantes (photo envoyée par le client) : réponse fixe « envoie-moi le nom du produit ».
- Groupes, audio.

## Contraintes reprises du CLAUDE.md

- §3.5 : le LLM ne peut jamais énoncer un prix, un stock ou un délai qui ne vienne pas du catalogue. Traité en architecture (§ Garde-fou), pas en prompt.
- §8.6 : compteur de réponses par commerçant, plafond par palier, longueur de réponse bridée.
- Stack : Node + TypeScript, NX, Firebase, Docker. Aucun SDK fournisseur LLM dans le moteur.

## Approche retenue : B

Classifieur d'intention (LLM, sortie JSON contrainte) → machine à états déterministe (code) → rédaction (LLM, à partir de faits validés) → garde-fou (code). Le LLM décide *quoi* le client veut, le code décide *ce qui est vrai et permis*, le LLM met en mots, le code vérifie.

## Architecture

```
libs/domain        schémas (spec 1) + ConversationState + Order
libs/llm-provider  interface LlmProvider, impl OpenAiCompatibleProvider, MockProvider
libs/engine        pipeline, intent, state machine, negotiation, composer, guardrail, counter
libs/channels      Inbound/Outbound message, adaptateurs web + cli
apps/api           Node : HTTP + Firestore (state, profils, commandes, compteurs)
apps/backoffice    Angular : formulaire catalogue, écran « tester mon bot »
apps/cli           exécuteur de scénarios YAML, éval live
```

### Pipeline par message (`engine.handle(input) → output`)

Entrée : `{ merchantId, customerId, text, receivedAt }` + `MerchantProfile` + `ConversationState` (chargés par l'appelant). Sortie : `{ replyText, newState, events[] }`. Le moteur est **pur** : pas d'I/O, pas d'horloge, pas d'aléatoire hors provider. Toute persistance est dans `apps/api`.

1. **Quota** : si `counter.repliesThisMonth ≥ limits.maxRepliesPerMonth`, réponse sûre « je reviens vers vous » + event `QuotaExceeded`. Pas d'appel LLM.
2. **Intent** (appel LLM n°1, JSON contraint) : prompt court avec la liste des produits (id, nom, alias) et les 6 derniers tours. Schéma de sortie :
   ```
   {
     intent: "greet" | "browse" | "ask_product" | "ask_price" | "negotiate" | "add_to_cart"
           | "remove_from_cart" | "give_address" | "confirm_order" | "cancel" | "off_topic" | "unclear",
     productRefs: { productId, variantId?, quantity? }[],
     counterOffer?: number,
     address?: string,
     zone?: string
   }
   ```
   Validation Zod. JSON invalide → un retry avec le message d'erreur, puis `intent: "unclear"`.
3. **Machine à états** (code pur). États : `idle → browsing → negotiating → cart → address → confirmed | cancelled`. Chaque transition produit des **faits** : produits trouvés, prix courant, offre acceptée ou refusée, total panier, frais de zone, délai. Hors catalogue → fait `OutOfScope`. Stock insuffisant → fait `OutOfStock`.
4. **Négociation** (code pur, `negotiation.ts`) : `evaluate(policy, product, counterOffer, round) → { accepted, offer }`. Descend les `steps` un par un, jamais sous `floorPrice`, refus ferme après `maxRounds`. Remise quantité appliquée avant tout.
5. **Composer** (appel LLM n°2) : prompt = `StyleProfile` + faits du tour + consigne de longueur (`maxReplyChars`) + interdiction d'inventer. Le prompt liste explicitement les **nombres autorisés** du tour.
6. **Garde-fou** (code pur) : extrait tous les nombres du texte produit, les compare à l'ensemble autorisé (prix cités, offre courante, quantités, total, frais, délai). Nombre inconnu → régénération une fois avec le nombre fautif signalé. Second échec → réponse sûre prédéfinie du style du commerçant (`fallbacks` dans le profil, ex. « je vérifie et je te redis ») + event `GuardrailTripped` (notification commerçant). Longueur > `maxReplyChars` → troncature à la dernière phrase complète.
7. **Compteur** : `repliesThisMonth + 1`, event `ReplySent` avec tokens in/out rapportés par le provider (base du suivi de coût §8.6).
8. **Commande** : sur `confirmed`, event `OrderConfirmed` avec `Order` : lignes, total, adresse, zone, frais, mode de paiement choisi, `customerId`. `apps/api` persiste et notifie le commerçant (v1 : entrée dans le back-office + email ; WhatsApp template en v2).

### ConversationState

```
{
  merchantId, customerId,
  phase: "idle" | "browsing" | "negotiating" | "cart" | "address" | "confirmed" | "cancelled",
  turns: { role: "customer" | "bot", text, at }[]   // 12 derniers, fenêtre glissante
  cart: { productId, variantId?, quantity, unitPrice, agreedPrice }[],
  negotiation: Record<productId, { round: number, currentOffer: number }>,
  address?: { text, zone? },
  lastActivityAt
}
```

État expiré après 72 h sans message : retour à `idle`, panier conservé 7 jours.

### LlmProvider

```
interface LlmProvider {
  complete(req: { system: string, messages: Msg[], jsonSchema?: object, maxTokens: number })
    : Promise<{ text: string, usage: { inputTokens, outputTokens } }>
}
```

- `OpenAiCompatibleProvider` : `baseUrl`, `model`, `apiKey?`. Couvre Ollama (`/v1/chat/completions`, `response_format` JSON), vLLM, Groq, Mistral. Timeout 20 s, 1 retry sur 5xx.
- `MockProvider` : répond depuis un script de scénario ; utilisé par tous les tests unitaires.
- Config par env : `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`. Dev : Ollama local, `qwen2.5:14b-instruct-q4_K_M`. Prod : à fixer par config sur le VPS, même code.

### Canaux

```
Inbound  { channel: "web" | "cli" | "whatsapp", merchantId, customerId, text, receivedAt }
Outbound { channel, customerId, text }
```

Adaptateur web : endpoint `POST /merchants/:id/test-chat` dans `apps/api`, consommé par l'écran « tester mon bot ». Adaptateur CLI : lit un scénario YAML, joue les tours, affiche le diff attendu/obtenu. WhatsApp : adaptateur à écrire quand la phase Meta est débloquée, aucune modification du moteur.

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| Provider injoignable / timeout | Réponse sûre prédéfinie, event `ProviderDown`, pas de décompte du quota |
| JSON d'intention invalide ×2 | `intent: unclear` → le bot demande de reformuler |
| Garde-fou ×2 | Réponse sûre + notification commerçant |
| Profil sans produit actif | Le bot répond que la boutique met à jour son catalogue, notification commerçant |
| Message vide / média | Réponse fixe demandant le texte |

Aucune erreur n'est avalée : chaque cas produit un event journalisé dans `apps/api`.

## Tests

**Unitaires (déterministes, `MockProvider`)** — couverture cible 80 % sur `libs/engine`, 90 % sur `negotiation.ts` et `guardrail.ts`.
- Négociation : table de cas (plancher, paliers, remise quantité, maxRounds).
- Garde-fou : nombres autorisés / interdits, formats (12 000, 12000, 12k), régénération, fallback.
- Machine à états : chaque transition, expiration, stock insuffisant, hors catalogue.
- Scénarios YAML dans `libs/engine/scenarios/*.yaml` : tours client, réponses scriptées du mock pour les deux appels LLM, assertions sur `phase`, `cart`, prix cité, events. Une dizaine de scénarios : achat simple, négociation acceptée, négociation refusée au plancher, vrac, sur commande avec acompte, hors catalogue, quota atteint, adresse zone inconnue, annulation, reprise après expiration.

**Éval live (à la demande, `apps/cli eval`)** — 20 à 30 scénarios contre le vrai modèle. Rapporte : taux de JSON d'intention valide au premier essai, taux de déclenchement du garde-fou, longueur moyenne, tokens moyens par réponse. Pas de pass/fail, un rapport. Sert à choisir le modèle et à surveiller les régressions de prompt.

**Spike préalable (étape 1 du plan, 30 min, jetable)** : 50 messages clients en français parlé béninois → taux de JSON valide sur Qwen2.5-14B Q4 via Ollama. Sous 90 %, tester Mistral Small ou passer à un modèle plus gros. Le résultat fixe `LLM_MODEL` par défaut.

## Coût par réponse (rappel phase 0)

Deux appels LLM par message : intention (~600 tokens in, ~60 out) et rédaction (~1 200 tokens in, ~100 out). Sur API au token type Haiku : ≈ 0,002 $/réponse. En local : 0 marginal. Le compteur d'events `ReplySent` rend ce chiffre mesurable par commerçant.

## Ordre d'implémentation

1. Spike modèle (jetable).
2. `libs/domain` (spec 1).
3. `libs/llm-provider` avec `MockProvider` puis `OpenAiCompatibleProvider`.
4. `libs/engine` : négociation → garde-fou → machine à états → intent → composer → pipeline. TDD à chaque étape.
5. `apps/cli` scénarios + éval.
6. `apps/api` : persistance Firestore, endpoint test-chat.
7. `apps/backoffice` : formulaire catalogue + écran « tester mon bot ».
