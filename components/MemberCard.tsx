import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Member } from '@/types';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { formatCurrency, getInitials } from '@/lib/formatters';
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

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handleCardPress}
      style={[
        styles.card,
        isPayoutTurn && !member.hasReceivedPayout && styles.cardHighlightTurn,
      ]}
    >
      {/* Top Header: Avatar + Name + Status */}
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(member.fullName)}</Text>
        </View>

        <View style={styles.nameContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.fullName} numberOfLines={1}>
              {member.fullName}
            </Text>
            {member.payoutRank && (
              <View style={styles.rankPill}>
                <Text style={styles.rankPillText}>Main #{member.payoutRank}</Text>
              </View>
            )}
          </View>
          <Text style={styles.phone}>{member.phoneNumber}</Text>
        </View>
      </View>

      {/* Middle: Badges & Financial Info */}
      <View style={styles.middleRow}>
        <Badge
          paymentStatus={member.paymentStatusToday}
          overdueCount={member.overdueRoundsCount}
          hasReceivedPayout={member.hasReceivedPayout}
        />

        <View style={styles.financialBox}>
          <Text style={styles.balanceLabel}>Solde cotisé :</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(member.currentBalance)}</Text>
        </View>
      </View>

      {/* Bottom: Quick Actions */}
      <View style={styles.actionRow}>
        {/* Payout Hand Action if it's their turn and not yet paid out */}
        {isPayoutTurn && !member.hasReceivedPayout && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePayoutPress}
            style={styles.payoutButton}
          >
            <Icon name="crown" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.payoutButtonText}>Décaisser la Main</Text>
          </TouchableOpacity>
        )}

        {/* Regular Collection Shortcut */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleCollectPress}
          style={[
            styles.collectButton,
            member.paymentStatusToday === 'PAID_TODAY' && styles.collectButtonPaid,
          ]}
        >
          <Icon
            name={member.paymentStatusToday === 'PAID_TODAY' ? 'check' : 'collect'}
            size={14}
            color={member.paymentStatusToday === 'PAID_TODAY' ? '#15803D' : '#FFFFFF'}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.collectButtonText,
              member.paymentStatusToday === 'PAID_TODAY' && styles.collectButtonTextPaid,
            ]}
          >
            {member.paymentStatusToday === 'PAID_TODAY' ? 'Cotisé (Ajouter)' : 'Encaisser'}
          </Text>
        </TouchableOpacity>
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
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  cardHighlightTurn: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
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
    marginRight: 10,
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
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 10,
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
  collectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 10,
    borderRadius: 12,
  },
  collectButtonPaid: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  collectButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  collectButtonTextPaid: {
    color: '#15803D',
  },
  payoutButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 12,
  },
  payoutButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
