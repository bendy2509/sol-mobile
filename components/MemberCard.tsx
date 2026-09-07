import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Member } from '@/types';
import { Icon } from './Icon';
import { formatCurrency, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { SHADOWS } from '@/constants/Colors';

interface MemberCardProps {
  member: Member;
  isPayoutTurn?: boolean;
  onQuickCollect?: (member: Member) => void;
  onPayoutHand?: (member: Member) => void;
}

const MemberCardComponent: React.FC<MemberCardProps> = ({
  member,
  isPayoutTurn = false,
  onQuickCollect,
  onPayoutHand,
}) => {
  const router = useRouter();

  const handleCardPress = () => {
    triggerLightImpact();
    router.push(`/client/${member.id}` as any);
  };

  const handleCollectPress = () => {
    triggerMediumImpact();
    if (onQuickCollect) {
      onQuickCollect(member);
    } else {
      router.push({
        pathname: '/(tabs)/collect',
        params: { clientId: member.id },
      } as any);
    }
  };

  const handlePayoutPress = () => {
    triggerMediumImpact();
    if (onPayoutHand) {
      onPayoutHand(member);
    }
  };

  const isCovered =
    member.paymentStatusToday === 'PAID_TODAY' ||
    member.paymentStatusToday === 'PAID_IN_ADVANCE';

  const isMultiHands = (member.handsCount || 1) > 1;

  // Calcul du label et style de badge de recouvrement
  const renderStatusBadge = () => {
    switch (member.paymentStatusToday) {
      case 'PAID_TODAY':
        return (
          <View style={[styles.statusBadge, styles.statusBadgePaid]}>
            <Icon name="check" size={11} color="#047857" style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, styles.statusBadgeTextPaid]}>À JOUR</Text>
          </View>
        );
      case 'PAID_IN_ADVANCE':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeAdvance]}>
            <Icon name="check" size={11} color="#0F766E" style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, styles.statusBadgeTextAdvance]}>
              AVANCE (+{member.handsCoveredAhead || 1})
            </Text>
          </View>
        );
      case 'OVERDUE':
        return (
          <View style={[styles.statusBadge, styles.statusBadgeOverdue]}>
            <Icon name="alert" size={11} color="#BE123C" style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, styles.statusBadgeTextOverdue]}>EN RETARD</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.statusBadge, styles.statusBadgeUnpaid]}>
            <Icon name="clock" size={11} color="#B45309" style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, styles.statusBadgeTextUnpaid]}>À ENCAISSER</Text>
          </View>
        );
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={handleCardPress}
      style={[
        styles.card,
        isPayoutTurn && !member.hasReceivedHand && styles.cardHighlightTurn,
        isMultiHands && styles.cardMultiHands,
      ]}
    >
      {/* 1. Zone Supérieure : Avatar + Identité + Rangs */}
      <View style={styles.headerRow}>
        <View style={[styles.avatar, member.hasReceivedHand && styles.avatarCompleted]}>
          <Text style={styles.avatarText}>{getInitials(member.fullName)}</Text>
        </View>

        <View style={styles.identityContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.fullName} numberOfLines={1}>
              {member.fullName}
            </Text>
            {isMultiHands ? (
              <View style={styles.multiHandsTag}>
                <Icon name="crown" size={11} color="#92400E" style={{ marginRight: 3 }} />
                <Text style={styles.multiHandsTagText}>{member.handsCount} mains</Text>
              </View>
            ) : member.rankOrder ? (
              <View style={[styles.rankPill, member.hasReceivedHand && styles.rankPillReceived]}>
                <Text style={[styles.rankPillText, member.hasReceivedHand && styles.rankPillTextReceived]}>
                  Rang #{member.rankOrder}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.subMetaRow}>
            <Icon name="phone" size={12} color="#64748B" style={{ marginRight: 4 }} />
            <Text style={styles.phoneText}>{member.phoneNumber}</Text>
            {isMultiHands && member.payoutRanks ? (
              <Text style={styles.ranksText}> • Rangs : #{member.payoutRanks}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* 2. Zone Intermédiaire : État Financier & Dotation de Tirage */}
      <View style={styles.financialSection}>
        <View style={styles.balanceGroup}>
          <Text style={styles.balanceLabel}>COTISATIONS VERSÉES</Text>
          <Text style={styles.balanceAmount}>
            {formatCurrency(member.totalPaidAmount || member.currentBalance || 0)}
          </Text>
        </View>
        {renderStatusBadge()}
      </View>

      {/* Barre de Mains Perçues pour les Souscripteurs Multiples */}
      {isMultiHands && (
        <View style={styles.multiHandsProgressBox}>
          <View style={styles.multiHandsProgressHeader}>
            <Text style={styles.multiHandsProgressLabel}>
              Mains perçues : {member.receivedHandsCount || 0} sur {member.handsCount}
            </Text>
            <Text style={styles.multiHandsProgressPercent}>
              {Math.round(((member.receivedHandsCount || 0) / member.handsCount) * 100)}%
            </Text>
          </View>
          <View style={styles.multiHandsTrack}>
            <View
              style={[
                styles.multiHandsFill,
                {
                  width: `${Math.min(
                    100,
                    Math.round(((member.receivedHandsCount || 0) / member.handsCount) * 100)
                  )}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* 3. Zone Inférieure : Cibles Tactiles Ergonomiques (>= 48dp) */}
      <View style={styles.actionsDeck}>
        {/* Bouton Encaisser Cotisation */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCollectPress}
          style={[styles.actionBtn, styles.collectBtn, isCovered && styles.collectBtnCovered]}
        >
          <Icon
            name={isCovered ? 'plus' : 'cash'}
            size={16}
            color={isCovered ? '#0F766E' : '#FFFFFF'}
            style={styles.actionBtnIcon}
          />
          <Text style={[styles.actionBtnText, isCovered && styles.collectBtnTextCovered]}>
            {isCovered
              ? 'Ajouter avance'
              : isMultiHands
              ? `Encaisser (${member.handsCount}m)`
              : 'Encaisser'}
          </Text>
        </TouchableOpacity>

        {/* Bouton Décaissement / Statut Tirage */}
        {member.hasReceivedHand ? (
          <View style={[styles.actionBtn, styles.payoutCompletedBox]}>
            <Icon name="check" size={15} color="#047857" style={styles.actionBtnIcon} />
            <Text style={styles.payoutCompletedText}>
              {isMultiHands ? `${member.handsCount}/${member.handsCount} perçues` : 'Main remise'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePayoutPress}
            style={[styles.actionBtn, styles.payoutBtn]}
          >
            <Icon name="crown" size={16} color="#FFFFFF" style={styles.actionBtnIcon} />
            <Text style={styles.actionBtnText}>
              {isMultiHands
                ? `Décaisser (${(member.receivedHandsCount || 0) + 1}/${member.handsCount})`
                : 'Décaisser'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1', // Contraste solaire augmenté
    ...SHADOWS.sm,
  },
  cardHighlightTurn: {
    borderColor: '#0284C7',
    borderWidth: 2,
    backgroundColor: '#F0F9FF',
  },
  cardMultiHands: {
    borderLeftWidth: 5,
    borderLeftColor: '#D97706', // Marqueur visuel de multi-parts
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarCompleted: {
    backgroundColor: '#0D9488',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  identityContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fullName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0F1D',
    flex: 1,
    marginRight: 6,
  },
  multiHandsTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  multiHandsTagText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
  },
  rankPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rankPillReceived: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  rankPillTextReceived: {
    color: '#64748B',
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  ranksText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },
  financialSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
  },
  balanceGroup: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0F1D',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgePaid: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  statusBadgeTextPaid: {
    color: '#047857',
  },
  statusBadgeAdvance: {
    backgroundColor: '#CCFBF1',
    borderColor: '#99F6E4',
  },
  statusBadgeTextAdvance: {
    color: '#0F766E',
  },
  statusBadgeOverdue: {
    backgroundColor: '#FFE4E6',
    borderColor: '#FECDD3',
  },
  statusBadgeTextOverdue: {
    color: '#BE123C',
  },
  statusBadgeUnpaid: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statusBadgeTextUnpaid: {
    color: '#B45309',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  multiHandsProgressBox: {
    marginBottom: 12,
  },
  multiHandsProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  multiHandsProgressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  multiHandsProgressPercent: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0284C7',
  },
  multiHandsTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  multiHandsFill: {
    height: '100%',
    backgroundColor: '#0284C7',
    borderRadius: 3,
  },
  actionsDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48, // Règle stricte de cible tactile
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnIcon: {
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  collectBtn: {
    backgroundColor: '#0D9488',
  },
  collectBtnCovered: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
  },
  collectBtnTextCovered: {
    color: '#0F766E',
  },
  payoutBtn: {
    backgroundColor: '#D97706',
  },
  payoutCompletedBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  payoutCompletedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
});

export const MemberCard = React.memo(MemberCardComponent);

