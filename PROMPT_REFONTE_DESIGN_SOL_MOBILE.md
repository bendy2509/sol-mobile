# 🎨 MISSION : Refonte complète du design de SOL Mobile

Tu reprends le contrôle visuel de **SOL Mobile** (React Native / Expo / Expo Router / TypeScript, offline-first SQLite).
Lis le briefing du projet en entier avant toute action.

**Prérequis :** ce chantier commence **après** la suppression de la logique admin (app 100 % autonome, sécurité par le PIN de chaque gestionnaire). Il n'y a plus d'écran `admin.tsx`, plus de mode superviseur, plus de statut « en attente » ou « suspendu ». Ne recrée rien de tout ça.

La logique métier est validée (tests financiers et crypto à 100 %, 0 erreur TypeScript).
Le problème est **uniquement visuel et de navigation** : l'interface doit devenir **moderne, sobre et professionnelle**, au niveau d'une bonne app fintech actuelle.

---

## PHASE 0 — Installer les skills avant de coder

```bash
# Skills officiels de l'équipe Expo (UI native, Expo Router, animations, onglets natifs…)
npx skills add expo/skills

# Si tu tournes dans Claude Code, alternative via le marketplace :
#   /plugin marketplace add expo/skills
#   /plugin install expo

# Skill de direction artistique
npx skills add anthropics/skills --skill frontend-design
```

1. Lis le `SKILL.md` de **building-native-ui** et de **frontend-design** en entier.
2. Applique leurs recommandations sauf si elles contredisent les contraintes ci-dessous.
3. Si une installation échoue, dis-le clairement et continue avec les bonnes pratiques Expo officielles — n'invente pas de skill.

---

## PHASE 1 — Audit (avant de toucher au code)

1. Lance l'app et capture chaque écran à **360px** et sur **tablette**.
2. Produis `DESIGN_AUDIT.md` : pour chaque écran, les problèmes majeurs (hiérarchie, densité, espacements, couleurs incohérentes, textes surdimensionnés, écrans trop chargés, navigation confuse).
3. Cartographie la **navigation actuelle** (comment on va d'un écran à l'autre, combien de taps pour les actions fréquentes).
4. Liste les couleurs, tailles de police et espacements codés en dur dans `app/` et `components/`.

**Arrête-toi et présente l'audit + la nouvelle architecture de navigation + 2 directions artistiques avant de refondre les écrans.**

---

## PRINCIPES DE DESIGN (s'appliquent partout)

### Sobriété et proportions normales
- **Pas de gros textes, pas de gros blocs, pas d'écrans surdimensionnés.** Tailles standard des apps modernes : corps de texte 15–16, sous-titres 13, titres d'écran 20–22. Le montant principal d'un écran peut être plus grand (28–32), mais un seul élément « héros » par écran au maximum.
- Boutons à hauteur normale (44–48), pas de boutons géants. Les zones tactiles restent ≥ 44 pour l'accessibilité, sans paraître énormes.
- Pas d'emojis dans l'interface (titres, boutons, badges) : utiliser une bibliothèque d'icônes cohérente, embarquée localement.
- Beaucoup d'espace blanc, peu de bordures, peu de couleurs simultanées.

### Écrans légers
- **Un écran = une intention.** Ne pas tout empiler : afficher l'essentiel, le reste derrière un tap (« Voir tout », détail, section repliable).
- Maximum 3–4 indicateurs sur le Dashboard ; le détail va dans des écrans dédiés.
- Les actions secondaires vont dans un menu (⋯) ou une **bottom sheet**, pas en boutons empilés.
- Formulaires courts, découpés en étapes si nécessaire.

### Navigation fluide
- Navigation par onglets en bas, **4 à 5 onglets maximum**, par exemple : Accueil · Encaisser · Sol · Historique · Réglages. Propose la structure exacte dans l'audit.
- Les écrans moins fréquents (clôture de caisse, gestion des cycles, fiche adhérent) s'ouvrent en **stack** depuis l'endroit logique, avec en-tête et retour natifs.
- Actions rapides (encaisser, confirmer, choisir) en **bottom sheets** plutôt qu'en nouveaux écrans.
- Transitions natives d'Expo Router, gestes de retour, recherche accessible sans quitter la liste.
- Les actions fréquentes (encaisser un adhérent) doivent prendre **3 taps maximum** depuis l'accueil.
- États soignés : chargement (squelettes), liste vide (message + action), erreur, succès (confirmation discrète + retour haptique).

### Identité
- Ton : fintech sérieuse, moderne, chaleureuse. Doit inspirer confiance (c'est de l'argent).
- L'app peut être utilisée hors d'Haïti : le bleu `#00209F` et le rouge `#D21034` peuvent rester des accents de marque, mais l'interface ne doit pas dépendre d'eux. Le rouge de marque ne doit jamais être confondu avec un statut d'erreur.
- Statuts financiers (à jour, en avance, non payé aujourd'hui, en retard) : couleur + icône + libellé, jamais la couleur seule.

---

## PHASE 2 — Design system (une seule source de vérité)

Crée un dossier `theme/` :

- `theme/colors.ts` — palette sémantique (`primary`, `success`, `warning`, `danger`, `surface`, `textMuted`…) en **mode clair et mode sombre**.
- `theme/typography.ts` — échelle typographique **multipliée par le facteur de taille de texte choisi dans les Réglages** (voir plus bas), et respectant aussi la taille de police système. Style dédié pour les montants : chiffres tabulaires, lisibles, sans excès de taille.
- `theme/spacing.ts` — échelle 4/8 (4, 8, 12, 16, 24, 32).
- `theme/radius.ts`, `theme/shadows.ts` (compatibles Android `elevation` et iOS).
- `theme/ThemeProvider.tsx` + hook `useTheme()` : thème (clair / sombre / système) et taille de texte lus depuis les préférences enregistrées, appliqués instantanément sans redémarrer l'app.

Composants de base dans `components/ui/` : `Button`, `Card`, `AmountText`, `StatusBadge`, `ListItem`, `EmptyState`, `SectionHeader`, `MetricTile`, `Screen`, `BottomSheet`, `SettingsRow` (ligne de réglage avec icône, libellé, valeur, chevron ou interrupteur), `SegmentedControl`.

---

## PHASE 3 — Espace Réglages (nouveau)

Un écran **Réglages** clair, organisé en sections, où le gestionnaire modifie tout lui-même, sans dépendre de personne :

1. **Apparence**
   - Thème : Clair / Sombre / Automatique (système)
   - Taille du texte : Petite / Normale / Grande (aperçu en direct)
2. **Profil**
   - Nom, téléphone, zone, photo ou initiales
   - Nom du carnet ou de l'activité (affiché sur les reçus)
3. **Sécurité**
   - Changer le PIN
   - Déverrouillage biométrique (si disponible sur l'appareil)
   - Verrouillage automatique après X minutes d'inactivité
   - Régénérer le code de récupération
4. **Carnet et reçus**
   - Devise et format des montants
   - En-tête et mentions des reçus PDF
5. **Langue** — Français, Kreyòl, English (prévoir l'architecture i18n même si toutes les traductions ne sont pas prêtes)
6. **Données**
   - Sauvegarde chiffrée, restauration, export
7. **À propos** — version, aide, contact du support de l'application

Les préférences sont stockées localement et persistent entre les sessions. Les actions sensibles (PIN, restauration, régénération du code) demandent le PIN.

---

## PHASE 4 — Refonte écran par écran

Ordre de priorité :
1. Navigation globale (onglets, stacks, bottom sheets) et écran Réglages
2. Encaissement — rapide, clair, confirmation nette
3. Accueil — résumé léger, bénéficiaire actuel, accès rapides
4. Sol — rangs, mains reçues / restantes (ex. « 2/3 mains reçues »)
5. Fiche adhérent
6. Historique
7. Clôture de caisse, gestion des cycles
8. Connexion, inscription, modale PIN (pavé numérique soigné, retour haptique)

Pour chaque écran : tokens du thème uniquement, test en mode clair et sombre, test avec les 3 tailles de texte, capture avant/après.

---

## ⛔ CONTRAINTES NON NÉGOCIABLES

1. **Ne touche pas à la logique métier** : `db/`, `services/financialService.ts`, `lib/crypto.ts`, les règles métier. Seule exception : ajouter le stockage des préférences (thème, taille du texte, langue).
2. **Offline-first** : aucune ressource chargée depuis Internet à l'exécution. Polices embarquées via `expo-font`, icônes en local.
3. **Android bas de gamme** : pas de flou ni d'effets coûteux, animations légères, `FlatList` optimisée. Teste à 360px.
4. **Lisibilité** : contraste WCAG AA minimum en clair comme en sombre.
5. **PDF** (`services/pdfService.ts`) : aligne seulement couleurs et typographie, sans casser les formats ni le fallback `Print.printAsync`.
6. **Branche dédiée** `design/refonte-ui`, commits petits et par écran.

---

## ✅ Critères de validation (à chaque étape)

- `npx tsc --noEmit` → 0 erreur
- Tests financiers et crypto → 100 % PASS
- Aucune couleur hex ni taille de police codée en dur dans `app/` (hors `theme/` et `pdfService.ts`)
- Chaque écran vérifié : clair + sombre, 3 tailles de texte, 360px + tablette
- Aucune action fréquente à plus de 3 taps

## 📦 Livrables

1. `DESIGN_AUDIT.md` (avec la nouvelle carte de navigation)
2. `theme/` + `components/ui/`
3. `DESIGN_SYSTEM.md`
4. Écran Réglages complet
5. Tous les écrans migrés
6. Résumé final : ce qui a changé, ce qui reste à faire