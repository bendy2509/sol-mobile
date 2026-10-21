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
| `scripts/test-financial-rules.ts` | 19 / 19 |
| `scripts/test_crypto.ts` | 9 / 9 |
| `scripts/test_security.ts` | 30 / 30 |
| Hex, `fontSize` ou `fontWeight` dans `app/` et `components/` | 0 |
| Emojis dans l'interface | 0 |
| Action fréquente au-delà de 3 taps | aucune |

**Vérifié dans le navigateur (web, 360 px) :**
- Encaisser, de l'onglet jusqu'à l'encaissement réel avec PIN et l'écran de succès ;
- le bouton rond de l'Accueil, qui ouvre directement la feuille ;
- Réglages, Accueil, Sol, Fiche adhérent, Historique (feuille de détail), Clôture et Connexion, en sombre ;
- Accueil et Encaisser en clair.

**Captures « après »** : `docs/design-audit/v2/after/`, avec seulement l'Accueil et Encaisser en clair à 360 px, parce que la série a été interrompue.

## Non vérifié

- **Captures manquantes** : la tablette et les tailles Petite et Grande n'ont pas été capturées. Elles sont gérées par les tokens (largeur max 720, feuilles centrées, facteur de taille) mais ne sont pas contrôlées visuellement.
- **Natif** : biométrie, partage de fichiers, haptique et Android bas de gamme n'ont pas été testés sur un appareil.
- **i18n** : les onglets, Réglages et les actions communes sont traduits. Les autres écrans restent en français (repli) et seront à extraire au fil de l'eau.
- **Bug web hors périmètre** : l'adaptateur SQLite web (`db/sqlite.ts`) décale les colonnes du collecteur de démo, si bien que la zone affiche une date. Ce bug n'apparaît que sur le web, et `db/` est hors périmètre de la refonte : il n'est pas corrigé.
