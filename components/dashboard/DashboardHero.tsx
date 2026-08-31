import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DashboardMetrics } from '@/types';
import { Icon } from '@/components/Icon';
import { formatCurrency } from '@/lib/formatters';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

interface DashboardHeroProps {
  metrics: DashboardMetrics;
  cycleProgressPct: number;
}

export const DashboardHero: React.FC<DashboardHeroProps> = ({ metrics, cycleProgressPct }) => {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroLeft}>
          <View style={styles.heroPillHeader}>
            <Icon name="crown" size={12} color="#FDE68A" style={{ marginRight: 4 }} />
            <Text style={styles.heroLabel}>CAGNOTTE D'UNE MAIN (TIRAGE)</Text>
          </View>
          <Text style={styles.heroAmount}>{formatCurrency(metrics.totalPotAmount)}</Text>
          <Text style={styles.heroSubFormula}>
            {metrics.totalHandsExpected} mains x {formatCurrency(metrics.unitAmount)}
          </Text>
        </View>
        <View style={styles.heroUnitBadge}>
          <Text style={styles.heroUnitText}>{formatCurrency(metrics.unitAmount)}/main</Text>
        </View>
      </View>
      <View style={styles.heroStatsRow}>
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatItemLabel}>ENFANTS</Text>
          <View style={styles.heroStatItemValRow}>
            <Icon name="users" size={12} color="#94A3B8" style={{ marginRight: 4 }} />
            <Text style={styles.heroStatItemVal}>{metrics.totalMembersCount}</Text>
          </View>
        </View>
        <View style={styles.heroStatDivider} />
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatItemLabel}>PARTS TOTALES</Text>
          <View style={styles.heroStatItemValRow}>
            <Icon name="crown" size={12} color="#FDE68A" style={{ marginRight: 4 }} />
            <Text style={styles.heroStatItemVal}>{metrics.totalHandsExpected} mains</Text>
          </View>
        </View>
        <View style={styles.heroStatDivider} />
        <View style={styles.heroStatItem}>
          <Text style={styles.heroStatItemLabel}>TOTAL CYCLE</Text>
          <Text style={styles.heroStatItemValGreen}>
            {formatCurrency(metrics.totalHandsExpected * metrics.totalPotAmount)}
          </Text>
        </View>
      </View>
      <View style={styles.heroProgressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>
            Mains données : {metrics.handsTouchedCount}/{metrics.totalHandsExpected} mains
          </Text>
          <Text style={styles.progressPct}>{cycleProgressPct}%</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: (cycleProgressPct + '%') as any }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: SOL_COLORS.secondary,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    ...SHADOWS.md,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroLeft: { flex: 1, marginRight: 10 },
  heroPillHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  heroLabel: { fontSize: 10, fontWeight: '900', color: '#CBD5E1', letterSpacing: 0.5 },
  heroAmount: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', marginTop: 2, letterSpacing: -0.5 },
  heroSubFormula: { fontSize: 11, color: '#93C5FD', fontWeight: '600', marginTop: 2 },
  heroUnitBadge: {
    backgroundColor: SOL_COLORS.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroUnitText: { fontSize: 12, fontWeight: '800', color: SOL_COLORS.primaryLight },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatItemLabel: { fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 0.2 },
  heroStatItemValRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  heroStatItemVal: { fontSize: 13, fontWeight: '800', color: '#F1F5F9' },
  heroStatItemValGreen: { fontSize: 13, fontWeight: '900', color: '#34D399', marginTop: 3 },
  heroStatDivider: { width: 1, height: 24, backgroundColor: '#334155' },
  heroProgressSection: { marginTop: 14 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12, color: '#CBD5E1', fontWeight: '600' },
  progressPct: { fontSize: 12, fontWeight: '800', color: SOL_COLORS.primaryLight },
  progressBarBg: {
    height: 10,
    backgroundColor: '#1E293B',
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressBarFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 5 },
});

