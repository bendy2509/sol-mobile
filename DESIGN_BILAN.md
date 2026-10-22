# Bilan de la refonte — SOL Mobile (Direction A « Registre »)

Branche `design/refonte-ui` · 34 commits, de `13503bc` (audit) à `e9b63f0` (thème automatique) · livrable 5 du brief.

## En bref

L'application a désormais **une seule source de vérité visuelle** (`theme/` + `components/ui/`). Elle est migrée **écran par écran**, sans toucher à la logique. Elle suit le mode clair ou sombre du téléphone.

| Indicateur | Avant | Après |
|---|---|---|
| Couleurs hex codées en dur dans `app/` + `components/` | 1 139 (91 teintes) | **2**, dans `app/+html.tsx` (coquille web, hors périmètre) |
| `rgba()` codés en dur | 24 | 0 |
| Icônes | 25 dessinées avec des `View`, plus 21 emojis | 36 icônes SVG locales au trait (`components/ui/Icon.tsx`) |
| Police | Police système, graisses au hasard | Public Sans embarquée (5 graisses), chiffres tabulaires |
| Mode sombre | Inexistant (`userInterfaceStyle: "light"`) | Palette sombre complète, `automatic` + splash sombre |
| Composants hérités | 8 composants + 7 restes du modèle Expo + `SOL_COLORS` | Supprimés (−2 147 lignes) |
| Lignes (redesign seul) | — | +8 258 / −16 043 |

**Validation finale :** `tsc --noEmit` donne 0 erreur. Les tests financiers passent (118/118 : 112 d'origine plus 6 ajoutés pour le verrou de cycle), de même que les tests crypto (9/9). Le code de `db/`, `lib/crypto.ts`, `services/financialService.ts`, `services/pdfService.ts` et `context/AuthContext.tsx` n'a pas été modifié depuis le début de la refonte. Dans chaque écran migré, le bloc de logique est resté **identique à l'octet** : on y a seulement ajouté les hooks de thème, et un `diff` le vérifie à chaque commit.

## Ce qui a changé

### Fondations

- **`theme/`** : couleurs (clair et sombre), typographie, espacements (4 → 48), rayons, ombres, `layout`, avec `ThemeProvider`, `useTheme()` et `useThemePreference()`. Le bleu national `#00209F` sert de signature (primaire, bloc héros, liseré). Le rouge du drapeau `#D21034` n'apparaît **que** dans le liseré. Le danger a sa propre teinte (`#B83A0B`) et ne se confond jamais avec le drapeau. Le mode superviseur a son violet (`#3D1A78`).
- **`components/ui/`** (18 composants) : `Screen`, `Text`, `Button` (avec état `locked` réutilisable), `Card`, `AmountText`, `StatusBadge` (couleur, icône et libellé, avec `HAND_RECEIVED` et `LOCKED`), `ListItem`, `Avatar`, `MetricTile`, `SectionHeader`, `EmptyState`, `ProgressBar`, `Dialog`, `TextField`, `Chip`, `Icon`, `PinPad`, `PinDots`.
- **Documentation** : `DESIGN_AUDIT.md` (état initial et deux directions) et `DESIGN_SYSTEM.md` (règles d'usage).

### Écrans (un commit chacun, captures dans `docs/design-audit/<écran>/`)

| Écran | Points clés |
|---|---|
| Barre d'onglets et `Header` | Liseré bicolore, bandeau violet en mode superviseur, onglets de 68dp |
| `(tabs)/collect` | Montant énorme, action « Encaisser » en bas (zone du pouce), modale PIN |
| `(tabs)/index` | Bloc héros de la cagnotte, bénéficiaire actuel mis en avant, grille de chiffres |
| `(tabs)/sol` | Table de passage : rangs, « 2/3 mains reçues », états reçu / à venir |
| `client/[id]` | Fiche adhérent : solde, statut, historique, actions |
| `(tabs)/history` | Journal typé (icônes), montants signés, annulation verrouillée pour un cycle clôturé |
| `closure`, `cycle-management` | Contrôle des espèces, clôture puis réouverture avec PIN |
| `profile`, `admin` | Console superviseur impossible à confondre avec le mode gestionnaire |
| `login`, `register`, modale PIN | Pavé numérique partagé (touches de 64dp), points PIN, feuille en bas d'écran sur téléphone, retour haptique conservé |
| `setup-business`, `pending-approval`, `suspended` | Sections numérotées, écrans de statut avec actions en bas |
| `payout/[id]`, `client/new` | Cagnotte dans le bloc héros, aperçu en direct, compteurs de 56dp, validation par PIN |
| `scan`, `backup-diagnostics`, `modal`, `+not-found` | Superposition caméra toujours claire sur fond sombre, diagnostics en tuiles, 404 en français |

### Corrections faites en chemin (présentation seulement)

- **Doubles en-têtes** : `payout/[id]`, `suspended` et `backup-diagnostics` affichaient un en-tête Stack brut au-dessus du leur. Ils sont maintenant déclarés sans en-tête.
- **Web uniquement** : un `<strong>` et un emoji étaient placés dans un `Text` natif de `setup-business` ; corrigé.
- **Faux positif** : « Anomalie détectée » clignotait avant le premier diagnostic.
- **Libellés coupés** au milieu d'un mot à 360px (boutons, onglets) ; corrigé.
- **Accessibilité** : libellés ajoutés sur les liens, les touches PIN, le compteur de tentatives, la lampe torche et la saisie manuelle.

## Ce qui reste à faire

### À vérifier sur un vrai téléphone (impossible dans le navigateur)

1. La **superposition caméra** du scanner QR (seul l'écran de permission a été vu).
2. L'état **« main déjà remise »** de `payout/[id]` : aucun adhérent de démo dans cet état n'a pu être ouvert.
3. Les **retours haptiques** et la feuille PIN sur un Android d'entrée de gamme.
4. Le **splash sombre** et le mode `automatic`, qui demandent un **nouveau build natif** (Expo Go les prend directement).

### Travail restant

5. **PDF** (`services/pdfService.ts`) : aligner les couleurs et la typographie des 5 formats sur le thème. Le brief l'autorise, mais rien n'a encore été fait. Il faut garder le repli `Print.printAsync`.
6. **Micro-interactions** prévues par le brief : animation de succès sobre après un encaissement et squelettes de chargement. `react-native-reanimated` 4.5.1 est déjà installé. Rien n'est fait à part l'haptique et la secousse du PIN.
7. **Captures tablette manquantes** pour `pending-approval`, `suspended`, `payout`, `client-new`, `scan`, `backup-diagnostics`, `modal` et `+not-found`. Elles existent pour tous les autres écrans.
8. **Sélecteur Clair / Sombre / Système** : il n'existe que sur la page de développement `/design-system`. Pour l'exposer aux utilisateurs, il faudrait l'ajouter au profil, avec persistance de la préférence (aujourd'hui gardée en mémoire seulement).
9. **Emojis dans des textes d'alerte** situés dans des blocs de logique gardés tels quels : `closure.tsx:127` (« 📄 Bordereau PDF ») et `cycle-management.tsx:185` (« 🎉 Nouveau Cycle Démarré ! »). Il faut une décision métier pour les retirer.
10. **Routes orphelines** : `payout/[id]` et `backup-diagnostics` ne sont accessibles qu'en tapant leur URL, aucun bouton n'y mène. Décision produit : les relier, par exemple depuis le Dashboard et le profil, ou les retirer.

### Données de démo, hors design (constatées sur le web)

11. Plusieurs valeurs de démo sont incohérentes : `zone` contient une date ISO, `unitAmount` vaut 0 sur un carnet, et certaines dates ou certains types manquent.
12. Sur le web, `PRAGMA integrity_check` ne répond pas « ok ». C'est propre au moteur SQLite web, l'ancien écran faisait de même.

### Hors périmètre, comme convenu

- L'annulation réservée à l'admin pour les transactions d'un cycle clôturé reste un chantier séparé. Les briques sont prêtes : `Button locked` et `StatusBadge` `LOCKED`.

## Pour la suite

- Ouvrir la PR `design/refonte-ui` vers `dev` (la branche part de `dev`, qui n'est pas encore fusionné dans `main`).
- Faire tester sur le terrain (360px, plein soleil, une seule main) avant de fusionner.
