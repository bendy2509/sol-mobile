import {
  calculatePot,
  isValidContributionMultiple,
  calculateHandsCount,
  calculateContributionAmount,
  calculateCoverageDate,
  calculateClientPaymentStatus,
} from '../services/financialService';

function runTests() {
  console.log('=== DÉMARRAGE DES TESTS UNITAIRES MÉTIER SOL ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`PASS: ${testName}`);
      passed++;
    } else {
      console.error(`FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Calcul de Cagnotte (Pot) : 10 enfants * 250 HTG = 2500 HTG
  const pot = calculatePot(250, 10);
  assert(pot === 2500, 'Calcul de cagnotte (250 HTG x 10 enfants = 2500 HTG)');

  // 2. Validation stricte des multiples
  assert(isValidContributionMultiple(250, 250) === true, 'Validation multiple : 250 HTG pour main de 250 (Valide)');
  assert(isValidContributionMultiple(500, 250) === true, 'Validation multiple : 500 HTG pour main de 250 (Valide)');
  assert(isValidContributionMultiple(750, 250) === true, 'Validation multiple : 750 HTG pour main de 250 (Valide)');
  assert(isValidContributionMultiple(300, 250) === false, 'Rejet non-multiple : 300 HTG pour main de 250 (Rejeté)');
  assert(isValidContributionMultiple(425, 250) === false, 'Rejet non-multiple : 425 HTG pour main de 250 (Rejeté)');
  assert(isValidContributionMultiple(0, 250) === false, 'Rejet montant nul : 0 HTG (Rejeté)');

  // 3. Calcul du nombre de mains
  assert(calculateHandsCount(750, 250) === 3, 'Calcul nombre de mains : 750 HTG = 3 mains de 250 HTG');
  assert(calculateContributionAmount(4, 250) === 1000, 'Calcul montant cotisations : 4 mains x 250 HTG = 1000 HTG');

  // 4. Calcul des dates de couverture pour DAILY
  const cov1 = calculateCoverageDate({
    todayStr: '2026-08-10',
    handsCovered: 3,
    frequency: 'DAILY',
    currentPaidUntilDate: null,
  });
  assert(cov1.startDate === '2026-08-10', 'Date de début quotidienne = 2026-08-10');
  assert(cov1.paidUntilDate === '2026-08-12', 'Date de couverture 3 jours (10, 11, 12 août) = 2026-08-12');

  // 5. Continuité sur avance existante : paidUntil actuel = 15 août, versement de 2 mains le 12 août -> couverture jusqu au 17 août
  const cov2 = calculateCoverageDate({
    todayStr: '2026-08-12',
    handsCovered: 2,
    frequency: 'DAILY',
    currentPaidUntilDate: '2026-08-15',
  });
  assert(cov2.startDate === '2026-08-16', 'Prolongation avance : début le lendemain de fin actuelle = 2026-08-16');
  assert(cov2.paidUntilDate === '2026-08-17', 'Prolongation avance : fin = 2026-08-17');

  // 6. Calcul des dates pour 8_DAYS
  const cov3 = calculateCoverageDate({
    todayStr: '2026-08-01',
    handsCovered: 2,
    frequency: '8_DAYS',
    currentPaidUntilDate: null,
  });
  assert(cov3.paidUntilDate === '2026-08-09', 'Fréquence 8 jours : 2 mains à partir du 1er août = 9 août');

  // 7. Statuts de paiement en temps réel
  const statusAdvance = calculateClientPaymentStatus({
    todayStr: '2026-08-12',
    paidUntilDate: '2026-08-15',
    currentBalance: 750,
    unitAmount: 250,
  });
  assert(statusAdvance.status === 'PAID_IN_ADVANCE', 'Statut en avance : PAID_IN_ADVANCE');
  assert(statusAdvance.handsCoveredAhead === 3, 'Avance calculée : 3 jours');

  const statusToday = calculateClientPaymentStatus({
    todayStr: '2026-08-12',
    paidUntilDate: '2026-08-12',
    currentBalance: 250,
    unitAmount: 250,
  });
  assert(statusToday.status === 'PAID_TODAY', 'Statut à jour aujourd hui : PAID_TODAY');

  const statusOverdue = calculateClientPaymentStatus({
    todayStr: '2026-08-12',
    paidUntilDate: '2026-08-09',
    currentBalance: 0,
    unitAmount: 250,
  });
  assert(statusOverdue.status === 'OVERDUE', 'Statut en retard : OVERDUE');
  assert(statusOverdue.overdueRoundsCount === 3, 'Retard calculé : 3 jours');

  console.log(`\n=== RÉSULTATS : ${passed} TESTS RÉUSSIS, ${failed} ÉCHECS ===`);
  if (failed > 0) process.exit(1);
}

runTests();
