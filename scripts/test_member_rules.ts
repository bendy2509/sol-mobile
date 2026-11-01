// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const process: { exit(code: number): never };

import {
  currentRound,
  cycleHandsPaidOut,
  cycleTotalHands,
  handPotAmount,
  hasReceivedAllHands,
  memberHandsCount,
  memberPaidHands,
  memberPayoutRanks,
  memberReceivedHands,
  nextBeneficiary,
  parsePayoutRanks,
} from '../services/memberRules';
import { buildMemberSheet, editableRanks, ledgerEntryKind, ranksToSave } from '../services/memberSheet';

console.log('==================================================');
console.log('TEST SUITE: MEMBER RULES (ONE FUNCTION PER COUNT)');
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

// The manager's sol: Bendy 1 hand (rank 1), SERVILUS 2 hands (ranks 2, 3), BS 1 hand (rank 4)
const bendy = { id: 'b', handsCount: 1, payoutRank: 1, payoutRanks: '1', receivedHandsCount: 1, paidHandsCount: 4 };
const servilus = { id: 's', hands_count: 2, payout_rank: 2, payout_ranks: '2,3', received_hands_count: 0, paid_hands_count: 5 };
const bs = { id: 'x', handsCount: 1, payoutRank: 4 };
const sol = [bendy, servilus, bs];

// 1. Ranks and hands, whatever the shape (app object or database row)
assert(parsePayoutRanks('2, 3') .join() === '2,3' && parsePayoutRanks(null, 4).join() === '4', 'Ranks read from "2, 3" or from the single rank');
assert(memberPayoutRanks(servilus).join() === '2,3', 'A database row gives its ranks');
assert(memberHandsCount(servilus) === 2 && memberHandsCount(bs) === 1, 'Hands of each member');
assert(memberHandsCount({ handsCount: 1, payoutRanks: '5,6' }) === 2, 'At least one hand per payout rank');
assert(memberHandsCount({}) === 1, 'A member always holds at least one hand');

// 2. Hands received, legacy flag included
assert(memberReceivedHands(bendy) === 1 && memberReceivedHands(servilus) === 0, 'Hands received from the counter');
assert(memberReceivedHands({ handsCount: 1, hasReceivedHand: 1 }) === 1, 'Old 1-hand row flagged as paid out counts 1');
assert(memberReceivedHands({ handsCount: 2, hasReceivedPayout: true }) === 0, 'Old 2-hand row with only a flag: the counter decides (0)');
assert(hasReceivedAllHands(bendy) && !hasReceivedAllHands(servilus), 'Bendy has received his hand, SERVILUS not yet');
assert(memberPaidHands(servilus) === 5, 'Hands paid in the cycle');

// 3. Cycle totals
assert(cycleTotalHands(sol) === 4, 'Bendy 1 + SERVILUS 2 + BS 1 = 4 rounds');
assert(handPotAmount(500, cycleTotalHands(sol)) === 2000, 'Each round pays 4 × 500 G = 2 000 G');
assert(cycleHandsPaidOut(sol) === 1 && currentRound(sol) === 2, 'One hand paid out: round 2 is being drawn');

// 4. Next beneficiary: lowest rank not paid out yet
const next = nextBeneficiary(sol);
assert(next?.member.id === 's' && next.rank === 2, 'SERVILUS receives round 2');
const afterOne = nextBeneficiary([bendy, { ...servilus, received_hands_count: 1 }, bs]);
assert(afterOne?.member.id === 's' && afterOne.rank === 3, 'After his first hand, SERVILUS receives round 3');
assert(nextBeneficiary([bendy]) === null, 'Everyone paid out: no next beneficiary');

// 5. Member sheet: the screen's figures in one computation
const asClient = (m: any) => ({ fullName: 'X', phoneNumber: '', qrCodeToken: '', type: 'SOL', ...m });
const business: any = { id: 'biz', startDate: '2026-10-20', frequency: 'DAILY', contributionAmount: 500, endDate: '2026-10-23' };
const clients: any[] = [
  asClient({ ...bendy, fullName: 'Bendy' }),
  asClient({ id: 's', fullName: 'SERVILUS', handsCount: 2, payoutRanks: '2,3', receivedHandsCount: 0, paidHandsCount: 5 }),
  asClient(bs),
];
const sheetS = buildMemberSheet({ client: clients[1], allClients: clients, business, transactions: [], cycleBoundary: null, todayStr: '2026-10-22' });
assert(sheetS.potAmount === 2000 && sheetS.totalToReceive === 4000, 'SERVILUS: pot 2 000 G, receives 2 hands = 4 000 G');
assert(sheetS.maxHands === 8 && sheetS.remainingHands === 3 && sheetS.remainingAmount === 1500, 'SERVILUS owes 8 hands, 3 left (1 500 G)');
assert(!sheetS.isOutOfOrder && sheetS.expectedNextRank === 2, 'Paying SERVILUS now follows the order (rank 2)');
const sheetBs = buildMemberSheet({ client: clients[2], allClients: clients, business, transactions: [], cycleBoundary: null, todayStr: '2026-10-22' });
assert(sheetBs.isOutOfOrder, 'Paying BS before SERVILUS is out of order');
assert(sheetS.schedule.paidUntilDate === '2026-10-21' && sheetS.schedule.isPartialToday, 'SERVILUS: covered until the 21st, today partial');
assert(editableRanks({ payoutRanks: '2,3', payoutRank: 2 }) === '2, 3' && ranksToSave('', 4, 3) === '4, 5, 6', 'Ranks shown and saved (one per hand when left empty)');
assert(ledgerEntryKind({ type: 'SOL_PAYOUT', isReversed: true }) === 'REVERSAL' && ledgerEntryKind({ type: 'SOL_CONTRIBUTION' }) === 'CONTRIBUTION', 'Ledger entry kinds');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
