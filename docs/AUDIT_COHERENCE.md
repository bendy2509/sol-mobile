# Audit de cohérence du SOL (28 octobre 2026)

Cet audit vérifie que l'app applique les règles d'un sol partout : sur les dates, les paramètres, les échéances, la caisse, les rapports et les cycles. Il couvre aussi ce qui se passe quand on modifie le carnet. Les corrections se répartissent en 7 lots, sur les branches `feat/calendrier-sol` → `chore/audit-final`.

## Règles appliquées

1. **Échéances**
   - Chaque adhérent doit toutes ses mains à chaque tour, depuis la date de début du cycle.
   - Un adhérent inscrit au jour 3 doit rattraper les jours 1 à 3.
2. **Paiement partiel**
   - Le jour même, une main partielle est « À encaisser · partiel ».
   - À partir du lendemain, elle passe « En retard ».
   - Exemple : un adhérent à 2 mains qui paie 1 main ne couvre ce jour-là qu'une main. La seconde est à encaisser, puis en retard le lendemain.
3. **Paramètres verrouillés** : dès le premier encaissement du cycle, le montant par main, la fréquence et la date de début ne changent plus. On clôture le cycle pour en ouvrir un autre avec d'autres paramètres.
4. **Inscriptions verrouillées**
   - Dès qu'une main a été remise, on ne peut plus ajouter, modifier ou retirer d'adhérent, ni changer ses mains.
   - Le verrou se lève quand toutes les remises du cycle sont annulées.
5. **Tours et date de fin** : un tour par main. La date de fin est le jour du dernier tour, calculée en jours locaux (heure d'Haïti).

## Constats et corrections

| # | Constat | Correction |
|---|---|---|
| 1 | La couverture avançait d'un jour par main payée. Un adhérent à 2 mains qui payait 1 main était « Payé aujourd'hui ». | Un seul calendrier, `services/scheduleService.ts`. Les statuts, la couverture, l'accueil, les compteurs, l'aperçu d'encaissement et le recalcul depuis les opérations l'utilisent tous. La migration 8 recalcule les données existantes. |
| 2 | Aucun échéancier par adhérent. | Carte « Échéancier » sur la fiche adhérent : chaque tour, ses mains payées, son état, et le jour de la remise. |
| 3 | Date de fin calculée à 2 endroits, avec des résultats différents. À l'inscription, elle était fixée à « début + 30 jours ». | Un seul calcul. Les tours et la date de fin sont recalculés après chaque changement d'adhérent. |
| 4 | Mercredi/samedi et hebdomadaire décalés d'un jour en Haïti (lecture en UTC). | Calcul en jours locaux, testé avec le fuseau d'Haïti. |
| 5 | La date de début du cycle n'était affichée nulle part. | Début → fin sur l'Accueil, l'onglet Sol, l'écran Cycle, les PDF et chaque cycle clôturé. |
| 6 | « Réglages → Carnet » créait un nouveau carnet. | L'écran modifie le carnet actif. Les règles sont verrouillées dès le premier encaissement, et le nombre de tours découle des mains. |
| 7 | Rien n'empêchait d'ajouter un adhérent après une remise. La suppression d'un adhérent effaçait aussi ses encaissements. | Verrou des inscriptions. Un adhérent qui a des opérations dans le cycle ne peut être retiré qu'après leur annulation. |
| 8 | Le montant remis était calculé de 4 façons selon l'écran. | C'est la base qui le fixe : montant par main × mains du cycle. |
| 9 | La fermeture de caisse ne vérifiait pas qui avait payé. | Liste des impayés du jour, puis choix entre « Laisser la caisse ouverte » et « Fermer quand même ». La liste est enregistrée (migration 9) et imprimée sur le PV. Une deuxième clôture le même jour demande confirmation. |
| 10 | « Repartir de zéro » supprimait les transactions, et l'archive du cycle avait de faux totaux. | Rien n'est supprimé. Les totaux viennent des opérations réelles. Le cycle clôturé garde son début, sa fin prévue, sa date de clôture et son calendrier des remises. Si l'archivage échoue, la clôture est bloquée. |
| 11 | Le statut du rapport PDF affichait toujours « RETARD ». | Statuts corrigés. Le rapport affiche la période, le reste à encaisser, payé / dû et le calendrier des remises. Nouveau relevé par adhérent. Les reçus indiquent les tours payés. Le PV liste les impayés. |
| 12 | Une annulation qui vidait les versements d'un adhérent le laissait « couvert jusqu'au début du cycle ». | L'adhérent revient sans couverture. |
| 13 | Exemples au nom de Jean-Baptiste, Marie-Carmel, etc. | Bendy SERVILUS, Bendy, SERVILUS, BS, B. Servilus. La démo inclut un adhérent à 2 mains en paiement partiel. |
| 14 | Aperçu web : historique d'un adhérent vide, annulation de la mauvaise opération, cycles clôturés invisibles, faux « Anomalie » du diagnostic, PDF qui imprimaient l'écran. | L'émulation SQLite du web lit le bon paramètre pour chaque filtre, gère les cycles clôturés et le contrôle d'intégrité, et imprime le document généré. |
| 15 | L'encaissement proposait toujours un tour complet. | Il propose ce qui est dû à ce jour : par exemple, la seconde main d'un tour partiel. |

## Tests automatiques

`npm test` lance `tsc` puis toutes les suites :

| Suite | Résultat |
|---|---|
| `test_schedule.ts` (calendrier, exemple Bendy + SERVILUS) | 27 / 27 |
| `test_financial_rules.ts` | 118 / 118 |
| `test_ledger.ts` | 33 / 33 |
| `test_migrations.ts` (dont migrations 8 et 9) | 35 / 35 |
| `test_db_demo.ts` | 24 / 24 |
| `test_security.ts` | 30 / 30 |
| `test_crypto.ts` | 9 / 9 |
| `test_i18n.ts` (français / kreyòl, 0 texte sans traduction) | 5 / 5 |

L'ancienne suite `test-financial-rules.ts` (19 tests) est retirée : ce qu'elle testait est déjà couvert par `test_financial_rules.ts`.

## Parcours vérifiés dans l'aperçu web (compte de démo)

| Parcours | Résultat |
|---|---|
| Connexion avec le PIN | OK |
| Accueil | Statuts « En avance », « À encaisser · partiel, 1 main », « En retard · 2 tours », avec début → fin |
| Encaissement de la seconde main de SERVILUS | 1 main proposée, puis « Payé aujourd'hui », 6/10 |
| Fiche adhérent | Échéancier tour par tour, historique des opérations |
| Onglet Sol | Période et jour de remise de chacun |
| Remise de la main à SERVILUS | 1 250 HTG enregistrés |
| Verrou des inscriptions | « Nouvel adhérent » est bloqué tant qu'une remise existe. Après l'annulation des 2 remises, le verrou se lève. |
| Annulation d'une remise | Mains reçues remises à 0, encaissements et solde intacts |
| Fermeture de caisse avec impayés | La liste s'affiche avec le choix. « Fermer quand même » enregistre les impayés. |
| Clôture du cycle en conservant les membres | Cycle #1 archivé : 2 500 HTG encaissés, 1 000 HTG remis, 62,5 %, du 26 au 29 oct. |
| Rapport PDF du carnet | Période, tours, statuts, remises prévues, calendrier |
| Réglages du carnet | Montant, fréquence et date verrouillés. Le changement de nom modifie le carnet existant. |
| Diagnostic « Cohérence du carnet » | 0 écart |

## Ce qui reste hors de cet audit

- **À vérifier sur téléphone avec le prochain APK** : le relevé adhérent PDF, le PV de clôture PDF et les reçus. Les modèles compilent, mais ils n'ont pas été affichés : sur le web, les menus à boutons (`Alert`) ne s'ouvrent pas.
- **Sur le web**, les messages de succès ou d'erreur (`Alert`) ne s'affichent pas. Sur téléphone, ils s'affichent.
- **Rôles** : il reste du code de l'ancien rôle « lecture seule » (`isReadOnly`). Le rôle vaut toujours « gestionnaire », donc ce code est sans effet.
- **Clôture de cycle** : elle ne demande pas de confirmation si des mains restent à remettre ou à encaisser. C'est une piste d'amélioration.
