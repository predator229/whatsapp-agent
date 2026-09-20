# Spike modèle (jetable)

Date : 2026-09-20. Machine : MacBook Pro M4 Pro 24 Go, Ollama 0.34.

50 messages clients (`messages.json`), français parlé béninois, couvrant les 12 intentions du schéma
(négociation avec chiffre XOF, adresse, confirmation, annulation, hors catalogue, ambigu, etc.). Depuis
le round 2, chaque message porte une intention attendue (`expected`) et la précision est mesurée
automatiquement sur les 50, pas seulement à la main sur 10.

## Round 1 — prompt placeholder du brief

Le prompt système du brief ne définissait explicitement que `off_topic` ("produit absent → off_topic").
C'était un point de départ, pas le prompt réel du moteur — gardé ici comme référence, remplacé au round 2.

| Modèle | JSON valide | Intentions fausses /10 (relu à la main) | Intentions fausses /50 (gold complet) | Latence moyenne |
|---|---|---|---|---|
| qwen2.5:14b-instruct-q4_K_M | 50/50 (100%) | 6/10 | 23/50 (46%) | 2937 ms |
| mistral-small:24b-instruct-2501-q4_K_M | 50/50 (100%) | 5/10 | 21/50 (42%) | 4901 ms |

Aucun des deux modèles ne passait la règle (JSON valide ≥ 90 % **et** ≤ 2 intentions fausses sur 10).
Le JSON était déjà valide à 100 % ; la classification était mauvaise pour les deux, avec une erreur
systématique partagée (donc liée au prompt, pas au modèle) : les 6 messages d'adresse et 2/3 des
salutations classés `off_topic`, plusieurs négociations à chiffre explicite mal classées. qwen inventait
en plus des mutations de panier sur de simples questions produit/prix (5/50 cas : `confirm_order` ou
`remove_from_cart` sur "Vous avez le riz...?", "C'est quoi le prix du gari", "Envoie moi la photo...",
etc.) ; mistral ne le faisait qu'une fois sur 50. Retenu à l'époque, à défaut : mistral-small.
Détail conservé dans `last-run.round1-qwen2.5.json` et `last-run.round1-mistral.json`.

**Conclusion round 1 :** l'accuracy ~55% ne disait rien sur la viabilité d'un modèle local — le prompt
testé n'était pas réaliste. D'où le round 2.

## Round 2 — prompt système réaliste + few-shot

`tools/spike/intent-rate.mjs` a été réécrit avec :
- une définition et une frontière par intention (ex. `negotiate` = chiffre proposé plus bas ou "fais un
  prix"/"dernier prix"/"trop cher" ; `ask_price` = demande le prix sans en proposer un ; `add_to_cart` =
  décision d'achat explicite, pas une question ; `give_address` = lieu/quartier/repère de livraison ;
  `confirm_order` = valide une commande déjà discutée ; `off_topic` = produit hors liste ou hors sujet,
  horaires d'ouverture inclus dans ce spike) ;
- des règles strictes (productRefs limité aux productId listés, quantity/counterOffer seulement si
  énoncés, jamais d'adresse inventée) ;
- 8 exemples few-shot (paires user/assistant avant le message à classer, phrases différentes de
  `messages.json`) couvrant negotiate+chiffre, add_to_cart+quantité, give_address, confirm_order,
  greet, off_topic (produit inconnu), ask_price, cancel.

Schéma de sortie (zod + JSON schema Ollama) **inchangé**. `messages.json` est maintenant
`[{ text, expected }]` ; la précision et les erreurs dangereuses sont calculées automatiquement sur
les 50 messages. Relecture manuelle sur 10 cas gardée comme test de cohérence (voir rapport de tâche).

| Modèle | JSON valide | Intention correcte /50 | Erreurs dangereuses (add_to_cart/confirm_order faux, adresse ou prix inventés) | Latence moyenne |
|---|---|---|---|---|
| qwen2.5:14b-instruct-q4_K_M | 50/50 (100%) | 46/50 (92%) | 1 | 2134 ms |
| mistral-small:24b-instruct-2501-q4_K_M | 50/50 (100%) | 45/50 (90%) | 0 | 3857 ms |

Règle de décision (même règle, appliquée au lot de 50) : JSON valide ≥ 90 % **et** ≤ 20 % d'intentions
fausses sur 50 (soit ≤ 10/50).

**Les deux modèles passent la règle** : qwen2.5 (100% valide, 8% faux) et mistral-small (100% valide,
10% faux) sont tous les deux sous la barre des 20% d'erreur. C'est le prompt réaliste, pas le modèle,
qui faisait échouer le round 1.

Détail des erreurs restantes (aucune n'est une répétition du problème systématique du round 1) :
- qwen2.5 (4 erreurs) : "Est-ce que vous livrez à Calavi" → `give_address` avec `address: "Calavi"` au
  lieu de `unclear` (seule erreur dangereuse : adresse extraite d'une question sur une zone de livraison,
  pas d'une adresse donnée) ; "Mon frère a dit que tu fais des réductions" → `negotiate` au lieu de
  `unclear` ; "Le pagne wax... il reste encore ?" → `ask_product` au lieu de `browse` ; "Fais-moi un prix
  pour la tenue sur mesure" → `negotiate` au lieu de `ask_price` (frontière `ask_price`/`negotiate`
  discutable ici, "fais-moi un prix" n'énonce pas de chiffre).
- mistral-small (5 erreurs, 0 dangereuse) : la même question sur Calavi → `off_topic` (safe mais faux) ;
  "Tu peux coudre une tenue..." → `unclear` au lieu de `ask_product` ; deux confusions `browse`/
  `ask_product` (mêmes messages que qwen) ; la même confusion `ask_price`/`negotiate` sur la tenue sur
  mesure.

Retenu : **`qwen2.5:14b-instruct-q4_K_M`**, comme valeur par défaut de `LLM_MODEL` pour le plan 2 —
plus rapide (2134 ms vs 3857 ms, ~45% plus rapide) et légèrement plus précis (92% vs 90%), pour un
unique défaut dangereux (une extraction d'adresse sur une question de zone de livraison, pas une
mutation de panier) qu'un exemple few-shot supplémentaire peut corriger. C'est aussi le défaut déjà en
dur dans le script, donc aucun changement de configuration n'est nécessaire pour le plan 2.
`mistral-small:24b-instruct-2501-q4_K_M` reste une alternative valable si l'équipe préfère éliminer
tout risque d'adresse halluciné (0 erreur dangereuse) au prix de la latence.

Fichiers de résultats conservés pour preuve :
- `last-run.json` — dernière exécution (round 2, qwen2.5, modèle retenu).
- `last-run.round2-qwen2.5.json` / `last-run.round2-mistral.json` — round 2, les deux modèles, prompt réaliste.
- `last-run.round1-qwen2.5.json` / `last-run.round1-mistral.json` — round 1, prompt placeholder du brief (référence historique).

Relancer :
```bash
node tools/spike/intent-rate.mjs                                                   # qwen2.5 (retenu, défaut du script)
LLM_MODEL=mistral-small:24b-instruct-2501-q4_K_M node tools/spike/intent-rate.mjs   # mistral (alternative)
```
