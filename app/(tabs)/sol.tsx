import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Header } from '@/components/Header';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { BusinessConfig, Member } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { getFrequencyLabel } from '@/lib/dateCalculations';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function SolMatrixScreen() {
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [activeBusiness, memberList] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus({ sort: 'PAYOUT_RANK' }),
      ]);
      setBusiness(activeBusiness);
      setMembers(memberList);
    } catch (err) {
      console.warn('Error loading Sol matrix:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handlePayout = async (member: Member) => {
    if (!business) return;
    triggerMediumImpact();

    const potAmount = business.contributionAmount * (business.totalSlots || members.length);

    Alert.alert(
      'Décaisser la Main (Remettre la Cagnotte)',
      `Confirmez-vous le versement de la main du Sol à ${member.fullName} pour un montant de ${formatCurrency(potAmount)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer le Décaissement',
          onPress: async () => {
            try {
              await payoutMemberHand(member.id, potAmount, business.id);
              triggerSuccessFeedback();
              Alert.alert('Succès', `La main a été décaissée avec succès pour ${member.fullName}.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Erreur', err?.message || 'Échec du décaissement.');
            }
          },
        },
      ]
    );
  };

  const totalPaidOut = members.filter((m) => m.hasReceivedPayout).length;
  const currentRound = Math.min(members.length || 1, totalPaidOut + 1);
  const potValue = (business?.contributionAmount || 0) * (business?.totalSlots || members.length || 1);

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={business?.name || 'Sol (ROSCA)'}
        subtitle="Matrice de passage des mains & tirage"
        onRefresh={handleRefresh}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[SOL_COLORS.primary]}
          />
        }
      >
        {/* Sol Status Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroGroupLabel}>CYCLE EN COURS</Text>
              <Text style={styles.heroGroupName}>{business?.name || 'Groupe Sol'}</Text>
              <Text style={styles.heroFrequency}>
                Fréquence : {getFrequencyLabel(business?.frequency || 'WED_SAT')}
              </Text>
            </View>
            <View style={styles.potBox}>
              <Text style={styles.potLabel}>CAGNOTTE (PO)</Text>
              <Text style={styles.potAmount}>{formatCurrency(potValue)}</Text>
            </View>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                Progression du cycle : Tour {currentRound} sur {business?.totalSlots || members.length}
              </Text>
              <Text style={styles.progressPct}>
                {Math.round((totalPaidOut / (business?.totalSlots || members.length || 1)) * 100)}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round((totalPaidOut / (business?.totalSlots || members.length || 1)) * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Member Matrix */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            ORDRE DE PASSAGE DES MAINS ({members.length} ADHÉRENTS)
          </Text>
        </View>

        {members.map((m, index) => {
          const rank = m.payoutRank || index + 1;
          const isCurrentTurn = rank === currentRound && !m.hasReceivedPayout;

          return (
            <View
              key={m.id}
              style={[
                styles.memberRow,
                isCurrentTurn && styles.memberRowHighlight,
                m.hasReceivedPayout && styles.memberRowPaidOut,
              ]}
            >
              {/* Rank Pill */}
              <View
                style={[
                  styles.rankCircle,
                  isCurrentTurn && styles.rankCircleHighlight,
                  m.hasReceivedPayout && styles.rankCirclePaidOut,
                ]}
              >
                <Text
                  style={[
                    styles.rankText,
                    isCurrentTurn && styles.rankTextHighlight,
                    m.hasReceivedPayout && styles.rankTextPaidOut,
                  ]}
                >
                  #{rank}
                </Text>
              </View>

              {/* Member Details */}
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.fullName}</Text>
                <Text style={styles.memberPhone}>{m.phoneNumber}</Text>
              </View>

              {/* Status or Payout Action */}
              <View style={styles.actionContainer}>
                {m.hasReceivedPayout ? (
                  <View style={styles.paidBadge}>
                    <Icon name="check" size={12} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={styles.paidBadgeText}>Main Touchée</Text>
                  </View>
                ) : isCurrentTurn ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePayout(m)}
                    style={styles.payoutBtn}
                  >
                    <Icon name="crown" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.payoutBtnText}>Décaisser</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.pendingRankText}>En attente</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: SOL_COLORS.secondary,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroGroupLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  heroGroupName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  heroFrequency: {
    fontSize: 12,
    color: '#34D399',
    marginTop: 2,
    fontWeight: '600',
  },
  potBox: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#334155',
  },
  potLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  potAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 2,
  },
  progressSection: {
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    color: '#E2E8F0',
    fontWeight: '700',
  },
  progressPct: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '800',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#34D399',
    borderRadius: 4,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  memberRowHighlight: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
  },
  memberRowPaidOut: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.85,
  },
  rankCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankCircleHighlight: {
    backgroundColor: '#2563EB',
  },
  rankCirclePaidOut: {
    backgroundColor: '#DCFCE7',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  rankTextHighlight: {
    color: '#FFFFFF',
  },
  rankTextPaidOut: {
    color: '#15803D',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  memberPhone: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    marginTop: 1,
  },
  actionContainer: {
    alignItems: 'flex-end',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paidBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  payoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  payoutBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  pendingRankText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
