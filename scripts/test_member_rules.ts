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

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
