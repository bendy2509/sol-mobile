# Audit design — SOL Mobile (Phase 1)

Branche : `design/refonte-ui` · Date : 20 octobre 2026 · Périmètre : présentation uniquement (aucun fichier `db/`, `financialService`, `crypto` ou règle métier modifié).

## Méthode et limites

- **Skills installés (Phase 0)** : `npx skills add expo/skills` (25 skills Expo dans `.claude/skills/`) et `npx skills add anthropics/skills --skill frontend-design`. Le skill `building-native-ui` cité dans la mission n'existe plus sous ce nom : son équivalent actuel est **`expo-native-ui`**. J'ai lu en entier `expo-native-ui/SKILL.md` et `frontend-design/SKILL.md`.
- **Captures** : version web d'Expo (`npx expo start`, `localhost:8081`), compte de démo du seed (`db/sqlite.ts`) et compte Admin par défaut. Elles sont dans `docs/design-audit/before/`, en **360px** pour les 11 écrans demandés, et en **tablette (820px)** pour Login, Admin et Dashboard (mode superviseur).
- **Limites** :
  - Le panneau navigateur a capturé à une échelle instable. Pour certaines captures 360px, j'ai réduit l'affichage (`transform: scale`) sans changer la mise en page. Les bords droits peuvent donc paraître légèrement coupés : ce n'est pas un débordement réel (vérifié, aucun élément ne dépasse 360px).
  - En tablette, Encaissement / Sol / Historique n'ont pas pu être capturés de façon exploitable.
  - Le web n'est pas l'appareil réel : ombres Android, polices système et retour haptique sont à revalider sur téléphone.

## Constats transverses (les plus importants)

1. **Aucune source de vérité visuelle.** `constants/Colors.ts` (`SOL_COLORS`) existe et sert 657 fois, mais on trouve **1 139 couleurs hex codées en dur** (91 teintes distinctes) dans `app/` et `components/`, plus 24 `rgba()`. Résultat : un même rôle prend plusieurs couleurs (le vert « succès » existe en `#059669`, `#10B981`, `#047857`, `#0D9488`…).
2. **L'identité haïtienne est absente de l'app.** La couleur primaire est un sarcelle (`#0D9488`, Tailwind teal). Le bleu `#00209F` et le rouge `#D21034` n'apparaissent **que dans `pdfService.ts`**. L'app et ses reçus ne se ressemblent pas.
3. **Typographie hors contrôle.**
   - 19 tailles différentes, de 8 à 34 px.
   - **406 occurrences sous 14 px** (dont 84 à 8–10 px), illisibles en plein soleil.
   - Les graisses 800/900 sont utilisées 362 fois : tout crie, donc rien ne ressort.
   - 74 libellés en MAJUSCULES espacées.
   - Aucune police embarquée en dehors de `SpaceMono` (template Expo, inutilisée).
   - Les montants n'ont pas de chiffres tabulaires.
4. **Échelles d'espacement et de rayons inexistantes.**
   - 26 valeurs de padding/margin différentes (1, 2, 3, 5, 7, 9, 11, 15…).
   - **30 rayons d'angle différents** (1 à 44).
   - Les ombres mélangent `elevation` 0/2/3/4/6 et 6 `shadowOpacity` différents.
5. **Iconographie artisanale.** `components/Icon.tsx` dessine 25 icônes avec des `View` : formes approximatives, pas de version « remplie ». Elle est mélangée à **21 emojis** (💼 👁 🛡 🔑 🟢 🔴 📄 🎉 ⚠…) et à des caractères (➔ ⌫ ✖). Aucune bibliothèque d'icônes ni `react-native-svg` n'est installée.
6. **Statuts incohérents d'un écran à l'autre.** Le même adhérent (Dieula Saint-Juste) est « EN RETARD » en rouge sur le Dashboard et « EN ATTENTE » en ambre sur sa fiche. Les libellés de l'action de remise varient aussi : « Décaisser » (orange), « Donner la Main » (bleu), « Décaisser » (sarcelle) sur la table SOL.
7. **Pas de mode sombre.** `app.json` force `userInterfaceStyle: "light"`. `Themed.tsx` et `useColorScheme` (template Expo) ne sont branchés nulle part.
8. **En-têtes hétérogènes.** Trois systèmes cohabitent : `Header` maison (onglets, closure, profile), en-tête de pile natif (client, register) et bandeau sombre (admin). Les titres sont tronqués à 360px (« Sol Mache … », « Journal de… »).
9. **Mode superviseur trop discret.** En impersonation, seul un bandeau ambre de 30 px le signale. Le reste de l'écran est identique au mode gestionnaire, ce qui crée un risque d'action faite dans le mauvais rôle.
10. **Tablette** : le Dashboard est bien centré (maxWidth). En revanche, Admin et Login s'étirent ou laissent de grands vides, avec un texte minuscule (10–11 px sur 820 px de large).

## Problèmes par écran

### `(tabs)/index.tsx` — Dashboard
1. Le hero (bloc marine) affiche la cagnotte à **0 HTG** et « Formule : 4 mains × 0 HTG », alors que la table SOL affiche 1 000 HTG pour le même cycle. Le chiffre héros n'est pas fiable visuellement (voir « Anomalies hors design »).
2. Le titre du carnet est tronqué (« Sol Mache … ») et le sous-titre aussi. Le badge « 8 en attente » rouge prend la place du titre et ressemble à une erreur alors que c'est un statut de synchronisation.
3. Il y a quatre tuiles de métriques et quatre raccourcis avant la liste des adhérents, ce qui donne trop de densité au-dessus du pli. La tuile Retards affiche **« NaN main(s) »**.
4. Le bouton flottant « Ajouter un Enfant » recouvre les cartes et leurs boutons (« Main remise », badge de statut), et les libellés des onglets sont coupés en bas.
5. Chaque carte adhérent a deux gros boutons de couleurs différentes (sarcelle, orange, gris) : la liste devient un mur de boutons. Le « Rang #2 » en bleu ciel se confond avec un lien.

### `(tabs)/collect.tsx` — Encaissement
1. Le montant (« 250 HTG ») n'arrive qu'au deuxième écran de défilement, sur fond noir. C'est pourtant l'information héros de l'écran.
2. Les préréglages 1/2/3 mains sont **gris pâle sur gris** quand ils sont désactivés (« Max: 0 »), avec un contraste insuffisant. Désactivé et non sélectionné se ressemblent.
3. Le bouton principal est en bas d'un long défilement et pas fixé dans la zone du pouce. À l'état plafond atteint, c'est un bloc gris ardoise qui ressemble à un bouton cliquable.
4. « Cotisé : 10/4 mains » + « Complété » : le ratio dépasse 100 % sans explication visuelle. Le message du plafond est répété trois fois (badge, pastille, encart vert).
5. Les libellés font 10–11 px en majuscules espacées (« ADHÉRENT EN COURS D'ENCAISSEMENT », « NOMBRE DE MAIN(S) À PAYER »).

### `(tabs)/sol.tsx` — Table de passage
1. Une même action a trois rendus : « Donner la Main » (bleu plein, rang courant), « Décaisser » (sarcelle, rangs suivants) et « Main Touchée » (pastille verte). Aucun code couleur stable.
2. Les noms sont tronqués (« Marie-Carmel Jo… », « Jean-Robert E… ») alors que le bouton occupe 40 % de la largeur.
3. Les mains multiples ne sont pas lisibles : il n'y a ni « 2/3 mains reçues » ni rangs multiples par adhérent.
4. Le hero affiche « CAGNOTTE (PO) », une abréviation obscure, avec le libellé de fréquence sur deux lignes.

### `(tabs)/history.tsx` — Historique
1. Les lignes n'ont ni date ni type visibles, seulement un nom et « +0 HTG ». Impossible de scanner le journal.
2. Les filtres débordent horizontalement (« A… » coupé) sans indice de défilement.
3. Dans le détail de l'opération, Type et Date sont vides et les quatre boutons ont quatre couleurs (bleu, vert, rouge, bleu ciel).
4. « Annuler cette opération » (rouge) et « Contacter l'Admin » ont la même taille : l'action destructrice n'est pas hiérarchisée.

### `client/[id].tsx` — Fiche adhérent
1. Le statut diffère du Dashboard pour le même adhérent (« EN ATTENTE » ambre contre « EN RETARD » rouge). Le badge « SABOTAY » s'affiche sur un membre de SOL.
2. Les libellés passent à la ligne avec leur deux-points orphelin (« Cagnotte d'un tirage / : »). La grille libellé–valeur n'est pas alignée.
3. La rangée d'actions (Encaisser / Modifier / Reçu / ✖) est trop serrée à 360px, et la croix de suppression n'a pas de libellé.
4. Il y a deux blocs de progression (cotisations et mains données) avec des barres de couleurs différentes, alors qu'ils mesurent des choses proches.
5. « Historique des cotisations (0) » s'affiche alors que le total cotisé est de 750 HTG.

### `closure.tsx` — Clôture journalière
1. « -0 HTG » apparaît en rouge, ce qui fait passer un zéro pour une perte.
2. Le champ « Montant réel constaté » a la même taille que le reste. Le montant devrait être énorme, avec un pavé numérique dédié.
3. L'historique vide est un simple texte gris sous le bouton, sans état vide soigné.
4. Le bouton « Valider la Clôture » apparaît avant la saisie, en plein milieu de l'écran plutôt qu'en bas.

### `cycle-management.tsx` — Gestion du cycle
1. La valeur « Fin prévue » est vide et « 0 HTG / Main » est affiché.
2. Les deux options (Conserver / Démarrer à zéro) ont la même icône et le même poids visuel, alors que « Démarrer à zéro » est destructif.
3. L'encart « Action irréversible » ambre est placé avant le choix et n'est pas relié à l'option dangereuse.
4. Un violet (`#7C3AED`) est introduit pour l'historique : c'est une couleur de plus sans rôle sémantique.

### `profile.tsx` — Profil
1. « Zone : 2026-10-20T22:13:54.859Z » : une date ISO s'affiche à la place de la zone.
2. Sept cartes se suivent avec des titres colorés (sarcelle, bleu, violet, rouge) : aucune hiérarchie.
3. Le bouton WhatsApp porte une icône « utilisateur » et Email une icône « partager ».
4. « Zone sensible » et « Se déconnecter » sont deux blocs rouges de même poids.

### `admin.tsx` — Console Super-Admin
1. Le mode superviseur utilise la même couleur primaire sarcelle que le gestionnaire. Seul l'en-tête sombre le distingue.
2. Les 7 boutons d'une carte utilisateur sont colorés au hasard (gris, jaune, violet, bleu, rouge). Les icônes téléphone et WhatsApp sont identiques et sans libellé, et un emoji 🔑 est mélangé aux icônes.
3. Les métriques du haut défilent horizontalement : la 3ᵉ tuile est coupée à 360px.
4. Il y a des contradictions : « ACTIF » sur la carte mais « 0 actifs » dans le compteur, et « 0 enfants » dans la ligne carnet contre « 4 » dans la tuile.
5. En tablette, tout est étiré sur 820px avec des polices de 10–11 px.

### `login.tsx` — Connexion
1. Le pavé numérique maison est soigné, mais il est dissocié du champ actif. En tablette, un énorme vide sépare le formulaire du pavé.
2. Le logo est un « bouclier » dessiné en `View`, générique, sans identité SOL ni haïtienne.
3. Le libellé « CODE PIN PERSONNEL (4 CHIFFRES) » fait 11 px en majuscules. Le badge « ACTIF » est inutile.
4. En cas d'erreur PIN, les cercles et le message passent au rouge `#E11D48`, la même teinte que les retards.

### `register.tsx` — Inscription
1. Le bouton « Continuer » est sarcelle pâle quand il est désactivé, ce qui le rend illisible.
2. Il y a deux pavés PIN (PIN et confirmation) sans indication claire de celui qui est actif.
3. L'en-tête natif « Nouveau Carnet SOL » ne correspond pas au titre « Créer un Compte Gestionnaire ».

## Anomalies hors design constatées (à traiter dans un autre chantier)

Ces points relèvent des données ou de la logique, pas de la présentation. Je ne les corrige pas dans la refonte :

- Version web (`WebSQLiteAdapter`) : `contribution_amount` lu à 0, des transactions sans `type` ni `created_at_local`, et la zone du collecteur lue comme une date. Ça ressemble à un décalage de colonnes dans l'adaptateur web. **À vérifier sur appareil** avant de conclure.
- « NaN main(s) » dans la tuile Retards (index).
- « 10/4 mains » à l'encaissement, à vérifier à l'affichage.

## Dette codée en dur à éliminer

| Catégorie | Constat | Fichiers les plus touchés |
|---|---|---|
| Couleurs hex | 1 139 occurrences, 91 teintes distinctes + 24 `rgba()` | `admin.tsx` (128), `collect.tsx` (106), `client/[id].tsx` (84), `profile.tsx` (80), `history.tsx` (69), `sol.tsx` (64), `MemberCard.tsx` (58), `RenewCycleModal.tsx` (49), `register.tsx` (46) |
| Teintes les plus fréquentes | `#FFFFFF` ×209, `#64748B` ×127, `#94A3B8` ×67, `#CBD5E1` ×48, `#059669` ×46, `#F1F5F9` ×39, `#E2E8F0` ×33, `#F8FAFC` ×32, `#DC2626` ×30, `#1D4ED8` ×27 | — |
| Tailles de police | 19 valeurs (8 → 34) ; 406 occurrences < 14 px | idem |
| Graisses | `900` ×188, `800` ×174, `700` ×83, `600` ×80 | — |
| Rayons | 30 valeurs (1 → 44) | — |
| Espacements | 26 valeurs (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 40, 50, 80, 90) | — |
| Ombres | `elevation` 0/2/3/4/6, `shadowOpacity` 0 → 0.2 | — |
| Feuilles de style | 39 fichiers avec `StyleSheet.create` | — |
| Emojis comme icônes | 21 | `admin.tsx`, `Badge.tsx` |

Commande de suivi (doit atteindre 0 hors `theme/` et `pdfService.ts`) :

```bash
grep -rnoE "#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b" app components --include=*.tsx | wc -l
```

## Notes sur les skills appliqués

Points de `expo-native-ui` que je reprends :
- `useWindowDimensions` plutôt que `Dimensions`.
- `contentInsetAdjustmentBehavior="automatic"`.
- `fontVariant: ['tabular-nums']` pour les compteurs et montants.
- `<Text selectable>` sur les montants et références.
- `boxShadow` (pris en charge par RN 0.86 New Arch) à la place du mélange `elevation`/`shadow*`.
- Quatre états par écran (chargement, erreur, vide, contenu).
- `keyboardShouldPersistTaps`.

Points écartés, car ils contredisent les contraintes :
- **Couleurs dynamiques Material You (`Color.android.dynamic.*`)** : elles changeraient la palette selon le fond d'écran et effaceraient l'identité SOL. Je garde une palette fixe dans `theme/colors.ts`.
- **`expo-glass-effect` et le flou** : trop coûteux pour les Android bas de gamme.

Points de `frontend-design` que je reprends :
- Une seule audace par écran : le montant.
- Pas d'eyebrows en MAJUSCULES partout.
- Pas de cartes identiques avec la même ombre.
- Copie en langage simple et actif.

## Directions artistiques proposées (Phase 2, à choisir)

Planches (Dashboard à 360px + palette, typo, statuts, boutons) : https://claude.ai/artifact/56Dy5h9g22QPhxCyiyd6ar

Les deux directions partagent les mêmes règles :
- les montants sont les héros, en chiffres tabulaires ;
- chaque statut a une couleur, une icône et un libellé ;
- l'action « Encaisser » est fixée en bas de l'écran, dans la zone du pouce ;
- aucun texte sous 14 px ;
- cibles tactiles d'au moins 48 dp ;
- `danger` en orange brique, jamais le rouge du drapeau ;
- un état « Verrouillé » / « Admin seul » est prévu dans les statuts et les boutons.

| | A — Registre (institutionnel épuré) | B — Lakou (chaleureux communautaire) |
|---|---|---|
| Idée | Le carnet officiel numérisé : sobre, aligné, certifié | La cour du marché : on parle des personnes, la cagnotte est un soleil |
| Primaire | `#00209F` (bleu national pur) | `#1F2A7A` (indigo issu du bleu national) |
| Accent | — (le bleu porte tout) | `#F5B000` mangue, réservé à la cagnotte et au bénéficiaire |
| Rouge haïtien `#D21034` | Liseré bicolore sous l'en-tête (comme les PDF) | Logo uniquement |
| Statuts | succès `#0B6E47`, avance `#0F6B66`, à encaisser `#8A5300`, retard `#B83A0B` | succès `#1F7A4D`, avance `#3949AB`, à encaisser `#50536B` (neutre), retard `#B23A14` |
| Fonds | `#F4F5F8` / surfaces blanches, filets fins | `#F1F2F9` / cartes blanches très arrondies |
| Sombre | `#0E1322` / `#171E31`, primaire `#8EA0FF` | `#12132A` / `#1C1E3C`, primaire `#A9B3FF`, cagnotte `#FFC93D` |
| Typo (embarquée, `expo-font`) | Public Sans | Figtree |
| Liste adhérents | Lignes de registre : rang, nom, statut, montant aligné à droite | Cartes avec pastille d'initiales colorée selon le statut et action directe sur les retards |
| Élément signature | Bandeau cagnotte bleu + barre de tours segmentée | Jetons de mains (remise ✓ / en cours / à venir) dans la carte mangue |

## Prochaine étape

**Aucun code de refonte ne sera écrit avant le choix du Product Owner** (A, B, ou un mélange précis).
