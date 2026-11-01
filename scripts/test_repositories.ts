// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const process: { env: Record<string, string | undefined>; exit(code: number): never };

// Run with the phone-only modules stubbed: npx tsx --require ./scripts/support/register-stubs.cjs
// (scripts/run_tests.ts does it). The repositories below are the app's real code, on SQLite.
process.env.TZ = 'America/Port-au-Prince';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, setActiveBusinessId } from '../db/sqlite';
import {
  ENROLLMENT_LOCKED_MESSAGE,
  SETTINGS_LOCKED_MESSAGE,
  getActiveBusinessConfig,
  getClosedCycles,
  getDashboardMetrics,
  getEnrollmentLock,
  renewSolCycle,
  saveBusinessConfig,
  updateActiveBusinessSettings,
} from '../db/businessRepository';
import { createClient, deleteClient, updateClientDetails } from '../db/clientRepository';
import { createTransaction, getTransactions, reverseTransaction } from '../db/transactionRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '../db/memberRepository';
import { createCashClosure, getCashClosures, getUnpaidForDate } from '../db/cashClosureRepository';
import { findLedgerDiscrepancies } from '../db/ledgerRepository';
import { localDateString } from '../lib/dates';

console.log('==================================================');
console.log('TEST SUITE: REPOSITORIES ON SQLITE (FULL CYCLE)');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name}`);
    failed++;
  }
}

async function rejects(fn: () => Promise<unknown>, message: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return String(e?.message || '').includes(message);
  }
}

const day = 24 * 60 * 60 * 1000;
const isoDay = (offset: number) => localDateString(new Date(Date.now() + offset * day));

(async () => {
  // Setup: a manager and a daily sol of 500 G a hand, started 2 days ago
  const db = await getDatabase();
  const collectorId = 'c-test';
  await db.runAsync(
    `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    [collectorId, 'Bendy SERVILUS', '+50937000001', 'hash', 'Pétion-Ville', new Date().toISOString()]
  );
  await AsyncStorage.setItem('SOL_ACTIVE_COLLECTOR_ID', collectorId);
  const start = isoDay(-2);
  const biz = await saveBusinessConfig({
    collectorId,
    name: 'Sol BS',
    type: 'SOL',
    contributionAmount: 500,
    frequency: 'DAILY',
    totalSlots: 1,
    startDate: start,
    endDate: start,
    status: 'ACTIVE',
  });
  await setActiveBusinessId(biz.id);

  // 1. Enrolment shapes the cycle: one round per hand
  const bendy = await createClient({ fullName: 'Bendy', phoneNumber: '+50937000011', type: 'SOL', dailyAmount: 500, handsCount: 1, collectorId, businessId: biz.id });
  const servilus = await createClient({ fullName: 'SERVILUS', phoneNumber: '+50937000012', type: 'SOL', dailyAmount: 500, handsCount: 3, collectorId, businessId: biz.id });
  let business = await getActiveBusinessConfig(collectorId);
  assert(business?.totalSlots === 4 && business.endDate === isoDay(1), 'Bendy 1 + SERVILUS 3 = 4 rounds, end = start + 3 days');
  assert(servilus.payoutRanks === '2,3,4', 'SERVILUS receives ranks 2, 3 and 4');

  // 2. Collections fill the rounds from the cycle start
  await createTransaction({ clientId: servilus.id, amount: 1500, type: 'SOL_CONTRIBUTION', collectorId, businessId: biz.id });
  await createTransaction({ clientId: bendy.id, amount: 1500, type: 'SOL_CONTRIBUTION', collectorId, businessId: biz.id });
  let members = await getMembersWithPaymentStatus();
  let s = members.find((m) => m.id === servilus.id)!;
  let b = members.find((m) => m.id === bendy.id)!;
  assert(s.paidUntilDate === start, 'SERVILUS paid 3 hands: the first round only (3 hands per round)');
  assert(s.paymentStatusToday === 'OVERDUE' && s.lateHands === 3 && s.missingHandsToday === 3, 'SERVILUS owes yesterday (late) and today');
  assert(b.paymentStatusToday === 'PAID_TODAY' && b.paidUntilDate === isoDay(0), 'Bendy paid 3 hands: covered until today');

  await createTransaction({ clientId: servilus.id, amount: 2500, type: 'SOL_CONTRIBUTION', collectorId, businessId: biz.id });
  members = await getMembersWithPaymentStatus();
  s = members.find((m) => m.id === servilus.id)!;
  assert(s.paymentStatusToday === 'UNPAID_TODAY' && s.isPartialToday === true && s.missingHandsToday === 1, '8 hands paid: 2 rounds done, today partial (2/3), 1 hand to collect');
  assert(await rejects(() => createTransaction({ clientId: bendy.id, amount: 1000, type: 'SOL_CONTRIBUTION', collectorId }), 'Dépassement'), 'Bendy cannot pay past his 4 hands of the cycle (1 left, 2 offered)');
  assert(await rejects(() => createTransaction({ clientId: servilus.id, amount: 2500, type: 'SOL_CONTRIBUTION', collectorId }), 'identique'), 'The same collection sent twice in a row is refused (double tap)');

  // 3. Settings lock at the first collection; the name still changes
  assert(await rejects(() => updateActiveBusinessSettings({ name: 'Sol BS', type: 'SOL', contributionAmount: 250, frequency: 'DAILY', startDate: start }), SETTINGS_LOCKED_MESSAGE), 'Amount locked once a collection exists');
  await updateActiveBusinessSettings({ name: 'Sol BS Pétion-Ville', type: 'SOL', contributionAmount: 500, frequency: 'DAILY', startDate: start });
  business = await getActiveBusinessConfig(collectorId);
  const carnets = await db.getAllAsync('SELECT id FROM business_configs');
  assert(business?.name === 'Sol BS Pétion-Ville' && carnets.length === 1, 'Renaming edits the carnet in place (no second carnet)');

  // 4. Cash closure lists who has not fully paid today
  const unpaid = await getUnpaidForDate();
  assert(unpaid.length === 1 && unpaid[0].clientId === servilus.id && unpaid[0].missingHands === 1 && unpaid[0].amount === 500, 'Unpaid today: SERVILUS, 1 hand, 500 G');
  await createCashClosure({ totalCashDeclared: 0, unpaidMembers: unpaid, closureNote: 'SERVILUS paiera demain' });
  const closures = await getCashClosures(collectorId);
  assert(closures.length === 1 && closures[0].unpaidMembers?.[0]?.fullName === 'SERVILUS' && closures[0].closureNote === 'SERVILUS paiera demain', 'The closure keeps the unpaid list and the note');

  // 5. Payout: the pot is fixed by the repository; enrolment locks
  const payout = await payoutMemberHand(bendy.id, 1, 'Main du tour 1', biz.id);
  assert(payout.amount === 2000, 'The hand pays 4 × 500 G = 2 000 G, whatever amount the screen sent');
  assert((await getEnrollmentLock(collectorId)).locked, 'A hand paid out locks the members');
  assert(await rejects(() => createClient({ fullName: 'BS', phoneNumber: '+50937000013', type: 'SOL', dailyAmount: 500, collectorId }), ENROLLMENT_LOCKED_MESSAGE), 'No new member after a payout');
  assert(await rejects(() => updateClientDetails(servilus.id, { handsCount: 2 }), ENROLLMENT_LOCKED_MESSAGE), 'No change of hands after a payout');
  assert(await rejects(() => deleteClient(servilus.id), ENROLLMENT_LOCKED_MESSAGE), 'No removal after a payout');
  await updateClientDetails(servilus.id, { fullName: 'SERVILUS B.' });
  assert((await getMembersWithPaymentStatus()).some((m) => m.fullName === 'SERVILUS B.'), 'The name of a member still changes');
  assert(await rejects(() => payoutMemberHand(bendy.id, 1), 'Action interdite'), 'Bendy cannot receive a second hand (1 hand)');

  // 6. Reversing the payout lifts the lock and restores the member
  await reverseTransaction({ transactionId: payout.id, reason: 'Test' });
  assert(!(await getEnrollmentLock(collectorId)).locked, 'Reversing every payout lifts the lock');
  b = (await getMembersWithPaymentStatus()).find((m) => m.id === bendy.id)!;
  assert(b.receivedHandsCount === 0 && b.paidHandsCount === 3, 'Bendy: hand received undone, his 3 paid hands kept');
  const bs = await createClient({ fullName: 'BS', phoneNumber: '+50937000013', type: 'SOL', dailyAmount: 500, collectorId, businessId: biz.id });
  business = await getActiveBusinessConfig(collectorId);
  assert(business?.totalSlots === 5, 'BS joins once the lock lifts: 5 rounds');
  assert((await getMembersWithPaymentStatus()).find((m) => m.id === bs.id)?.paymentStatusToday === 'OVERDUE', 'BS joined on day 3: owes days 1 and 2 (late) and today');
  assert(await rejects(() => deleteClient(servilus.id), 'opérations'), 'A member with collections cannot be removed (no collection disappears)');

  // 6b. Statuses come from the ledger: a wrong stored counter changes nothing
  await db.runAsync(`UPDATE clients SET paid_hands_count = 99, received_hands_count = 2 WHERE id = ?`, [servilus.id]);
  s = (await getMembersWithPaymentStatus()).find((m) => m.id === servilus.id)!;
  assert(s.paidHandsCount === 8 && s.receivedHandsCount === 0 && s.isPartialToday === true, 'A tampered counter (99 hands, 2 received) is ignored: 8 paid, 0 received, today partial');
  assert((await getUnpaidForDate()).some((u) => u.clientId === servilus.id && u.missingHands === 1), 'The cash closure reads the ledger too');
  assert(await rejects(() => createTransaction({ clientId: servilus.id, amount: 4000, type: 'SOL_CONTRIBUTION', collectorId }), 'Dépassement'), 'The cycle cap reads the ledger (8 paid + 8 > 15 allowed, not 99)');
  await createTransaction({ clientId: servilus.id, amount: 500, type: 'SOL_CONTRIBUTION', collectorId, businessId: biz.id });
  const healed = await db.getFirstAsync<{ paid_hands_count: number }>(`SELECT paid_hands_count FROM clients WHERE id = ?`, [servilus.id]);
  assert(healed?.paid_hands_count === 9, 'The next collection rewrites the stored counter from the ledger (9)');
  await db.runAsync(`UPDATE clients SET received_hands_count = 0 WHERE id = ?`, [servilus.id]);

  // 7. The stored totals equal the ledger
  assert((await findLedgerDiscrepancies(collectorId)).length === 0, 'Ledger check: no difference between totals and operations');
  const metrics = await getDashboardMetrics();
  assert(metrics.totalPotAmount === 2500 && metrics.totalHandsExpected === 5, 'Dashboard: 5 hands, pot 2 500 G');

  // 8. Closing the cycle keeps every operation and archives its dates and totals
  const before = (await getTransactions({ collectorId })).length;
  await payoutMemberHand(bendy.id, 1, 'Main du tour 1', biz.id);
  await renewSolCycle({ businessId: biz.id, collectorId, mode: 'RENEW_SAME_MEMBERS', userId: collectorId, userRole: 'MANAGER', name: 'Sol BS 2', contributionAmount: 500, frequency: 'DAILY' });
  const closed = await getClosedCycles(collectorId);
  assert(closed.length === 1 && closed[0].startDate === start && closed[0].endDate === isoDay(2), 'Closed cycle archived with its start and planned end (5 rounds)');
  assert(closed[0].totalCollected === 6000 && closed[0].totalDistributed === 2500, 'Archive totals from the operations: 6 000 G collected, 2 500 G paid out');
  assert((await getTransactions({ collectorId })).length === before + 1, 'No operation deleted by the renewal');
  members = await getMembersWithPaymentStatus();
  assert(members.length === 3 && members.every((m) => m.paidHandsCount === 0 && m.receivedHandsCount === 0 && !m.paidUntilDate), 'Members kept with fresh counters and no coverage');
  assert(!(await getEnrollmentLock(collectorId)).locked, 'The new cycle starts unlocked');
  await deleteClient(bs.id);
  assert((await getMembersWithPaymentStatus()).length === 2, 'A member with no operation in the new cycle can be removed');

  // 9. Reversing a collection: the hands go back, coverage follows the calendar again
  const c1 = await createTransaction({ clientId: bendy.id, amount: 500, type: 'SOL_CONTRIBUTION', collectorId, businessId: biz.id });
  b = (await getMembersWithPaymentStatus()).find((m) => m.id === bendy.id)!;
  assert(b.paidHandsCount === 1 && b.paidUntilDate === localDateString(), 'New cycle: Bendy pays 1 hand, covered today');
  await reverseTransaction({ transactionId: c1.id, reason: 'Erreur de montant' });
  b = (await getMembersWithPaymentStatus()).find((m) => m.id === bendy.id)!;
  assert(b.paidHandsCount === 0 && !b.paidUntilDate && b.paymentStatusToday === 'UNPAID_TODAY', 'Collection reversed: 0 hand, no coverage, « À encaisser »');
  const reversal = (await getTransactions({ collectorId })).find((t) => t.type === 'REVERSAL' && t.note?.includes(c1.id.slice(0, 8)));
  assert(Boolean(reversal) && reversal!.amount === 500, 'The reversal is a new entry of the same amount (nothing deleted)');
  assert(await rejects(() => reverseTransaction({ transactionId: c1.id, reason: 'Encore' }), 'déjà été annulée'), 'An operation is reversed only once');

  // 10. Cash closure: expected cash = today's collections minus today's payouts (reversed ones excluded)
  const today = (await getTransactions({ collectorId })).filter((t) => !t.isReversed && t.type !== 'REVERSAL' && localDateString(new Date(t.createdAtLocal)) === localDateString());
  const expected =
    today.filter((t) => t.type === 'SOL_CONTRIBUTION').reduce((sum, t) => sum + t.amount, 0) -
    today.filter((t) => t.type === 'SOL_PAYOUT').reduce((sum, t) => sum + t.amount, 0);
  const closure = await createCashClosure({ totalCashDeclared: expected });
  assert(closure.totalSystemCalculated === Math.max(0, expected), `Expected cash at closing = collections − payouts of the day (${expected} G)`);

  console.log('\n==================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌ [FAIL] Unexpected error:', e);
  console.log(`RESULTS: ${passed} PASSED, ${failed + 1} FAILED`);
  process.exit(1);
});
