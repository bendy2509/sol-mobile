import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DashboardMetrics } from '@/types';
import { Icon } from '@/components/Icon';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics;
  membersCount: number;
}

export const DashboardMetricsGrid: React.FC<DashboardMetricsGridProps> = ({
  metrics,
  membersCount,
}) => {
  return (
    <View style={styles.metricsGrid}>
      {/* Card 1: Aujourd'hui */}
      <View style={styles.metricCard}>
        <View style={styles.metricCardHeader}>
          <Text style={styles.metricCardTitle}>AUJOURD'HUI</Text>
          <View style={[styles.metricIconBox, { backgroundColor: '#ECFDF5' }]}>
            <Icon name="cash" size={13} color={SOL_COLORS.successDark} />
          </View>
        </View>
        <Text style={[styles.metricCardValue, { color: SOL_COLORS.successDark }]}>
          {metrics.handsCollectedToday} main{metrics.handsCollectedToday > 1 ? 's' : ''}
        </Text>
        <Text style={styles.metricCardSub}>
          {formatCurrency(metrics.handsCollectedToday * metrics.unitAmount)} • {metrics.paidTodayCount}/{membersCount} à jour
        </Text>
      </View>

      {/* Card 2: Effectif */}
      <View style={styles.metricCard}>
        <View style={styles.metricCardHeader}>
          <Text style={styles.metricCardTitle}>EFFECTIF DU SOL</Text>
          <View style={[styles.metricIconBox, { backgroundColor: '#EFF6FF' }]}>
            <Icon name="crown" size={13} color={SOL_COLORS.info} />
          </View>
        </View>
        <Text style={[styles.metricCardValue, { color: SOL_COLORS.primary }]}>
          {metrics.totalHandsExpected} mains
        </Text>
        <Text style={styles.metricCardSub}>{metrics.totalMembersCount} enfants inscrits</Text>
      </View>

      {/* Card 3: Calendrier */}
      <View style={styles.metricCard}>
        <View style={styles.metricCardHeader}>
          <Text style={styles.metricCardTitle}>CALENDRIER</Text>
          <View style={[styles.metricIconBox, { backgroundColor: '#F0F9FF' }]}>
            <Icon name="clock" size={13} color="#0284C7" />
          </View>
        </View>
        <Text style={[styles.metricCardValue, { color: SOL_COLORS.textPrimary }]}>
          {metrics.daysRemaining} jours
        </Text>
        <Text style={styles.metricCardSub}>Fin : {formatDateShort(metrics.endDate)}</Text>
      </View>

      {/* Card 4: Retards */}
      <View
        style={[
          styles.metricCard,
          metrics.overdueMembersCount > 0 && styles.metricCardAlert,
        ]}
      >
        <View style={styles.metricCardHeader}>
          <Text
            style={[
              styles.metricCardTitle,
              metrics.overdueMembersCount > 0 && { color: SOL_COLORS.dangerDark },
            ]}
          >
            RETARDS
          </Text>
          <View
            style={[
              styles.metricIconBox,
              { backgroundColor: metrics.overdueMembersCount > 0 ? '#FFE4E6' : '#F1F5F9' },
            ]}
          >
            <Icon
              name="alert"
              size={13}
              color={metrics.overdueMembersCount > 0 ? SOL_COLORS.danger : SOL_COLORS.textMuted}
            />
          </View>
        </View>
        <Text
          style={[
            styles.metricCardValue,
            metrics.overdueMembersCount > 0
              ? { color: SOL_COLORS.dangerDark }
              : { color: SOL_COLORS.textPrimary },
          ]}
        >
          {metrics.overdueMembersCount} {metrics.overdueMembersCount > 1 ? 'enfants' : 'enfant'}
        </Text>
        <Text
          style={[
            styles.metricCardSub,
            metrics.overdueMembersCount > 0 && { color: SOL_COLORS.dangerDark },
          ]}
        >
          {metrics.overdueMembersCount > 0
            ? `${metrics.overdueHandsCount} main(s) • ${formatCurrency(metrics.overdueHandsCount * metrics.unitAmount)}`
            : 'Aucun retard'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  metricCard: {
    width: '48.3%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  metricCardAlert: {
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  metricCardValue: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  metricCardSub: {
    fontSize: 11,
    fontWeight: '600',
    color: SOL_COLORS.textMuted,
    marginTop: 2,
  },
});
