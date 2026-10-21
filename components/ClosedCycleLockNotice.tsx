import React from 'react';
import { View, Alert, Linking } from 'react-native';
import { Button, Card, Icon, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { Transaction } from '@/types';
import { CLOSED_CYCLE_REVERSAL_LOCK_MESSAGE } from '@/services/financialService';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { triggerMediumImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';

interface ClosedCycleLockNoticeProps {
  transaction: Transaction;
  clientName?: string;
}

/**
 * Locked reversal notice for transactions belonging to a closed cycle.
 * Managers cannot reverse them: they send an official request to the Admin hotline instead.
 */
export const ClosedCycleLockNotice: React.FC<ClosedCycleLockNoticeProps> = ({ transaction, clientName }) => {
  const { activeCollector, getAdminProfile } = useAuth();
  const { colors, spacing } = useTheme();

  const handleRequestAdmin = async () => {
    triggerMediumImpact();
    const profile = await getAdminProfile();
    const phone = profile.phoneNumber || '+50900000000';
    const digitsOnly = phone.replace(/[^0-9]/g, '');

    const message = `DEMANDE OFFICIELLE D'ANNULATION (Cycle clôturé)

Gestionnaire : ${activeCollector?.fullName || 'N/A'} (${activeCollector?.phoneNumber || 'N/A'})
Adhérent : ${clientName || transaction.clientName || 'N/A'}
Opération : #${transaction.id.slice(0, 8)}
Type : ${transaction.type}
Montant : ${formatCurrency(transaction.amount)}
Date : ${formatDate(transaction.createdAtLocal)}

Motif de la demande : `;

    const encoded = encodeURIComponent(message);
    const url = digitsOnly ? `https://wa.me/${digitsOnly}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`).catch(() => {
        Alert.alert('Hotline Admin', `Numéro Hotline Administrateur : ${phone}`);
      });
    });
  };

  return (
    <Card tone="locked" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Icon name="lock" size={18} color={colors.locked} />
        <Text variant="label" tone="locked" style={{ flex: 1 }}>
          {CLOSED_CYCLE_REVERSAL_LOCK_MESSAGE}
        </Text>
      </View>
      <Button
        variant="secondary"
        icon="message"
        fullWidth
        label="Demander l'annulation à l'Admin"
        onPress={handleRequestAdmin}
        accessibilityLabel="Demander l'annulation à l'administrateur"
      />
    </Card>
  );
};
