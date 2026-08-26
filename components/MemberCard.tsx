import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Member } from '@/types';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { formatCurrency, formatDateShort, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

interface MemberCardProps {
  member: Member;
  isPayoutTurn?: boolean;
  onQuickCollect?: (member: Member) => void;
  onPayoutHand?: (member: Member) => void;
}

export const MemberCard: React.FC<MemberCardProps> = ({
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
      activeOpacity={0.85}
      onPress={handleCardPress}
      style={[
        styles.card,
        isPayoutTurn && !member.hasReceivedHand && styles.cardHighlightTurn,
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
            {member.rankOrder && (
              <View style={styles.rankPill}>
                <Text style={styles.rankPillText}>Main #{member.rankOrder}</Text>
              </View>
            )}
          </View>
          <Text style={styles.phone}>{member.phoneNumber}</Text>
        </View>
      </View>

      {/* Hand Status Indicator Banner */}
      <View style={styles.handStatusRow}>
        {member.hasReceivedHand ? (
          <View style={styles.handReceivedBadge}>
            <Icon name="check" size={12} color="#047857" style={{ marginRight: 4 }} />
            <Text style={styles.handReceivedText}>
              Main touchée {member.handReceivedDate ? `le ${formatDateShort(member.handReceivedDate)}` : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.handPendingBadge}>
            <Icon name="clock" size={12} color="#475569" style={{ marginRight: 4 }} />
            <Text style={styles.handPendingText}>Main en attente de tour</Text>
          </View>
        )}

        {member.handsCoveredAhead > 0 && (
          <View style={styles.advanceBadge}>
            <Text style={styles.advanceBadgeText}>+{member.handsCoveredAhead} j d'avance</Text>
          </View>
        )}
      </View>

      {/* Middle Row: Payment Status Badge & Financial Total */}
      <View style={styles.middleRow}>
        <View style={styles.statusBox}>
          {member.paymentStatusToday === 'PAID_IN_ADVANCE' ? (
            <View style={styles.badgeAdvance}>
              <Icon name="check" size={12} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.badgeAdvanceText}>
                Couvert jusqu'au {formatDateShort(member.paidUntilDate)}
              </Text>
            </View>
          ) : member.paymentStatusToday === 'PAID_TODAY' ? (
            <View style={styles.badgePaid}>
              <Icon name="check" size={12} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.badgePaidText}>Payé aujourd'hui</Text>
            </View>
          ) : member.paymentStatusToday === 'OVERDUE' ? (
            <View style={styles.badgeOverdue}>
              <Icon name="alert" size={12} color="#DC2626" style={{ marginRight: 4 }} />
              <Text style={styles.badgeOverdueText}>
                En retard ({member.overdueRoundsCount} main{member.overdueRoundsCount > 1 ? 's' : ''})
              </Text>
            </View>
          ) : (
            <View style={styles.badgeUnpaid}>
              <Icon name="clock" size={12} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={styles.badgeUnpaidText}>Non payé aujourd'hui</Text>
            </View>
          )}
        </View>

        <View style={styles.financialBox}>
          <Text style={styles.balanceLabel}>Total cotisé :</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(member.totalPaidAmount || member.currentBalance)}</Text>
        </View>
      </View>

      {/* Bottom Action Row: Encaisser & Donner la main */}
      <View style={styles.actionRow}>
        {/* Quick Collect Action */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleCollectPress}
          style={[styles.actionBtn, styles.collectBtn, isCovered && styles.collectBtnCovered]}
        >
          <Icon
            name={isCovered ? 'plus' : 'collect'}
            size={14}
            color={isCovered ? '#059669' : '#FFFFFF'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.actionBtnText, isCovered && styles.collectBtnTextCovered]}>
            {isCovered ? 'Avance (Ajouter)' : 'Encaisser'}
          </Text>
        </TouchableOpacity>

        {/* Payout Hand Action */}
        {!member.hasReceivedHand && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePayoutPress}
            style={[styles.actionBtn, styles.payoutBtn]}
          >
            <Icon name="crown" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionBtnText}>Donner la Main</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  cardHighlightTurn: {
    borderColor: '#3B82F6',
    backgroundColor: '#F0F7FF',
    borderWidth: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SOL_COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarHandReceived: {
    backgroundColor: '#059669',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
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
    marginRight: 6,
  },
  rankPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  phone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  handStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  handReceivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  handReceivedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  handPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  handPendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  advanceBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  advanceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 10,
  },
  statusBox: {
    flex: 1,
  },
  badgePaid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgePaidText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  badgeAdvance: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeAdvanceText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  badgeOverdue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeOverdueText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  badgeUnpaid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeUnpaidText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  financialBox: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  collectBtn: {
    backgroundColor: SOL_COLORS.primary,
  },
  collectBtnCovered: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  collectBtnTextCovered: {
    color: '#047857',
  },
  payoutBtn: {
    backgroundColor: '#2563EB',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
