import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Button, Card, Icon, Screen, Text, TextField } from '@/components/ui';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { useAuth } from '@/context/AuthContext';
import { getDatabase } from '@/db/sqlite';
import { BackupEnvelope } from '@/services/backupCrypto';
import { BackupSummary, pickBackupFile, previewBackup, restoreEncryptedBackup } from '@/services/backupService';
import { formatDate } from '@/lib/formatters';
import { triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Restore an encrypted .solbak file: pick it, unlock it with its password, check what it
 * contains, then write it. From an open session the manager's PIN is also required.
 */
export default function RestoreBackupScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { isAuthenticated, refreshSession } = useAuth();

  const [envelope, setEnvelope] = useState<BackupEnvelope | null>(null);
  const [password, setPassword] = useState('');
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPinOpen, setIsPinOpen] = useState(false);

  const fail = (message: string) => {
    triggerErrorFeedback();
    setError(message);
  };

  const handlePick = async () => {
    setError(null);
    setSummary(null);
    try {
      const picked = await pickBackupFile();
      if (picked) setEnvelope(picked);
    } catch (e: any) {
      fail(e?.message || t('Fichier illisible.'));
    }
  };

  const handleUnlock = async () => {
    if (!envelope) return;
    setError(null);
    setBusy(true);
    // Let the spinner render before the key derivation blocks the JS thread
    setTimeout(() => {
      try {
        setSummary(previewBackup(envelope, password));
      } catch (e: any) {
        fail(e?.message || t('Déchiffrement impossible.'));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const doRestore = async () => {
    if (!envelope) return;
    setBusy(true);
    try {
      const collectorId = await restoreEncryptedBackup(envelope, password);
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ phone_number: string }>(`SELECT phone_number FROM collectors WHERE id = ?`, [collectorId]);
      if (row?.phone_number) await AsyncStorage.setItem('SOL_LAST_PHONE', row.phone_number);
      triggerSuccessFeedback();
      if (isAuthenticated) {
        await refreshSession();
        router.replace('/(tabs)' as any);
      } else {
        router.replace('/login' as any);
      }
    } catch (e: any) {
      fail(e?.message || t('Restauration impossible.'));
    } finally {
      setBusy(false);
    }
  };

  const footer = !envelope ? (
    <Button size="lg" fullWidth icon="upload" label={t('Choisir le fichier .solbak')} onPress={handlePick} />
  ) : !summary ? (
    <Button size="lg" fullWidth icon="lock" label={t('Déverrouiller')} loading={busy} disabled={password.length === 0} onPress={handleUnlock} />
  ) : (
    <Button
      size="lg"
      fullWidth
      icon="download"
      label={t('Restaurer ces données')}
      loading={busy}
      onPress={() => (isAuthenticated ? setIsPinOpen(true) : doRestore())}
    />
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
      <Screen edges={['left', 'right']} contentStyle={styles.content} footer={footer}>
        <Text variant="body" tone="muted">{t('Choisissez une sauvegarde chiffrée créée depuis SOL Mobile, puis saisissez son mot de passe. Les données du fichier remplacent celles du même carnet sur ce téléphone.')}</Text>

        {error && (
          <Card tone="danger" padding="sm">
            <View style={styles.row}>
              <Icon name="alert" size={16} color={theme.colors.danger} />
              <Text variant="label" tone="danger" style={styles.flexShrink}>
                {error}
              </Text>
            </View>
          </Card>
        )}

        {envelope && (
          <Card style={styles.card}>
            <View style={styles.row}>
              <Icon name="file" size={20} color={theme.colors.primary} />
              <View style={styles.flexShrink}>
                <Text variant="bodyStrong">{t('Sauvegarde chiffrée')}</Text>
                <Text variant="caption" tone="muted">{t('Créée le {0}', formatDate(envelope.createdAt))}
                </Text>
              </View>
              <Button variant="ghost" label={t('Changer')} onPress={handlePick} />
            </View>
            {!summary && (
              <TextField
                label={t('Mot de passe de la sauvegarde')}
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleUnlock}
              />
            )}
          </Card>
        )}

        {summary && (
          <Card tone="sunken" style={styles.card}>
            <Text variant="subheading">{summary.collectorName}</Text>
            <Text variant="body" tone="muted">
              {t('{0} adhérent(s) · {1} opération(s)', summary.clients, summary.transactions)}</Text>
            <Text variant="caption" tone="muted">{t('Exportée le {0}', formatDate(summary.exportedAt))}
            </Text>
          </Card>
        )}

        <PinVerificationModal
          visible={isPinOpen}
          title={t('Confirmer la restauration')}
          subtitle={t('Saisissez votre code PIN pour remplacer les données de ce carnet par la sauvegarde.')}
          onSuccess={() => {
            setIsPinOpen(false);
            doRestore();
          }}
          onCancel={() => setIsPinOpen(false)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    flexOne: { flex: 1 },
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    card: { gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  });
