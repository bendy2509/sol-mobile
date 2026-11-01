📱 BRIEFING COMPLET DU PROJET : SOL MOBILE
1. 🎯 Idée Centrale & Objectif Métier
Le Problème

En Haïti et dans les Caraïbes, l'accès au système bancaire traditionnel est limité. La population s'appuie massivement sur des systèmes financiers communautaires séculaires :

Le SOL (Tontine rotative / ROSCA) : un groupe de personnes cotise régulièrement (chaque jour, semaine ou quinzaine). À chaque tour, un adhérent prédéfini ou tiré au sort perçoit l'intégralité de la cagnotte (« Bay Men »).
Le SABOTAY (Épargne libre / Dépôt journalier) : les commerçants et particuliers confient quotidiennement de petites sommes à un collecteur de confiance et retirent leur capital à une échéance convenue.

Historiquement, ces tontines sont gérées sur des cahiers papier, ce qui pose de graves problèmes : risques de fraude, perte physique du cahier, erreurs de calcul des dates et des cagnottes, contestations sur les remises de mains et incapacité de fournir des reçus certifiés.

L'Objectif de SOL Mobile

SOL Mobile est une application mobile professionnelle (React Native / Expo / TypeScript), fonctionnant 100% hors-ligne (Offline-First) avec base de données SQLite locale, conçue pour les gestionnaires de tontines et les superviseurs administratifs.

L'application permet de :

Gérer dynamiquement les carnets SOL et SABOTAY sans calculatrice manuelle.
Encaisser les cotisations en quelques secondes (avec QR Code ou recherche rapide).
Gérer les adhérents à mains multiples (un adhérent cotisant pour 1, 2, 3 parts ou plus).
Suivre en temps réel qui est à jour, qui est en avance et qui est en retard.
Effectuer les décaissements de cagnotte en toute sécurité juridique avec quittance légale.
Générer et partager des reçus PDF officiels (directement via WhatsApp ou impression).
Permettre une supervision nationale par un Super-Admin (dashboard d'audit, déblocage, hotline).
2. 👥 Les Rôles Utilisateurs & Sécurité

L'application applique un contrôle d'accès strict basé sur les rôles (UserRole) :

Rôle	Description	Droits Principaux
ADMIN (Superviseur)	Direction / Super-Admin	Contrôle tous les gestionnaires, valide/suspend les comptes, réinitialise les codes PIN, configure la hotline officielle, inspecte les carnets en mode superviseur (👑 MODE SUPERVISEUR), annule administrativement les transactions d'anciens cycles.
MANAGER (Gestionnaire)	Responsable de carnet / Collecteur	Gère son carnet, inscrit des enfants/adhérents, encaisse, attribue les rangs, décaisse les cagnottes, effectue les clôtures de caisse journalières, renouvelle les cycles.
READ_ONLY / USER	Consultation seule	Visualisation des données sans pouvoir modifier ou encaisser.
Sécurité du Code PIN (4 chiffres)
Hachage cryptographique : bcryptjs calibré à 8 tours de sel, optimisé pour le moteur JavaScript Hermes sur mobile (temps de calcul divisé par 4,5, ~200 ms).
Cache en mémoire : Réponse à 0 ms lors des vérifications répétées d'une même session.
PIN Admin d'urgence : Hachage pré-calculé pour 9999 évitant toute saturation CPU.
Validation obligatoire : Requise pour toute action critique (décaissement, clôture, modification de carnet, réinitialisation, annulation).
3. ⚖️ Règles Métier Fondamentales (Cruciales pour l'Agent)

L'agent qui travaille sur le code doit impérativement respecter ces 5 règles métier :

Règle 1 : Le nombre de mains est STRICTEMENT DYNAMIQUE

Le nombre total de mains d'un cycle n'est JAMAIS fixé arbitrairement à l'avance. Il est égal à la somme exacte des mains souscrites par chaque enfant inscrit (SUM(hands_count)).

Exemple : Si un carnet compte 3 enfants d'1 main et 1 enfant de 3 mains, le cycle compte 4 enfants et 6 mains.
La cagnotte versée au bénéficiaire est toujours : Cagnotte = Nombre total de mains du cycle × Cotisation unitaire (ex : 6 × 250 HTG = 1 500 HTG).
Règle 2 : Gestion des Mains Multiples (Souscriptions à plusieurs parts)

Un enfant/adhérent peut posséder plusieurs mains (ex: 3 mains).

Il cotise 3 × Montant unitaire par tour.
Il a droit à plusieurs rangs de tirage (ex: rangs 1, 4, 7).
Il doit percevoir 3 cagnottes distinctes au fil du cycle pour que son statut passe à « Mains toutes reçues » (receivedHandsCount >= handsCount).
Règle 3 : Calcul des Avances, Retards et Échéances (paid_until_date)
Si un adhérent verse plus que le montant d'un tour, l'excédent couvre les tours suivants.
Sa date de couverture (paid_until_date) s'étend dans le futur selon la fréquence (DAILY, 8_DAYS, 15_DAYS, MONTHLY, WED_SAT).
Statuts automatiques : PAID_TODAY, PAID_IN_ADVANCE, UNPAID_TODAY, OVERDUE.
Règle 4 : Immuabilité & Grand Livre d'Audit (Double-Entry Ledger)
Aucune transaction financière n'est supprimée brutalement de la base.
Une annulation crée une transaction de type REVERSAL avec le motif obligatoire et la référence [Réf #txIdOriginal].
La ligne de vie financière de l'adhérent (reconstructClientFinancialTimeline) est recalculée atomiquement à partir des écritures valides restantes.
Règle 5 : Archivage Historique des Cycles Clôturés (closed_cycles)
Lorsqu'un cycle se termine ou est renouvelé (renewSolCycle), un snapshot complet de tous les membres, montants collectés, distribués et pourcentages est archivé dans la table closed_cycles.
Le gestionnaire peut réimprimer le bilan PDF certifié de n'importe quel cycle passé à tout moment.
4. 🏗️ Ce qui a été Réalisé & Validé (État Actuel)

Toutes les briques suivantes sont 100% fonctionnelles, testées et validées :

Architecture & Écrans Principaux (app/) :

app/(tabs)/index.tsx : Dashboard principal avec Hero métriques, bénéficiaire actuel de la cagnotte, recherche, filtres et accès rapide.
app/(tabs)/collect.tsx : Écran d'encaissement express (préréglages 1, 2, 3, 5 cotisations, calcul auto des mains couvertes, impression immédiate).
app/(tabs)/sol.tsx : Table d'honneur du cycle SOL, liste ordonnée par rangs de tirage, statut de perception, bouton de décaissement immédiat.
app/(tabs)/history.tsx : Historique global avec filtres, détail complet, génération de reçu PDF et partage WhatsApp.
app/client/[id].tsx : Dossier adhérent complet, historique individuel, édition des mains [-] / [+], QR Code.
app/closure.tsx : Clôture journalière de caisse avec confrontation système vs caisse physique et PV de clôture PDF.
app/cycle-management.tsx : Clôture/renouvellement de cycle (mêmes membres ou nouveau départ) et historique complet des cycles fermés avec téléchargement PDF direct.
app/profile.tsx : Profil du gestionnaire (édition du nom, téléphone, zone, modification du PIN, raccourci vers les cycles et bordereaux, coordonnées de l'assistance Admin avec boutons directs Appeler / WhatsApp / Email).
app/admin.tsx : Dashboard Super-Admin (supervision nationale, approbation des gestionnaires, réinitialisation de PIN, configuration hotline, annulation administrative globale).

Responsivité Multi-Appareils (hooks/useResponsive.ts) :

Support fluide du petit smartphone Android (320px/360px), des téléphones standards (iPhone 13/14/15, Samsung) jusqu'aux tablettes (iPad, écrans larges avec conteneurs centrés maxWidth: 720-900px).

Moteur PDF Spooler-Ready (services/pdfService.ts) :

5 formats officiels : Reçu de Cotisation, Attestation & Décharge légale de Décaissement (« Bay Men »), Rapport d'Évolution de Carnet SOL, Bordereau de Supervision Nationale, Procès-Verbal de Clôture de Caisse.
Codes-barres vectoriels SVG, liseré national haïtien (#00209F / #D21034), résilience totale sur Android et Web (fallback Print.printAsync en cas de restriction de partage).

Performance & Élimination de la Latence :

Réduction drastique du temps d'ouverture de session PIN (< 100 ms).
Élimination des requêtes SQLite N+1 dans db/memberRepository.ts et db/businessRepository.ts via des requêtes groupées GROUP BY client_id.

Validation & Tests :

TypeScript : npx tsc --noEmit ➔ 0 erreur.
Tests Financiers & Règles Métier (scripts/test_financial_rules.ts) ➔ 112/112 tests réussis (100% PASS).
Tests Cryptographiques (scripts/test_crypto.ts) ➔ 9/9 tests réussis (100% PASS).
5. 🛠️ Stack Technologique & Architecture des Fichiers
c:\Users\bendy\Desktop\Projet-SOL\sol-mobile
├── app/                        # Expo Router (Pages & Modales)
│   ├── (tabs)/                 # Navigation principale par onglets
│   │   ├── index.tsx           # Dashboard Accueil
│   │   ├── collect.tsx         # Encaissement rapide
│   │   ├── sol.tsx             # Table de passage du Sol
│   │   └── history.tsx         # Historique des transactions
│   ├── client/[id].tsx         # Fiche individuelle adhérent
│   ├── admin.tsx               # Espace Super-Admin
│   ├── profile.tsx             # Profil gestionnaire & Assistance Admin
│   ├── cycle-management.tsx    # Clôture & Historique des cycles fermés
│   ├── closure.tsx             # Clôture journalière de caisse
│   └── login.tsx / register.tsx
├── components/                 # Composants UI réutilisables (Header, Grille métriques, Modales PIN...)
├── db/                         # Couche d'accès aux données SQLite
│   ├── sqlite.ts               # Init base de données, migrations et WebSQLiteAdapter
│   ├── businessRepository.ts   # Métriques, configurations, cycles, archivage
│   ├── clientRepository.ts     # CRUD adhérents, augmentation des mains
│   ├── memberRepository.ts     # Calcul des statuts journaliers des membres
│   └── transactionRepository.ts# Écritures, encaissements, annulations, timeline
├── services/
│   ├── financialService.ts     # Calculs mathématiques purs, calendrier des échéances
│   └── pdfService.ts           # Moteur HTML/CSS vectoriel pour les reçus et rapports
├── context/
│   └── AuthContext.tsx         # Session utilisateur, rôles, cache PIN
├── hooks/
│   └── useResponsive.ts        # Hook centralisé de responsive design
├── lib/
│   └── crypto.ts               # Hachage bcryptjs 8 tours et cache mémoire
└── scripts/                    # Suites de tests automatisés (tsx)
6. ⏳ Tâche Immédiate en Cours & Prochains Chantiers
La Tâche en Cours (Demandée par le Product Owner) :

« Les actions passées d'un cycle ancien ne doivent pas pouvoir être annulées par le gestionnaire, seul l'admin peut le faire sur demande. »

Comportement attendu :
Si une transaction date d'un cycle antérieur (created_at_local < activeBusiness.startDate ou figurant dans closed_cycles) :
Le gestionnaire NE PEUT PAS l'annuler. Le bouton d'annulation est verrouillé avec la mention explicite : « Action d'un cycle clôturé - Seul l'administrateur peut l'annuler sur demande ».
Un bouton direct permet au gestionnaire d'envoyer la demande officielle à l'Admin (via WhatsApp / Hotline).
L'Administrateur conserve le droit d'annuler ces écritures passées sur sa console d'administration avec son code PIN Super-Admin.
Le plan technique a déjà été rédigé dans implementation_plan.md et attend l'approbation pour exécution.
Chantiers Futurs Possibles :
Synchronisation Cloud / API distante : Passerelle de synchronisation automatique avec une base distante (ex. Supabase / Postgres) lorsque l'appareil retrouve une connexion Internet (sync_status = 'PENDING' -> 'SYNCED').
Impression Thermique Bluetooth : Option pour envoyer les reçus directement sur de petites imprimantes de poche Bluetooth (commandes ESC/POS 58mm/80mm) pour les collecteurs sur les marchés publics.