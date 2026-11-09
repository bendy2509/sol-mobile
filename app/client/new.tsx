import React, { useState, useEffect, useMemo } from 'react';
import { View, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';

import { createClient } from '@/db/clientRepository';
import { EnrollmentLock, getActiveBusinessConfig, getEnrollmentLock } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { createTransaction } from '@/db/transactionRepository';
import { useAuth } from '@/context/AuthContext';
import { BusinessConfig } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { localDateString } from '@/lib/dates';
import { buildCycleRounds, roundsDueToDate } from '@/services/scheduleService';
import { calculateContributionAmount, calculateMemberDuePerRound, calculateMemberTotalCyclePot } from '@/services/financialService';
import { cycleTotalHands, handUnitAmount, owedAmount } from '@/services/memberRules';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { triggerSuccessFeedback, triggerErrorFeedback, triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { Button, Card, Icon, Screen, ScreenHeader, SectionHeader, StatStrip, Text, TextField } from '@/components/ui';
import { recordAuditLog } from '@/services/auditService';
import { safeBack } from '@/lib/navigation';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function NewClientScreen() {
  const router = useRouter();
  const { activeCollector } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
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
  const [lock, setLock] = useState<EnrollmentLock | null>(null);

  const unitAmount = handUnitAmount(business);
  const totalCycleHands = existingTotalCycleHands + handsCount;
  // Three key figures (services): per round, over the whole cycle, and already owed today
  // (dues run from the cycle start, so a late member catches up the rounds already past)
  const duePerRound = calculateMemberDuePerRound(handsCount, unitAmount);
  const memberTotalDue = calculateMemberTotalCyclePot(handsCount, totalCycleHands, unitAmount);
  const roundsDueNow = business ? roundsDueToDate(buildCycleRounds(business.startDate, business.frequency, totalCycleHands), localDateString()) : 0;
  const alreadyOwed = owedAmount(roundsDueNow * handsCount, unitAmount);

  const generateRanksString = (startRank: number, count: number): string => {
    const ranks = [];
    for (let i = 0; i < count; i++) {
      ranks.push(startRank + i);
    }
    return ranks.join(', ');
  };

  useEffect(() => {
    async function loadContext() {
      const [activeBiz, members, enrollmentLock] = await Promise.all([
        getActiveBusinessConfig(),
        getMembersWithPaymentStatus(),
        getEnrollmentLock(),
      ]);
      setBusiness(activeBiz);
      setLock(enrollmentLock);
      const totalHands = cycleTotalHands(members);
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

    if (lock?.locked) {
      triggerErrorFeedback();
      Alert.alert(t('Inscriptions fermées'), t('Une main a déjà été remise dans ce cycle : les adhérents et leurs mains ne peuvent plus changer. Annulez la remise pour modifier.'));
      return;
    }

    if (!fullName.trim()) {
      triggerErrorFeedback();
      Alert.alert(t('Nom requis'), t('Veuillez saisir le nom complet de l\'adhérent.'));
      return;
    }

    if (phoneDigits.length < 8) {
      triggerErrorFeedback();
      Alert.alert(t('Téléphone incomplet'), t('Veuillez saisir un numéro de téléphone à 8 chiffres (ex: 37123456).'));
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
        collectorId,
        businessId: business?.id,
      });

      // 2. If first hand collection was checked, immediately record first contribution
      if (collectFirstHand) {
        await createTransaction({
          clientId: client.id,
          collectorId,
          amount: calculateContributionAmount(effectiveHandsCount, unitAmount),
          handsCovered: effectiveHandsCount,
          type: 'SOL_CONTRIBUTION',
          paymentMethod: 'CASH',
          note: `Première cotisation à l'inscription (${effectiveHandsCount} main(s) - Rangs: #${computedRanks})`,
        });
      }

      triggerSuccessFeedback();

      Alert.alert(
        t('Adhérent Enregistré avec Succès !'),
        t('{0} a été ajouté(e) au carnet avec {1} main{2} (Rangs : #{3}) ({4} / main).{5}', fullName.trim(), effectiveHandsCount, effectiveHandsCount > 1 ? 's' : '', computedRanks, formatCurrency(unitAmount), collectFirstHand ? `\n\n1ère cotisation encaissée avec succès (${formatCurrency(unitAmount * effectiveHandsCount)}).` : ''),
        [
          {
            text: t('Voir le Tableau de Bord'),
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert(t('Erreur'), err?.message ? t(err.message) : t('Échec de l\'enregistrement de l\'adhérent.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepHands = (delta: number) => {
    triggerLightImpact();
    handleHandsCountChange(handsCount + delta);
  };
  const stepRank = (delta: number) => {
    triggerLightImpact();
    handleAssignedRankChange(assignedRank + delta);
  };

  /** − value + : the one control for a count (hands, rank). */
  const renderStepper = (opts: { value: string; caption: string; noun: string; minusDisabled: boolean; onMinus: () => void; onPlus: () => void }) => (
    <View style={styles.stepper}>
      <Pressable
        onPress={opts.onMinus}
        disabled={opts.minusDisabled}
        accessibilityRole="button"
        accessibilityLabel={t('Retirer {0}', opts.noun)}
        style={({ pressed }) => [styles.stepBtn, opts.minusDisabled && styles.stepBtnDisabled, pressed && styles.pressed]}
      >
        <Icon name="minus" size={22} color={opts.minusDisabled ? theme.colors.textPlaceholder : theme.colors.text} />
      </Pressable>
      <View style={styles.stepCenter} accessible accessibilityLabel={`${opts.value}, ${opts.caption}`}>
        <Text variant="amountLarge" align="center">
          {opts.value}
        </Text>
        <Text variant="caption" tone="muted" align="center">
          {opts.caption}
        </Text>
      </View>
      <Pressable
        onPress={opts.onPlus}
        accessibilityRole="button"
        accessibilityLabel={t('Ajouter {0}', opts.noun)}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
      >
        <Icon name="plus" size={22} color={theme.colors.text} />
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
      <Screen
        edges={['top', 'left', 'right', 'bottom']}
        header={
          <ScreenHeader
            title={t('Nouvel adhérent')}
            subtitle={t('{0} · {1} / main', business?.name || t('Carnet actif'), formatCurrency(unitAmount))}
            onBack={() => safeBack(router, '/(tabs)')}
          />
        }
        contentStyle={styles.content}
        footer={
          <Button
            size="lg"
            fullWidth
            icon="check"
            loading={isSubmitting}
            disabled={isSubmitting || !!lock?.locked}
            label={isSubmitting ? t('Enregistrement en cours…') : t('Enregistrer l\'adhérent')}
            accessibilityHint={t('Demande votre code PIN gestionnaire')}
            onPress={handleValidateForm}
          />
        }
      >
        {lock?.locked && (
          <Card tone="sunken">
            <View style={styles.infoRow}>
              <Icon name="lock" size={18} color={theme.colors.textMuted} />
              <Text variant="body" style={styles.flexShrink}>
                {t('Une main a déjà été remise le {0}. Annulez cette remise pour ajouter un adhérent.', lock.since ? formatDateShort(lock.since) : '—')}
              </Text>
            </View>
          </Card>
        )}

        {/* Identity */}
        <Card style={styles.formCard}>
          <TextField
            label={t('Nom complet *')}
            placeholder={t('Ex : Bendy SERVILUS')}
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setActiveInput('NAME')}
            onBlur={() => setActiveInput(null)}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {/* Haitian phone number: +509 and 8 digits */}
          <View style={styles.group}>
            <Text variant="label">{t('Numéro de téléphone *')}</Text>
            <View style={[styles.phoneBox, activeInput === 'PHONE' && styles.phoneBoxActive]}>
              <View style={styles.countryChip}>
                <Text variant="label">+509</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="37 12 34 56"
                placeholderTextColor={theme.colors.textPlaceholder}
                value={formatDisplayPhone(phoneDigits)}
                onChangeText={handlePhoneChange}
                onFocus={() => setActiveInput('PHONE')}
                onBlur={() => setActiveInput(null)}
                keyboardType="phone-pad"
                maxLength={11}
                accessibilityLabel={t('Numéro de téléphone, 8 chiffres')}
              />
              {phoneDigits.length > 0 && (
                <Pressable
                  onPress={() => setPhoneDigits('')}
                  accessibilityRole="button"
                  accessibilityLabel={t('Effacer le numéro')}
                  style={styles.clearBtn}
                >
                  <Icon name="close" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </View>
          </View>
        </Card>

        {/* Hands: one control */}
        <View style={styles.section}>
          <SectionHeader title={t('Mains souscrites')} />
          <Card style={styles.formCard}>
            {renderStepper({
              value: String(handsCount),
              caption: handsCount > 1 ? t('mains · {0} mains dans le cycle', totalCycleHands) : t('main · {0} mains dans le cycle', totalCycleHands),
              noun: t('une main'),
              minusDisabled: handsCount <= 1,
              onMinus: () => handsCount > 1 && stepHands(-1),
              onPlus: () => stepHands(1),
            })}
          </Card>
        </View>

        {/* Key figures instead of explanations */}
        <StatStrip
          cells={[
            { label: t('Par tour'), value: formatCurrency(duePerRound) },
            { label: t('Sur le cycle'), value: formatCurrency(memberTotalDue) },
            {
              label: t('Déjà dû'),
              value: formatCurrency(alreadyOwed),
              hint: roundsDueNow > 0 ? t('{0} tour(s) passé(s)', roundsDueNow) : t('Aucun'),
              tone: alreadyOwed > 0 ? 'warning' : 'default',
            },
          ]}
        />

        {/* Payout rank(s) */}
        <View style={styles.section}>
          <SectionHeader title={handsCount > 1 ? t('Rangs de tirage de ses mains') : t('Rang dans le cycle')} />
          <Card style={styles.formCard}>
            {handsCount > 1 ? (
              <TextField
                label={t('Rangs attribués')}
                placeholder={t('Ex : {0}', multiRanks)}
                value={multiRanks}
                onChangeText={setMultiRanks}
                onFocus={() => setActiveInput('RANKS')}
                onBlur={() => setActiveInput(null)}
                keyboardType="numbers-and-punctuation"
                helper={t('Séparez les rangs par des virgules (ex : 5, 6, 7).')}
              />
            ) : (
              renderStepper({
                value: `#${assignedRank}`,
                caption: t('Ordre de réception de la cagnotte'),
                noun: t('un rang'),
                minusDisabled: assignedRank <= 1,
                onMinus: () => assignedRank > 1 && stepRank(-1),
                onPlus: () => stepRank(1),
              })
            )}
          </Card>
        </View>

        {/* First payment: the whole row toggles, and its state reads in words, on or off */}
        <Pressable
          onPress={() => {
            triggerLightImpact();
            setCollectFirstHand((v) => !v);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: collectFirstHand }}
          accessibilityLabel={t('Encaisser sa part dès l\'inscription')}
          style={({ pressed }) => [styles.switchCard, collectFirstHand && styles.switchCardOn, pressed && styles.pressed]}
        >
          <View style={styles.flexShrink}>
            <Text variant="bodyStrong">{t('Encaisser sa part dès l\'inscription')}</Text>
            <Text variant="caption" tone={collectFirstHand ? 'primary' : 'muted'}>
              {collectFirstHand
                ? t('Oui : {0} encaissés à l\'enregistrement', formatCurrency(calculateContributionAmount(handsCount, unitAmount)))
                : t('Non : rien n\'est encaissé maintenant')}
            </Text>
          </View>
          {/* Shows the state only: the row takes the touch (a second handler would toggle back) */}
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Switch
              value={collectFirstHand}
              trackColor={{ false: theme.colors.textPlaceholder, true: theme.colors.primary }}
              ios_backgroundColor={theme.colors.textPlaceholder}
              thumbColor={theme.colors.onPrimary}
            />
          </View>
        </Pressable>

        {/* 4-Digit PIN Security Modal */}
        <PinVerificationModal
          visible={isPinModalOpen}
          title={t('Validation de l\'Inscription')}
          subtitle={t('Saisissez votre code PIN gestionnaire pour confirmer l\'ajout de {0} (Main #{1}).', fullName.trim() || 'un adhérent', assignedRank)}
          onSuccess={executeSaveClient}
          onCancel={() => setIsPinModalOpen(false)}
          onLockout={() => {
            recordAuditLog({
              action: 'LOGIN_FAILURE',
              entityType: 'SYSTEM',
              entityId: 'unknown',
              reason: t('3 tentatives PIN échouées lors de la création du profil "{0}".', fullName.trim()),
              userId: activeCollector?.id || 'c011ec70-0000-0000-0000-000000000001',
              userRole: 'MANAGER',
            });
          }}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexOne: { flex: 1 },
    flexShrink: { flex: 1, minWidth: 0 },
    pressed: { backgroundColor: colors.surfacePressed },
    content: { gap: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xl },
    section: { gap: spacing.md },
    group: { gap: spacing.xs },

    formCard: { gap: spacing.lg },
    phoneBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: layout.touchTarget,
      paddingLeft: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    phoneBoxActive: { borderWidth: 2, borderColor: colors.primary },
    countryChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceAlt,
    },
    phoneInput: { ...typography.amountSmall, flex: 1, minWidth: 0, color: colors.text, paddingVertical: spacing.sm },
    clearBtn: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepBtn: {
      width: layout.actionHeight,
      height: layout.actionHeight,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
    stepCenter: { flex: 1, minWidth: 0, gap: spacing.xs },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },

    switchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    switchCardOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  });
