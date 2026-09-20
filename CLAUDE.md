# CLAUDE.md — Projet « Agent WhatsApp pour commerçants (Bénin) »

> Fichier de contexte destiné à un agent de code (Claude Code / agent local).
> Lis-le entièrement avant toute action. Ne code rien tant que la phase 0 n'est pas tranchée.

---

## 1. Qui je suis et d'où je pars

- Développeur full-stack : Angular, NX monorepo, RxJS, TypeScript, Firebase, Docker.
- J'ai déjà intégré l'API WhatsApp Business sur d'autres projets.
- Je vis à Cluj (Roumanie). Je ne suis pas citoyen roumain, permis de séjour temporaire.
- Le marché visé est au Bénin. **Je gère tout à distance**, je rentre très rarement.
- Je n'ai **pas** d'entité légale à mon nom. Ma tentative de vérification Meta Business en tant que personne physique sous une marque a échoué : « impossible de vérifier les informations de cette entreprise ». C'est structurel, pas une erreur de dossier — Meta vérifie des entités inscrites dans un registre officiel consultable.
- **Levier disponible** : ma mère possède une entreprise réellement enregistrée au Bénin (IFU + RCCM). C'est cette entité qui servira à la vérification Meta.

**Objectif personnel** : un revenu récurrent où mon temps humain est minimal, le travail continu étant assuré par des agents. Ambition réaliste de départ : quelques dizaines d'euros par mois, puis croissance. Je n'ai aucune illusion sur le « 100 % passif ».

---

## 2. Le produit

Un **agent conversationnel LLM branché sur le WhatsApp du commerçant**, qui :

- connaît son catalogue réel (produits, prix, stock, photos) ;
- répond dans **son style à elle/lui** — le client doit avoir l'impression de parler au commerçant ;
- sait négocier un peu (au Bénin, on négocie) dans des bornes définies par le commerçant ;
- prend la commande, collecte l'adresse de livraison, déclenche le paiement Mobile Money ;
- notifie le commerçant avec une fiche de commande propre.

### Ce que ce n'est PAS

- Pas un menu à choix numérotés (« Tapez 1 pour le catalogue »).
- Pas une FAQ scriptée.
- Pas un simple lien « catalogue web + bouton WhatsApp pré-rempli » — ça existe déjà partout, ça ne vaut pas 20 €/mois.

### La promesse commerciale

**« Tu récupères les ventes que tu perds la nuit et quand tu es occupé. »**
Pas « j'ai une super techno ». Un commerçant qui reçoit 60 messages/jour en rate la moitié, répond 3 h plus tard, le client est parti ailleurs. C'est une douleur ressentie quotidiennement.

### Le déclencheur de vente

La **démo pré-remplie** : scraper la page Facebook du commerçant, construire son catalogue, lui envoyer un numéro à tester qui contient déjà ses produits, ses prix, ses photos. Il teste, il voit sa propre boutique fonctionner. Ça convertit infiniment mieux qu'un argumentaire.

---

## 3. Contraintes non négociables (leçons déjà payées)

### 3.1 La friction d'onboarding tue le deal
Personne au Bénin ne va créer un compte Meta Business, monter une app développeur et soumettre des documents pour tester un outil à 20 €. **Le commerçant ne doit avoir presque rien à faire.** Si la procédure d'entrée dépasse quelques clics, le produit est mort.

### 3.2 Le commerçant doit garder son numéro
Le marché est méfiant. Si le numéro WhatsApp est le mien, le commerçant sait que je peux couper le service à tout moment et qu'il perd ses clients. **Il doit garder SON numéro, SON compte, SON historique.** S'il part, il part avec tout. Ça change complètement la psychologie de la vente.

### 3.3 Une seule facture, la mienne
Impossible de dire à un commerçant : « tu paies mon abonnement ET tes crédits Meta ». Il refusera. **Il paie un prix unique, tout compris.** J'absorbe le coût des messages dans mon prix.

### 3.4 Un export permanent
Catalogue et commandes téléchargeables à tout moment par le commerçant. À annoncer dès le premier contact — ça désarme la méfiance.

### 3.5 Le LLM ne doit jamais inventer
Ni prix, ni disponibilité, ni délai de livraison. Réponses **strictement bornées au catalogue réel**. Une seule hallucination sur un prix et le commerçant perd confiance définitivement.

---

## 4. Architecture retenue

### 4.1 Statut Meta : Tech Provider

- Créer une app Meta avec le cas d'usage WhatsApp + portefeuille business connecté.
- **Vérification business via l'entité de ma mère** (IFU + RCCM béninois).
- Délai typique annoncé : 3 à 4 semaines.
- En Tech Provider, je fournis le logiciel ; je n'ai pas de ligne de crédit Meta.

### 4.2 Onboarding client : Embedded Signup

- Le commerçant clique un bouton dans mon interface, se connecte avec son Facebook, et son numéro arrive dans mon portefeuille de prestataire en quelques clics.
- **À configurer pour qu'il utilise son compte WhatsApp Business existant et son numéro actuel**, avec historique synchronisé entre l'app et l'API.
- ⚠️ Détails de version à revérifier dans la doc Meta actuelle (versions d'Embedded Signup, dates de dépréciation, plafond de clients onboardés par semaine glissante par solution). Ne pas coder contre ma mémoire, **lire la doc officielle**.

### 4.3 Ligne de crédit : deux options, les deux conservées

**Option A — via un Solution Partner** (Twilio, Infobip, ou autre BSP)
Le partenaire a la ligne de crédit. Je facture un prix unique au commerçant et j'absorbe le coût des messages.

**Option B — multi-partner solution**
Je reste Tech Provider mais je m'associe à un Solution Partner qui partage sa ligne de crédit.

Dans les deux cas : **le commerçant ne voit qu'une facture, la mienne.**

### 4.4 Responsabilité

Chaque commerçant a son propre compte. Ma responsabilité porte sur **mon outil**, pas sur leurs comptes. (Rejeté explicitement : héberger tous les numéros clients sous le compte de ma mère — un signalement spam et tout le portefeuille tombe d'un coup.)

---

## 5. Modèle économique — vérifié le 2026-09-20

Détail, sources et tableaux : `docs/phase-0-pricing.md`. Résumé :

- Messages entrants gratuits, sans plafond. Bénin = « Rest of Africa ».
- **Service message (réponse libre dans la fenêtre 24 h, y compris générée par mon LLM) : 0,0040 $/message dès le 1er octobre 2026.** Gratuit jusque-là. Pas de palier de volume.
- Utility 0,0040 $, marketing 0,0225 $, entrée gratuite 72 h via pub Click-to-WhatsApp inchangée.
- **Free tier probable : 1 000 service messages gratuits / numéro / mois dès le 1er octobre 2026** (présent dans un rendu de la page pricing, absent d'un autre, à confirmer dans Business Manager). Moyen de paiement obligatoire avant le 30 septembre 2026.
- **Facturation au token « Meta Business Agent » (2 $/M tokens depuis le 1er août 2026) : ne concerne que l'IA hébergée par Meta.** Mon LLM via Cloud API = service message. Risque levé.
- **Vrai poste lourd : la marge BSP** (Twilio ≈ 0,005 $/msg, plus que Meta). Coût total par réponse ≈ 0,011 $ avec Twilio, ≈ 0,006 $ sans marge BSP.
- **Tech Provider seul ne peut pas payer les messages des clients** (doc Meta : le client doit mettre sa propre carte). Une facture unique exige une Multi-Partner Solution avec un Solution Partner, ou un BSP en marque blanche.

Conséquences tarifaires :
- Pas de forfait illimité. Paliers en **réponses du bot**, pas en conversations.
- Proposition à figer après choix du BSP : 15 €/1 000 réponses, 25 €/2 500 réponses, dépassement 0,015 €/réponse.
- Brider la longueur des réponses (coût LLM et lisibilité).

## 6. Phase 0 — FAITE le 2026-09-20

Les deux points sont tranchés (voir §5 et `docs/phase-0-pricing.md`). Restent avant tout code :

1. Obtenir la marge par message de 3 BSP (Twilio, 360dialog, Infobip) pour Rest of Africa et choisir : Multi-Partner Solution ou BSP marque blanche.
2. Tester la coexistence (numéro WhatsApp Business existant + Cloud API) sur le numéro de ma mère. Aucune liste officielle de pays, Bénin non confirmé.
3. Lancer Business Verification avec l'entité de ma mère.
4. Embedded Signup : cibler **v4**, v2 déprécié le 15 octobre 2026.

---

## 7. Séquence de déploiement

**Étape 1 — Pilote gratuit sur l'activité de ma mère.**
Accès total, aucune pression commerciale, itération tranquille. Vérifier d'abord que son activité reçoit assez de messages WhatsApp pour que le bot ait du sens.

**Étape 2 — Mesurer.**
Conversations traitées, commandes captées hors horaires d'ouverture, temps de réponse moyen avant/après. Ce sont mes preuves chiffrées.

**Étape 3 — Démarcher des commerces déjà déclarés.**
Pharmacies, restaurants, écoles privées, boutiques avec pignon sur rue. Ils ont les papiers, le budget, et le volume de messages qui fait mal. Marché plus petit mais réellement adressable.

**Étape 4 — Bouche-à-oreille.**
Trois commerçants satisfaits dans un marché, et les autres viennent d'eux-mêmes. C'est le vrai canal de distribution local.

> Note : les vendeuses informelles sans entreprise enregistrée (ex. une amie tricoteuse) **ne sont pas adressables** via l'API WhatsApp officielle. Pas de contournement propre. Elles ne font pas partie de la cible initiale.

---

## 8. Chantiers techniques

### 8.1 Ingestion du catalogue
Scraper la page Facebook / le catalogue WhatsApp Business existant → produits structurés (nom, prix, variantes, stock, photos). Doit tourner sans intervention pour produire une démo pré-remplie.

### 8.2 Capture du style du commerçant
C'est le cœur de la démo. Le bot doit parler comme lui. Sources possibles : historique de conversations fourni volontairement, publications Facebook, quelques exemples de réponses types.

### 8.3 Bornage du LLM
Récupération stricte depuis le catalogue. Refus explicite de répondre hors périmètre. Bornes de négociation paramétrables par le commerçant (prix plancher par produit).

### 8.4 Commande et paiement
Panier → adresse → Mobile Money → notification commerçant. Intégration des opérateurs locaux à étudier.

### 8.5 Back-office commerçant
Catalogue éditable, historique des commandes, export complet, statistiques simples (messages traités, commandes captées).

### 8.6 Contrôle des coûts
Compteur de conversations par client, plafond par palier, limitation de la longueur des réponses, alerte de dépassement.

---

## 9. Ce que j'attends de toi, agent

1. **Commence par la phase 0.** Cherche et vérifie dans la documentation officielle Meta les deux points de tarification. Ne me donne pas des chiffres de mémoire — les tarifs bougent chaque trimestre (1er janvier, 1er avril, 1er juillet, 1er octobre).
2. **Ne code rien avant** que le modèle économique soit chiffré.
3. Quand tu proposes une architecture, **justifie les coûts d'infrastructure** — chaque euro fixe mensuel mange ma marge.
4. Signale-moi immédiatement tout point où une hypothèse du document ci-dessus est fausse ou périmée. Ce fichier est un état de réflexion, pas une vérité.
5. Privilégie l'automatisation par agents sur tout ce qui est répétitif (ingestion catalogue, génération de démos, surveillance des coûts, support de niveau 1). Mon temps humain est la ressource la plus rare.

### Stack par défaut (sauf meilleure proposition argumentée)
Angular + NX pour le front / back-office, Node + TypeScript côté serveur, Firebase, Docker. Rester dans ce que je maîtrise déjà — je ne veux pas apprendre une stack en même temps que je monte un business.

---

## 10. Risques identifiés

| Risque | Gravité | Mitigation |
|---|---|---|
| Tarification Meta Business Agent au token | Levé (2026-09-20) | Ne s'applique qu'à l'IA hébergée par Meta, pas à mon LLM |
| Marge BSP > 0,002 $/msg rend le palier 25 € déficitaire | **Critique** | Comparer 3 BSP avant de figer les prix |
| Coexistence indisponible au Bénin | **Critique** | Tester sur le numéro de ma mère avant tout code |
| Vérification Meta de l'entité refusée à nouveau | **Critique** | Vérifier que nom légal, adresse et numéro d'enregistrement correspondent **exactement** au registre |
| Hallucination du LLM sur un prix | Élevée | Bornage strict au catalogue, tests systématiques |
| Signalement spam d'un compte client | Moyenne | Comptes séparés par client (architecture déjà retenue) |
| Méfiance du marché | Moyenne | Numéro du client, export permanent, bouche-à-oreille |
| Changement de tarif Meta trimestriel | Moyenne | Paliers révisables, pas d'engagement annuel à prix fixe |