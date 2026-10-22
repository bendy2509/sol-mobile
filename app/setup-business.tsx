import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { saveBusinessConfig } from '@/db/businessRepository';
import { BusinessType, PaymentFrequency } from '@/types';
import { calculateCycleEndDate, getFrequencyLabel, calculateCycleTotalDays, getFrequencyIntervalDays } from '@/lib/dateCalculations';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { AmountText, Button, Card, Icon, ListItem, Screen, SectionHeader, Text, TextField, UiIconName } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function SetupBusinessScreen() {
  const router = useRouter();
  const { isVerySmallScreen, isTablet, horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const todayStr = new Date().toISOString().split('T')[0];

  const [businessType, setBusinessType] = useState<BusinessType>('SABOTAY');
  const [name, setName] = useState('Sabotay Marché Cluny 2026');
  const [contributionAmount, setContributionAmount] = useState('250');
  const [frequency, setFrequency] = useState<PaymentFrequency>('DAILY');
  const [totalSlots, setTotalSlots] = useState('12');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatically recalculate end date when startDate, totalSlots or frequency change
  useEffect(() => {
    const slots = parseInt(totalSlots, 10) || 1;
    const computedEnd = calculateCycleEndDate(startDate, slots, frequency);
    setEndDate(computedEnd);
  }, [startDate, totalSlots, frequency]);

  const handleTypeChange = (type: BusinessType) => {
    triggerLightImpact();
    setBusinessType(type);
    if (type === 'SABOTAY') {
      setName('Sabotay Marché Cluny 2026');
      setContributionAmount('250');
      setFrequency('DAILY');
    } else {
      setName('Sol Marché Salomon #1');
      setContributionAmount('1000');
      setFrequency('WED_SAT');
    }
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

    const numSlots = parseInt(totalSlots, 10);
    if (isNaN(numSlots) || numSlots <= 0) {
      Alert.alert(t('Nombre de membres invalide'), t('Le nombre de participants doit être supérieur à 0.'));
      return;
    }

    setIsSubmitting(true);
    try {
      await saveBusinessConfig({
        collectorId: '',
        name: name.trim(),
        type: businessType,
        contributionAmount: numAmount,
        frequency,
        totalSlots: numSlots,
        startDate: startDate || todayStr,
        endDate: endDate || todayStr,
        status: 'ACTIVE',
      });

      triggerSuccessFeedback();
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      Alert.alert(t('Erreur'), err?.message || t('Impossible d\'enregistrer la configuration.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedDays = calculateCycleTotalDays(parseInt(totalSlots, 10) || 1, frequency);
  const estimatedPot = (Number(contributionAmount) || 0) * (parseInt(totalSlots, 10) || 0);

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
            label={isSubmitting ? t('Enregistrement…') : t('Valider et lancer l\'activité')}
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

        {/* Basic Parameters */}
        <View style={styles.section}>
          <SectionHeader title={t('2. Paramètres du carnet')} />
          <Card style={styles.fieldsCard}>
            <TextField
              label={t('Nom du groupe ou du carnet *')}
              placeholder={t('Ex : Sabotay Marché Cluny 2026')}
              value={name}
              onChangeText={setName}
            />
            <TextField
              label={t('Cotisation par main (HTG) *')}
              placeholder={t('Ex : 250')}
              value={contributionAmount}
              onChangeText={setContributionAmount}
              keyboardType="numeric"
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
                  onPress={() => {
                    triggerLightImpact();
                    setFrequency(opt.key);
                  }}
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
              label={t('Capacité initiale estimée (optionnelle)')}
              placeholder={t('Ex : 10')}
              value={totalSlots}
              onChangeText={setTotalSlots}
              keyboardType="number-pad"
              helper={t('Le nombre de mains n\'est pas figé : chaque enfant inscrit ajoute les mains qu\'il souscrit (ex : 3 enfants d\'1 main + 1 enfant de 3 mains = 4 enfants et 6 mains).')}
            />
            <TextField
              label={t('Date de début du cycle *')}
              placeholder={t('AAAA-MM-JJ')}
              value={startDate}
              onChangeText={setStartDate}
              helper={t('Format AAAA-MM-JJ')}
            />
          </Card>

          <Card tone="sunken" style={styles.computedCard}>
            <View style={styles.computedHead}>
              <Icon name="calendar" size={18} color={theme.colors.primary} />
              <Text variant="label" tone="primary">{t('Durée du cycle et date de fin')}</Text>
            </View>
            <Text variant="heading">{t('{0} jours de cycle estimés', estimatedDays)}</Text>
            <Text variant="caption" tone="muted">{t('S\'ajustera au nombre effectif de mains souscrites par les enfants.')}</Text>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text variant="body" tone="muted" style={styles.flexShrink}>{t('Fin prévisionnelle')}</Text>
              <Text variant="bodyStrong">{formatDateShort(endDate)}</Text>
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
