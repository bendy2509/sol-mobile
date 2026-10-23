import React, { useState, useEffect, useMemo } from 'react';
import { View, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform, Switch } from 'react-native';
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
import { Header } from '@/components/Header';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { AmountText, Button, Card, Chip, Icon, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { recordAuditLog } from '@/services/auditService';
import { safeBack } from '@/lib/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function NewClientScreen() {
  const router = useRouter();
  const { activeCollector, userRole } = useAuth();
  const { triggerSync } = useSync();
  const { width, isSmallScreen, isVerySmallScreen, isTablet, horizontalPadding } = useResponsive();
  const isReadOnly = userRole === 'READ_ONLY' || userRole === 'USER';
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
      Alert.alert(t('Accès Lecture Seule'), t('L\'inscription d\'adhérents est réservée aux gestionnaires.'));
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
      Alert.alert(t('Erreur'), err?.message || t('Échec de l\'enregistrement de l\'adhérent.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepper = (opts: {
    title: string;
    sub: string;
    onMinus: () => void;
    onPlus: () => void;
    minusDisabled: boolean;
    noun: string;
  }) => (
    <View style={styles.stepper}>
      <Pressable
        onPress={opts.onMinus}
        disabled={opts.minusDisabled}
        accessibilityRole="button"
        accessibilityLabel={t('Retirer {0}', opts.noun)}
        style={({ pressed }) => [styles.stepBtn, opts.minusDisabled && styles.stepBtnDisabled, pressed && styles.pressed]}
      >
        <Icon name="minus" size={22} color={opts.minusDisabled ? theme.colors.borderStrong : theme.colors.text} />
      </Pressable>
      <View style={styles.stepCenter} accessible accessibilityLabel={`${opts.title}, ${opts.sub}`}>
        <Text variant="subheading" align="center">
          {opts.title}
        </Text>
        <Text variant="caption" tone="muted" align="center">
          {opts.sub}
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
          <Header
            title={t('Nouvel adhérent')}
            subtitle={t('{0} · {1} / main', business?.name || 'Carnet actif', formatCurrency(unitAmount))}
            showBack={true}
            showScanner={false}
            fallbackBackRoute="/(tabs)"
          />
        }
        contentStyle={styles.content}
        footer={
          <Button
            size="lg"
            fullWidth
            icon="check"
            loading={isSubmitting}
            disabled={isSubmitting}
            label={isSubmitting ? t('Enregistrement en cours…') : t('Enregistrer l\'adhérent')}
            accessibilityHint={t('Demande votre code PIN gestionnaire')}
            onPress={handleValidateForm}
          />
        }
      >
        {/* Live Preview Card */}
        <Card tone="hero" style={styles.heroCard}>
          <View style={styles.previewTop}>
            <View style={styles.heroAvatar}>
              <Text variant="subheading" tone="onHero">
                {fullName.trim() ? getInitials(fullName) : t('SOL')}
              </Text>
            </View>
            <View style={styles.flexShrink}>
              <Text variant="heading" tone="onHero" numberOfLines={1}>
                {fullName.trim() || t('Nom de l\'adhérent')}
              </Text>
              <Text variant="caption" tone="onHeroMuted">
                {phoneDigits ? `+509 ${formatDisplayPhone(phoneDigits)}` : t('+509 XX XX XX XX')}
              </Text>
            </View>
            <View style={styles.heroPill}>
              <Text variant="label" tone="onHero" numberOfLines={1}>
                {handsCount > 1 ? `#${multiRanks}` : t('Main #{0}', assignedRank)}
              </Text>
            </View>
          </View>

          {/* Financial Grid Info (Real-Time Feedback) */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text variant="caption" tone="onHeroMuted">{t('Cotisation (1 main)')}</Text>
              <AmountText amount={unitAmount} size="medium" tone="onHero" />
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text variant="caption" tone="onHeroMuted">{t('Tirages prévus')}</Text>
              <Text variant="amount" tone="onHero" numberOfLines={1}>
                {handsCount} × {formatCurrency(totalPotAmount)}
              </Text>
            </View>
          </View>

          {/* Projection Temps Réel */}
          <Text variant="caption" tone="onHeroMuted">
            <Text variant="label" tone="onHero">{t('Impact SOL :')}
            </Text>{t('en prenant')}{' '}{handsCount}{' '}{t('main')}{handsCount > 1 ? 's' : ''}{t(', la cagnotte s\'ajuste pour tout le monde à')}{' '}
            <Text variant="label" tone="onHero">
              {formatCurrency(totalPotAmount)}
            </Text>{' '}
            ({totalCycleHands}{' '}{t('mains). Cet adhérent paiera')}{' '}
            <Text variant="label" tone="onHero">
              {t('{0} au total', formatCurrency(memberTotalDue))}</Text>{' '}{t('sur la durée du cycle.')}</Text>
        </Card>

        {/* Identity */}
        <Card style={styles.formCard}>
          <TextField
            label={t('Nom complet *')}
            placeholder={t('Ex : Marie Carmel Saint-Fleur')}
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setActiveInput('NAME')}
            onBlur={() => setActiveInput(null)}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {/* Haitian Phone Number Input */}
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

        {/* Number of Subscribed Hands (Multi-Mains) */}
        <View style={styles.section}>
          <SectionHeader title={t('Mains souscrites')} />
          <Card style={styles.formCard}>
            <View style={styles.chipRow}>
              {[1, 2, 3, 4].map((num) => (
                <Chip
                  key={num}
                  label={num === 1 ? t('1 main') : t('{0} mains', num)}
                  selected={handsCount === num}
                  onPress={() => {
                    triggerLightImpact();
                    handleHandsCountChange(num);
                  }}
                />
              ))}
            </View>

            {renderStepper({
              title: handsCount > 1 ? t('{0} mains souscrites', handsCount) : t('{0} main souscrite', handsCount),
              sub: handsCount > 1 ? t('+{0} enfants / places au cycle', handsCount) : t('+{0} enfant / place au cycle', handsCount),
              noun: t('une main'),
              minusDisabled: handsCount <= 1,
              onMinus: () => {
                triggerLightImpact();
                if (handsCount > 1) handleHandsCountChange(handsCount - 1);
              },
              onPlus: () => {
                triggerLightImpact();
                handleHandsCountChange(handsCount + 1);
              },
            })}

            <Card tone="sunken" padding="sm">
              <View style={styles.infoRow}>
                <Icon name="info" size={18} color={theme.colors.textMuted} />
                <Text variant="caption" tone="muted" style={styles.flexShrink}>
                  {handsCount > 1
                    ? t('Cet enfant prend {0} mains (l\'effectif du SOL passe de {1} à {2} mains effectives). La cagnotte de chaque main tirée passe à {3} ({4} × {5}). Cet enfant recevra {6} tirages de {7} (Total: {8}).', handsCount, existingTotalCycleHands, totalCycleHands, formatCurrency(totalPotAmount), totalCycleHands, formatCurrency(unitAmount), handsCount, formatCurrency(totalPotAmount), formatCurrency(memberTotalDue))
                    : t('1 part standard. L\'effectif du SOL est de {0} enfants et {1} mains. Chaque main tirée est de {2} ({3} × {4}).', existingMembersCount + 1, totalCycleHands, formatCurrency(totalPotAmount), totalCycleHands, formatCurrency(unitAmount))}
                </Text>
              </View>
            </Card>
          </Card>
        </View>

        {/* Assigned Hand / Multi-Ranks */}
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
                title: t('Main #{0}', assignedRank),
                sub: t('Ordre de réception de la cagnotte'),
                noun: t('un rang'),
                minusDisabled: assignedRank <= 1,
                onMinus: () => {
                  triggerLightImpact();
                  if (assignedRank > 1) handleAssignedRankChange(assignedRank - 1);
                },
                onPlus: () => {
                  triggerLightImpact();
                  handleAssignedRankChange(assignedRank + 1);
                },
              })
            )}
          </Card>
        </View>

        {/* Quick First Payment Switch */}
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.flexShrink}>
              <Text variant="bodyStrong">{t('Encaisser sa part ({0} main{1}) dès l\'inscription', handsCount, handsCount > 1 ? 's' : '')}</Text>
              <Text variant="caption" tone="muted">{t('Crédite immédiatement {0} au solde de l\'adhérent.', formatCurrency(unitAmount * handsCount))}</Text>
            </View>
            <Switch
              value={collectFirstHand}
              onValueChange={(val) => {
                triggerLightImpact();
                setCollectFirstHand(val);
              }}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
              accessibilityLabel={t('Encaisser sa part dès l\'inscription')}
            />
          </View>
        </Card>

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
    content: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    section: { gap: spacing.md },
    group: { gap: spacing.xs },

    heroCard: { gap: spacing.md },
    previewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    heroAvatar: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.onHeroMuted,
    },
    heroPill: {
      maxWidth: '35%',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.onHeroMuted,
    },
    heroStats: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
    heroStat: { flex: 1, minWidth: 0, gap: spacing.xs },
    heroStatDivider: { width: 1, backgroundColor: colors.onHeroMuted, opacity: 0.4 },

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

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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

    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  });
