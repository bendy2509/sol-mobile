import { getActiveBusinessConfig, getCurrentCycleBoundary, getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { getActiveCollector } from '@/db/sqlite';
import { getTransactions } from '@/db/transactionRepository';
import { generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';
import { isTransactionFromClosedCycle } from '@/services/financialService';
import { buildCycleRounds, buildPayoutCalendar, parsePayoutRanks } from '@/services/scheduleService';
import { localDayOf } from '@/lib/dates';

/**
 * Builds and shares the carnet's report (PDF) for the current cycle. Shared by the Accueil
 * menu and Réglages → Données. Figures come from the cycle's operations and calendar: the
 * same statuses, dates and amounts as the screens.
 */
export async function exportBusinessReport(): Promise<void> {
  const [metrics, activeCollector, currentMembers, business, boundary] = await Promise.all([
    getDashboardMetrics(),
    getActiveCollector(),
    getMembersWithPaymentStatus({ filter: 'ALL', sort: 'PAYOUT_RANK' }),
    getActiveBusinessConfig(),
    getCurrentCycleBoundary(),
  ]);

  const unit = metrics.unitAmount;
  const totalHands = metrics.totalHandsExpected;
  const rounds = business ? buildCycleRounds(business.startDate, business.frequency, totalHands) : [];

  // Payouts of this cycle, per member (dates of the hands actually paid out)
  const cycleTxs = (await getTransactions({})).filter(
    (t) => !t.isReversed && !isTransactionFromClosedCycle(t.createdAtLocal, boundary)
  );
  const payouts = cycleTxs.filter((t) => t.type === 'SOL_PAYOUT' || t.type === 'HAND_PAYOUT');
  const receivedBy = (id: string) => payouts.filter((t) => t.clientId === id).map((t) => localDayOf(t.createdAtLocal)).sort();

  const totalCashCollected = currentMembers.reduce((sum, m) => sum + (m.totalPaidInCycle || 0), 0);
  const totalDistributed = payouts.reduce((sum, t) => sum + t.amount, 0);
  const handsDueToDate = currentMembers.reduce((sum, m) => sum + (m.paidHandsCount || 0) + (m.lateHands || 0) + (m.missingHandsToday || 0), 0);
  const remainingHands = currentMembers.reduce((sum, m) => sum + (m.lateHands || 0) + (m.missingHandsToday || 0), 0);
  // Recovery up to today: hands paid over hands due so far (advance payments count up to 100 %)
  const completionRate = handsDueToDate > 0 ? Math.min(100, (currentMembers.reduce((s, m) => s + (m.paidHandsCount || 0), 0) / handsDueToDate) * 100) : 100;

  const membersForCalendar = currentMembers.map((m) => ({
    fullName: m.fullName,
    ranks: parsePayoutRanks(m.payoutRanks, m.payoutRank),
    receivedDates: receivedBy(m.id),
  }));

  const pdfUri = await generateManagerBusinessReportPdf({
    businessName: metrics.businessName,
    collectorName: activeCollector?.fullName || 'Bendy SERVILUS',
    collectorPhone: activeCollector?.phoneNumber || '',
    collectorZone: activeCollector?.zone,
    unitAmount: unit,
    totalSlots: totalHands,
    registeredChildrenCount: metrics.totalMembersCount,
    totalPotAmount: metrics.totalPotAmount,
    cycleStartDate: metrics.startDate,
    cycleEndDate: metrics.endDate,
    currentRound: metrics.currentRound,
    handsCollectedTotal: metrics.handsCollectedTotal,
    totalCashCollected,
    totalDistributed,
    netReserveBalance: totalCashCollected - totalDistributed,
    completionRate,
    remainingToCollect: remainingHands * unit,
    members: currentMembers.map((m, i) => ({
      rank: m.payoutRank || 1,
      fullName: m.fullName,
      phoneNumber: m.phoneNumber,
      totalPaid: m.totalPaidInCycle || 0,
      handsCovered: m.paidHandsCount || 0,
      coverageStatus: m.paymentStatusToday,
      hasReceivedPayout: m.hasReceivedPayout,
      handsCount: m.handsCount,
      totalDue: (m.handsCount || 1) * totalHands * unit,
      plannedPayoutDates: membersForCalendar[i].ranks.map((r) => rounds[r - 1]).filter(Boolean),
      receivedPayoutDates: membersForCalendar[i].receivedDates,
    })),
    payoutCalendar: buildPayoutCalendar(rounds, membersForCalendar),
    generatedAt: new Date().toISOString(),
  });

  await sharePdfFile(pdfUri, `Rapport_${metrics.businessName.replace(/\s+/g, '_')}.pdf`);
}
