import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { SolGroup, SolGroupMember, Transaction } from '@/types';
import { getDatabase } from './sqlite';
import { createTransaction } from './transactionRepository';

export async function getSolGroups(): Promise<SolGroup[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    contribution_amount: number;
    frequency: '8J' | '15J' | 'MOIS';
    total_rounds: number;
    current_round: number;
    status: 'ACTIVE' | 'COMPLETED' | 'PENDING';
    created_at: string;
  }>(`SELECT * FROM sol_groups ORDER BY created_at DESC`);

  const groups: SolGroup[] = [];

  for (const row of rows) {
    const members = await getSolGroupMembers(row.id);
    groups.push({
      id: row.id,
      name: row.name,
      contributionAmount: Number(row.contribution_amount),
      frequency: row.frequency,
      totalRounds: row.total_rounds,
      currentRound: row.current_round,
      status: row.status,
      createdAt: row.created_at,
      members,
    });
  }

  return groups;
}

export async function getSolGroupById(solGroupId: string): Promise<SolGroup | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    contribution_amount: number;
    frequency: '8J' | '15J' | 'MOIS';
    total_rounds: number;
    current_round: number;
    status: 'ACTIVE' | 'COMPLETED' | 'PENDING';
    created_at: string;
  }>(`SELECT * FROM sol_groups WHERE id = ?`, [solGroupId]);

  if (!row) return null;

  const members = await getSolGroupMembers(row.id);
  return {
    id: row.id,
    name: row.name,
    contributionAmount: Number(row.contribution_amount),
    frequency: row.frequency,
    totalRounds: row.total_rounds,
    currentRound: row.current_round,
    status: row.status,
    createdAt: row.created_at,
    members,
  };
}

export async function getSolGroupMembers(solGroupId: string): Promise<SolGroupMember[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    sol_group_id: string;
    client_id: string;
    payout_rank: number;
    has_paid: number;
    full_name: string;
    phone_number: string;
    daily_amount: number;
    current_balance: number;
    qr_code_token: string;
    created_at: string;
  }>(
    `SELECT 
      m.id,
      m.sol_group_id,
      m.client_id,
      m.payout_rank,
      m.has_paid,
      c.full_name,
      c.phone_number,
      c.daily_amount,
      c.current_balance,
      c.qr_code_token,
      c.created_at
     FROM sol_group_members m
     JOIN clients c ON m.client_id = c.id
     WHERE m.sol_group_id = ?
     ORDER BY m.payout_rank ASC`,
    [solGroupId]
  );

  const todayStr = new Date().toISOString().split('T')[0];

  return rows.map((m) => {
    const balance = Number(m.current_balance || 0);
    return {
      id: m.id,
      solGroupId: m.sol_group_id,
      clientId: m.client_id,
      payoutRank: m.payout_rank,
      hasPaid: Boolean(m.has_paid),
      client: {
        id: m.client_id,
        collectorId: '',
        fullName: m.full_name,
        phoneNumber: m.phone_number,
        type: 'SOL',
        dailyAmount: Number(m.daily_amount || 250),
        currentBalance: balance,
        payoutRank: m.payout_rank,
        rankOrder: m.payout_rank,
        handsCount: 1,
        receivedHandsCount: 0,
        hasReceivedHand: false,
        hasReceivedPayout: false,
        handReceivedDate: undefined,
        totalPaidAmount: balance,
        paidHandsCount: Math.floor(balance / (Number(m.daily_amount) || 1)),
        paidUntilDate: todayStr,
        qrCodeToken: m.qr_code_token,
        createdAt: m.created_at,
        syncStatus: 'SYNCED',
        paymentStatusToday: m.has_paid ? 'PAID_TODAY' : 'UNPAID_TODAY',
        overdueRoundsCount: 0,
        totalPaidInCycle: balance,
        handsCoveredAhead: 0,
      },
    };
  });
}

export async function createSolGroup(data: {
  name: string;
  contributionAmount: number;
  frequency: '8J' | '15J' | 'MOIS';
  totalRounds: number;
  memberClientIds: string[];
}): Promise<SolGroup> {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sol_groups (id, name, contribution_amount, frequency, total_rounds, current_round, status, created_at)
       VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE', ?)`,
      [id, data.name, data.contributionAmount, data.frequency, data.totalRounds, now]
    );

    let rank = 1;
    for (const clientId of data.memberClientIds) {
      const memberId = uuidv4();
      await db.runAsync(
        `INSERT INTO sol_group_members (id, sol_group_id, client_id, payout_rank, has_paid)
          VALUES (?, ?, ?, ?, 0)`,
        [memberId, id, clientId, rank]
      );
      rank++;
    }
  });

  return (await getSolGroupById(id))!;
}

export async function recordSolContribution(data: {
  solGroupId: string;
  clientId: string;
  amount: number;
  collectorId?: string;
}): Promise<Transaction> {
  return createTransaction({
    clientId: data.clientId,
    solGroupId: data.solGroupId,
    amount: data.amount,
    type: 'SOL_CONTRIBUTION',
    collectorId: data.collectorId,
    paymentMethod: 'CASH',
  });
}

export async function recordSolPayout(data: {
  solGroupId: string;
  clientId: string;
  amount: number;
  collectorId?: string;
}): Promise<Transaction> {
  const db = await getDatabase();
  const tx = await createTransaction({
    clientId: data.clientId,
    solGroupId: data.solGroupId,
    amount: data.amount,
    type: 'SOL_PAYOUT',
    collectorId: data.collectorId,
    paymentMethod: 'CASH',
  });

  // Advance round or reset paid flags if everyone has contributed
  await db.withTransactionAsync(async () => {
    const group = await db.getFirstAsync<{ current_round: number; total_rounds: number }>(
      `SELECT current_round, total_rounds FROM sol_groups WHERE id = ?`,
      [data.solGroupId]
    );

    if (group && group.current_round < group.total_rounds) {
      await db.runAsync(
        `UPDATE sol_groups SET current_round = current_round + 1 WHERE id = ?`,
        [data.solGroupId]
      );
      // Reset members payment status for the new round
      await db.runAsync(
        `UPDATE sol_group_members SET has_paid = 0 WHERE sol_group_id = ?`,
        [data.solGroupId]
      );
    } else if (group && group.current_round >= group.total_rounds) {
      await db.runAsync(
        `UPDATE sol_groups SET status = 'COMPLETED' WHERE id = ?`,
        [data.solGroupId]
      );
    }
  });

  return tx;
}
