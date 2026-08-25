import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { ClientType, MemberPaymentStatus, SyncStatus } from '@/types';
import { Icon } from './Icon';

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
        border: '#CBD5E1',
        iconName: 'check' as const,
      };
    }

    if (paymentStatus) {
      switch (paymentStatus) {
        case 'PAID_TODAY':
          return {
            label: "Payé aujourd'hui",
            bg: '#DCFCE7',
            text: '#15803D',
            border: '#86EFAC',
            iconName: 'check' as const,
          };
        case 'UNPAID_TODAY':
          return {
            label: 'Non payé',
            bg: '#FEF3C7',
            text: '#B45309',
            border: '#FDE68A',
            iconName: 'clock' as const,
          };
        case 'OVERDUE':
          return {
            label: overdueCount && overdueCount > 1 ? `En retard (${overdueCount} mains)` : 'En retard',
            bg: '#FEE2E2',
            text: '#B91C1C',
            border: '#FCA5A5',
            iconName: 'alert' as const,
          };
        case 'UPCOMING_PAYOUT':
          return {
            label: 'Main à toucher',
            bg: '#EFF6FF',
            text: '#1D4ED8',
            border: '#BFDBFE',
            iconName: 'crown' as const,
          };
      }
    }

    if (type) {
      switch (type) {
        case 'SABOTAY':
          return { label: 'SABOTAY', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' };
        case 'SOL':
          return { label: 'SOL', bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' };
        case 'HYBRID':
          return { label: 'HYBRIDE', bg: '#EDE9FE', text: '#6D28D9', border: '#DDD6FE' };
      }
    }

    if (syncStatus) {
      switch (syncStatus) {
        case 'SYNCED':
          return { label: 'Synchronisé', bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' };
        case 'PENDING':
          return { label: 'En attente', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' };
        case 'FAILED':
          return { label: 'Échec', bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
      }
    }

    return { label: label || '', bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
