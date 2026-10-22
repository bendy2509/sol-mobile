import { getActiveBusinessConfig, getCurrentCycleBoundary } from './businessRepository';
import { getActiveCollectorId, getDatabase } from './sqlite';
import { getTransactions } from './transactionRepository';
import { recordAuditLog } from '@/services/auditService';
import { isTransactionFromClosedCycle, reconstructClientFinancialTimeline } from '@/services/financialService';
import { ClientTotals, diffClientTotals, TotalsDifference } from '@/services/ledgerConsistency';
import { localDateString } from '@/lib/dates';

export interface LedgerDiscrepancy {
  clientId: string;
  fullName: string;
  differences: TotalsDifference[];
  ledger: ClientTotals & { handReceivedDate: string | null };
}

interface ClientRow {
  id: string;
  full_name: string;
  hands_count: number | null;
  current_balance: number | null;
  total_paid_amount: number | null;
  paid_hands_count: number | null;
  received_hands_count: number | null;
  has_received_hand: number | null;
  paid_until_date: string | null;
}

/**
 * Replays each member's current-cycle operations and compares the result with the totals
 * stored on the member row. Read-only.
 */
export async function findLedgerDiscrepancies(collectorIdParam?: string): Promise<LedgerDiscrepancy[]> {
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());
  const [business, boundary] = await Promise.all([getActiveBusinessConfig(collectorId), getCurrentCycleBoundary(collectorId)]);

  const clients = await db.getAllAsync<ClientRow>(
    `SELECT id, full_name, hands_count, current_balance, total_paid_amount, paid_hands_count,
            received_hands_count, has_received_hand, paid_until_date
     FROM clients WHERE collector_id = ?`,
    [collectorId]
  );
  const allTxs = await getTransactions({ collectorId });
  const cycleTxs = allTxs.filter((t) => !isTransactionFromClosedCycle(t.createdAtLocal, boundary));

  const result: LedgerDiscrepancy[] = [];
  for (const c of clients) {
    const own = cycleTxs.filter((t) => t.clientId === c.id);
    const rebuilt = reconstructClientFinancialTimeline({
      transactions: own,
      unitAmount: business?.contributionAmount || 250,
      frequency: business?.frequency || 'DAILY',
      cycleStartDate: business?.startDate || localDateString(),
      handsCount: Math.max(1, Number(c.hands_count || 1)),
    });
    // A member with no operation yet has no coverage date: nothing to compare there
    const ledger = { ...rebuilt, paidUntilDate: own.length ? rebuilt.paidUntilDate : c.paid_until_date };
    const stored: ClientTotals = {
      currentBalance: Number(c.current_balance || 0),
      totalPaidAmount: Number(c.total_paid_amount || 0),
      paidHandsCount: Number(c.paid_hands_count || 0),
      receivedHandsCount: Number(c.received_hands_count || 0),
      hasReceivedHand: Boolean(c.has_received_hand),
      paidUntilDate: c.paid_until_date,
    };
    const differences = diffClientTotals(stored, ledger);
    if (differences.length) result.push({ clientId: c.id, fullName: c.full_name, differences, ledger });
  }
  return result;
}

/**
 * Rewrites the stored totals of the given members from their ledger replay, in one
 * transaction, and records each correction in the audit log. The UI asks for the PIN first.
 */
export async function repairLedgerDiscrepancies(discrepancies: LedgerDiscrepancy[], collectorIdParam?: string): Promise<number> {
  if (!discrepancies.length) return 0;
  const db = await getDatabase();
  const collectorId = collectorIdParam || (await getActiveCollectorId());

  await db.withTransactionAsync(async () => {
    for (const d of discrepancies) {
      const l = d.ledger;
      await db.runAsync(
        `UPDATE clients
         SET current_balance = ?, total_paid_amount = ?, paid_hands_count = ?, received_hands_count = ?,
             has_received_hand = ?, has_received_payout = ?, hand_received_date = ?, paid_until_date = ?,
             sync_status = 'PENDING'
         WHERE id = ?`,
        [
          l.currentBalance,
          l.totalPaidAmount,
          l.paidHandsCount,
          l.receivedHandsCount,
          l.hasReceivedHand ? 1 : 0,
          l.hasReceivedHand ? 1 : 0,
          l.handReceivedDate,
          l.paidUntilDate,
          d.clientId,
        ]
      );
    }
  });

  for (const d of discrepancies) {
    await recordAuditLog({
      userId: collectorId,
      userRole: 'MANAGER',
      action: 'RECONCILE_CLIENT',
      entityType: 'CLIENT',
      entityId: d.clientId,
      oldData: Object.fromEntries(d.differences.map((x) => [x.field, x.stored])),
      newData: Object.fromEntries(d.differences.map((x) => [x.field, x.ledger])),
      reason: 'Totaux recalculés depuis le journal des opérations',
    }).catch(() => {});
  }
  return discrepancies.length;
}
