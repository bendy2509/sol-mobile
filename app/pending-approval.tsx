import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { AmountText, Button, Card, Icon, Screen, Text } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { activeCollector, userSession, approveAccount, refreshSession, logout } = useAuth();
  const { horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [isChecking, setIsChecking] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const handleCheckStatus = async () => {
    triggerLightImpact();
    setIsChecking(true);
    try {
      await refreshSession();
      if (activeCollector?.status === 'ACTIVE') {
        triggerSuccessFeedback();
        router.replace('/(tabs)' as any);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleSimulateAdminApproval = async () => {
    triggerMediumImpact();
    setIsApproving(true);
    try {
      await approveAccount(activeCollector?.id);
      triggerSuccessFeedback();
      router.replace('/(tabs)' as any);
    } finally {
      setIsApproving(false);
    }
  };

  const handleLogout = async () => {
    triggerLightImpact();
    await logout();
    router.replace('/login' as any);
  };

  const unitAmount = userSession?.unitAmount || 250;
  const totalSlots = userSession?.totalSlots || 10;
  const details: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Gestionnaire', value: activeCollector?.fullName || userSession?.fullName || 'Non spécifié' },
    { label: 'Téléphone', value: activeCollector?.phoneNumber || userSession?.phoneNumber || 'Non spécifié' },
    { label: 'Activité SOL', value: userSession?.businessName || 'Sol Mache Klnik', highlight: true },
    { label: 'Type de carnet', value: userSession?.businessType === 'SOL' ? 'Sol (rotatif)' : 'Sabotay (quotidien)' },
    { label: 'Main unitaire', value: formatCurrency(unitAmount) },
    { label: 'Enfants prévus', value: `${totalSlots} enfants` },
  ];

  return (
    <Screen
      edges={['top', 'left', 'right']}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button size="lg" fullWidth icon="cycle" loading={isChecking} disabled={isChecking} label="Actualiser mon statut" onPress={handleCheckStatus} />
          <Button variant="ghost" fullWidth icon="logout" label="Changer de compte" accessibilityLabel="Se déconnecter et changer de compte" onPress={handleLogout} />
        </View>
      }
    >
      {/* Pending status */}
      <View style={styles.hero}>
        <View style={[styles.disc, styles.discWarning]}>
          <Icon name="clock" size={32} color={theme.colors.warning} />
        </View>
        <View style={styles.pill}>
          <Text variant="label" tone="warning">
            En attente d'approbation
          </Text>
        </View>
        <Text variant="title" align="center" accessibilityRole="header">
          Compte en cours de validation
        </Text>
        <Text variant="body" tone="muted" align="center">
          Votre demande d'inscription et le paramétrage de votre activité ont été enregistrés avec succès.
        </Text>
      </View>

      {/* Account & Business Summary Card */}
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="shield" size={16} color={theme.colors.primary} />
          <Text variant="label" tone="primary">
            Détails du compte enregistré
          </Text>
        </View>
        {details.map((d) => (
          <View key={d.label} style={styles.row}>
            <Text variant="body" tone="muted">
              {d.label}
            </Text>
            <Text variant="bodyStrong" tone={d.highlight ? 'primary' : 'default'} align="right" style={styles.value}>
              {d.value}
            </Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text variant="bodyStrong">Cagnotte par ramassage</Text>
          <AmountText amount={unitAmount * totalSlots} size="medium" tone="primary" />
        </View>
      </Card>

      {/* Explanatory Notice */}
      <Card tone="sunken" padding="sm">
        <View style={styles.notice}>
          <Icon name="info" size={18} color={theme.colors.textMuted} />
          <Text variant="caption" tone="muted" style={styles.flexShrink}>
            Pour des raisons de sécurité financière sur les marchés, chaque carnet ou SOL doit être validé par un administrateur avant l'ouverture des encaissements.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
    footer: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: spacing.xs },

    hero: { alignItems: 'center', gap: spacing.sm },
    disc: {
      width: layout.touchTarget + spacing.xl,
      height: layout.touchTarget + spacing.xl,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    discWarning: { backgroundColor: colors.warningSoft },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.warningLine,
      backgroundColor: colors.warningSoft,
    },

    card: { gap: spacing.sm },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    value: { flex: 1, minWidth: 0 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  });
