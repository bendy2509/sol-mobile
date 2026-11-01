@AGENTS.md

# SOL Mobile

App de gestion de SOL / SABOTAY (tontines haïtiennes), 100 % hors-ligne.
Expo (SDK 57, Expo Router) + SQLite (expo-sqlite, aussi sur le web), interface en Kreyòl et en Français.
Un seul gestionnaire par carnet, protégé par PIN : pas d'admin, pas de rôles.

## Règles métier

1. Un tour par main : le cycle compte autant de tours que la somme des mains des adhérents ; la fin = jour du dernier tour.
2. Chaque adhérent doit toutes ses mains à chaque tour, depuis la date de début du cycle (un inscrit tardif rattrape).
3. Main partielle ou impayée : « À encaisser » le jour même, « En retard » à partir du lendemain.
4. Dès le premier encaissement, montant par main, fréquence et date de début sont verrouillés (changer = clôturer le cycle).
5. Dès qu'une main est remise, plus d'ajout, de retrait ni de changement de mains ; le verrou se lève si toutes les remises sont annulées.

**REVERSAL** : une opération ne se modifie ni ne se supprime jamais. On l'annule par une écriture inverse
(`REVERSAL`, PIN + motif obligatoires) et les totaux sont recalculés depuis le registre.

## Où vivent les calculs

Interdit de calculer mains, pot, montants, dates ou statuts dans les écrans : appeler les services.
- `services/memberRules.ts` : mains, rangs, mains reçues/payées, mains du cycle, pot, montant par main, prochain bénéficiaire.
- `services/scheduleService.ts` : tours, dates de début/fin, échéancier, couverture, statuts du jour.
- `services/financialService.ts` : montants, plafonds, rejeu du registre.
- Une seule fonction par calcul : si elle n'existe pas, l'ajouter dans le service, puis l'appeler partout.

## Interface

- Aucun texte en dur : tout passe par `t()` (`i18n/fr.ts`, `i18n/ht.ts`, `i18n/ht.phrases.ts`).
- Aucune couleur, taille ou espacement en dur : utiliser `theme/` (`useTheme()`).

## Avant chaque commit

```bash
npx tsc --noEmit
```

```bash
npm test
```

`npm test` doit passer à 100 % : règles financières, calendrier, registre, base, crypto, sécurité, traductions.

## Git

- Travailler sur `dev` ou une branche partie de `dev`, jamais directement sur `main`.
- Les branches vont dans `dev` ; `dev` passe dans `main` en une seule PR.
