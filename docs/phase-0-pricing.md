# Phase 0 — Tarification Meta vérifiée et seuil de rentabilité

Date de vérification : 2026-09-20. Sources officielles Meta uniquement, sauf mention SECONDAIRE.
Fichiers tarifaires téléchargés depuis les liens CDN de la page pricing et relus ligne par ligne.

## 1. Réponse aux deux questions de la phase 0

### Q1 — Facturation au token « Meta Business Agent » : NON applicable à un LLM hébergé par moi

Source : https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages

> "Any non-template message that is not powered by Meta Business Agent is a service message."
> "Service messages – As today, these can be powered by a person, like a customer service representative, or by a 3rd-party AI solution."
> "Effective August 1, 2026, Meta will charge all businesses for Meta Business Agent messages" — "One global rate of $2.00 USD per 1M tokens."

Conclusion : la facturation au token ne concerne que l'IA hébergée par Meta (Meta Business Agent Platform).
Un texte généré par mon LLM et envoyé via l'endpoint `messages` du Cloud API est un **service message**, facturé **par message**, pas au token.
Le risque « critique » n°1 du CLAUDE.md est levé.

Réserve : la politique « AI Providers » (https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers, mise à jour 2026-05-12) vise les entreprises dont l'IA est la fonctionnalité « primaire » du service, à la discrétion de Meta, et ne s'applique aujourd'hui qu'aux numéros brésiliens (+55). Un outil de vente pour commerçant où l'IA est un moyen, pas le produit vendu au consommateur, n'est pas dans la cible décrite. Pas de test opérationnel précis dans les docs.

### Q2 — Tarif service messages post 1er octobre 2026, Rest of Africa : 0,0040 $/message

Source : fichier tarifaire Oct 2026 (xlsx) lié depuis https://developers.facebook.com/docs/whatsapp/pricing, ligne brute :

```
Rest of Africa | USD | 0.0225 | 0.004 | 0.004 | n/a | 0.004
(Market | Currency | Marketing | Utility | Authentication | Auth-International | Service)
```

> "Effective October 1, 2026, Meta will charge on a per-message basis for service messages, consistent with how Meta charges for template messages."
> "Volume tiers: None. Meta does not offer volume tiers for service messages."

Bénin est nommément listé dans le bucket « Rest of Africa » sur la page pricing. Nigeria, Égypte, Afrique du Sud et (dès Oct 2026) Maroc sont des marchés à part, non concernés.

## 2. Grille tarifaire Meta complète — Rest of Africa (USD/message)

| Catégorie | Aujourd'hui (depuis 1er juil. 2026) | Dès 1er oct. 2026 |
|---|---|---|
| Marketing (template) | 0,0225 | 0,0225 |
| Utility (template, hors fenêtre 24 h) | 0,0040 | 0,0040 |
| Utility dans la fenêtre 24 h | gratuit | 0,0040 |
| Authentication | 0,0040 | 0,0040 |
| Service (réponse libre dans fenêtre 24 h) | gratuit | **0,0040** |
| Messages entrants client | gratuit | gratuit |
| Free Entry Point (pub Click-to-WhatsApp, 72 h) | gratuit | gratuit, inchangé |

Paliers de volume utility : −5 % au-delà de 100 000 msg/mois. Non atteignable à mon échelle, ignoré.

## 2 bis. Free tier mensuel de 1 000 service messages : présent dans un rendu, absent dans un autre

Rendu complet de https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ (104 Ko, via proxy US, 2026-09-20) :

> "(NEW) Effective October 1, 2026 – Meta will introduce a monthly free tier for service messages."
> "Each business phone number has one shared free tier of 1,000 delivered service messages per month. [...] Meta charges for service messages after the free tier has been used."
> "Unused service messages in the free tier do not roll over."
> "If you do not have a payment method for your WhatsApp Business account, Meta will deliver service messages within the shared free tier but not deliver them after the free tier has been used."

Le même rendu contient la table des `pricing_type` webhook (`free_customer_service` → `regular` après épuisement), donc contenu structuré, pas une rumeur.
Le rendu servi à mon IP (37 Ko) et WebFetch ne contiennent pas ce paragraphe. Meta sert visiblement deux versions de la page.
Page non-template (rendu complet) :

> "For any Solution Provider or directly-integrated businesses that does not have a payment method on file by September 30, 2026, Meta will stop delivering service messages as of when they become charged on October 1, 2026."

**Impact si confirmé** : les 1 000 premières réponses du bot par numéro et par mois coûtent 0 $ côté Meta. Le poste Meta devient marginal pour un petit commerçant. **Action immédiate : ajouter un moyen de paiement sur le WABA de ma mère avant le 30 septembre 2026.**

## 3. Hypothèses du CLAUDE.md fausses ou périmées

| Hypothèse §5 | Réalité vérifiée |
|---|---|
| Tarif utility Rest of Africa ≈ 0,0076 $ | **0,0040 $**. Presque deux fois moins. |
| Facturation au token depuis 1er août 2026 = plus gros risque | Vraie, mais **ne s'applique qu'à Meta Business Agent**. Mon LLM = service message, par message. Risque levé. |
| 3 000 réponses ≈ 22 $ « au-delà du prix de vente » | Côté Meta seul : 3 000 × 0,004 = **12 $**. Le vrai poste lourd est la marge BSP, pas Meta (voir §4). |
| Palier « 500 conversations incluses » | L'unité facturée par Meta est le **message envoyé**, pas la conversation. Les paliers doivent être en réponses du bot. |
| §4.3 Option A « via BSP, je facture un prix unique » | Confirmé possible, mais **pas en Tech Provider seul** (voir §5). |
| « 1 000 service messages gratuits/mois » | **Présent dans le rendu complet de la page pricing** (fetch via proxy US, 2026-09-20), absent du rendu servi à mon IP roumaine et à WebFetch. Voir §2 bis. Probablement réel, à confirmer dans Business Manager. |

## 4. Coût réel par réponse du bot (dès 1er oct. 2026)

Trois lignes de coût par réponse, pas une.

| Poste | USD/réponse | Source |
|---|---|---|
| Meta service message | 0,0040 | rate card Oct 2026 |
| Marge BSP (Twilio, frais plateforme) | 0,0050 | SECONDAIRE twilio.com/en-us/whatsapp/pricing |
| Inférence LLM (Claude Haiku 4.5, ~2 500 tokens in dont majorité en cache, ~80 tokens out) | ≈ 0,0010 à 0,0030 | tarifs Anthropic : 1 $/M in, 5 $/M out, cache read 0,10 $/M (convention 10 % de l'input, à confirmer) |
| **Total avec Twilio** | **≈ 0,011** | |
| **Total sans marge BSP** (partenaire pass-through ou statut Solution Partner) | **≈ 0,006** | |

Coûts annexes par commande : 1 template utility vers le commerçant (fiche de commande) = 0,004 $. Négligeable.
Infobip ne publie pas de marge chiffrée. Estimations tierces 30 à 55 %, non vérifiées.

Hypothèse de change : 1 € ≈ 1,15 $. À réactualiser.

### Scénarios mensuels (USD)

| Réponses bot / mois | Meta | BSP Twilio | LLM | Total avec Twilio | Total sans marge BSP |
|---|---|---|---|---|---|
| 1 000 | 4 | 5 | 2 | **11** | **6** |
| 2 500 | 10 | 12,5 | 5 | **27,5** | **15** |
| 3 000 | 12 | 15 | 6 | **33** | **18** |
| 5 000 | 20 | 25 | 10 | **55** | **30** |

Avant le 1er octobre (Meta = 0), retirer la colonne Meta.
Si le free tier de 1 000 messages (§2 bis) est confirmé, la colonne Meta devient : 1 000 → 0 ; 2 500 → 6 ; 3 000 → 8 ; 5 000 → 16.

Lecture : à 20 €/mois (≈ 23 $), un commerçant à 2 500 réponses est **déficitaire avec Twilio**, rentable à ~35 % de marge brute sans marge BSP.
**La marge BSP est la variable décisive, pas Meta ni le LLM.** Un BSP à 0,002 $/msg ou moins change tout.

## 5. Point bloquant révélé par la vérification : Tech Provider ne peut pas payer les messages

Source : https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview

> "Unlike Solution Partners, however, Tech Providers do not have credit lines. Instead, clients onboarded by Tech Providers must provide their own payment method after onboarding is complete. Meta will then bill these clients for API usage, and the Tech Provider will bill for other services."

Conséquence : en Tech Provider seul, **le commerçant doit ajouter une carte bancaire chez Meta**. Contradiction frontale avec la contrainte §3.3 (une seule facture) et §3.1 (zéro friction).

Deux sorties officielles :

1. **Multi-Partner Solution** avec un Solution Partner qui partage sa ligne de crédit. Mécanisme toujours actif dans les docs.
   > "if you are a Tech Provider, you may wish to create a multi-partner solution with a Solution Partner who can share their credit line with clients onboarded via your joint solution."
   Le Solution Partner devient « Bill To Party », il me facture, je facture le commerçant.
2. **Passer par un BSP en marque blanche** (Twilio, 360dialog, etc.) où les numéros sont sur leur infrastructure et je paie leur facture. C'est l'option A du CLAUDE.md. La marge BSP s'applique.

Dans les deux cas, c'est le partenaire qui absorbe la carte bancaire, pas le commerçant.
Différence clé : en Multi-Partner Solution, **je reste le Tech Provider qui fait tourner Embedded Signup**, donc je garde la main sur la coexistence (§3.2, le commerçant garde son numéro). En marque blanche BSP, l'onboarding passe par leur Embedded Signup et la coexistence dépend de ce qu'ils supportent. Action : comparer 3 partenaires sur la marge par message pour Rest of Africa (Twilio 0,005 $ connu, 360dialog et Infobip à obtenir).

## 6. Autres points vérifiés (Embedded Signup, coexistence)

- **Embedded Signup v2 déprécié le 15 octobre 2026.** Cibler **v4** directement. Source : .../embedded-signup/versions.
- **Coexistence** (numéro de l'app WhatsApp Business gardé + Cloud API) : fonctionnalité officielle « Onboard WhatsApp Business app users ». App version ≥ 2.24.17, sync historique 180 jours, doit finir sous 24 h. Limites : 20 msg/s fixe, pas de groupes, pas d'appels, pas d'outil catalogue/commandes natif WhatsApp, pas de messages éphémères.
  **Aucune liste officielle de pays.** Bénin ni confirmé ni exclu. **À tester sur le numéro de ma mère avant tout.**
- **Plafond d'onboarding** : 10 nouveaux clients / 7 jours glissants par défaut, 200 après Business Verification + App Review + Access Verification.
- **App Review** : ~24 h annoncé. Business Verification : aucun délai officiel trouvé. Pages du Help Center sur les documents acceptés non lisibles (JS), acceptation IFU/RCCM non confirmée en ligne.
- **Messaging limit** de 250 : lecture de la doc (s'applique aux conversations initiées par l'entreprise via templates, pas aux réponses dans la fenêtre 24 h). Page messaging-limits non relue en direct ce jour, à confirmer.
- Partner-led Business Verification est réservée aux Solution Partners, pas aux Tech Providers.

## 7. Paliers proposés (à figer après choix du BSP)

Unité : **réponses du bot**, pas conversations. Longueur des réponses bridée (levier LLM, et lisibilité mobile).

| Palier | Prix | Réponses incluses | Coût estimé sans marge BSP | Coût avec Twilio |
|---|---|---|---|---|
| Essentiel | 15 € | 1 000 | ≈ 5 € | ≈ 10 € |
| Standard | 25 € | 2 500 | ≈ 13 € | ≈ 24 € |
| Dépassement | 0,015 €/réponse | | coût ≈ 0,005 à 0,010 € | |

Pas d'illimité. Compteur par commerçant, alerte à 80 %, coupure douce à 100 % (le bot répond « je reviens vers vous » et notifie le commerçant).

Le palier Standard n'est viable qu'avec une marge BSP ≤ 0,002 $/msg. Sinon monter à 30 € ou réduire à 2 000 réponses.

## 8. Actions issues de la phase 0

0. **Avant le 30 septembre 2026** : moyen de paiement sur le WABA de ma mère (sinon arrêt des service messages au 1er octobre après le free tier).
1. Obtenir les marges par message de 3 BSP pour Rest of Africa (Twilio connu, 360dialog, Infobip). Décider : Multi-Partner Solution ou BSP marque blanche.
2. Vérifier la coexistence sur le numéro WhatsApp Business de ma mère (pilote §7 étape 1). Si indisponible au Bénin, tout le modèle « il garde son numéro » tombe.
3. Lancer Business Verification avec l'entité de ma mère. Nom légal, adresse, numéro d'enregistrement exactement comme au registre.
4. Figer les paliers avec le chiffre BSP réel.
5. Recalculer à chaque trimestre (1er janv., avr., juil., oct.).

## Sources

- https://developers.facebook.com/docs/whatsapp/pricing (page + fichiers CSV/XLSX liés, actuel et Oct 2026)
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers
- https://www.whatsapp.com/legal/business-solution-terms (modifié 2026-03-06)
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/share-and-revoke-credit-lines
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- https://developers.facebook.com/docs/whatsapp/messaging-limits/
- SECONDAIRE : https://www.twilio.com/en-us/whatsapp/pricing
- Tarifs Anthropic : table du skill claude-api (cache 2026-06-24), à confirmer sur anthropic.com/pricing
