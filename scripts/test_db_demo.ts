import { parseInsert, splitTopLevel } from '../db/sqlInsertParser';
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
console.log('TEST SUITE: DEMO ACCOUNT & WEB STORAGE PARSER');
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
assert(
  !isUntouchedDemoAccount({ ...untouched, collector: { id: 'someone-else', phone_number: DEMO_PHONE, created_at: createdAt } }),
  'Only the demo identifier qualifies'
);
assert(!isUntouchedDemoAccount({ ...untouched, collector: null }), 'No demo account, nothing to remove');

// 3. INSERT parsing keeps literals in place
const biz = parseInsert(
  `INSERT INTO business_configs (id, collector_id, name, type, contribution_amount, frequency, total_slots, start_date, end_date, status, created_at)
   VALUES (?, ?, ?, 'SOL', 250, 'DAILY', 4, ?, ?, 'ACTIVE', ?)`,
  ['b1', 'c1', 'Sol Mache Klnik 2026', '2026-10-20', '2026-10-23', '2026-10-20T08:00:00Z']
);
assert(biz?.table === 'business_configs', 'Table name is read');
assert(biz?.values.contribution_amount === 250 && biz?.values.total_slots === 4, 'Numeric literals land in their own columns (no more 0 HTG)');
assert(biz?.values.start_date === '2026-10-20' && biz?.values.end_date === '2026-10-23', 'Parameters after literals stay aligned');
assert(biz?.values.created_at === '2026-10-20T08:00:00Z', 'Last parameter reaches the last column');

const col = parseInsert(
  `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
  ['c1', 'Jean', '+509', 'hash', 'Marché Salomon', '2026-10-20T08:00:00Z']
);
assert(col?.values.status === 'ACTIVE' && col?.values.zone === 'Marché Salomon', 'Collector zone is no longer replaced by a date');

const upsert = parseInsert(
  `INSERT INTO collectors (id, full_name, phone_number, pin_hash, status, zone, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name`,
  ['c1', 'Jean', '+509', 'hash', 'ACTIVE', null, 'now']
);
assert(upsert?.values.created_at === 'now' && upsert?.values.zone === null, 'A trailing ON CONFLICT clause is ignored');

const tx = parseInsert(
  `INSERT INTO transactions (id, client_id, amount, type, note, sync_status) VALUES (?, ?, ?, 'CONTRIBUTION', 'Dépôt, initial', NULL)`,
  ['t1', 'k1', 500]
);
assert(tx?.values.note === 'Dépôt, initial' && tx?.values.sync_status === null, 'Commas inside quotes and NULL are handled');
assert(splitTopLevel("a, 'b, c', COALESCE(x, 1)").length === 3, 'Commas inside quotes and parentheses do not split');
assert(parseInsert("INSERT INTO t (a) VALUES ('it''s')")?.values.a === "it's", "Escaped quotes ('') are unescaped");
assert(parseInsert('INSERT INTO t VALUES (?, ?)', [1, 2]) === null, 'No column list: positional fallback (null)');

// 4. Calendar days are local, not UTC
assert(localDateString(new Date(2026, 9, 22, 21, 30)) === '2026-10-22', 'A closure at 21:30 is dated the same day (local), not the next UTC day');
assert(localDateString(new Date(2026, 0, 5, 0, 5)) === '2026-01-05', 'Just after midnight is the new local day, zero-padded');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');
process.exit(failed > 0 ? 1 : 0);
