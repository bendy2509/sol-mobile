import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Client } from '@/types';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { formatCurrency, getInitials } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

interface ClientListItemProps {
  client: Client;
  onQuickCollect?: (client: Client) => void;
}

export const ClientListItem: React.FC<ClientListItemProps> = ({
  client,
  onQuickCollect,
}) => {
  const router = useRouter();

  const handleCardPress = () => {
    triggerLightImpact();
    router.push(`/client/${client.id}` as any);
  };

  const handleCollectPress = () => {
    triggerMediumImpact();
    if (onQuickCollect) {
      onQuickCollect(client);
    } else {
      router.push({
        pathname: '/(tabs)/collect',
        params: { clientId: client.id },
      } as any);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handleCardPress}
      style={styles.card}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(client.fullName)}</Text>
      </View>

      {/* Main Info */}
      <View style={styles.infoContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.fullName} numberOfLines={1}>
            {client.fullName}
          </Text>
          <Badge type={client.type} />
        </View>

        <Text style={styles.phone}>{client.phoneNumber}</Text>

        <View style={styles.bottomRow}>
          <Text style={styles.dailyTarget}>
            {client.dailyAmount > 0 ? `${client.dailyAmount.toLocaleString()} HTG/j` : 'Lib'}
          </Text>
          <Text style={styles.balance}>
            Solde:{' '}
            <Text style={styles.balanceAmount}>
              {formatCurrency(client.currentBalance)}
            </Text>
          </Text>
        </View>
      </View>

      {/* Quick Collect Action */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleCollectPress}
        style={styles.collectButton}
      >
        <Icon name="collect" size={13} color={SOL_COLORS.primaryDark} style={{ marginRight: 3 }} />
        <Text style={styles.collectButtonText}>Peye</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  infoContainer: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  fullName: {
    fontSize: 16,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  phone: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dailyTarget: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  balance: {
    fontSize: 12,
    color: '#64748B',
  },
  balanceAmount: {
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  collectButton: {
    backgroundColor: SOL_COLORS.primaryLight,
    borderColor: SOL_COLORS.primary,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectButtonIcon: {
    fontSize: 14,
    color: SOL_COLORS.primaryDark,
  },
  collectButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primaryDark,
    marginTop: 2,
  },
});
