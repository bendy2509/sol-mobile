import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { getDatabase, getActiveCollectorId } from '@/db/sqlite';

import { Header } from '@/components/Header';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus, payoutMemberHand } from '@/db/memberRepository';
import { BusinessConfig, Member } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { getFrequencyLabel } from '@/lib/dateCalculations';
import { calculatePot, calculateCycleTotalHands } from '@/services/financialService';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function SolMatrixScreen() {
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Payout Flow State
  const [payoutTargetMember, setPayoutTargetMember] = useState<Member | null>(null);
  const [payoutNote, setPayoutNote] = useState('');
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const [dbTotalHands, setDbTotalHands] = useState<number>(0);

  const loadData = useCallback(async () => {
    try {
      const [activeBusiness, memberList] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus({ sort: 'PAYOUT_RANK' }),
      ]);
      setBusiness(activeBusiness);
      setMembers(memberList);

      // Direct SQL SUM for guaranteed accuracy — avoids ORM mapping issues
      try {
        const db = await getDatabase();
        const collectorId = await getActiveCollectorId();
        const row = await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(COALESCE(hands_count, 1)), 0) as total FROM clients WHERE collector_id = ?`,
          [collectorId]
        );
        const totalFromSql = Number(row?.total || 0);
        const totalFromMembers = calculateCycleTotalHands(memberList);
        setDbTotalHands(Math.max(1, totalFromMembers, totalFromSql));
      } catch {
        // Fallback to JS calculation if direct query fails
        setDbTotalHands(Math.max(1, calculateCycleTotalHands(memberList)));
      }
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

  const handleInitiatePayout = (member: Member) => {
    triggerMediumImpact();
    setPayoutTargetMember(member);
    const hands = Math.max(1, member.handsCount || 1);
    const rec = Number(member.receivedHandsCount || 0);
    setPayoutNote(`Remise de la main (${rec + 1}/${hands}) - ${member.fullName}`);
    setIsPayoutModalOpen(true);
  };

  const handleConfirmPayoutDetails = () => {
    if (!payoutNote.trim()) {
      Alert.alert('Justification requise', 'Veuillez saisir une note ou motif pour le déblocage de la main.');
      return;
    }
    setIsPayoutModalOpen(false);
    setIsPinModalOpen(true);
  };

  // Use SQL-based total (most reliable) falling back to JS calculation then business config
  const totalHandsCount = dbTotalHands || calculateCycleTotalHands(members) || (business?.totalSlots || 10);
  const potValue = calculatePot(
    business?.contributionAmount || 250,
    totalHandsCount
  );

  const handlePinSuccessPayout = async () => {
    setIsPinModalOpen(false);
    if (!payoutTargetMember) return;

    try {
      await payoutMemberHand(
        payoutTargetMember.id,
        potValue,
        payoutNote.trim(),
        business?.id
      );
      triggerSuccessFeedback();
      Alert.alert(
        'Main Remise avec Succès !',
        `La cagnotte complète de ${formatCurrency(potValue)} a été décaissée pour ${payoutTargetMember.fullName}.\n\nRappel : Cet enfant reste actif et doit continuer ses cotisations restantes jusqu'à la fin du cycle.`
      );
      loadData();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Échec du décaissement.');
    } finally {
      setPayoutTargetMember(null);
    }
  };

  const totalHandsTouched = members.reduce(
    (sum, m) => sum + (m.receivedHandsCount || (m.hasReceivedHand ? m.handsCount || 1 : 0)),
    0
  );
  const currentRound = Math.min(totalHandsCount, totalHandsTouched + 1);

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
                Fréquence : {getFrequencyLabel(business?.frequency || 'DAILY')}
              </Text>
            </View>
            <View style={styles.potBox}>
              <Text style={styles.potLabel}>CAGNOTTE (PO)</Text>
              <Text style={styles.potAmount}>{formatCurrency(potValue)}</Text>
            </View>
          </View>

          {/* Progress Metrics */}
          <View style={styles.progressSection}>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressLabel}>
                Mains données : <Text style={styles.progressBold}>{totalHandsTouched} sur {totalHandsCount} mains</Text>
              </Text>
              <Text style={styles.progressPct}>
                {Math.round((totalHandsTouched / (totalHandsCount || 1)) * 100)}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      (totalHandsTouched / (totalHandsCount || 1)) * 100
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Matrix List of Ranks */}
        <View style={styles.matrixContainer}>
          <Text style={styles.sectionTitle}>ORDRE OFFICIEL DE PASSAGE DES MAINS</Text>

          {members.map((member, index) => {
            const memberHandsCount = Math.max(1, member.handsCount || 1);
            const receivedCount = Number(member.receivedHandsCount || 0);
            const hasReceived = receivedCount >= memberHandsCount || Boolean(member.hasReceivedHand || member.hasReceivedPayout);
            
            const ranksList = (member.payoutRanks ? String(member.payoutRanks).split(',') : [String(member.payoutRank || '')])
              .map((r) => Number(r.trim()))
              .filter((n) => !isNaN(n) && n > 0);
            const isNextTurn = !hasReceived && (ranksList.includes(currentRound) || member.payoutRank === currentRound);

            return (
              <View
                key={member.id}
                style={[
                  styles.rankCard,
                  isNextTurn && styles.rankCardHighlight,
                  hasReceived && styles.rankCardCompleted,
                ]}
              >
                <View style={styles.rankLeft}>
                  <View
                    style={[
                      styles.rankCircle,
                      isNextTurn && styles.rankCircleHighlight,
                      hasReceived && styles.rankCircleCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rankNumber,
                        isNextTurn && styles.rankNumberHighlight,
                        hasReceived && styles.rankNumberCompleted,
                      ]}
                    >
                      {member.rankOrder || member.payoutRank || index + 1}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={styles.memberName}>{member.fullName}</Text>
                      {memberHandsCount > 1 && (
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>
                            {memberHandsCount} mains
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberPhone}>{member.phoneNumber}</Text>
                    {memberHandsCount > 1 ? (
                      <Text style={{ fontSize: 11, color: '#0284C7', fontWeight: '700', marginTop: 2 }}>
                        {receivedCount}/{memberHandsCount} main{receivedCount > 1 ? 's' : ''} touchée{receivedCount > 1 ? 's' : ''} • Rangs #{member.payoutRanks || member.payoutRank}
                      </Text>
                    ) : member.handReceivedDate ? (
                      <Text style={styles.receivedDateText}>
                        Main touchée le {formatDateShort(member.handReceivedDate)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.rankRight}>
                  {hasReceived ? (
                    <View style={styles.badgePaidOut}>
                      <Icon name="check" size={12} color="#047857" style={{ marginRight: 4 }} />
                      <Text style={styles.badgePaidOutText}>
                        {memberHandsCount > 1 ? `${memberHandsCount}/${memberHandsCount} Touchées` : 'Main Touchée'}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleInitiatePayout(member)}
                      style={[styles.payoutActionBtn, isNextTurn && styles.payoutActionBtnHighlight]}
                    >
                      <Icon name="crown" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.payoutActionBtnText}>
                        {memberHandsCount > 1
                          ? `Décaisser (${receivedCount + 1}/${memberHandsCount})`
                          : isNextTurn ? 'Donner la Main' : 'Décaisser'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Payout Justification Modal */}
      <Modal
        visible={isPayoutModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPayoutModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.iconCircleCrown}>
                <Icon name="crown" size={24} color="#1D4ED8" />
              </View>
              <Text style={styles.modalTitle}>Remise de la Main (Payout)</Text>
            </View>

            <Text style={styles.modalSub}>
              Vous allez débloquer la cagnotte complète de{' '}
              <Text style={styles.modalSubBold}>{formatCurrency(potValue)}</Text> pour{' '}
              <Text style={styles.modalSubBold}>{payoutTargetMember?.fullName}</Text> (Main #{payoutTargetMember?.rankOrder || payoutTargetMember?.payoutRank || 1}).
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOTE / JUSTIFICATION DU DÉCAISSEMENT (OBLIGATOIRE)</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Ex: Remise de main effectuée en mains propres au marché."
                placeholderTextColor="#94A3B8"
                value={payoutNote}
                onChangeText={setPayoutNote}
              />
            </View>

            <View style={styles.modalWarningBox}>
              <Icon name="shield" size={14} color="#0284C7" style={{ marginRight: 6 }} />
              <Text style={styles.modalWarningText}>
                L'adhérent restera sur le tableau de bord et continuera d'être exigible pour les cotisations restantes.
              </Text>
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsPayoutModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleConfirmPayoutDetails}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmBtnText}>Valider (Code PIN)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation Sécurisée de la Main"
        subtitle={`Saisissez votre code PIN gestionnaire pour autoriser le décaissement de ${formatCurrency(potValue)}.`}
        onSuccess={handlePinSuccessPayout}
        onCancel={() => setIsPinModalOpen(false)}
      />
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
    paddingBottom: 90,
  },
  heroCard: {
    backgroundColor: SOL_COLORS.secondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroGroupLabel: {
    fontSize: 10,
    fontWeight: '900',
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
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  potBox: {
    alignItems: 'flex-end',
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  potLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  potAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 2,
  },
  progressSection: {
    marginTop: 6,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  progressBold: {
    fontWeight: '900',
    color: '#FFFFFF',
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '900',
    color: '#34D399',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#34D399',
    borderRadius: 3,
  },
  matrixContainer: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  rankCardHighlight: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
  },
  rankCardCompleted: {
    backgroundColor: '#F8FAFC',
    opacity: 0.85,
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  rankCircleHighlight: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  rankCircleCompleted: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#64748B',
  },
  rankNumberHighlight: {
    color: '#FFFFFF',
  },
  rankNumberCompleted: {
    color: '#059669',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  memberPhone: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  receivedDateText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '700',
    marginTop: 2,
  },
  rankRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  badgePaidOut: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgePaidOutText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  payoutActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  payoutActionBtnHighlight: {
    backgroundColor: '#2563EB',
  },
  payoutActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    elevation: 6,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircleCrown: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginVertical: 8,
    lineHeight: 18,
  },
  modalSubBold: {
    fontWeight: '900',
    color: '#1D4ED8',
  },
  inputGroup: {
    marginVertical: 10,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  modalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 14,
  },
  modalWarningText: {
    flex: 1,
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 15,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalConfirmBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
