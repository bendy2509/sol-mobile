import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Member } from '@/types';
import { Icon } from './Icon';
import { formatCurrency, formatDateShort, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

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

  const isCovered = member.paymentStatusToday === 'PAID_TODAY' || member.paymentStatusToday === 'PAID_IN_ADVANCE';

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={handleCardPress}
      style={[
        styles.card,
        isPayoutTurn && !member.hasReceivedHand && styles.cardHighlightTurn,
        member.handsCount > 1 && styles.cardMultiHands,
      ]}
    >
      {/* Top Row: Avatar + Name + Hand Rank */}
      <View style={styles.topRow}>
        <View style={[styles.avatar, member.hasReceivedHand && styles.avatarHandReceived]}>
          <Text style={styles.avatarText}>{getInitials(member.fullName)}</Text>
        </View>

        <View style={styles.nameContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.fullName} numberOfLines={1}>
              {member.fullName}
            </Text>
            {member.handsCount && member.handsCount > 1 ? (
              <View style={styles.multiHandsBadge}>
                <Icon name="crown" size={11} color="#D97706" style={{ marginRight: 3 }} />
                <Text style={styles.multiHandsBadgeText}>{member.handsCount} mains</Text>
              </View>
            ) : member.rankOrder ? (
              <View style={[styles.rankPill, member.hasReceivedHand && styles.rankPillReceived]}>
                <Text style={[styles.rankPillText, member.hasReceivedHand && styles.rankPillTextReceived]}>
                  Main #{member.rankOrder}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.phone}>{member.phoneNumber}</Text>
            {member.handsCount && member.handsCount > 1 && member.payoutRanks && (
              <Text style={styles.payoutRanksText}>Rangs : #{member.payoutRanks}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Hand Status Indicator Banner & Progress */}
      <View style={styles.handStatusContainer}>
        <View style={styles.handStatusRow}>
          {member.hasReceivedHand ? (
            <View style={styles.handReceivedBadge}>
              <Icon name="check" size={12} color={SOL_COLORS.successDark} style={{ marginRight: 4 }} />
              <Text style={styles.handReceivedText}>
                {member.handsCount > 1
                  ? `Toutes mains reçues (${member.handsCount}/${member.handsCount})`
                  : `Main reçue (1/1) ${member.handReceivedDate ? `le ${formatDateShort(member.handReceivedDate)}` : ''}`}
              </Text>
            </View>
          ) : (member.receivedHandsCount || 0) > 0 ? (
            <View style={styles.handPartialBadge}>
              <Icon name="check" size={12} color="#0284C7" style={{ marginRight: 4 }} />
              <Text style={styles.handPartialText}>
                {member.receivedHandsCount}/{member.handsCount} main(s) perçue(s)
              </Text>
            </View>
          ) : (
            <View style={styles.handPendingBadge}>
              <Icon name="clock" size={12} color={SOL_COLORS.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.handPendingText}>
                0/{member.handsCount || 1} main perçue • En attente
              </Text>
            </View>
          )}

          {member.handsCoveredAhead > 0 && (
            <View style={styles.advanceBadge}>
              <Text style={styles.advanceBadgeText}>+{member.handsCoveredAhead} j d'avance</Text>
            </View>
          )}
        </View>

        {member.handsCount > 1 && (
          <View style={styles.memberProgressBarBg}>
            <View
              style={[
                styles.memberProgressBarFill,
                {
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((member.receivedHandsCount || (member.hasReceivedHand ? member.handsCount : 0)) /
                        member.handsCount) *
                        100
                    )
                  )}%`,
                },
              ]}
            />
          </View>
        )}
      </View>

      {/* Contribution Balance Row */}
      <View style={styles.balanceRow}>
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>COTISATIONS VERSÉES</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(member.totalPaidAmount || member.currentBalance)}</Text>
        </View>
      </View>

      {/* Bottom Action Row: Encaisser & Donner la main */}
      <View style={styles.actionRow}>
        {/* Quick Collect Action */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCollectPress}
          style={[styles.actionBtn, styles.collectBtn, isCovered && styles.collectBtnCovered]}
        >
          <Icon
            name={isCovered ? 'plus' : 'collect'}
            size={14}
            color={isCovered ? SOL_COLORS.primaryDark : '#FFFFFF'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.actionBtnText, isCovered && styles.collectBtnTextCovered]}>
            {isCovered ? 'Ajouter avance' : member.handsCount > 1 ? `Encaisser (${member.handsCount} mains)` : 'Encaisser cotisation'}
          </Text>
        </TouchableOpacity>

        {/* Payout Hand Action */}
        {member.hasReceivedHand ? (
          <View style={[styles.actionBtn, styles.payoutBtnDisabled]}>
            <Icon name="check" size={14} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.payoutBtnDisabledText}>
              {member.handsCount > 1 ? `${member.handsCount}/${member.handsCount} mains remises` : 'Main remise (1/1)'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePayoutPress}
            style={[styles.actionBtn, styles.payoutBtn]}
          >
            <Icon name="crown" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>
              {member.handsCount > 1
                ? `Décaisser (${(member.receivedHandsCount || 0) + 1}/${member.handsCount})`
                : 'Décaisser la main'}
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
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  cardHighlightTurn: {
    borderColor: '#3B82F6',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
  },
  cardMultiHands: {
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SOL_COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarHandReceived: {
    backgroundColor: SOL_COLORS.primary,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  nameContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fullName: {
    fontSize: 16,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  rankPill: {
    backgroundColor: SOL_COLORS.infoLighter,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rankPillReceived: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderColor: SOL_COLORS.border,
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.info,
  },
  rankPillTextReceived: {
    color: SOL_COLORS.textSecondary,
  },
  multiHandsBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  multiHandsBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#D97706',
  },
  payoutRanksText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  phone: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  handStatusContainer: {
    marginBottom: 12,
  },
  handStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  memberProgressBarBg: {
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  memberProgressBarFill: {
    height: '100%',
    backgroundColor: '#0284C7',
    borderRadius: 2,
  },
  handReceivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.successLighter,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  handReceivedText: {
    fontSize: 12,
    fontWeight: '700',
    color: SOL_COLORS.successDark,
  },
  handPartialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  handPartialText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  handPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  handPendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: SOL_COLORS.textSecondary,
  },
  advanceBadge: {
    backgroundColor: SOL_COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  advanceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.primaryDark,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: SOL_COLORS.borderLight,
    marginBottom: 12,
  },
  statusBox: {
    flex: 1,
  },
  badgeAdvance: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeAdvanceText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.primaryDark,
  },
  badgePaid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.successLighter,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgePaidText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.successDark,
  },
  badgeOverdue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.dangerLighter,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeOverdueText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.dangerDark,
  },
  badgeUnpaid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.accentLighter,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeUnpaidText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.accent,
  },
  balanceRow: {
    marginBottom: 12,
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: SOL_COLORS.textMuted,
  },
  balanceAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
  collectBtn: {
    backgroundColor: SOL_COLORS.primary,
  },
  collectBtnCovered: {
    backgroundColor: SOL_COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  payoutBtn: {
    backgroundColor: SOL_COLORS.accent,
  },
  payoutBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payoutBtnDisabledText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  collectBtnTextCovered: {
    color: SOL_COLORS.primaryDark,
  },
});

export const MemberCard = React.memo(MemberCardComponent);
