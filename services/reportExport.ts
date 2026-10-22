import { getDashboardMetrics } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { getActiveCollector } from '@/db/sqlite';
import { generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';

/**
 * Builds and shares the carnet's evolution report (PDF). Shared by the Accueil menu
 * and Réglages → Données. Same figures as before, read from the dashboard metrics.
 */
export async function exportBusinessReport(): Promise<void> {
  const [metrics, activeCollector, currentMembers] = await Promise.all([
    getDashboardMetrics(),
    getActiveCollector(),
    getMembersWithPaymentStatus({ filter: 'ALL', sort: 'PAYOUT_RANK' }),
  ]);

  const totalCashCollected = currentMembers.reduce((sum, m) => sum + (m.totalPaidInCycle || m.currentBalance || 0), 0);
  const totalDistributed = currentMembers.filter((m) => m.hasReceivedPayout).length * metrics.totalPotAmount;
  const netReserveBalance = totalCashCollected - totalDistributed;
  const completionRate = metrics.totalHandsExpected > 0 ? Math.round((metrics.handsCollectedTotal / metrics.totalHandsExpected) * 100) : 0;

  const pdfUri = await generateManagerBusinessReportPdf({
    businessName: metrics.businessName,
    collectorName: activeCollector?.fullName || 'Gestionnaire SOL',
    collectorPhone: activeCollector?.phoneNumber || '+509 XX XX XXXX',
    collectorZone: activeCollector?.zone,
    unitAmount: metrics.unitAmount,
    totalSlots: metrics.totalHandsExpected,
    registeredChildrenCount: metrics.totalMembersCount,
    totalPotAmount: metrics.totalPotAmount,
    cycleStartDate: metrics.startDate || new Date().toISOString(),
    cycleEndDate: metrics.endDate || new Date().toISOString(),
    handsCollectedTotal: metrics.handsCollectedTotal,
    totalCashCollected,
    totalDistributed,
    netReserveBalance,
    completionRate,
    members: currentMembers.map((m) => {
      const hands = metrics.unitAmount > 0 ? Math.floor((m.totalPaidInCycle || m.currentBalance || 0) / metrics.unitAmount) : 1;
      return {
        rank: m.payoutRank || 1,
        fullName: m.fullName,
        phoneNumber: m.phoneNumber,
        totalPaid: m.totalPaidInCycle || m.currentBalance || 0,
        handsCovered: hands,
        coverageStatus: m.paymentStatusToday,
        hasReceivedPayout: m.hasReceivedPayout,
      };
    }),
    generatedAt: new Date().toISOString(),
  });

  await sharePdfFile(pdfUri, `Rapport_Evolution_${metrics.businessName.replace(/\s+/g, '_')}.pdf`);
}
