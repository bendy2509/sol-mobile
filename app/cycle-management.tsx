import React, { useState, useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { AmountText, Button, Card, Chip, Dialog, EmptyState, Icon, MetricTile, Screen, SectionHeader, Text, TextField, UiIconName } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig, renewSolCycle, getClosedCycles } from '@/db/businessRepository';
import { getMembersWithPaymentStatus } from '@/db/memberRepository';
import { generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';
import { BusinessConfig, ClosedCycle, Member, PaymentFrequency } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerErrorFeedback, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

type CycleMode = 'RENEW_SAME_MEMBERS' | 'START_FRESH' | null;

export default function CycleManagementScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  // Closed Cycles History State
  const [closedCycles, setClosedCycles] = useState<ClosedCycle[]>([]);
  const [downloadingCycleId, setDownloadingCycleId] = useState<string | null>(null);

  // Editable new cycle params
  const [newCycleName, setNewCycleName] = useState('');
  const [newContribution, setNewContribution] = useState('');
  const [newFrequency, setNewFrequency] = useState<PaymentFrequency>('DAILY');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [biz, mems, pastCycles] = await Promise.all([
          getActiveBusinessConfig(),
          getMembersWithPaymentStatus(),
          getClosedCycles(activeCollector?.id).catch(() => []),
        ]);
        setBusiness(biz);
        setMembers(mems);
        setClosedCycles(pastCycles);
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
  }, [activeCollector?.id]);

  const handleDownloadClosedCyclePdf = async (cycle: ClosedCycle) => {
    setDownloadingCycleId(cycle.id);
    try {
      let pdfData: any = null;
      if (cycle.snapshotData) {
        try {
          pdfData = JSON.parse(cycle.snapshotData);
        } catch (parseErr) {
          console.warn('Failed to parse snapshotData:', parseErr);
        }
      }

      if (!pdfData) {
        pdfData = {
          businessName: cycle.businessName,
          collectorName: activeCollector?.fullName || 'Responsable SOL',
          collectorPhone: activeCollector?.phoneNumber || '',
          collectorZone: activeCollector?.zone,
          unitAmount: cycle.unitAmount,
          totalSlots: cycle.totalSlots,
          registeredChildrenCount: cycle.membersCount,
          totalPotAmount: cycle.totalPot,
          cycleStartDate: cycle.startDate,
          cycleEndDate: cycle.endDate,
          cycleNumber: cycle.cycleNumber,
          handsCollectedTotal: cycle.totalHands,
          totalCashCollected: cycle.totalCollected,
          totalDistributed: cycle.totalDistributed,
          netReserveBalance: cycle.netReserve,
          completionRate: cycle.completionRate,
          members: [],
          generatedAt: new Date().toISOString(),
        };
      }

      const pdfUri = await generateManagerBusinessReportPdf(pdfData);
      await sharePdfFile(pdfUri, `Bilan_Cycle_${cycle.cycleNumber}_${cycle.businessName}`);
      triggerSuccessFeedback();
    } catch (err: any) {
      console.error('Download cycle PDF error:', err);
      triggerErrorFeedback();
      Alert.alert('Erreur', 'Impossible de générer le rapport PDF du cycle.');
    } finally {
      setDownloadingCycleId(null);
    }
  };

  const isManager = userRole === 'MANAGER';

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

  const screenHeader = (
    <Header
      title="Gestion du cycle"
      subtitle="Clôture et réouverture"
      showBack={true}
      showScanner={false}
      fallbackBackRoute="/(tabs)/sol"
    />
  );

  if (isLoading) {
    return (
      <Screen scroll={false} edges={['top', 'left', 'right', 'bottom']} header={screenHeader}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyStrong">Chargement du carnet actif…</Text>
        </View>
      </Screen>
    );
  }

  if (!business) {
    return (
      <Screen scroll={false} edges={['top', 'left', 'right', 'bottom']} header={screenHeader}>
        <View style={styles.centered}>
          <EmptyState
            icon="alert"
            title="Aucun carnet actif"
            message="Créez d'abord un SOL ou un Sabotay pour accéder à la gestion du cycle."
          />
        </View>
      </Screen>
    );
  }

  const modeOptions: {
    mode: Exclude<CycleMode, null>;
    title: string;
    description: string;
    icon: UiIconName;
    danger: boolean;
    details: { ok: boolean; text: string }[];
  }[] = [
    {
      mode: 'RENEW_SAME_MEMBERS',
      title: 'Conserver les adhérents',
      description: `Les ${members.length} membres passent dans le nouveau cycle avec leurs comptes remis à zéro.`,
      icon: 'cycle',
      danger: false,
      details: [
        { ok: true, text: 'Nom, téléphone et nombre de mains conservés' },
        { ok: true, text: 'Soldes, cotisations et mains remises remis à 0' },
        { ok: true, text: 'Rangs de décaissement conservés (modifiables ensuite)' },
        { ok: false, text: 'Vous pourrez supprimer ensuite les adhérents qui ne participent plus' },
      ],
    },
    {
      mode: 'START_FRESH',
      title: 'Démarrer à zéro',
      description: 'La liste des adhérents est entièrement vidée. Nouveau départ.',
      icon: 'trash',
      danger: true,
      details: [
        { ok: false, text: `Les ${members.length} adhérents seront retirés du nouveau cycle` },
        { ok: true, text: "L'historique des transactions reste intact pour l'audit" },
        { ok: true, text: 'La liste sera vide, prête pour de nouveaux inscrits' },
      ],
    },
  ];
  const isFresh = selectedMode === 'START_FRESH';

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} header={screenHeader}>
      {/* Current cycle */}
      <Card style={styles.cardGap}>
        <Text variant="caption" tone="muted">
          Cycle actuel
        </Text>
        <Text variant="heading">{business.name}</Text>
        <View style={styles.metricsRow}>
          <MetricTile label="Adhérents" icon="users" value={String(members.length)} />
          <MetricTile label="Par main" icon="cash" value={formatCurrency(business.contributionAmount)} />
          <MetricTile label="Fin prévue" icon="calendar" value={business.endDate ? formatDateShort(business.endDate) : '—'} />
        </View>
      </Card>

      {/* Reopening options */}
      <SectionHeader title="Option de réouverture" />
      {modeOptions.map((opt) => {
        const selected = selectedMode === opt.mode;
        const accent = opt.danger ? theme.colors.danger : theme.colors.primary;
        return (
          <Pressable
            key={opt.mode}
            onPress={() => handleSelectMode(opt.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${opt.title}. ${opt.description}`}
            style={({ pressed }) => [
              styles.modeCard,
              pressed && styles.pressed,
              selected && { borderColor: accent, borderWidth: 2, backgroundColor: opt.danger ? theme.colors.dangerSoft : theme.colors.primarySoft },
            ]}
          >
            <View style={styles.modeHeader}>
              <View style={[styles.modeIcon, { backgroundColor: opt.danger ? theme.colors.dangerSoft : theme.colors.primarySoft }]}>
                <Icon name={opt.icon} size={22} color={accent} />
              </View>
              <View style={styles.flexShrink}>
                <Text variant="subheading" style={selected ? { color: accent } : undefined}>
                  {opt.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {opt.description}
                </Text>
              </View>
              <View style={[styles.radio, selected && { borderColor: accent }]}>
                {selected && <View style={[styles.radioDot, { backgroundColor: accent }]} />}
              </View>
            </View>

            {selected && (
              <View style={styles.modeDetails}>
                {opt.details.map((d) => (
                  <View key={d.text} style={styles.detailLine}>
                    <Icon
                      name={d.ok ? 'check' : 'alert'}
                      size={16}
                      color={d.ok ? theme.colors.success : opt.danger ? theme.colors.danger : theme.colors.warning}
                    />
                    <Text
                      variant="caption"
                      tone={d.ok ? 'default' : opt.danger ? 'danger' : 'warning'}
                      style={styles.flexShrink}
                    >
                      {d.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}

      {/* New cycle settings */}
      {selectedMode && (
        <Card style={styles.cardGap}>
          <Text variant="subheading" accessibilityRole="header">
            Paramètres du nouveau cycle
          </Text>
          <TextField
            label="Nom du sol / carnet"
            value={newCycleName}
            onChangeText={setNewCycleName}
            placeholder={`Ex : ${business.name} — cycle 2`}
            maxLength={60}
          />
          <TextField
            label="Valeur d'une main (HTG)"
            value={newContribution}
            onChangeText={setNewContribution}
            keyboardType="numeric"
            placeholder="Ex : 250"
          />
          <Text variant="label">Fréquence de cotisation</Text>
          <View style={styles.chipsWrap}>
            {frequencyOptions.map((opt) => (
              <Chip key={opt.value} label={opt.label} selected={newFrequency === opt.value} onPress={() => setNewFrequency(opt.value)} />
            ))}
          </View>
        </Card>
      )}

      {selectedMode && (
        <>
          <Card tone="warning">
            <View style={styles.detailLine}>
              <Icon name="alert" size={20} color={theme.colors.warning} />
              <Text variant="body" tone="warning" style={styles.flexShrink}>
                Action irréversible : le cycle actuel sera archivé. L'historique des transactions est conservé pour l'audit.
              </Text>
            </View>
          </Card>
          <Button
            size="lg"
            fullWidth
            icon="lock"
            variant={isFresh ? 'danger' : 'primary'}
            loading={isProcessing}
            label={isFresh ? 'Démarrer à zéro (PIN requis)' : 'Rouvrir avec les mêmes membres (PIN)'}
            onPress={handleOpenConfirm}
          />
        </>
      )}

      {/* Closed cycles archive */}
      <SectionHeader title="Cycles clôturés" count={closedCycles.length} />
      <Text variant="caption" tone="muted">
        Chaque cycle clôturé est archivé avec son bilan financier, téléchargeable en PDF à tout moment.
      </Text>
      {closedCycles.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon="history"
            title="Aucun cycle archivé"
            message="Dès que vous clôturez ou renouvelez un cycle, ses données financières et la liste des participants sont archivées ici."
          />
        </Card>
      ) : (
        closedCycles.map((cycle) => {
          const isDownloading = downloadingCycleId === cycle.id;
          return (
            <Card key={cycle.id} style={styles.cardGap}>
              <View style={styles.rowBetween}>
                <View style={styles.flexShrink}>
                  <Text variant="subheading">Cycle #{cycle.cycleNumber}</Text>
                  <Text variant="caption" tone="muted">
                    {cycle.businessName}
                  </Text>
                </View>
                <View style={styles.archivedChip}>
                  <Icon name="lock" size={14} color={theme.colors.locked} />
                  <Text variant="label" tone="locked">
                    Archivé
                  </Text>
                </View>
              </View>
              <View style={styles.periodRow}>
                <Icon name="calendar" size={14} color={theme.colors.textMuted} />
                <Text variant="caption" tone="muted">
                  {formatDateShort(cycle.startDate)} → {formatDateShort(cycle.closedAt || cycle.endDate)}
                </Text>
              </View>
              <View style={styles.statsGrid}>
                <View style={styles.statCell}>
                  <Text variant="caption" tone="muted">
                    Cotisation
                  </Text>
                  <AmountText amount={cycle.unitAmount} size="small" />
                </View>
                <View style={styles.statCell}>
                  <Text variant="caption" tone="muted">
                    Membres / mains
                  </Text>
                  <Text variant="amountSmall">
                    {cycle.membersCount} / {cycle.totalHands}
                  </Text>
                </View>
                <View style={styles.statCell}>
                  <Text variant="caption" tone="muted">
                    Total collecté
                  </Text>
                  <AmountText amount={cycle.totalCollected} size="small" tone="success" />
                </View>
                <View style={styles.statCell}>
                  <Text variant="caption" tone="muted">
                    Total remis
                  </Text>
                  <AmountText amount={cycle.totalDistributed} size="small" tone="primary" />
                </View>
              </View>
              <Button
                label="Bilan PDF"
                icon="printer"
                variant="secondary"
                fullWidth
                loading={isDownloading}
                onPress={() => handleDownloadClosedCyclePdf(cycle)}
              />
            </Card>
          );
        })
      )}

      {/* Confirmation */}
      <Dialog
        visible={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirmer la clôture ?"
        icon="alert"
        tone={isFresh ? 'danger' : 'primary'}
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsConfirmModalOpen(false)} style={styles.flexGrow} />
            <Button
              label="Continuer (PIN)"
              variant={isFresh ? 'danger' : 'primary'}
              onPress={() => {
                setIsConfirmModalOpen(false);
                setIsPinModalOpen(true);
              }}
              style={styles.flexGrow}
            />
          </>
        }
      >
        <Text variant="body">
          {selectedMode === 'RENEW_SAME_MEMBERS'
            ? `Le cycle « ${business.name} » va être archivé et ${members.length} adhérent(s) seront copiés dans le nouveau cycle « ${newCycleName} » avec leurs soldes à zéro.`
            : `Le cycle « ${business.name} » va être archivé et les ${members.length} adhérent(s) seront retirés. La liste sera vide.`}
        </Text>
        <Text variant="bodyStrong" tone="danger">
          Cette action est irréversible.
        </Text>
      </Dialog>

      {/* PIN Validation Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title="Validation de la Clôture"
        subtitle={`Saisissez votre code PIN gestionnaire pour confirmer la clôture du cycle "${business?.name}" et l'ouverture du nouveau cycle "${newCycleName}".`}
        onSuccess={handlePinSuccess}
        onCancel={() => setIsPinModalOpen(false)}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    flexShrink: { flex: 1, minWidth: 0 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    pressed: { backgroundColor: colors.surfacePressed },
    cardGap: { gap: spacing.sm },
    rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
    metricsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },

    modeCard: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    modeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    modeIcon: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radio: {
      width: spacing.xl,
      height: spacing.xl,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: { width: spacing.md, height: spacing.md, borderRadius: radius.pill },
    modeDetails: {
      gap: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },

    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    archivedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: spacing.xxl,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.lockedLine,
      backgroundColor: colors.lockedSoft,
    },
    periodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    statCell: {
      flexBasis: '47%',
      flexGrow: 1,
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
  });
