import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Numpad } from '@/components/Numpad';
import { Header } from '@/components/Header';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { getClientById, getAllClients } from '@/db/clientRepository';
import { createTransaction } from '@/db/transactionRepository';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { Client, Transaction, TransactionType } from '@/types';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function CollectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clientId?: string }>();
  const { activeCollector } = useAuth();
  const { triggerSync } = useSync();

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [amount, setAmount] = useState<string>('250');
  const [txType, setTxType] = useState<TransactionType>('SABOTAY_DEPOSIT');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function init() {
      const list = await getAllClients();
      setAllClients(list);

      if (params.clientId) {
        const found = await getClientById(params.clientId);
        if (found) {
          setSelectedClient(found);
          setAmount(found.dailyAmount > 0 ? found.dailyAmount.toString() : '250');
        }
      } else if (list.length > 0) {
        setSelectedClient(list[0]);
        setAmount(list[0].dailyAmount > 0 ? list[0].dailyAmount.toString() : '250');
      }
    }
    init();
  }, [params.clientId]);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setAmount(client.dailyAmount > 0 ? client.dailyAmount.toString() : '250');
    setIsClientModalOpen(false);
    triggerLightImpact();
  };

  const handleConfirmCollection = async () => {
    if (!selectedClient) {
      Alert.alert('Aucun adhérent', 'Veuillez sélectionner un adhérent.');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Montant invalide', 'Veuillez saisir un montant supérieur à 0 HTG.');
      return;
    }

    setIsProcessing(true);
    try {
      const collectorId = activeCollector?.id || 'c0000000-0000-0000-0000-000000000001';

      const tx = await createTransaction({
        clientId: selectedClient.id,
        collectorId,
        amount: numericAmount,
        type: txType,
        paymentMethod: 'CASH',
      });

      triggerSuccessFeedback();
      setLastTx(tx);
      setIsReceiptOpen(true);

      const updated = await getClientById(selectedClient.id);
      if (updated) setSelectedClient(updated);

      triggerSync();
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || "Échec de l'enregistrement de l'encaissement.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Collecte d'Épargne" subtitle="Encaissement immédiat hors-ligne" />

      <View style={styles.content}>
        {/* Selected Client Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setIsClientModalOpen(true)}
          style={styles.clientSelectorCard}
        >
          <View style={styles.clientSelectorLeft}>
            <View style={styles.avatar}>
              <Icon name="user" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.clientLabel}>ADHÉRENT SÉLECTIONNÉ (CHANGER)</Text>
              <Text style={styles.clientName}>
                {selectedClient ? selectedClient.fullName : 'Choisir un adhérent'}
              </Text>
              <Text style={styles.clientPhone}>
                {selectedClient?.phoneNumber || 'Cliquez pour sélectionner'}
              </Text>
            </View>
          </View>
          <View style={styles.clientSelectorRight}>
            <Badge type={selectedClient?.type || 'SABOTAY'} />
            <Text style={styles.clientBalance}>
              Solde: {formatCurrency(selectedClient?.currentBalance || 0)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Transaction Type Segmented Switch */}
        <View style={styles.txTypeContainer}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              triggerLightImpact();
              setTxType('SABOTAY_DEPOSIT');
            }}
            style={[
              styles.txTypeBtn,
              txType === 'SABOTAY_DEPOSIT' && styles.txTypeBtnActive,
            ]}
          >
            <Text
              style={[
                styles.txTypeText,
                txType === 'SABOTAY_DEPOSIT' && styles.txTypeTextActive,
              ]}
            >
              Sabotay (Dépôt)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              triggerLightImpact();
              setTxType('SOL_CONTRIBUTION');
            }}
            style={[
              styles.txTypeBtn,
              txType === 'SOL_CONTRIBUTION' && styles.txTypeBtnActive,
            ]}
          >
            <Text
              style={[
                styles.txTypeText,
                txType === 'SOL_CONTRIBUTION' && styles.txTypeTextActive,
              ]}
            >
              Sol (Cotisation)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tactile Keypad */}
        <View style={styles.keypadWrapper}>
          <Numpad
            value={amount}
            onChange={setAmount}
            onSubmit={handleConfirmCollection}
            submitLabel={
              isProcessing
                ? 'Enregistrement...'
                : `Encaisser ${formatCurrency(parseFloat(amount) || 0)}`
            }
          />
        </View>
      </View>

      {/* Client Picker Modal */}
      <Modal
        visible={isClientModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsClientModalOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sélectionner un Adhérent</Text>
            <TouchableOpacity
              onPress={() => setIsClientModalOpen(false)}
              style={styles.closeBtn}
            >
              <Icon name="close" size={18} color={SOL_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalList}>
            {allClients.map((c) => (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.7}
                onPress={() => handleSelectClient(c)}
                style={[
                  styles.clientOption,
                  selectedClient?.id === c.id && styles.clientOptionSelected,
                ]}
              >
                <View>
                  <Text style={styles.optionName}>{c.fullName}</Text>
                  <Text style={styles.optionPhone}>{c.phoneNumber}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Badge type={c.type} />
                  <Text style={styles.optionBalance}>
                    {formatCurrency(c.currentBalance)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Instant Digital Receipt Modal */}
      <Modal
        visible={isReceiptOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsReceiptOpen(false)}
      >
        <View style={styles.receiptOverlay}>
          <View style={styles.receiptCard}>
            <View style={styles.receiptHeader}>
              <View style={styles.successIcon}>
                <Icon name="check" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.receiptTitle}>Encaissement Réussi !</Text>
              <Text style={styles.receiptSub}>Enregistré immédiatement en local</Text>
            </View>

            <View style={styles.receiptBody}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Montant Encaissé</Text>
                <Text style={styles.receiptAmount}>
                  {formatCurrency(lastTx?.amount || 0)}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Adhérent</Text>
                <Text style={styles.receiptValue}>{selectedClient?.fullName}</Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Nouveau Solde</Text>
                <Text style={styles.receiptValue}>
                  {formatCurrency(selectedClient?.currentBalance || 0)}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Date & Heure</Text>
                <Text style={styles.receiptValue}>
                  {formatDate(lastTx?.createdAtLocal || new Date().toISOString())}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Statut Réseau</Text>
                <Badge syncStatus={lastTx?.syncStatus || 'PENDING'} />
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setIsReceiptOpen(false);
                setAmount('250');
              }}
              style={styles.receiptBtn}
            >
              <Text style={styles.receiptBtnText}>Terminé / Nouvel Encaissement</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  clientSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  clientSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
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
  clientLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  clientPhone: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    marginTop: 1,
  },
  clientSelectorRight: {
    alignItems: 'flex-end',
  },
  clientBalance: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primary,
    marginTop: 4,
  },
  txTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginVertical: 10,
  },
  txTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  txTypeBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  txTypeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  txTypeTextActive: {
    color: SOL_COLORS.primaryDark,
    fontWeight: '800',
  },
  keypadWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  modalList: {
    padding: 16,
  },
  clientOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  clientOptionSelected: {
    borderColor: SOL_COLORS.primary,
    backgroundColor: '#F0FDF4',
  },
  optionName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  optionPhone: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
  },
  optionBalance: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.primary,
    marginTop: 4,
  },
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  receiptSub: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
  },
  receiptBody: {
    width: '100%',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    marginBottom: 20,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  receiptLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  receiptAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  receiptValue: {
    fontSize: 14,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  receiptBtn: {
    width: '100%',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  receiptBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
