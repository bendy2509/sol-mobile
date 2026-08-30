import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { BusinessConfig, PaymentFrequency } from '@/types';
import { Icon } from '@/components/Icon';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { formatCurrency } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';

export interface RenewCycleFormData {
  mode: 'RENEW_SAME_MEMBERS' | 'START_FRESH';
  name: string;
  contributionAmount: number;
  frequency: PaymentFrequency;
  totalSlots: number;
}

interface RenewCycleModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: RenewCycleFormData) => void;
  currentBusiness: BusinessConfig | null;
  membersCount: number;
  totalHands: number;
}

export const RenewCycleModal: React.FC<RenewCycleModalProps> = ({
  visible,
  onClose,
  onConfirm,
  currentBusiness,
  membersCount,
  totalHands,
}) => {
  const [mode, setMode] = useState<'RENEW_SAME_MEMBERS' | 'START_FRESH'>('RENEW_SAME_MEMBERS');
  const [name, setName] = useState('');
  const [unitAmount, setUnitAmount] = useState('250');
  const [frequency, setFrequency] = useState<PaymentFrequency>('DAILY');
  const [slots, setSlots] = useState('10');

  useEffect(() => {
    if (visible && currentBusiness) {
      setMode('RENEW_SAME_MEMBERS');
      setName(`${currentBusiness.name || 'Sol'} - Nouveau Cycle`);
      setUnitAmount(String(currentBusiness.contributionAmount || 250));
      setFrequency(currentBusiness.frequency || 'DAILY');
      setSlots(String(currentBusiness.totalSlots || 10));
    }
  }, [visible, currentBusiness]);

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Nom requis', 'Veuillez saisir un nom pour le nouveau cycle Sol.');
      return;
    }
    const parsedAmount = parseInt(unitAmount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Montant invalide', 'Veuillez saisir un montant unitaire par main valide (ex: 250, 500 HTG).');
      return;
    }
    const parsedSlots = parseInt(slots, 10);
    if (mode === 'START_FRESH' && (isNaN(parsedSlots) || parsedSlots <= 0)) {
      Alert.alert('Effectif requis', "Veuillez préciser le nombre d'enfants/mains prévus pour ce nouveau carnet.");
      return;
    }

    triggerMediumImpact();
    onConfirm({
      mode,
      name: name.trim(),
      contributionAmount: parsedAmount,
      frequency,
      totalSlots: mode === 'RENEW_SAME_MEMBERS' ? totalHands || membersCount || parsedSlots : parsedSlots,
    });
  };

  const frequencies: { key: PaymentFrequency; label: string }[] = [
    { key: 'DAILY', label: 'Quotidien (1j)' },
    { key: '8_DAYS', label: '8 Jours' },
    { key: '15_DAYS', label: '15 Jours' },
    { key: 'MONTHLY', label: 'Mensuel' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Row */}
          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderTitleBox}>
              <View style={styles.iconCircleHeader}>
                <Icon name="sync" size={18} color="#059669" />
              </View>
              <Text style={styles.modalTitle}>Clôturer & Renouveler le Sol</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Fermer"
              style={styles.closeBtn}
            >
              <Icon name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBodyScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalSubtitle}>
              Le cycle en cours est terminé ou vous souhaitez démarrer un nouveau cycle. Choisissez votre méthode de renouvellement :
            </Text>

            {/* 1. Mode Selection Cards */}
            <Text style={styles.sectionLabel}>CHOIX DU MODE DE RENOUVELLEMENT *</Text>
            <View style={styles.modeCardsContainer}>
              {/* Mode A: Keep Members */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  triggerLightImpact();
                  setMode('RENEW_SAME_MEMBERS');
                }}
                style={[
                  styles.modeCard,
                  mode === 'RENEW_SAME_MEMBERS' && styles.modeCardActive,
                ]}
              >
                <View style={styles.modeCardHeader}>
                  <View
                    style={[
                      styles.modeIconBox,
                      mode === 'RENEW_SAME_MEMBERS'
                        ? { backgroundColor: '#ECFDF5' }
                        : { backgroundColor: '#F1F5F9' },
                    ]}
                  >
                    <Icon
                      name="users"
                      size={18}
                      color={mode === 'RENEW_SAME_MEMBERS' ? '#059669' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={[
                        styles.modeTitle,
                        mode === 'RENEW_SAME_MEMBERS' && { color: '#065F46' },
                      ]}
                    >
                      Garder les mêmes adhérents
                    </Text>
                    <Text style={styles.modeBadge}>
                      {membersCount} enfants inscrits • {totalHands} mains
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      mode === 'RENEW_SAME_MEMBERS' && styles.radioCircleActive,
                    ]}
                  >
                    {mode === 'RENEW_SAME_MEMBERS' && <View style={styles.radioDot} />}
                  </View>
                </View>
                <Text style={styles.modeDesc}>
                  Conserve tous les adhérents et leurs parts. Réinitialise les soldes, cotisations et mains perçues à 0 pour démarrer le nouveau cycle immédiatement.
                </Text>
              </TouchableOpacity>

              {/* Mode B: Start Fresh */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  triggerLightImpact();
                  setMode('START_FRESH');
                }}
                style={[
                  styles.modeCard,
                  mode === 'START_FRESH' && styles.modeCardActive,
                ]}
              >
                <View style={styles.modeCardHeader}>
                  <View
                    style={[
                      styles.modeIconBox,
                      mode === 'START_FRESH'
                        ? { backgroundColor: '#EFF6FF' }
                        : { backgroundColor: '#F1F5F9' },
                    ]}
                  >
                    <Icon
                      name="plus"
                      size={18}
                      color={mode === 'START_FRESH' ? '#2563EB' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={[
                        styles.modeTitle,
                        mode === 'START_FRESH' && { color: '#1E40AF' },
                      ]}
                    >
                      Recommencer à zéro (Sol vierge)
                    </Text>
                    <Text style={styles.modeBadgeFresh}>Nouveau carnet vierge</Text>
                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      mode === 'START_FRESH' && styles.radioCircleActive,
                    ]}
                  >
                    {mode === 'START_FRESH' && <View style={styles.radioDot} />}
                  </View>
                </View>
                <Text style={styles.modeDesc}>
                  Efface la liste actuelle des adhérents de ce carnet pour vous permettre d'enregistrer de nouveaux enfants à partir de zéro.
                </Text>
              </TouchableOpacity>
            </View>

            {/* 2. Parameters of New Cycle */}
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>PARAMÈTRES DU NOUVEAU CYCLE</Text>

            {/* Business Name Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOM DU SOL / CARNET *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Sol Marché Cluny 2026 - Cycle 2"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Unit Amount Input */}
            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>VALEUR D'UNE MAIN (HTG) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="250"
                  placeholderTextColor="#94A3B8"
                  value={unitAmount}
                  onChangeText={setUnitAmount}
                />
              </View>

              {mode === 'START_FRESH' && (
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.inputLabel}>NOMBRE DE SLOTS *</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    placeholder="10"
                    placeholderTextColor="#94A3B8"
                    value={slots}
                    onChangeText={setSlots}
                  />
                </View>
              )}
            </View>

            {/* Frequency Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FRÉQUENCE DE COTISATION *</Text>
              <View style={styles.frequencyRow}>
                {frequencies.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => {
                      triggerLightImpact();
                      setFrequency(f.key);
                    }}
                    style={[
                      styles.frequencyChip,
                      frequency === f.key && styles.frequencyChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.frequencyChipText,
                        frequency === f.key && styles.frequencyChipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Summary Information Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Icon name="crown" size={14} color="#B45309" style={{ marginRight: 6 }} />
                <Text style={styles.summaryTitle}>RÉSUMÉ DU NOUVEAU CYCLE</Text>
              </View>
              <Text style={styles.summaryText}>
                {mode === 'RENEW_SAME_MEMBERS'
                  ? `• Cagnotte par tirage : ${formatCurrency((parseInt(unitAmount, 10) || 0) * (totalHands || membersCount))}\n• Adhérents reconduits : ${membersCount} enfants (${totalHands} mains)\n• Toutes les cotisations repartent à zéro dès aujourd'hui.`
                  : `• Carnet vierge prêt pour inscription\n• Valeur unitaire : ${formatCurrency(parseInt(unitAmount, 10) || 0)} / main\n• Objectif initial : ${slots} mains`}
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalBtnRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onClose}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSubmit}
              style={styles.confirmBtn}
            >
              <Icon name="check" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.confirmBtnText}>Continuer avec PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    width: '100%',
    maxHeight: '92%',
    padding: 20,
    ...SHADOWS.md,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconCircleHeader: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  modalBodyScroll: {
    maxHeight: 460,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  modeCardsContainer: {
    gap: 10,
    marginBottom: 10,
  },
  modeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  modeCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  modeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  modeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 1,
  },
  modeBadgeFresh: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 1,
  },
  modeDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 4,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#10B981',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  frequencyChip: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  frequencyChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  frequencyChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  frequencyChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 6,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.3,
  },
  summaryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78350F',
    lineHeight: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 1.6,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
