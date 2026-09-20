# Spike modèle (jetable)

Date : 2026-09-20. Machine : MacBook Pro M4 Pro 24 Go, Ollama 0.34.

50 messages clients (`messages.json`), français parlé béninois, couvrant les 12 intentions du schéma
(négociation avec chiffre XOF, adresse, confirmation, annulation, hors catalogue, ambigu, etc.).

| Modèle | JSON valide | Intentions fausses /10 (échantillon relu à la main) | Intentions fausses /50 (comptées contre le gold de tous les messages) | Latence moyenne |
|---|---|---|---|---|
| qwen2.5:14b-instruct-q4_K_M | 50/50 (100%) | 6/10 | 23/50 (46%) | 2937 ms |
| mistral-small:24b-instruct-2501-q4_K_M | 50/50 (100%) | 5/10 | 21/50 (42%) | 4901 ms |

Règle de décision (brief) : JSON valide ≥ 90 % **et** ≤ 2 intentions fausses sur 10 → modèle retenu.

**Aucun des deux modèles ne passe la règle.** Le JSON est valide à 100 % dans les deux cas (le mode
JSON forcé d'Ollama fonctionne bien), mais la classification d'intention est mauvaise pour les deux :
5 à 6 erreurs sur 10 à la relecture manuelle, confirmées par un comptage exhaustif sur les 50 messages
(gold labels définis au moment de l'écriture de `messages.json`) : 23/50 pour qwen, 21/50 pour mistral.

Erreur systématique partagée par les deux modèles (donc **pas liée au choix du modèle**, mais au prompt
système, qui ne définit explicitement que `off_topic` — « produit absent → off_topic ») :
- Les 6 messages d'adresse (`give_address`) sont classés `off_topic` par les deux modèles (6/6).
- 2 des 3 messages de salutation (`greet`) sont classés `off_topic`.
- Plusieurs messages de négociation avec chiffre explicite sont mal classés (`ask_price`, `browse`,
  `confirm_order`, `add_to_cart` au lieu de `negotiate`).
- Le message ambigu « Bon on verra » est classé `off_topic` par les deux (cas limite : `unclear`
  serait plus juste, mais ce n'est pas non plus franchement faux — traité comme faux par prudence).

Différence notable entre les deux modèles, qui motive le choix ci-dessous : **qwen invente des
mutations de panier sur de simples questions produit/prix** — « Vous avez le riz en sac de 25kg ? »
→ `confirm_order`, « C'est quoi le prix du kg de gari » → `remove_from_cart`, « Envoie moi la photo de
la chaussure noire » → `remove_from_cart`, « Vous avez encore la chaussure noire en taille 40 ? » →
`remove_from_cart`, « Le pagne wax... il reste encore ? » → `confirm_order` (5/50 cas). Mistral ne fait
ce type d'erreur dangereuse qu'une seule fois sur 50. Pour un bot qui peut agir sur le panier réel d'un
client, cette différence pèse plus que l'écart de latence.

Retenu (à défaut, aucun des deux n'atteignant le seuil) : `mistral-small:24b-instruct-2501-q4_K_M`,
comme valeur par défaut de `LLM_MODEL` dans le plan 2 — malgré une latence moyenne ~1.7x plus élevée
que qwen, parce qu'il produit nettement moins d'hallucinations de mutation de panier (1/50 vs 5/50),
l'erreur la plus coûteuse pour un agent e-commerce. Le script lui-même garde `qwen2.5:14b-instruct-q4_K_M`
comme défaut en dur (code du spike inchangé, verbatim) ; c'est au plan 2 de fixer
`LLM_MODEL=mistral-small:24b-instruct-2501-q4_K_M`.

**Correctif important pour le plan 2 : ce n'est pas un problème de retry.** Le brief anticipait un
« retry systématique » comme filet de sécurité si les deux modèles échouaient. Mais le JSON est déjà
valide à 100 % dans les deux cas, donc il n'y a rien à retenter côté format — et la classification est
faite à `temperature: 0` (déterministe) : rejouer le même appel renverrait la même intention fausse.
Le vrai correctif est un travail de prompt : définir explicitement chaque intention (pas seulement
`off_topic`), ajouter des exemples few-shot pour `give_address` (mots-clés de quartier : Fidjrossè,
Calavi, Akpakpa, Godomey, Cadjèhoun...), `greet` et `negotiate` (présence d'un chiffre + verbe de
marchandage), avant d'envisager un retry.

Fichiers de résultats conservés pour preuve :
- `last-run.json` — dernière exécution (mistral-small, modèle retenu).
- `last-run.qwen2.5.json` — exécution qwen2.5, conservée pour la comparaison.

Relancer :
```bash
node tools/spike/intent-rate.mjs                                              # qwen2.5 (défaut du script)
LLM_MODEL=mistral-small:24b-instruct-2501-q4_K_M node tools/spike/intent-rate.mjs   # mistral (retenu)
```
