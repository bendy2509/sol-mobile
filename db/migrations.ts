/**
 * Versioned SQLite migrations (phase 3 of docs/PLAN_DB.md).
 *
 * - The schema version lives in `PRAGMA user_version`; each migration runs once, in order.
 * - Each migration runs in its own transaction with the version bump: it is applied entirely
 *   or not at all. A failure stops the chain, is reported (Diagnostic screen) and is retried at
 *   the next start — never silently swallowed.
 * - `schema_migrations` keeps when each version was applied and any warning it raised.
 *
 * Pure module: it only needs the four calls below, so it runs on expo-sqlite in the app and
 * on Node's built-in SQLite in scripts/test_migrations.ts.
 */
import { calculateCycleTotalHands } from '../services/financialService';
import { paidUntilFromHands } from '../services/scheduleService';

export interface MigrationDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<unknown>;
  getAllAsync<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface Migration {
  version: number;
  name: string;
  /** Returns a warning to record (the migration still counts as applied), or nothing. */
  up(db: MigrationDb): Promise<string | void>;
}

export interface MigrationReport {
  from: number;
  to: number;
  latest: number;
  applied: { version: number; name: string; warning?: string }[];
  error?: { version: number; name: string; message: string };
}

/** Transaction types the app has ever written (legacy names stay valid for old backups). */
export const TRANSACTION_TYPES = [
  'CONTRIBUTION',
  'HAND_PAYOUT',
  'SABOTAY_DEPOSIT',
  'SOL_CONTRIBUTION',
  'SOL_PAYOUT',
  'WITHDRAWAL',
  'REVERSAL',
  'CORRECTION',
] as const;

async function columnNames(db: MigrationDb, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

async function addColumn(db: MigrationDb, table: string, name: string, definition: string): Promise<void> {
  if (!(await columnNames(db, table)).has(name)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

const typeList = TRANSACTION_TYPES.map((t) => `'${t}'`).join(', ');

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline-columns',
    // Columns added over time to databases created by older builds (former runMigrations).
    async up(db) {
      for (const [name, def] of [
        ['business_id', 'business_id TEXT'],
        ['payout_rank', 'payout_rank INTEGER'],
        ['has_received_payout', 'has_received_payout INTEGER DEFAULT 0'],
        ['has_received_hand', 'has_received_hand INTEGER DEFAULT 0'],
        ['hand_received_date', 'hand_received_date TEXT'],
        ['total_paid_amount', 'total_paid_amount REAL DEFAULT 0'],
        ['paid_hands_count', 'paid_hands_count INTEGER DEFAULT 0'],
        ['paid_until_date', 'paid_until_date TEXT'],
        ['hands_count', 'hands_count INTEGER DEFAULT 1'],
        ['received_hands_count', 'received_hands_count INTEGER DEFAULT 0'],
        ['payout_ranks', 'payout_ranks TEXT'],
      ]) {
        await addColumn(db, 'clients', name, def);
      }
      await db.runAsync(`UPDATE clients SET hands_count = 1 WHERE hands_count IS NULL OR hands_count < 1`);
      await db.runAsync(`UPDATE clients SET received_hands_count = 0 WHERE received_hands_count IS NULL`);
      // A member with several ranks ("1, 4, 7") holds that many hands
      const withRanks = await db.getAllAsync<{ id: string; payout_ranks: string; hands_count: number }>(
        `SELECT id, payout_ranks, hands_count FROM clients WHERE payout_ranks IS NOT NULL`
      );
      for (const c of withRanks) {
        const ranks = String(c.payout_ranks).split(/[,;\s]+/).filter(Boolean).length;
        if (ranks > 1 && (!c.hands_count || c.hands_count < ranks)) {
          await db.runAsync(`UPDATE clients SET hands_count = ? WHERE id = ?`, [ranks, c.id]);
        }
      }

      for (const [name, def] of [
        ['business_id', 'business_id TEXT'],
        ['payment_method', "payment_method TEXT DEFAULT 'CASH'"],
        ['hands_covered', 'hands_covered INTEGER DEFAULT 1'],
        ['note', 'note TEXT'],
        ['idempotency_key', 'idempotency_key TEXT'],
        ['is_reversed', 'is_reversed INTEGER DEFAULT 0'],
        ['reversal_id', 'reversal_id TEXT'],
        ['reversed_at', 'reversed_at TEXT'],
      ]) {
        await addColumn(db, 'transactions', name, def);
      }
      await db.runAsync(`UPDATE transactions SET type = 'SOL_CONTRIBUTION' WHERE type = 'CONTRIBUTION'`);
      await db.runAsync(`UPDATE transactions SET type = 'SOL_PAYOUT' WHERE type = 'HAND_PAYOUT'`);

      await addColumn(db, 'collectors', 'zone', 'zone TEXT');
      await addColumn(db, 'collectors', 'status', "status TEXT DEFAULT 'ACTIVE'");
      await addColumn(db, 'collectors', 'role', "role TEXT DEFAULT 'MANAGER'");
      await addColumn(db, 'collectors', 'sync_status', "sync_status TEXT DEFAULT 'PENDING'");
      await addColumn(db, 'business_configs', 'cycle_status', "cycle_status TEXT DEFAULT 'ACTIVE'");
      await addColumn(db, 'deleted_clients', 'qr_code_token', 'qr_code_token TEXT');
      await addColumn(db, 'deleted_clients', 'phone_number', 'phone_number TEXT');
    },
  },
  {
    version: 2,
    name: 'managers-active',
    // The approval workflow is gone: every manager account is active.
    async up(db) {
      await db.runAsync(`UPDATE collectors SET status = 'ACTIVE' WHERE status IS NULL OR status <> 'ACTIVE'`);
    },
  },
  {
    version: 3,
    name: 'unique-idempotency-key',
    // One operation per idempotency key: a double tap or a resend can never record a
    // collection twice. Existing duplicates are real money questions, so they are reported,
    // never deleted; the unique index waits until they are resolved (see migration 6+).
    async up(db) {
      const dup = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM (
           SELECT idempotency_key FROM transactions
           WHERE idempotency_key IS NOT NULL
           GROUP BY idempotency_key HAVING COUNT(*) > 1
         )`
      );
      const duplicates = Number(dup?.n || 0);
      if (duplicates > 0) {
        // Fixed wording: it is translated at display time (Diagnostic screen)
        return DUPLICATE_KEYS_WARNING;
      }
      await db.execAsync(`DROP INDEX IF EXISTS idx_tx_idempotency`);
      await db.execAsync(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_tx_idempotency ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL`
      );
    },
  },
  {
    version: 4,
    name: 'query-indexes',
    // Indexes shaped like the screens' queries (member passbook, history, cash closure).
    async up(db) {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_tx_client_created ON transactions(client_id, created_at_local)`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_tx_business_type_created ON transactions(business_id, type, created_at_local)`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_clients_collector_rank ON clients(collector_id, payout_rank)`);
    },
  },
  {
    version: 5,
    name: 'ledger-guards',
    // SQLite cannot add CHECK constraints without rebuilding tables, and a rebuild would fail
    // on any legacy row. Triggers guard every new write instead:
    // - an operation has a known type, a non-negative amount and hand count;
    // - once written, its amount, type, hands and date never change (corrections go through
    //   a REVERSAL entry); status columns (sync, reversal flag) stay writable;
    // - a member holds at least one hand.
    async up(db) {
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS trg_tx_valid_insert
        BEFORE INSERT ON transactions
        WHEN NEW.type NOT IN (${typeList}) OR NEW.amount < 0 OR NEW.hands_covered < 0
        BEGIN
          SELECT RAISE(ABORT, 'SOL: opération invalide (type, montant ou mains)');
        END;
      `);
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS trg_tx_immutable
        BEFORE UPDATE OF amount, type, hands_covered, created_at_local ON transactions
        WHEN NEW.amount IS NOT OLD.amount OR NEW.type IS NOT OLD.type
          OR NEW.hands_covered IS NOT OLD.hands_covered OR NEW.created_at_local IS NOT OLD.created_at_local
        BEGIN
          SELECT RAISE(ABORT, 'SOL: une opération enregistrée ne se modifie pas, elle s''annule');
        END;
      `);
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS trg_clients_hands_insert
        BEFORE INSERT ON clients
        WHEN NEW.hands_count IS NOT NULL AND NEW.hands_count < 1
        BEGIN
          SELECT RAISE(ABORT, 'SOL: un adhérent a au moins une main');
        END;
      `);
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS trg_clients_hands_update
        BEFORE UPDATE OF hands_count ON clients
        WHEN NEW.hands_count IS NOT NULL AND NEW.hands_count < 1
        BEGIN
          SELECT RAISE(ABORT, 'SOL: un adhérent a au moins une main');
        END;
      `);
    },
  },
  {
    version: 6,
    name: 'cleanup',
    // - Cash closures remember their carnet (rows written before this stay NULL: unknown).
    // - The sol_groups / sol_group_members tables were never used by any screen (a sol is a
    //   business_config with its clients). They are dropped when both are empty, kept otherwise.
    async up(db) {
      await addColumn(db, 'cash_closures', 'business_id', 'business_id TEXT');
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_cash_closures_business ON cash_closures(business_id)`);

      // The two tables go together: both are dropped only when both are empty
      const legacy: string[] = [];
      let rows = 0;
      for (const table of ['sol_group_members', 'sol_groups']) {
        const exists = await db.getFirstAsync(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
        if (!exists) continue;
        legacy.push(table);
        const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
        rows += Number(row?.n || 0);
      }
      if (rows > 0) return LEGACY_TABLES_KEPT_WARNING;
      for (const table of legacy) await db.execAsync(`DROP TABLE ${table}`);
    },
  },
  {
    version: 7,
    name: 'unpaid-members-no-coverage',
    // Older builds set paid_until_date to the enrolment day for a member who paid nothing: the
    // member showed « Payé aujourd'hui » and the first payment covered the next day. Members
    // with no contribution at all lose that date (counters already say nothing was paid).
    async up(db) {
      await db.runAsync(
        `UPDATE clients SET paid_until_date = NULL
         WHERE COALESCE(paid_hands_count, 0) = 0
           AND COALESCE(total_paid_amount, 0) = 0
           AND id NOT IN (
             SELECT client_id FROM transactions
             WHERE type IN ('CONTRIBUTION', 'SABOTAY_DEPOSIT', 'SOL_CONTRIBUTION') AND COALESCE(is_reversed, 0) = 0
           )`
      );
    },
  },
  {
    version: 8,
    name: 'paid-until-from-cycle-calendar',
    // The paid-until date used to advance one day per hand paid, whatever the member's hands:
    // 1 hand paid by a 2-hand member covered the day. It now comes from the cycle calendar
    // (services/scheduleService.ts): all the member's hands at every round since the cycle start.
    async up(db) {
      const businesses = await db.getAllAsync<{ collector_id: string; start_date: string; frequency: string }>(
        `SELECT collector_id, start_date, frequency FROM business_configs b
         WHERE created_at = (SELECT MAX(created_at) FROM business_configs WHERE collector_id = b.collector_id)`
      );
      for (const b of businesses) {
        if (!b.start_date) continue;
        const clients = await db.getAllAsync<{ id: string; hands_count: number | null; payout_ranks: string | null; paid_hands_count: number | null }>(
          `SELECT id, hands_count, payout_ranks, paid_hands_count FROM clients
           WHERE collector_id = ? AND id NOT IN (SELECT id FROM deleted_clients)`,
          [b.collector_id]
        );
        const totalRounds = calculateCycleTotalHands(clients);
        for (const c of clients) {
          const paidUntil = paidUntilFromHands({
            cycleStartDate: b.start_date,
            frequency: b.frequency,
            memberHands: Math.max(1, Number(c.hands_count || 1)),
            paidHands: Number(c.paid_hands_count || 0),
            totalRounds,
          });
          await db.runAsync(`UPDATE clients SET paid_until_date = ? WHERE id = ?`, [paidUntil, c.id]);
        }
      }
    },
  },
];

/** Warning recorded by migration 6 when an unused legacy table still holds rows. */
export const LEGACY_TABLES_KEPT_WARNING = 'Anciennes tables de groupes non vides : conservées, à vérifier.';

/** Warning recorded by migration 3 when operations share an idempotency key. */
export const DUPLICATE_KEYS_WARNING = "Opérations en double détectées : index unique non créé, à vérifier.";

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

let lastReport: MigrationReport | null = null;

/** Report of the last run in this session (Diagnostic screen). */
export function getLastMigrationReport(): MigrationReport | null {
  return lastReport;
}

export async function getSchemaVersion(db: MigrationDb): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(`PRAGMA user_version`);
  return Number(row?.user_version || 0);
}

export async function runVersionedMigrations(db: MigrationDb, migrations: Migration[] = MIGRATIONS): Promise<MigrationReport> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      warning TEXT
    );
  `);
  const from = await getSchemaVersion(db);
  const latest = migrations.length ? migrations[migrations.length - 1].version : from;
  const report: MigrationReport = { from, to: from, latest, applied: [] };

  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= report.to) continue;
    await db.execAsync('BEGIN');
    try {
      const warning = (await m.up(db)) || undefined;
      await db.runAsync(`INSERT OR REPLACE INTO schema_migrations (version, name, applied_at, warning) VALUES (?, ?, ?, ?)`, [
        m.version,
        m.name,
        new Date().toISOString(),
        warning ?? null,
      ]);
      // PRAGMA takes no bound parameter; the version is a trusted integer from this file
      await db.execAsync(`PRAGMA user_version = ${Math.trunc(m.version)}`);
      await db.execAsync('COMMIT');
      report.to = m.version;
      report.applied.push({ version: m.version, name: m.name, warning });
    } catch (err: any) {
      await db.execAsync('ROLLBACK').catch(() => {});
      report.error = { version: m.version, name: m.name, message: String(err?.message || err) };
      break;
    }
  }

  lastReport = report;
  return report;
}
