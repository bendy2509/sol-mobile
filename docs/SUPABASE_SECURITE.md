# Base Supabase — points à traiter

Projet `abeilkegrspsavfavxkh`. État constaté dans le code le 22 octobre 2026 :
- `lib/supabase.ts`, `db/syncEngine.ts` ;
- `context/AuthContext.tsx` ;
- `services/auditService.ts`, `prisma/schema.prisma`.

Je n'ai pas interrogé la base Supabase elle-même. Les vérifications ci-dessous sont à lancer dans **Supabase → SQL Editor**.

## Le problème de fond

L'application se connecte à Supabase avec la **clé publique (anon) seule, sans aucune authentification** : aucun appel `supabase.auth`. Avec cette clé, elle :
- **lit** `collectors` en entier, empreinte du PIN (`pin_hash`) comprise, ainsi que `business_configs` et `clients` ;
- **écrit** dans `collectors`, `business_configs`, `clients`, `transactions` et `audit_logs` ;
- **supprime définitivement** des lignes de `clients` et de `transactions`.

La clé publique est incluse dans l'application : n'importe qui peut l'extraire. Il n'y a que deux situations possibles :
- **les règles d'accès (RLS) sont désactivées** : n'importe qui peut tout lire, modifier ou effacer, toutes les empreintes de PIN comprises ;
- **elles sont activées avec des politiques ouvertes à `anon`** : le résultat est le même.

Tant que l'application n'a pas d'identité côté Supabase, aucune règle ne peut réserver les données d'un gestionnaire à ce gestionnaire.

## Point 1 — Vérifier l'exposition (5 minutes)

```sql
-- Les règles d'accès sont-elles activées ? (relrowsecurity = true)
select c.relname as table_name, c.relrowsecurity as rls_active
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by 1;

-- Quelles politiques laissent entrer le rôle anon ?
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Ce que le rôle anon a le droit de faire, table par table
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as droits
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name
order by 1;
```

Il y a fuite dès qu'une table a `rls_active = false` et des droits pour `anon`, ou une politique qui vise `anon` ou `public`.

## Point 2 — Fermer l'accès tout de suite (recommandé)

L'application est désormais **autonome** : son registre est sur le téléphone, et la restauration passe par la **sauvegarde chiffrée**. La synchronisation Supabase n'est donc plus nécessaire pour qu'elle fonctionne.

Le script ci-dessous ferme la base au public. Il active les règles d'accès sans aucune politique pour `anon`, retire les droits et masque `pin_hash`.

```sql
begin;

-- 1. Règles d'accès activées sur toutes les tables de l'application
alter table public.collectors        enable row level security;
alter table public.business_configs  enable row level security;
alter table public.clients           enable row level security;
alter table public.transactions      enable row level security;
alter table public.cash_closures     enable row level security;
alter table public.sol_groups        enable row level security;
alter table public.sol_group_members enable row level security;
-- (la table audit_logs n'existe que si elle a été créée à la main)
do $$ begin
  if to_regclass('public.audit_logs') is not null then
    execute 'alter table public.audit_logs enable row level security';
  end if;
end $$;

-- 2. Suppression des politiques existantes qui ouvrent l'accès au public
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and (roles @> array['anon']::name[] or roles @> array['public']::name[])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 3. Plus aucun droit direct pour les visiteurs anonymes
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

commit;
```

**Effets côté application :**
- **Ce qui continue de marcher :** encaisser, remettre la main, clôturer, sauvegarder et restaurer, puisque tout se passe sur le téléphone.
- **Ce qui s'arrête :** la synchronisation vers Supabase (l'application est conçue hors ligne d'abord, donc les envois échouent sans bloquer) et la connexion « de secours », qui récupérait un compte depuis Supabase sur un nouveau téléphone. Ce cas passe désormais par la sauvegarde chiffrée.

**Vérification après le script :** relance la requête du point 1. Toutes les tables doivent afficher `rls_active = true`, sans politique ni droit pour `anon`.

## Point 3 — Choisir l'avenir de la synchronisation (décision produit)

| Option | Principe | Coût | Quand la choisir |
|---|---|---|---|
| **A. Pas de cloud** | La base reste fermée (point 2). On retire le code de synchro de l'app. | Faible | Un gestionnaire, un téléphone, une sauvegarde chiffrée. C'est le modèle actuel. |
| **B. Sauvegarde distante** | L'app envoie son fichier `.solbak`, **déjà chiffré**, dans Supabase Storage. Le serveur ne voit jamais les données en clair. | Moyen | Pour une copie hors du téléphone sans exposer les données. |
| **C. Synchro sécurisée** | Une fonction Edge vérifie le PIN côté serveur et délivre un jeton par gestionnaire. Les règles d'accès filtrent ensuite chaque table sur `collector_id = auth.jwt() ->> 'collector_id'`. | Élevé | Pour plusieurs appareils par carnet, un tableau de bord web, ou un suivi central. |

Je recommande A tout de suite, puis B si une copie hors du téléphone est voulue. C ne vaut que si un besoin multi-appareils existe vraiment.

Esquisse de C, pour référence :

```sql
-- Chaque table filtrée sur le gestionnaire du jeton (exemple : transactions)
create policy "gestionnaire: ses opérations"
on public.transactions for all to authenticated
using (collector_id = (auth.jwt() ->> 'collector_id')::uuid)
with check (collector_id = (auth.jwt() ->> 'collector_id')::uuid);

-- pin_hash n'est jamais lisible par le client, même authentifié
revoke select (pin_hash) on public.collectors from authenticated;
```

## Point 4 — Corriger le schéma serveur (si la synchro est gardée, options B ou C)

Le schéma Prisma (`prisma/schema.prisma`) et la base du téléphone ont divergé :
- **Colonnes absentes côté serveur :** `transactions` n'a pas `hands_covered`, `note`, `idempotency_key`, `is_reversed`, `reversal_id` ni `reversed_at`. `clients` n'a pas les colonnes de mains (`hands_count`, `received_hands_count`, `payout_ranks`…). `business_configs` n'a pas `cycle_status`. Les tables `closed_cycles` et `audit_logs` n'existent pas. Résultat : les envois de ces données échouent ou les perdent.
- **Effacements en cascade :** `Transaction.client` est en `onDelete: Cascade`. Effacer un adhérent efface son historique d'opérations, et l'application envoie aussi ses propres `delete()` sur `transactions`. Pour garder la trace, ce qui est la règle des annulations (REVERSAL), il faudrait passer en suppression logique (`deleted_at`) et en `onDelete: Restrict`.
- **Unicité :** il faudrait un index unique sur `transactions(idempotency_key)`, pour qu'un renvoi n'enregistre pas deux fois la même opération.

## Point 5 — Ce que je change dans l'application (PR 2, à mon niveau)

**Fait sur `fix/supabase-securite` :**
- **L'interrupteur `CLOUD_SYNC_ENABLED` (`lib/supabase.ts`) est à `false`,** et tous les appels Supabase le vérifient. Il ne faut le remettre à `true` que derrière un serveur qui identifie chaque gestionnaire.
- **Point 1, fait :** la connexion de secours est retirée. Le compte vit sur le téléphone, et un nouvel appareil s'installe depuis la sauvegarde chiffrée.
- **Point 2, fait :** le moteur de synchro ne démarre plus. La pastille et la ligne « Synchronisation » sont masquées.
- **Point 3, fait :** plus d'effacement d'adhérents ni d'opérations à distance, et plus d'envoi du journal d'audit.
- **Point 4, sans objet tant que la synchro est coupée :** les filtres `.or()` restants ne sont plus appelés, et ils ne reçoivent que des identifiants internes. Ils seront à revoir si la synchro revient.

1. **Connexion de secours :** elle ne lit plus `pin_hash` depuis Supabase, et l'acceptation d'un champ `pin` en clair disparaît. Avec l'option A, cette connexion est retirée ; la récupération passe par le code de récupération et la sauvegarde chiffrée.
2. **Synchronisation :** elle est désactivée par un réglage tant que l'option B ou C n'est pas en place, au lieu d'échouer en silence toutes les 30 secondes.
3. **Effacements distants :** l'application n'efface plus d'opérations à distance.
4. **Filtres PostgREST :** les filtres construits par concaténation de texte (`.or(\`phone_number.eq.${…}\`)`) sont remplacés par des filtres paramétrés.

## Récapitulatif — à faire de ton côté dans Supabase

- [ ] Lancer les requêtes du point 1 et noter le résultat
- [ ] Lancer le script du point 2
- [ ] Relancer le point 1 pour vérifier que tout est fermé
- [ ] Choisir l'option A, B ou C (point 3)
- [ ] Si des données réelles ont été envoyées : considérer que les empreintes de PIN ont pu être lues, et faire changer les PIN des gestionnaires concernés (Réglages → Changer le code PIN)
