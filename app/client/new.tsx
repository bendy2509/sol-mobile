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
        accessibilityLabel={`Retirer ${opts.noun}`}
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
        accessibilityLabel={`Ajouter ${opts.noun}`}
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
            title="Nouvel adhérent"
            subtitle={`${business?.name || 'Carnet actif'} · ${formatCurrency(unitAmount)} / main`}
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
            label={isSubmitting ? 'Enregistrement en cours…' : "Enregistrer l'adhérent"}
            accessibilityHint="Demande votre code PIN gestionnaire"
            onPress={handleValidateForm}
          />
        }
      >
        {/* Live Preview Card */}
        <Card tone="hero" style={styles.heroCard}>
          <View style={styles.previewTop}>
            <View style={styles.heroAvatar}>
              <Text variant="subheading" tone="onHero">
                {fullName.trim() ? getInitials(fullName) : 'SOL'}
              </Text>
            </View>
            <View style={styles.flexShrink}>
              <Text variant="heading" tone="onHero" numberOfLines={1}>
                {fullName.trim() || "Nom de l'adhérent"}
              </Text>
              <Text variant="caption" tone="onHeroMuted">
                {phoneDigits ? `+509 ${formatDisplayPhone(phoneDigits)}` : '+509 XX XX XX XX'}
              </Text>
            </View>
            <View style={styles.heroPill}>
              <Text variant="label" tone="onHero" numberOfLines={1}>
                {handsCount > 1 ? `#${multiRanks}` : `Main #${assignedRank}`}
              </Text>
            </View>
          </View>

          {/* Financial Grid Info (Real-Time Feedback) */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text variant="caption" tone="onHeroMuted">
                Cotisation (1 main)
              </Text>
              <AmountText amount={unitAmount} size="medium" tone="onHero" />
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text variant="caption" tone="onHeroMuted">
                Tirages prévus
              </Text>
              <Text variant="amount" tone="onHero" numberOfLines={1}>
                {handsCount} × {formatCurrency(totalPotAmount)}
              </Text>
            </View>
          </View>

          {/* Projection Temps Réel */}
          <Text variant="caption" tone="onHeroMuted">
            <Text variant="label" tone="onHero">
              Impact SOL :{' '}
            </Text>
            en prenant {handsCount} main{handsCount > 1 ? 's' : ''}, la cagnotte s'ajuste pour tout le monde à{' '}
            <Text variant="label" tone="onHero">
              {formatCurrency(totalPotAmount)}
            </Text>{' '}
            ({totalCycleHands} mains). Cet adhérent paiera{' '}
            <Text variant="label" tone="onHero">
              {formatCurrency(memberTotalDue)} au total
            </Text>{' '}
            sur la durée du cycle.
          </Text>
        </Card>

        {/* Identity */}
        <Card style={styles.formCard}>
          <TextField
            label="Nom complet *"
            placeholder="Ex : Marie Carmel Saint-Fleur"
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setActiveInput('NAME')}
            onBlur={() => setActiveInput(null)}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {/* Haitian Phone Number Input */}
          <View style={styles.group}>
            <Text variant="label">Numéro de téléphone *</Text>
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
                accessibilityLabel="Numéro de téléphone, 8 chiffres"
              />
              {phoneDigits.length > 0 && (
                <Pressable
                  onPress={() => setPhoneDigits('')}
                  accessibilityRole="button"
                  accessibilityLabel="Effacer le numéro"
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
          <SectionHeader title="Mains souscrites" />
          <Card style={styles.formCard}>
            <View style={styles.chipRow}>
              {[1, 2, 3, 4].map((num) => (
                <Chip
                  key={num}
                  label={num === 1 ? '1 main' : `${num} mains`}
                  selected={handsCount === num}
                  onPress={() => {
                    triggerLightImpact();
                    handleHandsCountChange(num);
                  }}
                />
              ))}
            </View>

            {renderStepper({
              title: `${handsCount} ${handsCount > 1 ? 'mains souscrites' : 'main souscrite'}`,
              sub: `+${handsCount} ${handsCount > 1 ? 'enfants / places au cycle' : 'enfant / place au cycle'}`,
              noun: 'une main',
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
                    ? `Cet enfant prend ${handsCount} mains (l'effectif du SOL passe de ${existingTotalCycleHands} à ${totalCycleHands} mains effectives). La cagnotte de chaque main tirée passe à ${formatCurrency(totalPotAmount)} (${totalCycleHands} × ${formatCurrency(unitAmount)}). Cet enfant recevra ${handsCount} tirages de ${formatCurrency(totalPotAmount)} (Total: ${formatCurrency(memberTotalDue)}).`
                    : `1 part standard. L'effectif du SOL est de ${existingMembersCount + 1} enfants et ${totalCycleHands} mains. Chaque main tirée est de ${formatCurrency(totalPotAmount)} (${totalCycleHands} × ${formatCurrency(unitAmount)}).`}
                </Text>
              </View>
            </Card>
          </Card>
        </View>

        {/* Assigned Hand / Multi-Ranks */}
        <View style={styles.section}>
          <SectionHeader title={handsCount > 1 ? 'Rangs de tirage de ses mains' : 'Rang dans le cycle'} />
          <Card style={styles.formCard}>
            {handsCount > 1 ? (
              <TextField
                label="Rangs attribués"
                placeholder={`Ex : ${multiRanks}`}
                value={multiRanks}
                onChangeText={setMultiRanks}
                onFocus={() => setActiveInput('RANKS')}
                onBlur={() => setActiveInput(null)}
                keyboardType="numbers-and-punctuation"
                helper="Séparez les rangs par des virgules (ex : 5, 6, 7)."
              />
            ) : (
              renderStepper({
                title: `Main #${assignedRank}`,
                sub: 'Ordre de réception de la cagnotte',
                noun: 'un rang',
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
              <Text variant="bodyStrong">
                Encaisser sa part ({handsCount} main{handsCount > 1 ? 's' : ''}) dès l'inscription
              </Text>
              <Text variant="caption" tone="muted">
                Crédite immédiatement {formatCurrency(unitAmount * handsCount)} au solde de l'adhérent.
              </Text>
            </View>
            <Switch
              value={collectFirstHand}
              onValueChange={(val) => {
                triggerLightImpact();
                setCollectFirstHand(val);
              }}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
              accessibilityLabel="Encaisser sa part dès l'inscription"
            />
          </View>
        </Card>

        {/* 4-Digit PIN Security Modal */}
        <PinVerificationModal
          visible={isPinModalOpen}
          title="Validation de l'Inscription"
          subtitle={`Saisissez votre code PIN gestionnaire pour confirmer l'ajout de ${fullName.trim() || 'un adhérent'} (Main #${assignedRank}).`}
          onSuccess={executeSaveClient}
          onCancel={() => setIsPinModalOpen(false)}
          onLockout={() => {
            recordAuditLog({
              action: 'LOGIN_FAILURE',
              entityType: 'SYSTEM',
              entityId: 'unknown',
              reason: `3 tentatives PIN échouées lors de la création du profil "${fullName.trim()}".`,
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
