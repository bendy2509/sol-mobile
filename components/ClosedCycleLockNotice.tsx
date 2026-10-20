import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { Icon } from './Icon';
import { useAuth } from '@/context/AuthContext';
import { Transaction } from '@/types';
import { CLOSED_CYCLE_REVERSAL_LOCK_MESSAGE } from '@/services/financialService';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { triggerMediumImpact } from '@/lib/haptics';

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
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="shield" size={15} color="#B45309" style={{ marginRight: 8 }} />
        <Text style={styles.text}>{CLOSED_CYCLE_REVERSAL_LOCK_MESSAGE}</Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleRequestAdmin}
        style={styles.requestBtn}
        accessibilityLabel="Demander l'annulation à l'administrateur"
      >
        <Icon name="share" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
        <Text style={styles.requestBtnText}>Demander l'annulation à l'Admin</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 17,
  },
  requestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: 10,
  },
  requestBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
