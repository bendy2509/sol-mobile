# Audit design — SOL Mobile (v2, après suppression de l'admin)

Date : 21 octobre 2026 · branche `design/refonte-ui` · captures dans `docs/design-audit/v2/before/` (360px, et tablette pour Connexion, Encaisser et Accueil).

L'app sort de la refonte « Registre » et de la passe « épure ». Elle est propre (plus de couleur codée en dur, mode sombre, composants partagés). Cet audit la confronte au **nouveau brief**, plus exigeant : proportions sobres, navigation par onglets avec Réglages, bottom sheets, taille de texte réglable, i18n et application 100 % autonome.

## 1. Problèmes transverses

| Sujet | Constat | Brief |
|---|---|---|
| Proportions | Montant héros à **40**, boutons principaux à **56**, touches du pavé à **64**, titres d'écran entre 18 et 22, légendes à 14. | Montant 28 à 32, un seul héros par écran ; boutons de 44 à 48 ; sous-titres 13. |
| Navigation | 4 onglets (Accueil · Encaisser · Cycle · Historique). Profil, sécurité, **clôture de caisse** et **gestion du cycle** ne s'atteignent que par l'icône Profil de l'en-tête. | 4 à 5 onglets dont **Réglages**. Écrans rares en stack depuis leur endroit logique. |
| Encaisser | Depuis l'onglet : onglet → « Changer » → choisir l'adhérent → Encaisser → PIN, soit **4 taps** avant le PIN. Depuis une ligne de l'Accueil : 2 taps. | 3 taps maximum, actions rapides en **bottom sheet**. |
| Actions secondaires | Empilées en boutons : fiche adhérent (Modifier, Fiche / reçu, Supprimer), détail d'opération (Reçu, WhatsApp, Annuler). | Menu ⋯ ou bottom sheet. |
| Réglages | Inexistants. Le thème clair / sombre ne se choisit que sur la page de développement, la préférence n'est pas enregistrée, la taille du texte ne se règle pas, il n'y a pas de langue. | Écran Réglages en 7 sections, préférences persistées et appliquées sans redémarrer. |
| Composants | Pas de `BottomSheet`, `SegmentedControl` ni `SettingsRow`. Interrupteurs `Switch` de React Native posés à la main. | Ces trois composants sont à créer. |
| Identité | Bleu `#00209F` et rouge `#D21034` partout (logo, liseré de chaque en-tête, bandeau héros). | Accents de marque seulement : l'interface ne doit pas dépendre d'eux. |
| États | Chargements en spinner plein écran, aucun squelette. Les succès passent par des `Alert` système. | Squelettes et confirmation discrète, avec retour haptique. |
| Hors-ligne et typo | Public Sans est embarquée (5 graisses) et les icônes sont des SVG locaux : c'est conforme. | — |

## 2. Écran par écran

- **Connexion** : propre, mais la carte du champ téléphone et du champ PIN plus le pavé occupent tout l'écran. Les touches font 64. Il y a trois liens d'aide sous le bouton.
- **Accueil** : un héros à 40, trois indicateurs, deux raccourcis, puis recherche, filtres et liste. Le registre est bon. Le bandeau répète le nom du carnet présent dans l'en-tête, et le sous-titre est tronqué (« 0 HTG/main · 4 enfants · Fin… »).
- **Encaisser** : la carte adhérent, le héros et le sélecteur de mains sont empilés. Les préréglages en « Max : 0 » sont verrouillés et bruyants une fois le cycle complet. Le bouton du pied fait 56.
- **Sol** : clair, mais héros à 40 et bouton plein large pour le tour en cours.
- **Fiche adhérent** : la bande de chiffres est bien. Viennent ensuite trois cartes (Cotisations, Remise, Détails du cycle, qui répète des chiffres) et trois boutons d'action empilés en bas, dont Supprimer.
- **Historique** : une recherche, cinq puces de filtre et une liste. Le type « Opération » à 0 HTG vient des données de démo web.
- **Clôture de caisse** : des tuiles dans une carte, un champ montant, le statut, puis l'historique. C'est correct, mais l'écran ne s'atteint que via le Profil.
- **Gestion du cycle** : des tuiles imbriquées dans la carte « Cycle actuel », deux options en cartes-radio, puis l'historique.
- **Profil** : l'identité en grande carte, puis un tableau « Mon carnet actif » qui répète l'en-tête, des liens et la déconnexion. Il doit fusionner dans Réglages.
- **Sécurité, Restauration, Code PIN oublié, Code de récupération** : écrans nouveaux et fonctionnels, mais le style est provisoire (Switch natif, puces pour l'auto-verrouillage).
- **Écrans secondaires** (inscription, configuration, nouvel adhérent, remise, scan, diagnostic, synchronisation, 404) : déjà migrés, mais avec les anciennes proportions (boutons de 56).

## 3. Codé en dur dans `app/` et `components/` (hors `theme/` et `pdfService.ts`)

| Type | Nombre | Où |
|---|---|---|
| Couleurs hex | 2 | `app/+html.tsx` (coquille web, fond avant hydratation) |
| `fontSize` numérique | 1 | `app/_layout.tsx:88` (titre de l'en-tête de stack) |
| `fontWeight` | 0 | — |
| Espacements numériques | 0 | — |
| `rgba()` | 0 | — |
| Emojis | 2 | textes d'alerte de `closure.tsx` (📄) et `cycle-management.tsx` (🎉) |

Échelle typographique actuelle (`theme/typography.ts`) : amountHero 40 · amountLarge 28 · amount 18 · title 22 · heading 18 · subheading 16 · body 15 · label / caption 14 · numpad 26. Aucun facteur de taille.

## 4. Navigation actuelle

```
Onglets : Accueil · Encaisser · Cycle · Historique
En-tête (tous les onglets) : [sync → modale] [scan → /scan] [profil → /profile]
Accueil ─ ligne adhérent → fiche ─ bouton rond → Encaisser (adhérent choisi)
        ─ bandeau « Remettre » → modale remise → PIN
        ─ Nouvel enfant → /client/new · Rapport PDF
Profil ─ Cycles clôturés → /cycle-management · Clôtures de caisse → /closure
       ─ Modifier mon PIN · Sécurité et sauvegarde → /security · Déconnexion
Connexion ─ Code PIN oublié → /recover-pin · Restaurer → /restore-backup · Inscription
```

## 5. Nouvelle architecture proposée

```
Onglets (5) : Accueil · Encaisser · Sol · Historique · Réglages

Accueil      cagnotte (seul héros) · 3 indicateurs · accès rapides [Clôturer la journée] [Nouvel adhérent]
             liste des adhérents ; tap ligne → fiche (stack) ; bouton rond → bottom sheet Encaisser
Encaisser    recherche immédiate + liste « À encaisser » en tête ; tap adhérent → bottom sheet
             (mains − / +, montant, [Encaisser] → PIN) : 3 taps
Sol          rangs et mains reçues (« 2/3 mains reçues ») ; ⋯ → Gestion du cycle (stack) ; Remettre → sheet
Historique   recherche + SegmentedControl (Tout · Cotisations · Remises · Annulations) ;
             tap → bottom sheet détail ; ⋯ → Reçu PDF, WhatsApp, Annuler (PIN + motif)
Réglages     Apparence · Profil · Sécurité · Carnet et reçus · Langue · Données · À propos
             + Clôtures de caisse et Cycles clôturés (section Carnet)
Fiche adhérent (stack)  ⋯ → Modifier, Fiche / reçu, Supprimer ; un seul bouton principal : Encaisser
En-tête      titre natif de stack ou d'onglet ; seul l'indicateur de synchronisation reste à droite ;
             le scan passe dans Encaisser (icône de la barre de recherche)
```

Taps des actions fréquentes :

| Action | Taps |
|---|---|
| Encaisser depuis l'Accueil | bouton rond → Encaisser → PIN, soit **2 taps + PIN** |
| Encaisser depuis l'onglet | onglet → adhérent → Encaisser, soit **3 taps + PIN** |
| Remettre la main | Accueil → Remettre → Valider, soit **2 taps + PIN** |
| Clôturer la journée | Accueil → accès rapide, soit **1 tap** jusqu'à l'écran |

## 6. Deux directions artistiques

Elles sont présentées visuellement à côté de cet audit (palette et Accueil à 360px).

**A — « Registre sobre »** (évolution de l'actuelle)
Public Sans. L'encre `#141B2D` sur une surface froide `#F4F5F8`, une seule couleur d'action : le bleu `#1F3FB8`, éclairci par rapport au bleu du drapeau pour l'interface. Le bleu et le rouge de marque ne restent que sur le logo et les reçus. Des lignes de registre, les montants en chiffres tabulaires à 30, des boutons de 48. Impression : banque publique moderne, institutionnelle, calme.

**B — « Caisse claire »**
IBM Plex Sans, plus technique, avec des chiffres très nets. Un fond `#F6F7F5` presque blanc et légèrement minéral, l'encre `#18211D`, et pour seule couleur d'action le vert `#0F6E52`, qui évoque la monnaie et le « payé ». Les statuts gardent leurs couleurs propres, mais le retard passe en ambre brûlé pour ne jamais se confondre avec l'action. Le bandeau héros devient une simple ligne sur fond blanc (pas de bloc coloré) : c'est le chiffre qui fait le héros. Impression : outil de caisse précis, neutre et international (utilisable hors d'Haïti).

Points communs, quelle que soit la direction : 5 onglets avec Réglages, des bottom sheets pour encaisser, remettre et voir le détail, des menus ⋯ pour les actions secondaires, une taille de texte Petite / Normale / Grande, et le mode sombre.
