import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DashboardMetrics } from '@/types';
import { Icon } from '@/components/Icon';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { SHADOWS } from '@/constants/Colors';

interface DashboardHeroProps {
  metrics: DashboardMetrics;
  cycleProgressPct: number;
}

export const DashboardHero: React.FC<DashboardHeroProps> = ({ metrics, cycleProgressPct }) => {
  const potTotal = metrics.totalHandsExpected * metrics.unitAmount;
  const handsRemaining = Math.max(0, metrics.totalHandsExpected - (metrics.handsTouchedCount || 0));

  return (
    <View style={styles.heroCard}>
      {/* Ligne Supérieure : Indicateur de Type & Montant Unitaire */}
      <View style={styles.topMetaRow}>
        <View style={styles.badgePill}>
          <Icon name="crown" size={13} color="#FDE68A" style={styles.badgeIcon} />
          <Text style={styles.badgeText}>CAGNOTTE DU SOL (BAY MEN)</Text>
        </View>
        <View style={styles.unitPill}>
          <Text style={styles.unitText}>{formatCurrency(metrics.unitAmount)} / main</Text>
        </View>
      </View>

      {/* Montant Central en Contraste Solaire Maximum */}
      <View style={styles.amountContainer}>
        <Text style={styles.amountMain} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(potTotal)}
        </Text>
        <Text style={styles.formulaEquation}>
          Formule : {metrics.totalHandsExpected} mains souscrites × {formatCurrency(metrics.unitAmount)}
        </Text>
      </View>

      {/* Bloc Statistique à 3 Piliers Solaires */}
      <View style={styles.statsDeck}>
        <View style={styles.statColumn}>
          <Text style={styles.statMicroLabel}>ENFANTS</Text>
          <View style={styles.statValueGroup}>
            <Icon name="users" size={12} color="#94A3B8" style={styles.statGroupIcon} />
            <Text style={styles.statValueNumber}>{metrics.totalMembersCount}</Text>
          </View>
        </View>

        <View style={styles.verticalDivider} />

        <View style={styles.statColumn}>
          <Text style={styles.statMicroLabel}>MAINS ROTATION</Text>
          <View style={styles.statValueGroup}>
            <Text style={styles.statValueNumber}>
              {metrics.handsTouchedCount} / {metrics.totalHandsExpected}
            </Text>
          </View>
        </View>

        <View style={styles.verticalDivider} />

        <View style={styles.statColumn}>
          <Text style={styles.statMicroLabel}>RESTANTES</Text>
          <Text style={styles.statValueHighlight}>
            {handsRemaining} main{handsRemaining > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Barre de Progression de Clôture de Cycle (10dp haute lisibilité) */}
      <View style={styles.progressSection}>
        <View style={styles.progressTextRow}>
          <Text style={styles.progressLabel}>Progression du tirage</Text>
          <Text style={styles.progressPercent}>{cycleProgressPct}%</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, cycleProgressPct))}%` }]} />
        </View>
        {metrics.endDate ? (
          <View style={styles.cycleEndRow}>
            <Icon name="calendar" size={11} color="#94A3B8" style={{ marginRight: 4 }} />
            <Text style={styles.cycleEndText}>Échéance prévue : {formatDateShort(metrics.endDate)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#0B132B',
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    ...SHADOWS.md,
  },
  topMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(253, 230, 138, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.25)',
  },
  badgeIcon: {
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 0.6,
  },
  unitPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  unitText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38BDF8',
  },
  amountContainer: {
    marginVertical: 4,
  },
  amountMain: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  formulaEquation: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 4,
  },
  statsDeck: {
    flexDirection: 'row',
    backgroundColor: '#162238',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginTop: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
  },
  statMicroLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  statGroupIcon: {
    marginRight: 4,
  },
  statValueNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  statValueHighlight: {
    fontSize: 13,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 3,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#243553',
  },
  progressSection: {
    marginTop: 14,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '900',
    color: '#38BDF8',
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#1E293B',
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 5,
  },
  cycleEndRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  cycleEndText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
});



