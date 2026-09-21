import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig, renewSolCycle } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { BusinessConfig, Member, PaymentFrequency } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerErrorFeedback, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { useResponsive } from '@/hooks/useResponsive';

type CycleMode = 'RENEW_SAME_MEMBERS' | 'START_FRESH' | null;

export default function CycleManagementScreen() {
  const router = useRouter();
  const { activeCollector, userRole } = useAuth();
  const { contentMaxWidth, horizontalPadding, width, isSmallScreen } = useResponsive();

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMode, setSelectedMode] = useState<CycleMode>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Editable new cycle params
  const [newCycleName, setNewCycleName] = useState('');
  const [newContribution, setNewContribution] = useState('');
  const [newFrequency, setNewFrequency] = useState<PaymentFrequency>('DAILY');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [biz, mems] = await Promise.all([
          getActiveBusinessConfig(),
          getMembersWithPaymentStatus(),
        ]);
        setBusiness(biz);
        setMembers(mems);
        if (biz) {
          setNewCycleName(biz.name);
          setNewContribution(String(biz.contributionAmount));
          setNewFrequency(biz.frequency);
        }
      } catch (err) {
        console.warn('Failed to load cycle data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const isManager = userRole === 'MANAGER' || userRole === 'ADMIN';

  const handleSelectMode = (mode: CycleMode) => {
    if (!isManager) {
      Alert.alert(
        'Accès Restreint',
        'Seul le responsable SOL peut effectuer une clôture de cycle.'
      );
      return;
    }
    triggerMediumImpact();
    setSelectedMode(mode);
  };

  const handleOpenConfirm = () => {
    if (!selectedMode) {
      Alert.alert('Sélection requise', 'Veuillez choisir une option de réouverture avant de continuer.');
      return;
    }
    const contribution = parseFloat(newContribution);
    if (isNaN(contribution) || contribution <= 0) {
      Alert.alert('Montant invalide', 'La valeur d\'une main doit être un nombre positif.');
      return;
    }
    if (!newCycleName.trim()) {
      Alert.alert('Nom requis', 'Veuillez saisir un nom pour le nouveau cycle.');
      return;
    }
    triggerMediumImpact();
    setIsConfirmModalOpen(true);
  };

  const handlePinSuccess = async () => {
    setIsPinModalOpen(false);
    setIsConfirmModalOpen(false);
    setIsProcessing(true);

    try {
      if (!business) {
        throw new Error('Aucun carnet actif trouvé.');
      }

      const contribution = parseFloat(newContribution) || business.contributionAmount;

      await renewSolCycle({
        businessId: business.id,
        collectorId: activeCollector?.id,
        mode: selectedMode as 'RENEW_SAME_MEMBERS' | 'START_FRESH',
        userId: activeCollector?.id || 'c011ec70-0000-0000-0000-000000000001',
        userRole: (userRole as 'MANAGER') || 'MANAGER',
        name: newCycleName.trim(),
        contributionAmount: contribution,
        frequency: newFrequency,
        totalSlots: business.totalSlots,
        reason:
          selectedMode === 'RENEW_SAME_MEMBERS'
            ? `Renouvellement du cycle "${newCycleName}" — Adhérents conservés, comptes remis à zéro`
            : `Nouveau cycle "${newCycleName}" — Démarrage à zéro (liste vidée)`,
      });

      triggerSuccessFeedback();

      const modeLabel =
        selectedMode === 'RENEW_SAME_MEMBERS'
          ? `${members.length} adhérent(s) ont été conservés avec leurs comptes remis à zéro.`
          : 'La liste des adhérents a été vidée. Vous pouvez maintenant inscrire de nouveaux membres.';

      Alert.alert(
        '🎉 Nouveau Cycle Démarré !',
        `Le cycle "${newCycleName}" est maintenant actif.\n\n${modeLabel}`,
        [
          {
            text: 'Voir le Tableau de Bord',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || 'Impossible de renouveler le cycle. Veuillez réessayer.');
    } finally {
      setIsProcessing(false);
    }
  };

  const frequencyOptions: { label: string; value: PaymentFrequency }[] = [
    { label: 'Quotidien', value: 'DAILY' },
    { label: 'Mercredi & Samedi', value: 'WED_SAT' },
    { label: '8 Jours', value: '8J' },
    { label: '15 Jours', value: '15J' },
    { label: 'Mensuel', value: 'MONTHLY' },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Gestion du Cycle"
          subtitle="Clôture & Réouverture"
          showBack={true}
          showProfile={false}
          showScanner={false}
          fallbackBackRoute="/(tabs)/sol"
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SOL_COLORS.primary} />
          <Text style={styles.loadingText}>Chargement du carnet actif...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Gestion du Cycle"
          subtitle="Clôture & Réouverture"
          showBack={true}
          showProfile={false}
          showScanner={false}
          fallbackBackRoute="/(tabs)/sol"
        />
        <View style={styles.loadingContainer}>
          <Icon name="alert" size={40} color={SOL_COLORS.danger} />
          <Text style={styles.noBusinessTitle}>Aucun carnet actif</Text>
          <Text style={styles.noBusinessSub}>
            Vous devez d'abord créer un SOL ou Sabotay pour accéder à cette fonctionnalité.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Gestion du Cycle"
        subtitle="Clôture & Réouverture"
        showBack={true}
        showProfile={false}
        showScanner={false}
        fallbackBackRoute="/(tabs)/sol"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%', paddingHorizontal: horizontalPadding },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Current Cycle Summary */}
        <View style={styles.currentCycleCard}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardIconBox, { backgroundColor: SOL_COLORS.primaryLighter }]}>
              <Icon name="sol" size={16} color={SOL_COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>CYCLE ACTUEL</Text>
          </View>

          <Text style={styles.cycleName}>{business.name}</Text>

          <View style={styles.cycleStatsRow}>
            <View style={styles.cycleStat}>
              <Text style={styles.cycleStatValue}>{members.length}</Text>
              <Text style={styles.cycleStatLabel}>Adhérents</Text>
            </View>
            <View style={styles.cycleStatDivider} />
            <View style={styles.cycleStat}>
              <Text style={styles.cycleStatValue}>{formatCurrency(business.contributionAmount)}</Text>
              <Text style={styles.cycleStatLabel}>/ Main</Text>
            </View>
            <View style={styles.cycleStatDivider} />
            <View style={styles.cycleStat}>
              <Text style={styles.cycleStatValue}>{formatDateShort(business.endDate)}</Text>
              <Text style={styles.cycleStatLabel}>Fin prévue</Text>
            </View>
          </View>
        </View>

        {/* Warning Banner */}
        <View style={styles.warningBanner}>
          <Icon name="alert" size={16} color="#92400E" style={{ marginTop: 1, marginRight: 10 }} />
          <Text style={styles.warningText}>
            <Text style={{ fontWeight: '900' }}>Action irréversible.</Text> La clôture archivera définitivement ce cycle. L'historique des transactions sera conservé à des fins d'audit.
          </Text>
        </View>

        {/* Mode Selection */}
        <Text style={styles.sectionLabel}>CHOISISSEZ L'OPTION DE RÉOUVERTURE</Text>

        {/* Option 1: Keep Members */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleSelectMode('RENEW_SAME_MEMBERS')}
          style={[
            styles.modeCard,
            selectedMode === 'RENEW_SAME_MEMBERS' && styles.modeCardSelected,
          ]}
        >
          <View style={styles.modeCardHeader}>
            <View
              style={[
                styles.modeIconBox,
                selectedMode === 'RENEW_SAME_MEMBERS'
                  ? { backgroundColor: SOL_COLORS.primaryLighter }
                  : { backgroundColor: '#F1F5F9' },
              ]}
            >
              <Icon
                name="users"
                size={20}
                color={
                  selectedMode === 'RENEW_SAME_MEMBERS' ? SOL_COLORS.primary : SOL_COLORS.textSecondary
                }
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={[
                  styles.modeTitle,
                  selectedMode === 'RENEW_SAME_MEMBERS' && { color: SOL_COLORS.primary },
                ]}
              >
                Conserver les Adhérents
              </Text>
              <Text style={styles.modeSubtitle}>
                Les {members.length} membres sont copiés dans le nouveau cycle avec leurs comptes remis à zéro.
              </Text>
            </View>
            <View
              style={[
                styles.radioCircle,
                selectedMode === 'RENEW_SAME_MEMBERS' && styles.radioCircleSelected,
              ]}
            >
              {selectedMode === 'RENEW_SAME_MEMBERS' && <View style={styles.radioInner} />}
            </View>
          </View>

          {selectedMode === 'RENEW_SAME_MEMBERS' && (
            <View style={styles.modeDetailBox}>
              <View style={styles.modeDetailRow}>
                <Icon name="check" size={12} color={SOL_COLORS.success} style={{ marginRight: 6 }} />
                <Text style={styles.modeDetailText}>
                  Nom, téléphone et nombre de mains conservés
                </Text>
              </View>
              <View style={styles.modeDetailRow}>
                <Icon name="check" size={12} color={SOL_COLORS.success} style={{ marginRight: 6 }} />
                <Text style={styles.modeDetailText}>Soldes, cotisations et mains remises = 0</Text>
              </View>
              <View style={styles.modeDetailRow}>
                <Icon name="check" size={12} color={SOL_COLORS.success} style={{ marginRight: 6 }} />
                <Text style={styles.modeDetailText}>
                  Rangs de décaissement conservés (modifiables après)
                </Text>
              </View>
              <View style={styles.modeDetailRow}>
                <Icon name="alert" size={12} color={SOL_COLORS.accent} style={{ marginRight: 6 }} />
                <Text style={[styles.modeDetailText, { color: '#92400E' }]}>
                  Vous pourrez ensuite supprimer les adhérents qui ne participent plus
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Option 2: Start Fresh */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleSelectMode('START_FRESH')}
          style={[
            styles.modeCard,
            selectedMode === 'START_FRESH' && styles.modeCardSelectedDanger,
          ]}
        >
          <View style={styles.modeCardHeader}>
            <View
              style={[
                styles.modeIconBox,
                selectedMode === 'START_FRESH'
                  ? { backgroundColor: SOL_COLORS.dangerLight }
                  : { backgroundColor: '#F1F5F9' },
              ]}
            >
              <Icon
                name="users"
                size={20}
                color={selectedMode === 'START_FRESH' ? SOL_COLORS.danger : SOL_COLORS.textSecondary}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={[
                  styles.modeTitle,
                  selectedMode === 'START_FRESH' && { color: SOL_COLORS.dangerDark },
                ]}
              >
                Démarrer à Zéro
              </Text>
              <Text style={styles.modeSubtitle}>
                La liste des adhérents est complètement vidée. Nouveau départ total.
              </Text>
            </View>
            <View
              style={[
                styles.radioCircle,
                selectedMode === 'START_FRESH' && styles.radioCircleSelectedDanger,
              ]}
            >
              {selectedMode === 'START_FRESH' && <View style={styles.radioInnerDanger} />}
            </View>
          </View>

          {selectedMode === 'START_FRESH' && (
            <View style={[styles.modeDetailBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
              <View style={styles.modeDetailRow}>
                <Icon name="alert" size={12} color={SOL_COLORS.danger} style={{ marginRight: 6 }} />
                <Text style={[styles.modeDetailText, { color: SOL_COLORS.dangerDark }]}>
                  Tous les {members.length} adhérents seront supprimés du nouveau cycle
                </Text>
              </View>
              <View style={styles.modeDetailRow}>
                <Icon name="check" size={12} color={SOL_COLORS.success} style={{ marginRight: 6 }} />
                <Text style={styles.modeDetailText}>
                  L'historique des transactions reste intact (à des fins d'audit)
                </Text>
              </View>
              <View style={styles.modeDetailRow}>
                <Icon name="check" size={12} color={SOL_COLORS.success} style={{ marginRight: 6 }} />
                <Text style={styles.modeDetailText}>
                  La liste sera vide, prête pour de nouveaux inscrits
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* New Cycle Settings (only when a mode is selected) */}
        {selectedMode && (
          <View style={styles.newCycleSettingsCard}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Icon name="calendar" size={14} color={SOL_COLORS.info} />
              </View>
              <Text style={styles.cardTitle}>PARAMÈTRES DU NOUVEAU CYCLE</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOM DU SOL / CARNET</Text>
              <TextInput
                style={styles.textInput}
                value={newCycleName}
                onChangeText={setNewCycleName}
                placeholder={`Ex: ${business.name} — Cycle 2`}
                placeholderTextColor={SOL_COLORS.textMuted}
                maxLength={60}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>VALEUR D'UNE MAIN (HTG)</Text>
              <TextInput
                style={styles.textInput}
                value={newContribution}
                onChangeText={setNewContribution}
                keyboardType="numeric"
                placeholder="Ex: 250"
                placeholderTextColor={SOL_COLORS.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FRÉQUENCE DE COTISATION</Text>
              <View style={styles.frequencyRow}>
                {frequencyOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    activeOpacity={0.7}
                    onPress={() => setNewFrequency(opt.value)}
                    style={[
                      styles.freqBtn,
                      newFrequency === opt.value && styles.freqBtnSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.freqBtnText,
                        newFrequency === opt.value && styles.freqBtnTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Launch Button */}
        {selectedMode && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenConfirm}
            disabled={isProcessing}
            style={[
              styles.launchBtn,
              selectedMode === 'START_FRESH' && styles.launchBtnDanger,
            ]}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Icon name="shield" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.launchBtnText}>
                  {selectedMode === 'RENEW_SAME_MEMBERS'
                    ? 'Rouvrir avec les mêmes membres (PIN requis)'
                    : 'Démarrer à Zéro (PIN requis)'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={isConfirmModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: Math.min(440, width - 32) }]}>
            <View style={[
                styles.modalIconCircle,
                selectedMode === 'START_FRESH'
                  ? { backgroundColor: SOL_COLORS.dangerLight }
                  : { backgroundColor: SOL_COLORS.accentLight },
              ]}
            >
              <Icon
                name="alert"
                size={26}
                color={selectedMode === 'START_FRESH' ? SOL_COLORS.danger : SOL_COLORS.accent}
              />
            </View>

            <Text style={styles.modalTitle}>Confirmer la Clôture ?</Text>
            <Text style={styles.modalSub}>
              {selectedMode === 'RENEW_SAME_MEMBERS'
                ? `Le cycle "${business.name}" va être archivé et ${members.length} adhérent(s) seront copiés dans le nouveau cycle "${newCycleName}" avec leurs soldes à zéro.`
                : `Le cycle "${business.name}" va être archivé et TOUS les ${members.length} adhérent(s) seront supprimés. La liste sera vide.`}
            </Text>
            <Text style={styles.modalWarning}>Cette action est irréversible.</Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsConfirmModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsConfirmModalOpen(false);
                  setIsPinModalOpen(true);
                }}
                style={[
                  styles.modalConfirmBtn,
                  selectedMode === 'START_FRESH' && { backgroundColor: SOL_COLORS.danger },
                ]}
              >
                <Text style={styles.modalConfirmBtnText}>Continuer (PIN)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PIN Validation Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation de la Clôture"
        subtitle={`Saisissez votre code PIN gestionnaire pour confirmer la clôture du cycle "${business?.name}" et l'ouverture du nouveau cycle "${newCycleName}".`}
        onSuccess={handlePinSuccess}
        onCancel={() => setIsPinModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
  },
  noBusinessTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    marginTop: 12,
    textAlign: 'center',
  },
  noBusinessSub: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // Current Cycle Card
  currentCycleCard: {
    backgroundColor: SOL_COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.borderStrong,
    marginBottom: 14,
    ...SHADOWS.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.5,
    flex: 1,
  },
  cycleName: {
    fontSize: 20,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    marginBottom: 12,
  },
  cycleStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cycleStat: {
    flex: 1,
    alignItems: 'center',
  },
  cycleStatValue: {
    fontSize: 14,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  cycleStatLabel: {
    fontSize: 10,
    color: SOL_COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  cycleStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: SOL_COLORS.border,
  },

  // Warning
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 18,
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Mode Cards
  modeCard: {
    backgroundColor: SOL_COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.border,
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  modeCardSelected: {
    borderColor: SOL_COLORS.primary,
    backgroundColor: SOL_COLORS.primaryLighter,
  },
  modeCardSelectedDanger: {
    borderColor: SOL_COLORS.danger,
    backgroundColor: '#FFF1F2',
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    marginBottom: 3,
  },
  modeSubtitle: {
    fontSize: 11,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    lineHeight: 15,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  radioCircleSelected: {
    borderColor: SOL_COLORS.primary,
  },
  radioCircleSelectedDanger: {
    borderColor: SOL_COLORS.danger,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: SOL_COLORS.primary,
  },
  radioInnerDanger: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: SOL_COLORS.danger,
  },
  modeDetailBox: {
    backgroundColor: SOL_COLORS.primaryLighter,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.primaryLight,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  modeDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  modeDetailText: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },

  // New Cycle Settings Card
  newCycleSettingsCard: {
    backgroundColor: SOL_COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.borderStrong,
    marginBottom: 16,
    ...SHADOWS.sm,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.borderStrong,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqBtn: {
    minWidth: '47%',
    flexGrow: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: SOL_COLORS.border,
    paddingHorizontal: 8,
  },
  freqBtnSelected: {
    backgroundColor: SOL_COLORS.primaryLighter,
    borderColor: SOL_COLORS.primary,
  },
  freqBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  freqBtnTextSelected: {
    color: SOL_COLORS.primaryDark,
  },

  // Launch Button
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 54,
    borderRadius: 16,
    marginBottom: 20,
    ...SHADOWS.md,
  },
  launchBtnDanger: {
    backgroundColor: SOL_COLORS.danger,
  },
  launchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  // Confirmation Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  modalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: SOL_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '600',
  },
  modalWarning: {
    fontSize: 12,
    fontWeight: '900',
    color: SOL_COLORS.danger,
    marginTop: 10,
    marginBottom: 18,
    textAlign: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    backgroundColor: SOL_COLORS.surfaceSubtle,
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  modalConfirmBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    backgroundColor: SOL_COLORS.accent,
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
