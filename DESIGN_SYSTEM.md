# Design system — SOL Mobile (Direction A « Registre sobre »)

Un outil de caisse calme : un seul bleu d'action, des fonds clairs et froids, des chiffres tabulaires et un seul montant héros par écran. Le bleu et le rouge du drapeau restent des accents de marque : le logo, le liseré de connexion et les reçus.

- **Source de vérité** : `theme/` pour les tokens et le `ThemeProvider`, `components/ui/` pour les composants.
- **Préférences** : `lib/preferences.ts` les stocke en local (AsyncStorage) : thème, taille du texte, langue, reçus.
- **i18n** : `i18n/`, avec FR comme référence et repli, plus Kreyòl et EN.
- **Catalogue de dev** : la route `/design-system`.

## Règles

1. **Pas de hex ni de `fontSize` dans `app/` ni dans `components/`.** Tout passe par `useTheme()` ou par les composants `ui/`. Les exceptions sont `theme/` et `services/pdfService.ts`.
2. **Un héros par écran.** Il s'affiche avec `<AmountText size="hero">` (30) sur une `Card tone="hero"`, qui est une surface simple et non un bloc coloré. Un zéro reste neutre.
3. **Un écran = une intention.**
   - Il y a une seule action principale, en bas de l'écran ou dans la feuille.
   - Les actions secondaires vont dans `<ActionMenu>` (⋯ → bottom sheet).
   - Les actions rapides passent par `<BottomSheet>` : encaisser, remettre, détail, annulation.
4. **Statut = couleur + icône + libellé**, via `<StatusBadge>` et `STATUS_CONFIG`.
5. **Les couleurs du drapeau ne servent jamais d'interface.** `#00209F` et `#D21034` ne s'utilisent que dans `brand.*` (logo, reçus). Le rouge n'est jamais une erreur : les erreurs utilisent `danger`, un orange brûlé.
6. **Tailles.**
   - Corps 15, légendes et sous-titres 13, titres d'écran 21, montant héros 30.
   - Boutons 44 (`md`) et 48 (`lg`), touches du pavé 48 (44 en compact).
   - Cibles tactiles d'au moins 44, lignes de liste d'au moins 56.
7. **Taille du texte.** Les choix Petite, Normale et Grande appliquent un facteur de 0,92, 1 ou 1,14 à toute l'échelle. La taille système s'ajoute par-dessus via `allowFontScaling`, plafonnée par `maxFontSizeMultiplier` à 1,6.
8. **Hors ligne et Android bas de gamme.**
   - Public Sans et les icônes SVG sont embarquées.
   - Pas de flou ; seules deux animations existent, la translation de la feuille et la pulsation des squelettes, toutes deux en driver natif.
   - Les `FlatList` sont optimisées (`windowSize`, `removeClippedSubviews`).
9. **États.** Chaque écran gère quatre états :
   - squelettes (`ListSkeleton`) au premier chargement ;
   - `EmptyState` avec une action ;
   - erreurs dans une `Card tone="danger"` ;
   - succès dans la feuille elle-même, avec un retour haptique.

## Couleurs (`theme/colors.ts`)

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `primary` | `#1F3FB8` | `#93A6FF` | La seule couleur d'action |
| `primarySoft` / `onPrimarySoft` | `#EBEEFA` / `#1F3FB8` | `#1F2950` / `#C9D2FF` | Sélection, rang actif |
| `hero` / `onHero` | `#FFFFFF` / `#141B2D` | `#171E31` / `#EEF1F8` | Carte du montant héros |
| `background` | `#F4F5F8` | `#0E1322` | Fond |
| `surface` / `surfaceAlt` | `#FFFFFF` / `#EEF0F4` | `#171E31` / `#1E2740` | Cartes / champs, segments, touches |
| `text` / `textMuted` | `#141B2D` / `#4A5368` | `#EEF1F8` / `#A8B0C4` | Texte (AA) |
| `success` · `advance` · `warning` · `danger` | `#0B6E47` · `#0F6B66` · `#8A5300` · `#B83A0B` | `#4CC38A` · `#4FC1B8` · `#F0B45A` · `#FF8A5C` | Statuts |
| `brand.haitiBlue` / `brand.haitiRed` | `#00209F` / `#D21034` | idem | Logo, liseré, reçus uniquement |

## Typographie (`theme/typography.ts`)

`buildTypography(textSize)` renvoie l'échelle multipliée par le facteur ; les montants utilisent `tabular-nums`.

| Variante | Normale | Usage |
|---|---|---|
| `amountHero` | 30 / 36 extrabold | Le montant héros |
| `amountLarge` | 22 / 28 | Compteur de mains, aperçu |
| `amount` / `amountSmall` | 16 / 15 | Montants de liste |
| `title` | 21 / 28 | Titre d'écran |
| `heading` / `subheading` | 18 / 16 | Titres de feuille, sections |
| `body` / `bodyStrong` | 15 / 22 | Texte courant |
| `label` / `caption` | 13 / 18 | Sous-titres, légendes |
| `button` / `buttonLarge` | 15 / 16 semibold | Boutons |
| `tab` | 12 | Barre d'onglets (taille fixe) |
| `numpad` | 24 | Pavé numérique |

## Espacements, rayons, ombres

- **Espacements** : `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32`, plus `xxxl 48`. La gouttière fait 16.
- **Gabarits** : `touchTarget` 44, `actionHeight` 48, `rowHeight` 56, `maxContentWidth` 720 (contenu centré sur tablette à partir de 768).
- **Rayons** : `sm 8 · md 12 · lg 16 · xl 24` (feuilles) et `pill`.
- **Ombres** (`boxShadow`, iOS et Android New Arch) :
  - `card` est un contact très léger ;
  - `raised` et `sheet` sont réservées aux feuilles ;
  - en sombre, la séparation se fait par la luminosité des surfaces.

## ThemeProvider

`theme/ThemeProvider.tsx` expose :

- `useTheme()`, qui renvoie le thème actif ;
- `useThemePreference()`, qui donne `preference` (`system | light | dark`) et `setPreference`, `textSize` et `setTextSize`, et `ready`.

Les préférences sont lues au démarrage, et le splash attend `ready` pour éviter un flash. Une modification s'applique sans redémarrer.

## Composants (`components/ui/`)

| Composant | Rôle |
|---|---|
| `Screen` | Fond, zones sûres, largeur max tablette, pied collant |
| `Button` | `primary · secondary · danger · ghost · inverse`, tailles `md 44` et `lg 48`, état `locked` |
| `Card` | `default · sunken · hero · success · warning · danger · locked` |
| `AmountText` | Montant tabulaire, signe ±, zéro neutre ; la devise vient des réglages (HTG ou G) |
| `StatusBadge` | Statut en couleur + icône + libellé |
| `ListItem` | Ligne de registre (56) |
| `EmptyState` | Vide avec une action |
| `SectionHeader` | Titre de section en casse de phrase |
| `MetricTile` / `StatStrip` | Indicateurs (3 au plus sur l'Accueil) |
| `BottomSheet` | Feuille du bas (Modal RN + translation native, sans bibliothèque de gestes), centrée sur tablette |
| `ActionMenu` | Bouton ⋯ qui ouvre les actions secondaires en feuille, avec les destructives en `danger` |
| `SegmentedControl` | 2 à 4 choix exclusifs (thème, taille, filtres d'historique, verrouillage) |
| `SettingsRow` / `SettingsGroup` | Lignes de Réglages : valeur, interrupteur, coche, cadenas « PIN requis » |
| `Skeleton` / `ListSkeleton` | Chargement |
| `TextField`, `Chip`, `Avatar`, `ProgressBar`, `PinPad`, `PinDots`, `Icon`, `Dialog` | Base |

**Pourquoi pas `@expo/ui` pour `BottomSheet`, `Switch` et `SegmentedControl` :** ce paquet ajoute du code natif, ce qui impose un nouveau build de développement, et son rendu web est partiel. Or l'app est testée sur le web hors ligne. Les composants maison gardent la même API : on pourra basculer plus tard sans toucher aux écrans.

## Navigation

- **Onglets** : Accueil · Encaisser · Sol · Historique · Réglages.
- **Écrans en stack** : fiche adhérent, clôture de caisse, gestion du cycle, inscription d'un adhérent, paramètres du sol, restauration, code de récupération.
- **Anciennes routes** : `/profile` et `/security` redirigent vers Réglages.

| Action fréquente | Taps |
|---|---|
| Encaisser depuis l'onglet | adhérent → Encaisser → PIN (3 taps + PIN) |
| Encaisser depuis l'Accueil | bouton rond → Encaisser → PIN (2 taps + PIN) |
| Remettre la main | Remettre → Valider → PIN (2 taps + PIN) |
| Clôturer la journée | Accueil → Clôturer (1 tap jusqu'à l'écran) |

## PDF

Les reçus et rapports reprennent la palette A (encre, gris, bleu d'action, statuts) et la pile `Public Sans, système`, avec des chiffres tabulaires. Le liseré bicolore reste comme marque. Le nom et la mention du reçu viennent de Réglages → Carnet et reçus. Le repli `Print.printAsync` est conservé.
