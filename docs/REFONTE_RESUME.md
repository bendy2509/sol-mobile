# Refonte SOL Mobile — résumé final

Branche `design/refonte-ui`, octobre 2026. Direction retenue : **A « Registre sobre »**.

## Étape 1 — Application autonome, sécurisée par le gestionnaire

- **Suppression complète de l'admin** :
  - rôle ADMIN, `admin.tsx`, mode superviseur et PIN 9999 ;
  - approbation et suspension, ainsi que leurs écrans ;
  - hotline ;
  - rapport admin global.
- **Comptes anciens** : ceux encore « en attente » ou « suspendus » sont activés à la connexion.
- **Blocage progressif** : 3 essais libres, puis des attentes de 30 s, 1 min, 5 min, 15 min, 1 h et 24 h. Il est partagé entre la connexion et chaque demande de PIN.
- **Code de récupération** :
  - affiché une seule fois et stocké sous forme de hash bcrypt ;
  - il remplace l'admin pour réinitialiser un PIN oublié ;
  - il est régénéré après chaque usage, ou sur demande (PIN requis).
- **Biométrie** (activation sous PIN) et **verrouillage automatique** de 1, 5, 15 ou 30 min.
- **Sauvegarde chiffrée** :
  - fichier `.solbak` en AES-256-GCM, avec une clé dérivée du mot de passe (PBKDF2, 60 000 itérations) ;
  - restauration possible depuis la connexion ou depuis Réglages (PIN requis).
  - L'ancien export JSON en clair est supprimé.
- **Annulation d'une opération d'un cycle clôturé** : PIN et motif obligatoires. REVERSAL est inchangé : l'écriture est archivée et ne touche pas au cycle en cours.

## Étape 2 — Refonte

- **Phase 0** : skills expo (native-ui, ui, design-system) et `frontend-design` chargées.
- **Phase 1** : `DESIGN_AUDIT.md` v2, captures dans `docs/design-audit/v2/before/`, carte de navigation, inventaire des valeurs codées en dur, deux directions présentées.
- **Phase 2** : design system décrit dans `DESIGN_SYSTEM.md`.
  - Palette A en clair et en sombre.
  - Échelle typographique avec facteur de taille.
  - Préférences persistées et appliquées à chaud.
  - i18n FR, Kreyòl et EN.
  - Nouveaux composants : `BottomSheet`, `ActionMenu`, `SegmentedControl`, `SettingsRow` / `SettingsGroup`, `Skeleton`.
- **Phase 3 : l'onglet Réglages**, en 7 sections :
  - Apparence, avec aperçu en direct ;
  - Profil ;
  - Sécurité ;
  - Carnet et reçus (devise HTG ou G, nom et mention des reçus, clôtures, cycles) ;
  - Langue ;
  - Données (sauvegarde, restauration, rapport PDF, synchronisation) ;
  - À propos.

  Les actions sensibles demandent le PIN.
- **Phase 4 : écrans** (un commit par écran) :
  1. Navigation à 5 onglets. L'icône Profil et le liseré disparaissent des en-têtes.
  2. **Encaisser** : recherche (avec le scan dans le champ), liste avec les adhérents à encaisser en tête. Un tap sur un adhérent ouvre la feuille (mains −/+, raccourcis, montant héros, PIN), puis affiche le succès et le reçu dans la même feuille. Les chiffres du reçu sont figés au moment de l'encaissement : avant, la période couverte du reçu était recalculée après rechargement.
  3. **Accueil** : un seul héros, la bénéficiaire du tour avec « Remettre » en ligne, 3 indicateurs, les accès rapides Clôturer et Inscrire, un menu ⋯ (rapport PDF, scan, gestion du cycle), la remise en feuille et un squelette au chargement.
  4. **Sol** : héros sobre (« 1 / 4 mains remises · Tour 2 sur 4 »), « Remettre » en ligne sur le tour en cours, ⋯ vers la gestion du cycle et les clôtures.
  5. **Fiche adhérent** : un menu ⋯ dans l'en-tête (Modifier, Fiche PDF, Supprimer). Encaisser est la seule action principale. Le détail, la modification, la remise et l'annulation passent en feuilles.
  6. **Historique** : filtre segmenté (Tout · Entrées · Remises · Annulées), détail et annulation en feuilles, lignes allégées.
  7. **Clôture et cycles** : solde théorique en seul héros, indicateurs à plat, confirmation en feuille. Les emojis sont retirés.
  8. **Connexion, PIN** : pavé plat en 48, modale PIN en feuille, champs sans carte.
- **PDF** : couleurs et typographie alignées sur la palette A, avec le nom et la mention des reçus. Le repli `Print.printAsync` est conservé.

## Validation

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | 0 erreur |
| `scripts/test_financial_rules.ts` | 118 / 118 |
| `npm test` (toutes les suites, voir `docs/AUDIT_COHERENCE.md`) | 281 / 281 |
| `scripts/test_crypto.ts` | 9 / 9 |
| `scripts/test_security.ts` | 30 / 30 |
| Hex, `fontSize` ou `fontWeight` dans `app/` et `components/` | 0 |
| Emojis dans l'interface | 0 |
| `scripts/test_i18n.ts` (français et kreyòl) | 5 / 5, 788 textes, 0 sans traduction |
| Action fréquente au-delà de 3 taps | aucune |

**Vérifié dans le navigateur (web, 360 px) :**
- Encaisser, de l'onglet jusqu'à l'encaissement réel avec PIN et l'écran de succès ;
- le bouton rond de l'Accueil, qui ouvre directement la feuille ;
- Réglages, Accueil, Sol, Fiche adhérent, Historique (feuille de détail), Clôture et Connexion, en sombre ;
- Accueil et Encaisser en clair.

**Captures « après »** (dans `docs/design-audit/v2/after/`) :

| Réglage | Écrans capturés |
|---|---|
| Clair, 360 px | Connexion, Accueil, Encaisser, Sol, Fiche adhérent et son menu ⋯, Historique, Réglages, Clôture, Gestion du cycle |
| Sombre et texte Grande | Réglages, Accueil, feuille Encaisser |
| Texte Petite | Historique |
| Tablette 820 px | Accueil |

Sur tablette, la feuille Encaisser a été contrôlée dans le DOM : elle fait 720 px de large et elle est centrée.

**Corrigé après les captures :**
- en texte Grande, les libellés d'onglets étaient tronqués (ils gardent maintenant une taille fixe) ;
- le bouton « Remettre » écrasait le nom du bénéficiaire (il passe désormais sous le nom quand la place manque) ;
- certains libellés de la fiche adhérent et de la clôture passaient sur deux lignes.

## Non vérifié

- **Captures** : il n'y a pas de capture tablette des autres écrans, ni de Petite et Grande sur tous les écrans.
- **Montants de démo sur le web** : l'Accueil affiche une cagnotte à 0 HTG alors que l'onglet Sol affiche 1 000 HTG. Ce sont les métriques de la base de démo web (`db/`, hors périmètre), pas l'interface.
- **Natif** : biométrie, partage de fichiers, haptique et Android bas de gamme n'ont pas été testés sur un appareil.
- **Bug web hors périmètre** : l'adaptateur SQLite web (`db/sqlite.ts`) décale les colonnes du collecteur de démo, si bien que la zone affiche une date. Ce bug n'apparaît que sur le web, et `db/` est hors périmètre de la refonte : il n'est pas corrigé.

## Traduction français et kreyòl (ajout du 22 octobre 2026)

- **Couverture** : toute l'interface est en deux langues, avec environ 800 phrases :
  - écrans, alertes, messages d'erreur et libellés d'accessibilité ;
  - messages WhatsApp envoyés aux adhérents ;
  - dates.
- **Anglais retiré** : le choix de langue ne propose plus que Français et Kreyòl ayisyen.
- **Méthode** :
  - un script d'analyse du code TypeScript a entouré chaque texte de `t()` ;
  - les phrases coupées autour d'une variable ont été réunies en une seule phrase avec des marqueurs `{0}` ;
  - les traductions sont dans `i18n/ht.phrases.ts`.
- **Contrôle** : `scripts/test_i18n.ts` échoue si un texte de l'interface n'a pas de traduction, ou si une traduction utilise une variable absente du texte français.
- **Restent en français, volontairement :**
  - les documents PDF (reçus, rapports, procès-verbaux), qui sont des pièces officielles ;
  - les notes enregistrées avec les opérations dans la base, qui sont des données et non de l'interface.
- **Relecture** : les traductions ont été écrites sans relecture par un locuteur natif. Une relecture est conseillée avant la mise en production.
