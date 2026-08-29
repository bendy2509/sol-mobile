import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { ClientType, MemberPaymentStatus, SyncStatus } from '@/types';
import { Icon } from './Icon';
import { SOL_COLORS } from '@/constants/Colors';

interface BadgeProps {
  label?: string;
  type?: ClientType;
  syncStatus?: SyncStatus;
  paymentStatus?: MemberPaymentStatus;
  overdueCount?: number;
  hasReceivedPayout?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  type,
  syncStatus,
  paymentStatus,
  overdueCount,
  hasReceivedPayout,
  style,
}) => {
  const getBadgeConfig = () => {
    if (hasReceivedPayout) {
      return {
        label: 'Main Décaissée',
        bg: '#F1F5F9',
        text: '#475569',
        border: '#E2E8F0',
        iconName: 'check' as const,
      };
    }

    if (paymentStatus) {
      switch (paymentStatus) {
        case 'PAID_TODAY':
          return {
            label: "À jour",
            bg: SOL_COLORS.successLighter,
            text: SOL_COLORS.successDark,
            border: '#A7F3D0',
            iconName: 'check' as const,
          };
        case 'UNPAID_TODAY':
          return {
            label: 'Attente cotisation',
            bg: SOL_COLORS.accentLighter,
            text: SOL_COLORS.accent,
            border: '#FDE68A',
            iconName: 'clock' as const,
          };
        case 'OVERDUE':
          return {
            label: overdueCount && overdueCount > 1 ? `En retard (${overdueCount} mains)` : 'En retard',
            bg: SOL_COLORS.dangerLighter,
            text: SOL_COLORS.dangerDark,
            border: '#FECDD3',
            iconName: 'alert' as const,
          };
        case 'UPCOMING_PAYOUT':
          return {
            label: 'Prochaine Main',
            bg: SOL_COLORS.infoLighter,
            text: SOL_COLORS.info,
            border: '#BFDBFE',
            iconName: 'crown' as const,
          };
      }
    }

    if (type) {
      switch (type) {
        case 'SABOTAY':
          return { label: 'SABOTAY', bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' };
        case 'SOL':
          return { label: 'SOL', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' };
        case 'HYBRID':
          return { label: 'HYBRIDE', bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' };
      }
    }

    if (syncStatus) {
      switch (syncStatus) {
        case 'SYNCED':
          return { label: 'Synchronisé', bg: '#F0FDF4', text: '#047857', border: '#A7F3D0' };
        case 'PENDING':
          return { label: 'En attente', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' };
        case 'FAILED':
          return { label: 'Erreur', bg: '#FFF1F2', text: '#E11D48', border: '#FECDD3' };
      }
    }

    return { label: label || '', bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' };
  };

  const config = getBadgeConfig();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.border },
        style,
      ]}
    >
      {config.iconName && (
        <Icon
          name={config.iconName}
          size={11}
          color={config.text}
          style={{ marginRight: 4 }}
        />
      )}
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
