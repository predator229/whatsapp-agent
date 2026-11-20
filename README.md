# whatsapp-agent

Agent conversationnel WhatsApp pour commerçants (pilote au Bénin). Contexte produit : `CLAUDE.md`.

## Monorepo Nx (moteur, sans app pour l'instant)

- `libs/domain` : schémas Zod (profil commerçant, catalogue, négociation, livraison, conversation, commande), export CSV/JSON. Fixture de démo : `@wa/domain/testing`.
- `libs/engine` : moteur déterministe (machine à états, négociation, garde-fou anti-hallucination).
- `libs/llm-provider` : interface `LlmProvider`, `MockProvider`, client OpenAI-compatible.
- `tools/demo-chat` : banc de test local branché sur Ollama (`npm run chat`, écoute sur 127.0.0.1).
- `tools/spike` : mesure du taux de JSON valide (voir son README).

Commandes : `npm run typecheck`, `npx vitest run`.

Pas encore construit (prérequis avant production, plan 3) : webhook WhatsApp avec vérification `X-Hub-Signature-256` et `hub.verify_token`, dédoublonnage par `wamid`, persistance, rate limit par client, politique de rétention RGPD.

## Landing statique

Page « coming soon » servie sur https://agent.cybersds.fr : `index.html`, `styles.css`, `app.js`, `logo.png`, `fonts/` (polices auto-hébergées), `legal/` (mentions, confidentialité, conditions). Pas de build.

Aperçu : `python3 -m http.server 8080`
