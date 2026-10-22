// Node built-ins without @types/node (the app's tsconfig has no Node types)
declare const require: (id: string) => any;

import { LATEST_SCHEMA_VERSION, LEGACY_TABLES_KEPT_WARNING, Migration, MigrationDb, MIGRATIONS, runVersionedMigrations } from '../db/migrations';

const { DatabaseSync } = require('node:sqlite');

console.log('==================================================');
console.log('TEST SUITE: VERSIONED SQLITE MIGRATIONS (real SQLite)');
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

/** expo-sqlite-shaped wrapper around node:sqlite. */
function open(): MigrationDb & { raw: any } {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params = []) {
      return raw.prepare(sql).run(...(params as any[]));
    },
    async getAllAsync(sql, params = []) {
      return raw.prepare(sql).all(...(params as any[]));
    },
    async getFirstAsync(sql, params = []) {
      return raw.prepare(sql).get(...(params as any[])) ?? null;
    },
  };
}

/** Schema of an old build: no hands columns, no idempotency, approval workflow. */
function legacySchema(db: { raw: any }) {
  db.raw.exec(`
    CREATE TABLE collectors (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, phone_number TEXT UNIQUE NOT NULL, pin_hash TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT DEFAULT 'PENDING_APPROVAL');
    CREATE TABLE business_configs (id TEXT PRIMARY KEY, collector_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, contribution_amount REAL NOT NULL, frequency TEXT NOT NULL, total_slots INTEGER NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT DEFAULT 'ACTIVE', created_at TEXT NOT NULL);
    CREATE TABLE clients (id TEXT PRIMARY KEY, collector_id TEXT NOT NULL, full_name TEXT NOT NULL, phone_number TEXT NOT NULL, type TEXT DEFAULT 'SABOTAY', daily_amount REAL DEFAULT 0, current_balance REAL DEFAULT 0, qr_code_token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, sync_status TEXT DEFAULT 'PENDING');
    CREATE TABLE transactions (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, collector_id TEXT NOT NULL, sol_group_id TEXT, amount REAL NOT NULL, type TEXT NOT NULL, created_at_local TEXT NOT NULL, synced_at TEXT, sync_status TEXT DEFAULT 'PENDING');
    CREATE TABLE deleted_clients (id TEXT PRIMARY KEY, collector_id TEXT, deleted_at TEXT NOT NULL, sync_status TEXT DEFAULT 'PENDING');
    CREATE TABLE cash_closures (id TEXT PRIMARY KEY, collector_id TEXT NOT NULL, closure_date TEXT NOT NULL, total_cash_declared REAL NOT NULL, total_system_calculated REAL NOT NULL, discrepancy_reason TEXT, status TEXT DEFAULT 'SUBMITTED', created_at TEXT NOT NULL);
    CREATE TABLE sol_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, contribution_amount REAL NOT NULL, frequency TEXT NOT NULL, total_rounds INTEGER NOT NULL, current_round INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE', created_at TEXT NOT NULL);
    CREATE TABLE sol_group_members (id TEXT PRIMARY KEY, sol_group_id TEXT NOT NULL, client_id TEXT NOT NULL, payout_rank INTEGER NOT NULL, has_paid INTEGER DEFAULT 0);
    INSERT INTO cash_closures VALUES ('cc1', 'c1', '2026-01-02', 250, 250, NULL, 'SUBMITTED', '2026-01-02T22:00:00Z');
    INSERT INTO collectors VALUES ('c1', 'Jean', '+50937000000', 'h', '2026-01-01', 'PENDING_APPROVAL');
    INSERT INTO clients (id, collector_id, full_name, phone_number, qr_code_token, created_at) VALUES ('k1', 'c1', 'Marie', '+509', 'Q1', '2026-01-01');
    INSERT INTO transactions VALUES ('t1', 'k1', 'c1', NULL, 250, 'CONTRIBUTION', '2026-01-02T10:00:00Z', NULL, 'SYNCED');
    INSERT INTO transactions VALUES ('t2', 'k1', 'c1', NULL, 1000, 'HAND_PAYOUT', '2026-01-03T10:00:00Z', NULL, 'SYNCED');
  `);
}

const throws = async (fn: () => Promise<unknown>, part: string) => {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return String(e?.message || '').includes(part);
  }
};

(async () => {
  // 1. Upgrade an old database
  const db = open();
  legacySchema(db);
  const report = await runVersionedMigrations(db);
  assert(report.from === 0 && report.to === LATEST_SCHEMA_VERSION && !report.error, `Old database upgraded from 0 to ${LATEST_SCHEMA_VERSION}`);
  assert(report.applied.length === MIGRATIONS.length, 'Every migration applied once');
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version;
  assert(version === LATEST_SCHEMA_VERSION, 'PRAGMA user_version records the schema version');
  const logged = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  assert(logged.length === MIGRATIONS.length, 'schema_migrations keeps one row per applied version');

  const txCols = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)')).map((r) => r.name));
  const clCols = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(clients)')).map((r) => r.name));
  assert(['hands_covered', 'idempotency_key', 'is_reversed', 'note'].every((c) => txCols.has(c)), 'Missing transaction columns are added');
  assert(['hands_count', 'payout_ranks', 'paid_until_date'].every((c) => clCols.has(c)), 'Missing member columns are added');
  const types = (await db.getAllAsync<{ type: string }>('SELECT type FROM transactions ORDER BY id')).map((r) => r.type);
  assert(types[0] === 'SOL_CONTRIBUTION' && types[1] === 'SOL_PAYOUT', 'Legacy operation types are renamed');
  assert((await db.getFirstAsync<{ status: string }>('SELECT status FROM collectors'))?.status === 'ACTIVE', 'Pending managers become active');
  const amounts = (await db.getAllAsync<{ amount: number }>('SELECT amount FROM transactions ORDER BY id')).map((r) => r.amount);
  assert(amounts[0] === 250 && amounts[1] === 1000, 'No amount changed by the upgrade');

  // Phase 6 cleanup
  const ccCols = new Set((await db.getAllAsync<{ name: string }>('PRAGMA table_info(cash_closures)')).map((r) => r.name));
  assert(ccCols.has('business_id'), 'Cash closures gain a business_id column');
  const oldClosure = await db.getFirstAsync<{ business_id: string | null; total_cash_declared: number }>(`SELECT business_id, total_cash_declared FROM cash_closures WHERE id = 'cc1'`);
  assert(oldClosure?.business_id === null && oldClosure.total_cash_declared === 250, 'Existing closures are kept, their carnet left unknown (NULL)');
  const legacy = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sol_groups', 'sol_group_members')`);
  assert(legacy.length === 0, 'Empty unused sol_groups tables are dropped');

  // 2. Running again changes nothing
  const again = await runVersionedMigrations(db);
  assert(again.applied.length === 0 && again.to === LATEST_SCHEMA_VERSION, 'A second start applies nothing');

  // 3. Unique idempotency key
  await db.runAsync(`INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local, idempotency_key) VALUES ('t3', 'k1', 'c1', 250, 'SOL_CONTRIBUTION', 'now', 'key-1')`);
  assert(
    await throws(() => db.runAsync(`INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local, idempotency_key) VALUES ('t4', 'k1', 'c1', 250, 'SOL_CONTRIBUTION', 'now', 'key-1')`), 'UNIQUE'),
    'The same idempotency key cannot record a collection twice'
  );
  assert(
    !(await throws(() => db.runAsync(`INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local) VALUES ('t5', 'k1', 'c1', 250, 'SOL_CONTRIBUTION', 'now')`), '')),
    'Operations without a key are still accepted'
  );

  // 4. Ledger guards
  assert(
    await throws(() => db.runAsync(`INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local) VALUES ('b1', 'k1', 'c1', -10, 'SOL_CONTRIBUTION', 'now')`), 'opération invalide'),
    'A negative amount is refused'
  );
  assert(
    await throws(() => db.runAsync(`INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local) VALUES ('b2', 'k1', 'c1', 10, 'GIFT', 'now')`), 'opération invalide'),
    'An unknown operation type is refused'
  );
  assert(
    await throws(() => db.runAsync(`UPDATE transactions SET amount = 9999 WHERE id = 't1'`), 'ne se modifie pas'),
    'A recorded amount cannot be edited'
  );
  assert(
    await throws(() => db.runAsync(`UPDATE transactions SET type = 'SOL_PAYOUT' WHERE id = 't1'`), 'ne se modifie pas'),
    'A recorded type cannot be edited'
  );
  assert(
    !(await throws(() => db.runAsync(`UPDATE transactions SET is_reversed = 1, reversal_id = 'r1', sync_status = 'PENDING' WHERE id = 't1'`), '')),
    'Reversal flag and sync status stay writable (REVERSAL flow unchanged)'
  );
  assert(
    !(await throws(() => db.runAsync(`INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local) VALUES ('r1', 'k1', 'c1', 250, 'REVERSAL', 'now')`), '')),
    'A REVERSAL entry can be appended'
  );
  assert(
    await throws(() => db.runAsync(`UPDATE clients SET hands_count = 0 WHERE id = 'k1'`), 'au moins une main'),
    'A member cannot drop to zero hands'
  );
  assert(
    !(await throws(() => db.runAsync(`INSERT OR REPLACE INTO transactions (id, client_id, collector_id, amount, type, created_at_local) VALUES ('t2', 'k1', 'c1', 1000, 'HAND_PAYOUT', '2026-01-03T10:00:00Z')`), '')),
    'Restoring an old backup row (legacy type, INSERT OR REPLACE) still works'
  );

  // 5. Fresh install (tables already complete) goes straight to the latest version
  const fresh = open();
  legacySchema(fresh);
  const freshReport = await runVersionedMigrations(fresh);
  assert(freshReport.to === LATEST_SCHEMA_VERSION, 'A new database reaches the latest version too');

  // 6. Duplicate keys are reported, not deleted
  const dupDb = open();
  legacySchema(dupDb);
  dupDb.raw.exec(`ALTER TABLE transactions ADD COLUMN idempotency_key TEXT;
    INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local, idempotency_key) VALUES ('d1', 'k1', 'c1', 250, 'SOL_CONTRIBUTION', 'now', 'dup');
    INSERT INTO transactions (id, client_id, collector_id, amount, type, created_at_local, idempotency_key) VALUES ('d2', 'k1', 'c1', 250, 'SOL_CONTRIBUTION', 'now', 'dup');`);
  const dupReport = await runVersionedMigrations(dupDb);
  const warning = dupReport.applied.find((a) => a.version === 3)?.warning || '';
  assert(dupReport.to === LATEST_SCHEMA_VERSION && warning.includes('en double'), 'Existing duplicates raise a warning and the chain continues');
  const kept = await dupDb.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions WHERE idempotency_key = 'dup'`);
  assert(Number(kept?.n) === 2, 'Duplicate operations are kept for the manager to check');

  // 6b. Unused tables that still hold rows are kept, with a warning
  const keepDb = open();
  legacySchema(keepDb);
  keepDb.raw.exec(`INSERT INTO sol_groups VALUES ('g1', 'Ancien', 250, 'DAILY', 4, 1, 'ACTIVE', 'now')`);
  const keepReport = await runVersionedMigrations(keepDb);
  const keptTables = await keepDb.getAllAsync(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sol_groups', 'sol_group_members')`);
  assert(
    keepReport.to === LATEST_SCHEMA_VERSION && keepReport.applied.find((a) => a.version === 6)?.warning === LEGACY_TABLES_KEPT_WARNING && keptTables.length === 2,
    'Non-empty legacy tables are kept and reported'
  );

  // 7. A failing migration rolls back and stops the chain
  const failDb = open();
  legacySchema(failDb);
  const broken: Migration[] = [
    ...MIGRATIONS.slice(0, 2),
    {
      version: 3,
      name: 'broken',
      async up(d) {
        await d.execAsync(`CREATE TABLE half_done (x INTEGER)`);
        throw new Error('boom');
      },
    },
    { version: 4, name: 'after', async up() {} },
  ];
  const failReport = await runVersionedMigrations(failDb, broken);
  assert(failReport.to === 2 && failReport.error?.version === 3 && failReport.error.message === 'boom', 'A failure is reported with its version and message');
  const halfDone = await failDb.getFirstAsync(`SELECT name FROM sqlite_master WHERE name = 'half_done'`);
  assert(!halfDone, 'The failed migration left nothing behind (rolled back)');
  assert((await failDb.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version === 2, 'The version stays at the last good migration');
  const retry = await runVersionedMigrations(failDb, [...MIGRATIONS.slice(0, 2), { version: 3, name: 'fixed', async up() {} }]);
  assert(retry.to === 3 && !retry.error, 'Next start retries from where it stopped');

  console.log('\n==================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
  process.exit(failed > 0 ? 1 : 0);
})();
