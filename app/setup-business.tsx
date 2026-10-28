import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import {
  getActiveBusinessConfig,
  getCycleHandsTotal,
  getSettingsLock,
  saveBusinessConfig,
  updateActiveBusinessSettings,
} from '@/db/businessRepository';
import { BusinessConfig, BusinessType, PaymentFrequency } from '@/types';
import { getCycleDates } from '@/services/scheduleService';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { AmountText, Button, Card, Icon, ListItem, Screen, SectionHeader, Text, TextField, UiIconName } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';
import { localDateString } from '@/lib/dates';

export default function SetupBusinessScreen() {
  const router = useRouter();
  const { isVerySmallScreen, isTablet, horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const todayStr = localDateString();

  const [businessType, setBusinessType] = useState<BusinessType>('SOL');
  const [name, setName] = useState('');
  const [contributionAmount, setContributionAmount] = useState('500');
  const [frequency, setFrequency] = useState<PaymentFrequency>('DAILY');
  const [startDate, setStartDate] = useState(todayStr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The active carnet is edited in place; its rules lock at the first collection of the cycle
  const [existing, setExisting] = useState<BusinessConfig | null>(null);
  const [rulesLocked, setRulesLocked] = useState(false);
  const [cycleHands, setCycleHands] = useState(0);

  useEffect(() => {
    (async () => {
      const [biz, lock, hands] = await Promise.all([getActiveBusinessConfig(), getSettingsLock(), getCycleHandsTotal()]);
      setCycleHands(hands);
      setRulesLocked(lock.locked);
      if (biz) {
        setExisting(biz);
        setBusinessType(biz.type);
        setName(biz.name);
        setContributionAmount(String(biz.contributionAmount));
        setFrequency(biz.frequency);
        setStartDate(biz.startDate);
      }
    })().catch(() => {});
  }, []);

  // One round per hand: the end date follows the members' hands, never typed
  const rounds = Math.max(1, cycleHands);
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const endDate = validStart ? getCycleDates(startDate, frequency, rounds).endDate : '';

  const handleTypeChange = (type: BusinessType) => {
    triggerLightImpact();
    setBusinessType(type);
  };

  const frequencyOptions: { key: PaymentFrequency; label: string; desc: string }[] = [
    { key: 'DAILY', label: t('Quotidien'), desc: t('Chaque jour ouvré') },
    { key: 'WED_SAT', label: t('Mercredi & Samedi'), desc: t('Jours de grand marché') },
    { key: 'WEEKLY_WED', label: t('Chaque Mercredi'), desc: t('Hebdomadaire (Mercredi)') },
    { key: 'WEEKLY_SAT', label: t('Chaque Samedi'), desc: t('Hebdomadaire (Samedi)') },
    { key: '8J', label: t('Tous les 8 Jours'), desc: t('Cycle traditionnel de 8 jours') },
    { key: '15J', label: t('Quinzaine (15 Jours)'), desc: t('Bimensuel / Quinzaine') },
    { key: 'MONTHLY', label: t('Mensuel'), desc: t('Chaque fin de mois') },
  ];

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t('Nom requis'), t('Veuillez entrer le nom de l\'activité ou du groupe.'));
      return;
    }

    const numAmount = Number(contributionAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert(t('Montant invalide'), t('Le montant de la cotisation doit être supérieur à 0.'));
      return;
    }

    if (!validStart) {
      Alert.alert(t('Date invalide'), t('Format AAAA-MM-JJ'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (existing) {
        await updateActiveBusinessSettings({ name: name.trim(), type: businessType, contributionAmount: numAmount, frequency, startDate });
      } else {
        await saveBusinessConfig({
          collectorId: '',
          name: name.trim(),
          type: businessType,
          contributionAmount: numAmount,
          frequency,
          totalSlots: rounds,
          startDate,
          endDate,
          status: 'ACTIVE',
        });
      }

      triggerSuccessFeedback();
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message ? t(err.message) : t('Impossible d\'enregistrer la configuration.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedPot = (Number(contributionAmount) || 0) * rounds;

  const typeOptions: { key: BusinessType; label: string; desc: string; icon: UiIconName }[] = [
    { key: 'SABOTAY', label: t('Sabotay'), desc: t("Collecte d'épargne quotidienne flexible sur le marché"), icon: 'cash' },
    { key: 'SOL', label: t('Sol (ROSCA)'), desc: t('Épargne rotative avec tirage et passage de mains'), icon: 'cycle' },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
      <Screen
        edges={['left', 'right']}
        footer={
          <Button
            size="lg"
            fullWidth
            icon="check"
            loading={isSubmitting}
            disabled={isSubmitting}
            label={isSubmitting ? t('Enregistrement…') : existing ? t('Enregistrer le carnet') : t('Valider et lancer l\'activité')}
            onPress={handleSubmit}
          />
        }
        contentStyle={styles.content}
      >
        <Text variant="body" tone="muted">{t('Paramétrez les règles de votre carnet Sabotay ou groupe Sol pour lancer le cycle.')}</Text>

        {/* Activity Type Selector */}
        <View style={styles.section}>
          <SectionHeader title={t('1. Type d\'activité')} />
          <View style={[styles.typeRow, isVerySmallScreen && styles.typeColumn]}>
            {typeOptions.map((opt) => {
              const isSelected = businessType === opt.key;
              return (
                <Card
                  key={opt.key}
                  onPress={() => handleTypeChange(opt.key)}
                  accessibilityLabel={`${opt.label} : ${opt.desc}${isSelected ? t(', sélectionné') : ''}`}
                  style={[styles.typeCard, isSelected && styles.typeCardSelected]}
                >
                  <View style={styles.typeHead}>
                    <Icon name={opt.icon} size={20} color={isSelected ? theme.colors.primary : theme.colors.textMuted} />
                    <Text variant="subheading" tone={isSelected ? 'primary' : 'default'} style={styles.flexShrink}>
                      {opt.label}
                    </Text>
                    {isSelected && <Icon name="check" size={18} color={theme.colors.primary} />}
                  </View>
                  <Text variant="caption" tone="muted">
                    {opt.desc}
                  </Text>
                </Card>
              );
            })}
          </View>
        </View>

        {rulesLocked && (
          <Card tone="sunken" style={styles.computedCard}>
            <View style={styles.computedHead}>
              <Icon name="lock" size={18} color={theme.colors.textMuted} />
              <Text variant="label">{t('Paramètres verrouillés')}</Text>
            </View>
            <Text variant="caption" tone="muted">
              {t('Des encaissements existent dans ce cycle : le montant par main, la fréquence et la date de début ne changent plus. Clôturez le cycle pour en ouvrir un nouveau avec d’autres paramètres.')}
            </Text>
          </Card>
        )}

        {/* Basic Parameters */}
        <View style={styles.section}>
          <SectionHeader title={t('2. Paramètres du carnet')} />
          <Card style={styles.fieldsCard}>
            <TextField
              label={t('Nom du groupe ou du carnet *')}
              placeholder={t('Ex : Sol BS 2026')}
              value={name}
              onChangeText={setName}
            />
            <TextField
              label={t('Cotisation par main (HTG) *')}
              placeholder={t('Ex : 250')}
              value={contributionAmount}
              onChangeText={setContributionAmount}
              keyboardType="numeric"
              editable={!rulesLocked}
            />
          </Card>
        </View>

        {/* Frequency Options */}
        <View style={styles.section}>
          <SectionHeader title={t('3. Fréquence des versements')} />
          <Card padding="none" style={styles.listCard}>
            {frequencyOptions.map((opt, index) => {
              const isSelected = frequency === opt.key;
              return (
                <ListItem
                  key={opt.key}
                  title={opt.label}
                  subtitle={opt.desc}
                  selected={isSelected}
                  divider={index < frequencyOptions.length - 1}
                  trailing={isSelected ? <Icon name="check" size={20} color={theme.colors.primary} /> : undefined}
                  accessibilityLabel={`${opt.label}, ${opt.desc}${isSelected ? t(', sélectionné') : ''}`}
                  onPress={
                    rulesLocked
                      ? undefined
                      : () => {
                          triggerLightImpact();
                          setFrequency(opt.key);
                        }
                  }
                />
              );
            })}
          </Card>
        </View>

        {/* Cycle: capacity, start date, computed end date */}
        <View style={styles.section}>
          <SectionHeader title={t('4. Cycle')} />
          <Card style={styles.fieldsCard}>
            <TextField
              label={t('Date de début du cycle *')}
              placeholder={t('AAAA-MM-JJ')}
              value={startDate}
              onChangeText={setStartDate}
              helper={t('Format AAAA-MM-JJ')}
              editable={!rulesLocked}
            />
          </Card>

          <Card tone="sunken" style={styles.computedCard}>
            <View style={styles.computedHead}>
              <Icon name="calendar" size={18} color={theme.colors.primary} />
              <Text variant="label" tone="primary">{t('Durée du cycle et date de fin')}</Text>
            </View>
            <Text variant="heading">{t('{0} tours · un par main', rounds)}</Text>
            <Text variant="caption" tone="muted">{t('Le nombre de tours suit les mains des adhérents inscrits : chaque main ajoute un tour et repousse la date de fin.')}</Text>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text variant="body" tone="muted" style={styles.flexShrink}>{t('Début')}</Text>
              <Text variant="bodyStrong">{validStart ? formatDateShort(startDate) : '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text variant="body" tone="muted" style={styles.flexShrink}>{t('Fin prévisionnelle')}</Text>
              <Text variant="bodyStrong">{endDate ? formatDateShort(endDate) : '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text variant="body" tone="muted" style={styles.flexShrink}>{t('Cagnotte estimée (po)')}</Text>
              <AmountText amount={estimatedPot} size="medium" tone="primary" />
            </View>
          </Card>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    flexOne: { flex: 1 },
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    section: { gap: spacing.md },

    typeRow: { flexDirection: 'row', gap: spacing.md },
    typeColumn: { flexDirection: 'column' },
    typeCard: { flex: 1, gap: spacing.sm },
    typeCardSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
    typeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

    fieldsCard: { gap: spacing.lg },
    listCard: { overflow: 'hidden' },

    computedCard: { gap: spacing.sm },
    computedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  });
