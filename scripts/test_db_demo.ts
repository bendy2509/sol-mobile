import { localDateString } from '../lib/dates';
import {
  DEMO_BUSINESS_NAME,
  DEMO_CLIENT_IDS,
  DEMO_COLLECTOR_ID,
  DEMO_PHONE,
  isUntouchedDemoAccount,
  shouldSeedDemo,
  DemoCheckInput,
} from '../db/demoAccount';

console.log('==================================================');
console.log('TEST SUITE: DEMO ACCOUNT');
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

// 1. Demo data only on web or in development
assert(shouldSeedDemo('web', false), 'Demo carnet is seeded on the web preview');
assert(shouldSeedDemo('android', true), 'Demo carnet is seeded in development builds');
assert(!shouldSeedDemo('android', false) && !shouldSeedDemo('ios', false), 'No demo carnet on a production phone');

// 2. Leftover demo account detection
const createdAt = '2026-10-01T10:00:00.000Z';
const untouched: DemoCheckInput = {
  collector: { id: DEMO_COLLECTOR_ID, phone_number: DEMO_PHONE, created_at: createdAt },
  pinIsDefault: true,
  businesses: [{ name: DEMO_BUSINESS_NAME }],
  clientIds: [...DEMO_CLIENT_IDS],
  transactions: DEMO_CLIENT_IDS.map(() => ({ note: 'Cotisation régulière', created_at_local: createdAt })),
  otherRecordsCount: 0,
};
assert(isUntouchedDemoAccount(untouched), 'A demo account exactly as seeded is recognised as unused');
assert(!isUntouchedDemoAccount({ ...untouched, pinIsDefault: false }), 'A changed PIN means real use: kept');
assert(
  !isUntouchedDemoAccount({ ...untouched, clientIds: [...DEMO_CLIENT_IDS, 'real-member'] }),
  'A member added by the manager means real use: kept'
);
assert(
  !isUntouchedDemoAccount({
    ...untouched,
    transactions: [...untouched.transactions, { note: 'Encaissement de 1 main(s)', created_at_local: '2026-10-03T09:00:00.000Z' }],
  }),
  'A later collection means real use: kept'
);
assert(!isUntouchedDemoAccount({ ...untouched, otherRecordsCount: 1 }), 'A cash closure or closed cycle means real use: kept');
assert(!isUntouchedDemoAccount({ ...untouched, businesses: [{ name: 'Sol Marché Salomon' }] }), 'A renamed or other carnet means real use: kept');
assert(isUntouchedDemoAccount({ ...untouched, businesses: [{ name: 'Sol Mache Klnik 2026' }] }), 'A demo left by an earlier build (old carnet name) is still recognised');
assert(
  !isUntouchedDemoAccount({ ...untouched, collector: { id: 'someone-else', phone_number: DEMO_PHONE, created_at: createdAt } }),
  'Only the demo identifier qualifies'
);
assert(!isUntouchedDemoAccount({ ...untouched, collector: null }), 'No demo account, nothing to remove');

// 3. Calendar days are local, not UTC
assert(localDateString(new Date(2026, 9, 22, 21, 30)) === '2026-10-22', 'A closure at 21:30 is dated the same day (local), not the next UTC day');
assert(localDateString(new Date(2026, 0, 5, 0, 5)) === '2026-01-05', 'Just after midnight is the new local day, zero-padded');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
