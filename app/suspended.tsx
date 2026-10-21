import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/context/AuthContext';
import { Button, Card, Icon, Screen, Text } from '@/components/ui';
import { getActiveCollector } from '@/db/sqlite';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

export default function SuspendedScreen() {
  const router = useRouter();
  const { logout, refreshSession, activeCollector } = useAuth();
  const { horizontalPadding } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [adminName, setAdminName] = useState('Administration SOL');
  const [adminPhone, setAdminPhone] = useState('+50900000000');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    async function loadAdminContact() {
      const name = (await AsyncStorage.getItem('SOL_ADMIN_NAME')) || 'Superviseur Général SOL';
      const phone = (await AsyncStorage.getItem('SOL_ADMIN_PHONE')) || '+50900000000';
      setAdminName(name);
      setAdminPhone(phone);
    }
    loadAdminContact();
  }, []);

  const handleCallAdmin = () => {
    triggerLightImpact();
    const cleanNumber = adminPhone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Contact', `Veuillez appeler l'administration au ${adminPhone}`);
    });
  };

  const handleWhatsAppAdmin = () => {
    triggerLightImpact();
    const digitsOnly = adminPhone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${digitsOnly}`).catch(() => {
      Alert.alert('WhatsApp', `Veuillez contacter le numéro ${adminPhone} sur WhatsApp.`);
    });
  };

  const handleCheckStatus = async () => {
    triggerMediumImpact();
    setIsChecking(true);
    try {
      await refreshSession();
      const current = await getActiveCollector();

      if (current && current.status === 'ACTIVE') {
        triggerSuccessFeedback();
        Alert.alert('Compte Réactivé !', 'Votre compte a été réactivé par l\'administration.', [
          {
            text: 'Accéder à mon espace',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]);
      } else if (current && current.status === 'PENDING_APPROVAL') {
        triggerLightImpact();
        router.replace('/pending-approval' as any);
      } else {
        triggerErrorFeedback();
        Alert.alert(
          'Toujours Suspendu',
          'Votre compte est toujours suspendu. Veuillez contacter l\'administrateur pour débloquer votre accès.'
        );
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de vérifier le statut. Vérifiez votre connexion.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    triggerLightImpact();
    await logout();
    router.replace('/login' as any);
  };

  const restrictions = [
    'Encaissements et collectes de cotisations bloqués',
    'Décaissements et remises de mains ("Bay Men") verrouillés',
    "Ajout et modification d'adhérents interdits",
  ];

  return (
    <Screen
      edges={['top', 'left', 'right']}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button
            size="lg"
            fullWidth
            icon="cycle"
            loading={isChecking}
            disabled={isChecking}
            label={isChecking ? 'Vérification en cours…' : 'Actualiser mon statut'}
            onPress={handleCheckStatus}
          />
          <Button variant="ghost" fullWidth icon="logout" label="Se déconnecter" onPress={handleLogout} />
        </View>
      }
    >
      {/* Suspended status */}
      <View style={styles.hero}>
        <View style={styles.disc}>
          <Icon name="shield" size={36} color={theme.colors.danger} />
        </View>
        <Text variant="title" tone="danger" align="center" accessibilityRole="header">
          Compte suspendu
        </Text>
        <Text variant="body" tone="muted" align="center">
          L'accès de votre compte gestionnaire a été temporairement suspendu par l'administration générale de la plateforme SOL.
        </Text>
      </View>

      {/* Security Restrictions Box */}
      <Card tone="danger" style={styles.card}>
        <Text variant="label" tone="danger">
          Restrictions en vigueur
        </Text>
        {restrictions.map((r) => (
          <View key={r} style={styles.restriction}>
            <Icon name="lock" size={16} color={theme.colors.danger} />
            <Text variant="body" style={styles.flexShrink}>
              {r}
            </Text>
          </View>
        ))}
      </Card>

      {/* Administrator Contact Info */}
      <Card style={styles.card}>
        <Text variant="label" tone="muted">
          Contacter l'administration pour déblocage
        </Text>
        <Text variant="heading">{adminName}</Text>
        <Text variant="amount" tone="primary">
          {adminPhone}
        </Text>
        <View style={styles.contactRow}>
          <Button variant="secondary" icon="phone" label="Appeler" onPress={handleCallAdmin} style={styles.flexOne} />
          <Button variant="secondary" icon="message" label="WhatsApp" onPress={handleWhatsAppAdmin} style={styles.flexOne} />
        </View>
      </Card>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexOne: { flex: 1 },
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
      backgroundColor: colors.dangerSoft,
    },

    card: { gap: spacing.sm },
    restriction: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    contactRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  });
