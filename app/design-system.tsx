import React from 'react';
import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import {
  AmountText,
  Avatar,
  Button,
  Card,
  EmptyState,
  ListItem,
  MetricTile,
  Screen,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/components/ui';
import { useTheme, useThemePreference } from '@/theme';

/**
 * Dev-only catalogue of the design system (theme/ + components/ui/).
 * Open /design-system in a development build or on web to review components in light and dark.
 */
export default function DesignSystemScreen() {
  const theme = useTheme();
  const { colors, spacing, brand } = theme;
  const { setPreference } = useThemePreference();

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Design system',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: theme.fonts.bold },
        }}
      />
      <Screen
        footer={<Button label="Encaisser une cotisation" icon="cash" size="lg" fullWidth haptic />}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Clair" variant="secondary" onPress={() => setPreference('light')} style={{ flex: 1 }} />
          <Button label="Sombre" variant="secondary" onPress={() => setPreference('dark')} style={{ flex: 1 }} />
          <Button label="Système" variant="ghost" onPress={() => setPreference('system')} />
        </View>

        <View style={{ flexDirection: 'row', height: 3 }}>
          <View style={{ flex: 1, backgroundColor: brand.haitiBlue }} />
          <View style={{ flex: 1, backgroundColor: brand.haitiRed }} />
        </View>

        <Card tone="hero" padding="lg">
          <Text variant="caption" tone="onHeroMuted">
            Cagnotte du tour 2 sur 4
          </Text>
          <AmountText amount={1000} size="hero" tone="onHero" />
          <Text variant="caption" tone="onHeroMuted">
            4 mains × 250 HTG
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <MetricTile label="Encaissé" value="750 HTG" icon="cash" />
          <MetricTile label="À jour" value="3 / 4" tone="success" />
          <MetricTile label="En retard" value="1" tone="danger" icon="alert" />
        </View>

        <SectionHeader title="Statuts" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatusBadge status="PAID_TODAY" />
          <StatusBadge status="PAID_IN_ADVANCE" detail="2 tours" />
          <StatusBadge status="UNPAID_TODAY" />
          <StatusBadge status="OVERDUE" detail="1 tour" />
          <StatusBadge status="UPCOMING_PAYOUT" />
          <StatusBadge status="HAND_RECEIVED" detail="2/3 mains" />
          <StatusBadge status="LOCKED" />
        </View>

        <SectionHeader title="Boutons" />
        <Button label="Encaisser" icon="cash" />
        <Button label="Reçu PDF" icon="printer" variant="secondary" />
        <Button label="Annuler l'opération" icon="trash" variant="danger" />
        <Button label="Contacter l'administrateur" icon="phone" variant="ghost" />
        <Button label="Annuler" locked lockedLabel="Cycle clôturé · admin seul" />
        <Button label="Plafond atteint" disabled />
        <Button label="Validation…" loading />

        <SectionHeader title="Adhérents" count={3} action={{ label: 'Ordre des rangs', onPress: () => {} }} />
        <Card padding="none">
          <ListItem
            leading={<Avatar rank={1} />}
            title="Marie-Carmel Joseph"
            meta={<StatusBadge status="HAND_RECEIVED" appearance="inline" />}
            trailing={<AmountText amount={2500} size="small" />}
            onPress={() => {}}
          />
          <ListItem
            leading={<Avatar rank={2} highlighted />}
            title="Jean-Robert Estimé"
            meta={<StatusBadge status="PAID_TODAY" appearance="inline" />}
            trailing={<AmountText amount={1750} size="small" />}
            onPress={() => {}}
          />
          <ListItem
            leading={<Avatar name="Dieula Saint-Juste" />}
            title="Dieula Saint-Juste"
            meta={<StatusBadge status="OVERDUE" detail="1 tour" appearance="inline" />}
            trailing={<AmountText amount={750} size="small" />}
            divider={false}
            onPress={() => {}}
          />
        </Card>

        <SectionHeader title="Montants" />
        <Card>
          <AmountText amount={250} sign="credit" tone="success" />
          <AmountText amount={1000} sign="debit" tone="danger" />
          <AmountText amount={0} sign="debit" tone="danger" />
        </Card>

        <Card padding="none">
          <EmptyState
            icon="users"
            title="Aucun adhérent pour l'instant"
            message="Ajoutez les enfants du sol pour démarrer la collecte."
            action={{ label: 'Ajouter un adhérent', icon: 'plus' }}
          />
        </Card>

        <Card tone="supervisor">
          <Text variant="subheading" style={{ color: colors.supervisor }}>
            Mode superviseur
          </Text>
          <Text variant="body" tone="muted">
            Ton réservé à l'administrateur.
          </Text>
        </Card>
      </Screen>
    </>
  );
}
