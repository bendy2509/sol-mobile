# Plan de changements de la base de données — SOL Mobile

État constaté le 22 octobre 2026 sur `design/refonte-ui`, à partir de :
- `db/` (4 365 lignes) ;
- `context/AuthContext.tsx` ;
- `db/syncEngine.ts`.

La refonte n'a pas touché `db/`. Chaque phase ci-dessous se fait sur sa propre branche, avec sa propre PR. Les règles financières (`services/financialService.ts`) ne changent qu'en phase 4, sous la protection des 137 tests existants.

## Avancement

- **PR 1, livrée sur `fix/db-securite-demo` :**
  - la démo n'est plus créée sur un téléphone de production, et la démo jamais utilisée est retirée des téléphones existants (phase 1a) ;
  - le statut par défaut des gestionnaires passe à `ACTIVE` (phase 1c) ;
  - les insertions de l'adaptateur web sont lues colonne par colonne, et les filtres de date sont respectés (phase 2, option A) ;
  - la démo a des chiffres cohérents ;
  - les dates sans heure s'affichent au bon jour.

  Tests : `scripts/test_db_demo.ts`, 21/21.

- **PR 3, livrée sur `feat/db-migrations` :**
  - migrations versionnées avec `PRAGMA user_version` ; chaque migration s'applique dans une transaction, et un échec s'affiche dans Diagnostic puis est retenté au démarrage suivant ;
  - index unique sur `idempotency_key`, et les doublons existants sont signalés, jamais effacés ;
  - index taillés pour les requêtes des écrans ;
  - garde-fous par triggers : type et montant valides, opération non modifiable une fois enregistrée, au moins une main par adhérent.

  Tests : `scripts/test_migrations.ts`, 27/27, sur un vrai SQLite.
  **Écart avec le plan :** les clés étrangères ne sont pas déclarées. Il faudrait reconstruire les tables, ce qui échouerait sur des lignes anciennes, et la restauration d'une sauvegarde insère les opérations avant la liste des adhérents supprimés. Les triggers couvrent les contrôles sans ce risque.

## Résumé par priorité

| # | Phase | Pourquoi | Effort | Risque |
|---|---|---|---|---|
| 1 | Sécurité des données | Compte démo avec PIN 1234 créé sur chaque nouveau téléphone ; empreintes de PIN lisibles depuis Supabase | Petit | Faible |
| 2 | Base web de démonstration | Démo fausse : cagnotte à 0 HTG, zone remplacée par une date | Petit à moyen | Faible |
| 3 | Migrations versionnées et contraintes | Schéma sans numéro de version, erreurs de migration ignorées, aucune clé étrangère | Moyen | Moyen |
| 4 | Le journal des opérations comme source de vérité | Compteurs dupliqués qui divergent (« 10/4 mains ») | Moyen à grand | Élevé |
| 5 | Montants en entiers | Montants en `REAL` (virgule flottante) | Moyen | Moyen |
| 6 | Nettoyage | Tables et fichiers morts, données de clôture incomplètes | Petit | Faible |
| 7 | Chiffrement sur l'appareil et synchronisation | Base en clair sur le téléphone ; synchro « dernier qui écrit gagne » | Grand | Moyen |

## Phase 1 — Sécurité des données (à faire en premier)

**1a. Le compte de démonstration est créé en production.**
- **Constat :** `seedInitialData` (`db/sqlite.ts:896`) crée le gestionnaire +509 37 12 34 56 avec le PIN `1234`, un carnet et quatre adhérents. Il le fait dès qu'aucun gestionnaire n'existe, donc sur chaque nouvelle installation, y compris en production. N'importe qui peut ouvrir ce compte sur n'importe quel téléphone.
- **Changement :** ne lancer la création des données de démo que sur le web, ou en développement (`__DEV__`). Ajouter une migration qui supprime ce compte s'il n'a jamais été utilisé : aucune opération réelle, téléphone et identifiant de démo inchangés.
- **Test :** au premier démarrage d'une version de production, l'écran de connexion n'accepte pas `37123456` / `1234`.

**1b. Les empreintes de PIN sont lisibles depuis Supabase.**
- **Constat :** la connexion de secours (`AuthContext.tsx`) lit toute la ligne du gestionnaire (`select('*')`, avec `pin_hash`) dans Supabase, avec la clé publique de l'application.
  - Si les règles d'accès ligne par ligne de Supabase (RLS) ne sont pas en place, n'importe qui peut télécharger les empreintes bcrypt de tous les gestionnaires et les attaquer hors ligne : un PIN à 4 chiffres, c'est seulement 10 000 essais.
  - Le code accepte aussi un ancien champ `pin` en clair.
- **Changement :**
  - Vérifier et activer les règles d'accès sur `collectors`, `business_configs`, `clients` et `transactions`.
  - Ne jamais renvoyer `pin_hash` au client. Faire vérifier le PIN par une fonction côté serveur, qui ne renvoie que oui ou non.
  - Supprimer le repli sur `pin` en clair.
  - Sinon, désactiver la connexion via Supabase : l'application est désormais autonome, et la restauration passe par la sauvegarde chiffrée.
- **Test :** une requête avec la seule clé publique ne renvoie aucun `pin_hash`.

**1c. Valeurs par défaut héritées de l'admin.**
- `collectors.status` vaut encore `'PENDING_APPROVAL'` par défaut (schéma et migration). La connexion corrige déjà les comptes concernés, mais le schéma doit dire `'ACTIVE'`.

## Phase 2 — Base web de démonstration

- **Cause des valeurs fausses :** l'adaptateur web (`WebSQLiteAdapter`, `db/sqlite.ts:33`) range les paramètres `?` par position, sans tenir compte des valeurs écrites en dur dans le SQL.
  - Pour le carnet de démo (`VALUES (?, ?, ?, 'SABOTAY', 250, …)`), le montant par main reçoit la date de fin : d'où le **0 HTG** et le « 4 mains × 0 HTG » de l'Accueil.
  - Pour le gestionnaire de démo, `status` reçoit la zone et `zone` reçoit la date.
- **Option A (rapide) :** n'écrire que des `?` dans le SQL de démo, et corriger l'analyse des `VALUES` pour qu'elle associe chaque colonne à son expression, littérale ou `?`. Réinitialiser `SOL_WEB_DB_STORE` pour les navigateurs qui ont déjà la démo faussée.
- **Option B (recommandée à terme) :** remplacer l'adaptateur maison (environ 500 lignes d'analyse SQL par expressions régulières) par le support web d'`expo-sqlite`, qui fait tourner le vrai SQLite dans le navigateur.
  - Il faut ajouter les en-têtes COOP/COEP au serveur web.
  - En échange, le web exécute exactement le même SQL que le téléphone, et toute une famille de bugs disparaît.
- **Test :** sur le web, l'Accueil affiche 1 000 HTG (4 mains × 250 HTG), comme l'onglet Sol.

## Phase 3 — Migrations versionnées et contraintes

**Constat :**
- Les migrations ajoutent des colonnes « si absentes » (`safeAddColumn`), sans numéro de version.
- Toute erreur est avalée (`catch {}`).
- Les clés étrangères sont activées (`PRAGMA foreign_keys = ON`), mais aucune n'est déclarée.
- `idempotency_key` n'a qu'un index ordinaire, pas une contrainte d'unicité.

**Changements :**
1. **Numéro de version :** utiliser `PRAGMA user_version` et une liste de migrations numérotées. Chacune s'exécute dans une transaction ; une erreur arrête la migration et s'affiche dans Diagnostic au lieu d'être ignorée.
2. **Unicité :** index unique sur `transactions(idempotency_key)` quand la clé est renseignée. C'est la garantie qu'un double appui ou une resynchronisation ne crée pas deux fois le même encaissement.
3. **Clés étrangères et contrôles** (reconstruction des tables) :
   - `clients.business_id` → `business_configs.id` ;
   - `transactions.client_id` → `clients.id` ;
   - contrôles du type `hands_count >= 1`, `amount >= 0`, et `type` limité aux valeurs connues.
4. **Index adaptés aux écrans :** `transactions(client_id, created_at_local)` et `transactions(business_id, type, created_at_local)`, pour l'historique et la clôture.
- **Test :** une nouvelle suite `scripts/test_migrations.ts` part d'une base au format actuel, applique les migrations, puis vérifie la version, les contraintes et qu'aucune donnée n'a été perdue.

## Phase 4 — Le journal des opérations comme source de vérité

**Constat :**
- `clients` stocke des totaux recopiés : `current_balance`, `total_paid_amount`, `paid_hands_count`, `received_hands_count`, `has_received_hand` et `has_received_payout`.
- Ces totaux peuvent diverger des opérations réelles. Dans la démo, on voit « 10/4 mains ».
- L'écran Encaisser prend déjà le maximum de trois calculs pour s'en accommoder.

**Changement :**
- Les écritures de `transactions` deviennent la seule référence, et les totaux en sont déduits : une vue SQL `client_totals`, ou un recalcul dans la même transaction que chaque écriture.
- Une vérification de cohérence, lancée depuis Diagnostic, signale et répare les écarts.
- Les annulations (REVERSAL) restent des écritures, sans effacement.

**Garde-fou :** cette phase touche aux règles financières. Elle passe par les 118 + 19 tests existants, plus des tests de cohérence qui partent d'opérations et vérifient les totaux attendus.

## Phase 5 — Montants en entiers

- **Constat :** `amount`, `current_balance`, `contribution_amount` et les autres montants sont en `REAL`. Additionner des nombres à virgule flottante peut donner `1249.9999`.
- **Changement :** stocker des entiers, en centimes de gourde pour garder une marge, et convertir uniquement à l'affichage.
- **Effet de bord :** il faut adapter la sauvegarde chiffrée (version du format) et le schéma Supabase.
- **Test :** les sommes de 1 000 encaissements aléatoires tombent juste.

## Phase 6 — Nettoyage

- **Tables mortes :** `sol_groups` et `sol_group_members`, ainsi que `db/solRepository.ts`, ne servent plus à aucun écran (le sol passe par `business_configs` et `clients`). Les retirer, avec la sauvegarde et la synchro.
- **Fichier mort :** `db/transactionRepo.ts`, deux lignes inutilisées.
- **Clôtures de caisse :** ajouter `cash_closures.business_id`, pour rattacher une clôture à son carnet.
- **Dates :** formats mélangés (`created_at`, `created_at_local`, dates `YYYY-MM-DD`). Fixer une convention : ISO en UTC pour les horodatages, date locale pour les échéances.

## Phase 7 — Chiffrement sur l'appareil et synchronisation

- **Chiffrement :**
  - **Constat :** la base SQLite est en clair sur le téléphone. Un téléphone rooté ou volé expose tout le carnet.
  - **Changement :** activer SQLCipher dans `expo-sqlite` (option du plugin), avec une clé générée et rangée dans `expo-secure-store`.
  - **Contrainte :** il faut un build de développement ou de production ; Expo Go ne le supporte pas.
- **Synchronisation :**
  - **Constat :** les envois Supabase écrasent la version distante (« dernier qui écrit gagne »).
  - **Changement :** ajouter `updated_at` et la suppression logique sur les tables synchronisées, et un curseur de synchro.
  - **Alternative :** l'application étant autonome, on peut aussi réduire Supabase à une sauvegarde distante facultative.

## Ordre conseillé

1. **PR 1 :** phases 1a, 1c et 2 (option A). Effort petit, à fusionner vite.
2. **PR 2 :** phase 1b, côté Supabase et application.
3. **PR 3 :** phase 3, socle des migrations, indispensable avant 4 et 5.
4. **PR 4 :** phase 6.
5. **PR 5 et 6 :** phases 4 et 5, chacune avec ses tests de cohérence.
6. **Plus tard :** phase 7, avec le passage aux builds EAS.
