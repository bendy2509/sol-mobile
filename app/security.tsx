import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, Card, Chip, Dialog, Icon, ListItem, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { useAuth } from '@/context/AuthContext';
import { exportEncryptedBackup } from '@/services/backupService';
import { MIN_BACKUP_PASSWORD_LENGTH } from '@/services/backupCrypto';
import { AUTO_LOCK_OPTIONS_MIN } from '@/services/securityService';
import { setPendingRecoveryCode } from '@/services/pendingSecret';
import { triggerErrorFeedback, triggerLightImpact, triggerSuccessFeedback } from '@/lib/haptics';
import { Theme, useTheme } from '@/theme';

/** Manager's own security: biometrics, auto-lock, recovery code and encrypted backup. */
export default function SecurityScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const {
    activeCollector,
    biometricAvailable,
    biometricEnabled,
    setBiometricEnabled,
    autoLockMinutes,
    setAutoLockMinutes,
    regenerateRecoveryCode,
  } = useAuth();

  const [isPinOpen, setIsPinOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const toggleBiometrics = async (value: boolean) => {
    const res = await setBiometricEnabled(value);
    if (!res.success && res.error) Alert.alert('Biométrie', res.error);
  };

  const handleExport = async () => {
    setExportError(null);
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
      return setExportError(`Choisissez un mot de passe d'au moins ${MIN_BACKUP_PASSWORD_LENGTH} caractères.`);
    }
    if (password !== confirm) return setExportError('Les deux mots de passe ne correspondent pas.');
    if (!activeCollector) return;
    setExporting(true);
    setTimeout(async () => {
      try {
        const fileName = await exportEncryptedBackup(activeCollector.id, password);
        triggerSuccessFeedback();
        setIsExportOpen(false);
        setPassword('');
        setConfirm('');
        Alert.alert('Sauvegarde créée', `${fileName}\n\nConservez ce fichier et son mot de passe : sans le mot de passe, il est illisible.`);
      } catch (e: any) {
        triggerErrorFeedback();
        setExportError(e?.message || "Échec de l'export.");
      } finally {
        setExporting(false);
      }
    }, 30);
  };

  return (
    <Screen edges={['left', 'right', 'bottom']} contentStyle={styles.content}>
      <View style={styles.section}>
        <SectionHeader title="Déverrouillage" />
        <Card padding="none" style={styles.list}>
          <ListItem
            title="Empreinte ou visage"
            subtitle={biometricAvailable ? 'Ouvrir l’app sans saisir le code PIN' : 'Non disponible sur ce téléphone'}
            leading={<Icon name="fingerprint" size={22} color={theme.colors.textMuted} />}
            trailing={
              <Switch
                value={biometricEnabled}
                disabled={!biometricAvailable}
                onValueChange={toggleBiometrics}
                trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
                accessibilityLabel="Déverrouillage biométrique"
              />
            }
          />
          <View style={styles.lockBlock}>
            <Text variant="bodyStrong">Verrouillage automatique</Text>
            <Text variant="caption" tone="muted">
              Après cette durée sans utilisation, le code PIN est redemandé.
            </Text>
            <View style={styles.chips}>
              {AUTO_LOCK_OPTIONS_MIN.map((m) => (
                <Chip key={m} label={`${m} min`} selected={autoLockMinutes === m} onPress={() => setAutoLockMinutes(m)} />
              ))}
            </View>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Code de récupération" />
        <Card style={styles.card}>
          <Text variant="body" tone="muted">
            Il remplace l'administrateur : c'est le seul moyen de choisir un nouveau PIN si vous oubliez le vôtre.
          </Text>
          <Button
            variant="secondary"
            icon="key"
            label="Générer un nouveau code"
            onPress={() => {
              triggerLightImpact();
              setIsPinOpen(true);
            }}
            accessibilityHint="Demande votre code PIN. L'ancien code ne fonctionnera plus."
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Sauvegarde chiffrée" />
        <Card style={styles.card}>
          <Text variant="body" tone="muted">
            Un fichier protégé par mot de passe (AES-256) avec tout votre carnet : adhérents, opérations, clôtures et cycles.
          </Text>
          <Button icon="download" label="Créer une sauvegarde" onPress={() => setIsExportOpen(true)} />
          <Button variant="secondary" icon="upload" label="Restaurer une sauvegarde" onPress={() => router.push('/restore-backup' as any)} />
        </Card>
      </View>

      <Dialog
        visible={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Mot de passe de la sauvegarde"
        subtitle="Il sera demandé pour restaurer. Il n'est enregistré nulle part : notez-le."
        icon="lock"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsExportOpen(false)} style={styles.flexGrow} />
            <Button label="Chiffrer et exporter" loading={exporting} onPress={handleExport} style={styles.flexGrow} />
          </>
        }
      >
        {exportError && (
          <Card tone="danger" padding="sm">
            <Text variant="label" tone="danger">
              {exportError}
            </Text>
          </Card>
        )}
        <TextField label="Mot de passe" secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
        <TextField label="Confirmer le mot de passe" secureTextEntry autoCapitalize="none" value={confirm} onChangeText={setConfirm} />
      </Dialog>

      <PinVerificationModal
        visible={isPinOpen}
        title="Nouveau code de récupération"
        subtitle="Saisissez votre code PIN. L'ancien code de récupération ne fonctionnera plus."
        onSuccess={async () => {
          setIsPinOpen(false);
          setPendingRecoveryCode(await regenerateRecoveryCode());
          router.push('/recovery-code' as any);
        }}
        onCancel={() => setIsPinOpen(false)}
      />
    </Screen>
  );
}

const createStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    content: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    section: { gap: spacing.md },
    list: { overflow: 'hidden' },
    card: { gap: spacing.md },
    lockBlock: { gap: spacing.xs, padding: spacing.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  });
