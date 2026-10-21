# Design system — SOL Mobile (Direction A « Registre »)

Le carnet officiel, version numérique : bleu national en signature, fonds clairs et froids, chiffres alignés comme dans un livre de comptes.

- **Source de vérité** : `theme/` (tokens) et `components/ui/` (composants de base).
- **Catalogue vivant** : la route `/design-system`, disponible en développement uniquement, montre chaque composant en clair et en sombre.
- **Planches de référence** : https://claude.ai/artifact/56Dy5h9g22QPhxCyiyd6ar

## Règles d'or

1. **Aucune couleur, taille ou espacement codé en dur** dans `app/` ni dans `components/` : tout passe par `useTheme()` ou par les composants `ui/`. Seules exceptions : `theme/` et `services/pdfService.ts`.
2. **Les montants sont les héros** : toujours `<AmountText>`, avec des chiffres tabulaires. Un zéro reste neutre, sans signe ni rouge.
3. **Un statut = couleur + icône + libellé**, toujours via `<StatusBadge>`. Le vocabulaire est fixé dans `STATUS_CONFIG` : ne pas réinventer de libellé écran par écran.
4. **Rouge haïtien `#D21034`** : réservé au liseré bicolore et aux documents officiels, **jamais pour un statut**. Les erreurs et retards utilisent `danger` (orange brûlé `#B83A0B`).
5. **Le terrain d'abord** :
   - texte ≥ 14 ;
   - cibles tactiles ≥ 48 dp ;
   - action principale en bas de l'écran, dans la zone du pouce (`<Screen footer>` + `<Button size="lg">`) ;
   - contraste AA minimum.
6. **Hors ligne** : police embarquée (`assets/fonts/`, licence OFL), icônes SVG locales. Aucune ressource réseau au runtime.
7. **Android bas de gamme** : pas de flou ni de verre, pas d'animation dans les listes. `ListItem` est mémoïsé.
8. **Épuré, pas encadré** (passe « épure », octobre 2026) :
   - les surfaces se séparent par l'élévation (clair) ou la luminosité (sombre), **jamais par un contour**. Pas de bordure sur `Card`, `Button secondary`, `Chip`, `MetricTile`, les touches du `PinPad` ni les badges. Seuls gardent un trait : les champs de saisie actifs (2px primaire), le tiret de l'état `locked`, les filets de séparation ;
   - **les listes sont des feuilles de registre** : une seule surface, des lignes séparées par un filet (`divider`) aligné sur le texte, pas une carte par ligne ;
   - **une action par ligne**, au plus. Une action déjà présente ailleurs à l'écran (bandeau, onglet) n'est pas répétée ;
   - **le chiffre d'abord, son sens ensuite** : pas de petite étiquette au-dessus d'un montant héros, la légende vient dessous (« Cagnotte par tour · 4 mains × 250 HTG ») ;
   - pas de carte dans une carte : dans le bandeau bleu, on sépare par un filet `heroTrack` et on utilise `Button variant="inverse"`.

## Couleurs (`theme/colors.ts`)

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `primary` | `#00209F` | `#8EA0FF` | Actions principales, liens, rang actif |
| `hero` / `onHero` | `#00209F` / `#FFFFFF` | `#14247A` / `#FFFFFF` | Bandeau cagnotte |
| `background` | `#F4F5F8` | `#0E1322` | Fond d'écran |
| `surface` / `surfaceAlt` | `#FFFFFF` / `#EEF0F4` | `#171E31` / `#1E2740` | Cartes / zones en creux |
| `border` / `borderStrong` | `#E3E6EC` / `#C5CBD8` | `#2A3450` / `#3A4566` | Filets |
| `text` / `textMuted` | `#141B2D` / `#4A5368` | `#EEF1F8` / `#A8B0C4` | Texte (les deux passent AA) |
| `success` | `#0B6E47` | `#4CC38A` | Payé, main reçue |
| `advance` | `#0F6B66` | `#4FC1B8` | En avance |
| `warning` | `#8A5300` | `#F0B45A` | À encaisser |
| `danger` | `#B83A0B` | `#FF8A5C` | En retard, annulation (≠ rouge drapeau) |
| `info` | `#00209F` | `#8EA0FF` | Reçoit la main, informations |
| `locked` | `#4A5368` | `#A8B0C4` | Cycle clôturé, action réservée à l'admin (bordure en tirets) |
| `supervisor` | `#3D1A78` | `#B99AF0` | 👑 Mode superviseur, à ne jamais utiliser en mode gestionnaire |
| `brand.haitiBlue` / `brand.haitiRed` | `#00209F` / `#D21034` | idem | Liseré, logo, PDF |

Chaque statut a trois variantes : `x` (texte et icône), `xSoft` (fond) et `xLine` (bordure).

## Typographie (`theme/typography.ts`)

Police : **Public Sans**, 400 / 500 / 600 / 700 / 800, embarquée et chargée par `useFonts` dans `app/_layout.tsx`.

Chaque graisse est une famille distincte (`PublicSans_700Bold`, etc.). **Ne jamais combiner** `fontFamily` et `fontWeight` : Android retomberait sur la police système.

| Variante | Taille / interligne | Graisse | Usage |
|---|---|---|---|
| `amountHero` | 40 / 46 | 800 | Cagnotte, montant à encaisser |
| `amountLarge` | 28 / 34 | 800 | Totaux de clôture |
| `amount` | 18 / 22 | 700 | Tuiles de métriques |
| `amountSmall` | 15 / 20 | 700 | Montants en liste |
| `title` | 22 / 28 | 700 | Titre d'écran |
| `heading` | 18 / 24 | 700 | Titre de carte |
| `subheading` | 16 / 22 | 700 | Titre de section |
| `bodyStrong` | 16 / 22 | 600 | Nom d'adhérent |
| `body` | 15 / 22 | 400 | Texte courant |
| `label` / `caption` | 14 / 18 | 600 / 500 | Libellés, légendes (minimum absolu) |
| `button` / `buttonLarge` | 16 / 17 | 700 | Boutons |
| `numpad` | 26 / 32 | 700 | Pavé PIN |

Les variantes de montant et `numpad` incluent `fontVariant: ['tabular-nums']`. Les titres sont en casse de phrase, sans libellés en MAJUSCULES espacées.

## Espacements, rayons, ombres

- **`spacing`** : `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`. Aucune autre valeur n'est autorisée.
- **`layout`** :
  - `gutter 16` : marge latérale d'écran ;
  - `touchTarget 48` : taille minimale d'une cible tactile ;
  - `actionHeight 56` : hauteur du bouton principal ;
  - `maxContentWidth 720` : largeur du contenu centré sur tablette (dès `tabletMinWidth 768`).
- **`radius`** : `sm 10` (petits éléments) · `md 14` (contrôles, cartes) · `lg 20` (bandeau hero, feuilles de registre) · `pill` (badges, boutons ronds).
- **`shadows`** : `card`, `raised`, `sheet`, en CSS `boxShadow` (iOS + Android New Arch), chacun en deux couches : une ombre de contact serrée et une ombre ambiante large et très légère. Ils sont vides en mode sombre, où la luminosité des surfaces fait la séparation.

## Composants (`components/ui/`)

Tout s'importe depuis `@/components/ui`.

| Composant | Rôle | Points clés |
|---|---|---|
| `Screen` | Coque d’écran | Fond thématisé, safe area, largeur max centrée sur tablette, `keyboardShouldPersistTaps`. `header` pleine largeur, `footer` = zone d’action fixe en bas (`footerSafeArea={false}` dans les onglets). `scroll={false}` quand la racine est une `FlatList`. |
| `Text` | Tout texte | `variant` (échelle typo) + `tone` (`muted`, `danger`, `onHero`…). `maxFontSizeMultiplier` 1.6. |
| `Button` | Actions | `primary` / `secondary` (fond `surfaceAlt`, sans contour) / `danger` / `ghost` / `inverse` (blanc sur le bandeau bleu), tailles `md` 48 et `lg` 56, `icon`, `loading`, `disabled`. **`locked` + `lockedLabel`** pour les actions verrouillées (bordure en tirets + cadenas, non pressable). `haptic` pour le retour tactile. |
| `Card` | Surface | Tons `default`, `sunken`, `hero`, `success`, `warning`, `danger`, `locked`, `supervisor`. `onPress` optionnel. |
| `AmountText` | Montants HTG | Tailles `hero` / `large` / `medium` / `small`. `sign="credit"` → `+`, `sign="debit"` → `−`. Zéro neutre. Sélectionnable. |
| `StatusBadge` | Statuts | `PAID_TODAY`, `PAID_IN_ADVANCE`, `UNPAID_TODAY`, `OVERDUE`, `UPCOMING_PAYOUT`, `HAND_RECEIVED`, **`LOCKED`**. `detail` (« 1 tour », « 2/3 mains »). `appearance="inline"` pour les listes denses. |
| `ListItem` | Ligne de registre | `leading` · titre / sous-titre / `meta` · `trailing`, hauteur ≥ 64, séparateur, chevron, `selected` (choix courant d'un sélecteur). Mémoïsé pour `FlatList`. |
| `Chip` | Filtre | Pastille 40 dp (+ hit slop 48), pleine quand sélectionnée, ton `danger` pour les filtres de retard / annulation. |
| `Dialog` | Modale centrée | Titre, sous-titre, icône teintée (`primary` / `success` / `danger`), bouton fermer 48 dp, corps défilant, rangée `actions`. |
| `TextField` | Champ de saisie | Libellé, aide ou erreur, focus en bordure primaire, ≥ 48 dp, multiligne. |
| `ProgressBar` | Progression | Valeur 0 → 1, tons `primary` / `success` / `onHero`, rôle `progressbar` accessible. |
| `Avatar` | Initiales ou rang | `rank` pour l'ordre de tirage, `highlighted` pour le bénéficiaire courant. |
| `MetricTile` | Chiffre clé | `tone` `danger` / `warning` teinte la tuile entière (attention requise), `success` colore seulement la valeur. |
| `SectionHeader` | Titre de section | « Adhérents (4) » + action texte (cible 48 dp). |
| `EmptyState` | Liste vide, aucun résultat | Dit ce qui manque et propose l'action suivante. |
| `Icon` | Icônes SVG locales | 35 icônes au trait sur une grille 24. Elles remplacent l'ancien `components/Icon.tsx` (supprimé) et les emojis. |

## Thème clair / sombre

- `ThemeProvider` (dans `app/_layout.tsx`) suit le système par défaut. `useThemePreference()` permet de forcer `light` ou `dark`.
- **Le mode sombre ne s'active sur l'appareil** qu'avec `userInterfaceStyle: "automatic"` dans `app.json`. C'est déjà prévu : `expo-system-ui` est installé pour Android.
- `app.json` est en `"automatic"` depuis la fin de la Phase 3 : l'application suit le réglage du téléphone.

## Migration d'un écran (Phase 3)

1. Remplacer le conteneur racine par `<Screen>`, et placer l'action principale dans `footer`.
2. Remplacer `Text`, les boutons et les badges par `components/ui`.
3. Supprimer chaque hex ; les styles restants lisent `useTheme()`.
4. Vérifier :

   ```bash
   grep -nE "#[0-9A-Fa-f]{3,6}\b" app/<ecran>.tsx
   ```

   doit renvoyer 0 ligne. Faire une capture avant/après à 360px et en tablette, en clair et en sombre.
5. `npx tsc --noEmit`, puis les tests financiers et crypto. Un commit par écran.

## Écarts assumés par rapport aux skills

- **Noms de fichiers** : `expo-native-ui` recommande le kebab-case, mais le projet utilise le PascalCase pour les composants. Je garde la convention du dépôt.
- **Couleurs dynamiques Material You** : écartées, pour garder l'identité SOL.
- **`theme/index.tsx`** au lieu de `index.ts` : le fichier contient le JSX du provider.
