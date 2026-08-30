import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { createClient } from '@/db/clientRepository';
import { getActiveBusinessConfig, saveBusinessConfig } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { createTransaction } from '@/db/transactionRepository';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/context/SyncContext';
import { BusinessConfig } from '@/types';
import { calculateCycleEndDate, getFrequencyLabel } from '@/lib/dateCalculations';
import { formatCurrency, getInitials } from '@/lib/formatters';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

export default function NewClientScreen() {
  const router = useRouter();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [existingMembersCount, setExistingMembersCount] = useState<number>(0);
  const [existingTotalCycleHands, setExistingTotalCycleHands] = useState<number>(0);
  const [handsCount, setHandsCount] = useState<number>(1);
  const [assignedRank, setAssignedRank] = useState<number>(1);
  const [multiRanks, setMultiRanks] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [collectFirstHand, setCollectFirstHand] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [activeInput, setActiveInput] = useState<'NAME' | 'PHONE' | 'RANKS' | null>(null);

  const unitAmount = business?.contributionAmount || 250;
  const totalCycleHands = existingTotalCycleHands + handsCount;
  const totalPotAmount = totalCycleHands * unitAmount;
  const memberTotalDue = handsCount * totalPotAmount;

  const generateRanksString = (startRank: number, count: number): string => {
    const ranks = [];
    for (let i = 0; i < count; i++) {
      ranks.push(startRank + i);
    }
    return ranks.join(', ');
  };

  useEffect(() => {
    async function loadContext() {
      const [activeBiz, members] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus(),
      ]);
      setBusiness(activeBiz);
      setExistingMembersCount(members.length);
      const totalHands = members.reduce((sum, m) => sum + (m.handsCount || 1), 0);
      setExistingTotalCycleHands(totalHands);
      const startRank = totalHands + 1;
      setAssignedRank(startRank);
      setMultiRanks(generateRanksString(startRank, 1));
    }
    loadContext();
  }, []);

  const handleHandsCountChange = (count: number) => {
    const valid = Math.max(1, count);
    setHandsCount(valid);
    setMultiRanks(generateRanksString(assignedRank, valid));
  };

  const handleAssignedRankChange = (rank: number) => {
    const valid = Math.max(1, rank);
    setAssignedRank(valid);
    setMultiRanks(generateRanksString(valid, handsCount));
  };

  const formatDisplayPhone = (raw: string): string => {
    const cleaned = raw.replace(/\D/g, '').slice(0, 8);
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)} ${cleaned.slice(2)}`;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4)}`;
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)}`;
  };

  const handlePhoneChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '').slice(0, 8);
    setPhoneDigits(digitsOnly);
  };

  const handleValidateForm = () => {
    if (isReadOnly) {
      triggerErrorFeedback();
      Alert.alert('Accès Lecture Seule', "L'inscription d'adhérents est réservée aux gestionnaires.");
      return;
    }

    if (!fullName.trim()) {
      triggerErrorFeedback();
      Alert.alert('Nom requis', "Veuillez saisir le nom complet de l'adhérent.");
      return;
    }

    if (phoneDigits.length < 8) {
      triggerErrorFeedback();
      Alert.alert('Téléphone incomplet', 'Veuillez saisir un numéro de téléphone à 8 chiffres (ex: 37123456).');
      return;
    }

    triggerMediumImpact();
    setIsPinModalOpen(true);
  };

  const executeSaveClient = async () => {
    setIsPinModalOpen(false);
    setIsSubmitting(true);
    try {
      const collectorId = activeCollector?.id || 'c011ec70-0000-0000-0000-000000000001';
      const fullPhone = normalizePhoneNumber(`+509${phoneDigits}`);
      
      const parsedRanks = multiRanks.trim()
        ? multiRanks.split(/[,;\s]+/).map((r) => r.trim()).filter(Boolean)
        : [];
      const effectiveHandsCount = Math.max(
        1,
        Number(handsCount) || 1,
        parsedRanks.length > 1 ? parsedRanks.length : 1
      );
      const computedRanks = parsedRanks.length > 0
        ? parsedRanks.join(', ')
        : generateRanksString(assignedRank, effectiveHandsCount);

      // 1. Create client locally with guaranteed hands count
      const client = await createClient({
        fullName: fullName.trim(),
        phoneNumber: fullPhone,
        type: business?.type === 'SOL' ? 'SOL' : 'SABOTAY',
        dailyAmount: unitAmount,
        handsCount: effectiveHandsCount,
        payoutRank: assignedRank,
        payoutRanks: computedRanks,
        initialDeposit: 0,
        collectorId,
        businessId: business?.id,
      });

      // 2. If first hand collection was checked, immediately record first contribution
      if (collectFirstHand) {
        await createTransaction({
          clientId: client.id,
          collectorId,
          amount: unitAmount * effectiveHandsCount,
          handsCovered: effectiveHandsCount,
          type: 'SOL_CONTRIBUTION',
          paymentMethod: 'CASH',
          note: `Première cotisation à l'inscription (${effectiveHandsCount} main(s) - Rangs: #${computedRanks})`,
        });
      }

      triggerSuccessFeedback();
      triggerSync().catch(() => {});

      Alert.alert(
        'Adhérent Enregistré avec Succès !',
        `${fullName.trim()} a été ajouté(e) au carnet avec ${effectiveHandsCount} main${effectiveHandsCount > 1 ? 's' : ''} (Rangs : #${computedRanks}) (${formatCurrency(unitAmount)} / main).${collectFirstHand ? `\n\n1ère cotisation encaissée avec succès (${formatCurrency(unitAmount * effectiveHandsCount)}).` : ''}`,
        [
          {
            text: 'Voir le Tableau de Bord',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', err?.message || "Échec de l'enregistrement de l'adhérent.");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header with Back Navigation */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="arrow-left" size={18} color={SOL_COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerMainTitle}>Nouvel Adhérent</Text>
          <Text style={styles.headerSubTitle}>
            {business?.name || 'Carnet Actif'} • {formatCurrency(unitAmount)} / main
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Live Preview Card */}
          <View style={styles.previewHeroCard}>
            <View style={styles.previewTopRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {fullName.trim() ? getInitials(fullName) : 'SOL'}
                </Text>
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {fullName.trim() || "Nom de l'Adhérent"}
                </Text>
                <Text style={styles.previewPhone}>
                  {phoneDigits ? `+509 ${formatDisplayPhone(phoneDigits)}` : '+509 XX XX XX XX'}
                </Text>
              </View>
              <View style={styles.rankBadge}>
                <Icon name="crown" size={12} color={SOL_COLORS.info} style={{ marginRight: 3 }} />
                <Text style={styles.rankBadgeText}>
                  {handsCount > 1 ? `#${multiRanks}` : `Main #${assignedRank}`}
                </Text>
              </View>
            </View>

            {/* Financial Grid Info */}
            <View style={styles.financialStatsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>VALEUR D'UNE MAIN</Text>
                <Text style={styles.statValueGreen}>{formatCurrency(unitAmount)}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>TOTAL DU CYCLE</Text>
                <Text style={styles.statValuePrimary}>
                  {totalCycleHands} {totalCycleHands > 1 ? 'mains' : 'main'} ({existingTotalCycleHands} + {handsCount})
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>CAGNOTTE / MAIN</Text>
                <Text style={styles.statValueGreen}>{formatCurrency(totalPotAmount)}</Text>
              </View>
            </View>

            {handsCount > 1 && (
              <View style={styles.multiHandsPreviewPill}>
                <Icon name="crown" size={13} color="#D97706" style={{ marginRight: 6 }} />
                <Text style={styles.multiHandsPreviewPillText}>
                  {handsCount} mains (Rangs : #{multiRanks}) • Total dû : {formatCurrency(memberTotalDue)} • Droit à {handsCount} tirages de {formatCurrency(totalPotAmount)}
                </Text>
              </View>
            )}
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.formSectionTitle}>INFORMATIONS PERSONNELLES</Text>

            {/* Full Name Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOM COMPLET *</Text>
              <View style={[styles.inputWrapper, activeInput === 'NAME' && styles.inputWrapperActive]}>
                <Icon name="user" size={16} color={activeInput === 'NAME' ? SOL_COLORS.primary : SOL_COLORS.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: Marie Carmel Saint-Fleur"
                  placeholderTextColor={SOL_COLORS.textMuted}
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setActiveInput('NAME')}
                  onBlur={() => setActiveInput(null)}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                {fullName.length > 0 && (
                  <TouchableOpacity onPress={() => setFullName('')}>
                    <Icon name="close" size={14} color={SOL_COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Haitian Phone Number Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NUMÉRO DE TÉLÉPHONE *</Text>
              <View style={[styles.inputWrapper, activeInput === 'PHONE' && styles.inputWrapperActive]}>
                <View style={styles.phoneCountryPill}>
                  <Text style={styles.countryPillFlagText}>HT</Text>
                  <Text style={styles.countryCode}>+509</Text>
                </View>
                <TextInput
                  style={styles.textInputPhone}
                  placeholder="37 12 34 56"
                  placeholderTextColor={SOL_COLORS.textMuted}
                  value={formatDisplayPhone(phoneDigits)}
                  onChangeText={handlePhoneChange}
                  onFocus={() => setActiveInput('PHONE')}
                  onBlur={() => setActiveInput(null)}
                  keyboardType="phone-pad"
                  maxLength={11}
                />
                {phoneDigits.length > 0 && (
                  <TouchableOpacity onPress={() => setPhoneDigits('')}>
                    <Icon name="close" size={14} color={SOL_COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Number of Subscribed Hands (Multi-Mains) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelWithBadgeRow}>
                <Text style={styles.inputLabel}>NOMBRE DE MAINS SOUSCRITES *</Text>
                <Text style={styles.rankSubHint}>Compte pour autant d'enfants en plus</Text>
              </View>

              {/* Quick Preset Buttons */}
              <View style={styles.handsQuickRow}>
                {[1, 2, 3, 4].map((num) => {
                  const isSelected = handsCount === num;
                  return (
                    <TouchableOpacity
                      key={num}
                      activeOpacity={0.8}
                      onPress={() => {
                        triggerLightImpact();
                        handleHandsCountChange(num);
                      }}
                      style={[styles.handsQuickBtn, isSelected && styles.handsQuickBtnActive]}
                    >
                      <Text style={[styles.handsQuickBtnText, isSelected && styles.handsQuickBtnTextActive]}>
                        {num === 1 ? '1 Main (1 Part)' : `${num} Mains`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    triggerLightImpact();
                    if (handsCount > 1) handleHandsCountChange(handsCount - 1);
                  }}
                  disabled={handsCount <= 1}
                  style={[styles.stepperBtn, handsCount <= 1 && styles.stepperBtnDisabled]}
                >
                  <Text style={styles.stepperBtnSymbol}>−</Text>
                </TouchableOpacity>

                <View style={styles.stepperCenter}>
                  <Text style={styles.stepperRankText}>{handsCount} {handsCount > 1 ? 'Mains souscrites' : 'Main souscrite'}</Text>
                  <Text style={styles.stepperSubText}>
                    +{handsCount} {handsCount > 1 ? 'enfants/places ajoutés au cycle' : 'enfant/place ajouté au cycle'}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    triggerLightImpact();
                    handleHandsCountChange(handsCount + 1);
                  }}
                  style={styles.stepperBtn}
                >
                  <Text style={styles.stepperBtnSymbol}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.multiHandsInfoBadge}>
                <Icon name="crown" size={14} color="#0284C7" style={{ marginRight: 6 }} />
                <Text style={styles.multiHandsInfoText}>
                  {handsCount > 1
                    ? `Cet enfant prend ${handsCount} mains (l'effectif du SOL passe de ${existingTotalCycleHands} à ${totalCycleHands} mains effectives). La cagnotte de chaque main tirée passe à ${formatCurrency(totalPotAmount)} (${totalCycleHands} × ${formatCurrency(unitAmount)}). Cet enfant recevra ${handsCount} tirages de ${formatCurrency(totalPotAmount)} (Total: ${formatCurrency(memberTotalDue)}).`
                    : `1 part standard. L'effectif du SOL est de ${existingMembersCount + 1} enfants et ${totalCycleHands} mains. Chaque main tirée est de ${formatCurrency(totalPotAmount)} (${totalCycleHands} × ${formatCurrency(unitAmount)}).`}
                </Text>
              </View>
            </View>

            {/* Assigned Hand / Multi-Ranks */}
            <View style={styles.inputGroup}>
              <View style={styles.labelWithBadgeRow}>
                <Text style={styles.inputLabel}>
                  {handsCount > 1 ? 'RANGS DE TIRAGE DE SES MAINS' : 'POSITION / RANG DANS LE CYCLE'}
                </Text>
                <Text style={styles.rankSubHint}>
                  {handsCount > 1 ? `Attribués: #${multiRanks}` : 'Ordre de réception'}
                </Text>
              </View>

              {handsCount > 1 ? (
                <View style={[styles.inputWrapper, activeInput === 'RANKS' && styles.inputWrapperActive]}>
                  <Icon name="crown" size={16} color={activeInput === 'RANKS' ? SOL_COLORS.primary : SOL_COLORS.textMuted} style={{ marginRight: 10 }} />
                  <TextInput
                    style={styles.textInput}
                    placeholder={`Ex: ${multiRanks}`}
                    placeholderTextColor={SOL_COLORS.textMuted}
                    value={multiRanks}
                    onChangeText={setMultiRanks}
                    onFocus={() => setActiveInput('RANKS')}
                    onBlur={() => setActiveInput(null)}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              ) : (
                <View style={styles.stepperContainer}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      triggerLightImpact();
                      if (assignedRank > 1) handleAssignedRankChange(assignedRank - 1);
                    }}
                    disabled={assignedRank <= 1}
                    style={[styles.stepperBtn, assignedRank <= 1 && styles.stepperBtnDisabled]}
                  >
                    <Text style={styles.stepperBtnSymbol}>−</Text>
                  </TouchableOpacity>

                  <View style={styles.stepperCenter}>
                    <Text style={styles.stepperRankText}>Main #{assignedRank}</Text>
                    <Text style={styles.stepperSubText}>Position de tirage</Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      triggerLightImpact();
                      handleAssignedRankChange(assignedRank + 1);
                    }}
                    style={styles.stepperBtn}
                  >
                    <Text style={styles.stepperBtnSymbol}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Quick First Payment Switch */}
            <View style={styles.firstPaymentCard}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.firstPaymentTitle}>
                  Encaisser sa part ({handsCount} main{handsCount > 1 ? 's' : ''}) dès l'inscription
                </Text>
                <Text style={styles.firstPaymentSub}>
                  Crédite immédiatement {formatCurrency(unitAmount * handsCount)} au solde de l'adhérent.
                </Text>
              </View>
              <Switch
                value={collectFirstHand}
                onValueChange={(val) => {
                  triggerLightImpact();
                  setCollectFirstHand(val);
                }}
                trackColor={{ false: '#CBD5E1', true: SOL_COLORS.primaryLight }}
                thumbColor={collectFirstHand ? SOL_COLORS.primary : '#F8FAFC'}
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleValidateForm}
              disabled={isSubmitting}
              style={styles.submitBtn}
            >
              <Icon name="check" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Enregistrement en cours...' : 'Enregistrer l\'Adhérent'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation de l'Inscription"
        subtitle={`Saisissez votre code PIN gestionnaire pour confirmer l'ajout de ${fullName.trim()} (Main #${assignedRank}).`}
        onSuccess={executeSaveClient}
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  headerSubTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: SOL_COLORS.textSecondary,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  previewHeroCard: {
    backgroundColor: SOL_COLORS.secondary,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    ...SHADOWS.md,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#2DD4BF',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  previewPhone: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.info,
  },
  financialStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 10,
    marginTop: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  multiHandsPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#312E81',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  multiHandsPreviewPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FDE68A',
    flex: 1,
    lineHeight: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  statValueGreen: {
    fontSize: 13,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 2,
  },
  statValuePrimary: {
    fontSize: 13,
    fontWeight: '900',
    color: '#60A5FA',
    marginTop: 2,
  },
  statValueMuted: {
    fontSize: 12,
    fontWeight: '800',
    color: '#CBD5E1',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  formSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: SOL_COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelWithBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: SOL_COLORS.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  rankSubHint: {
    fontSize: 10,
    color: SOL_COLORS.textMuted,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  inputWrapperActive: {
    borderColor: SOL_COLORS.primary,
    backgroundColor: '#FFFFFF',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  phoneCountryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: SOL_COLORS.border,
  },
  countryPillFlagText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  countryCode: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  textInputPhone: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  stepperBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  stepperBtnSymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    lineHeight: 22,
  },
  stepperCenter: {
    flex: 1,
    alignItems: 'center',
  },
  stepperRankText: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  stepperSubText: {
    fontSize: 10,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  firstPaymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  firstPaymentTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  firstPaymentSub: {
    fontSize: 11,
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  handsQuickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  handsQuickBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handsQuickBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: SOL_COLORS.primary,
  },
  handsQuickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  handsQuickBtnTextActive: {
    color: SOL_COLORS.primary,
    fontWeight: '900',
  },
  multiHandsInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 8,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  multiHandsInfoText: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 52,
    borderRadius: 14,
    ...SHADOWS.md,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
