import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Card, Icon, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatRecoveryCode, isWellFormedRecoveryCode } from '@/services/securityPolicy';
import { setPendingRecoveryCode } from '@/services/pendingSecret';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

/** Forgotten PIN: phone + recovery code + new PIN. A new recovery code is issued afterwards. */
export default function RecoverPinScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { resetPinWithRecoveryCode, regenerateRecoveryCode } = useAuth();

  const [phoneDigits, setPhoneDigits] = useState((params.phone || '').replace(/\D/g, '').slice(0, 8));
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (phoneDigits.length !== 8) return setError(t('Saisissez votre numéro à 8 chiffres.'));
    if (!isWellFormedRecoveryCode(code)) return setError(t('Le code de récupération comporte 12 caractères (ex : ABCD-EFGH-JKMN).'));
    if (newPin !== confirmPin) return setError(t('Les deux codes PIN ne correspondent pas.'));

    setSubmitting(true);
    try {
      const res = await resetPinWithRecoveryCode(`+509${phoneDigits}`, code, newPin);
      if (!res.success) return setError(res.error || t('Réinitialisation impossible.'));
      // The used recovery code is retired: issue a new one and show it once.
      setPendingRecoveryCode(await regenerateRecoveryCode());
      router.replace({ pathname: '/recovery-code', params: { next: 'carnet' } } as any);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
      <Screen
        edges={['left', 'right']}
        contentStyle={styles.content}
        footer={<Button size="lg" fullWidth icon="key" label={t('Choisir ce nouveau PIN')} loading={submitting} onPress={handleSubmit} />}
      >
        <Text variant="body" tone="muted">{t('Saisissez le code de récupération reçu à l\'inscription, puis votre nouveau code PIN.')}</Text>

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

        <Card style={styles.card}>
          <TextField
            label={t('Numéro de téléphone (+509)')}
            keyboardType="number-pad"
            maxLength={8}
            value={phoneDigits}
            onChangeText={(t) => setPhoneDigits(t.replace(/\D/g, '').slice(0, 8))}
            placeholder="37 12 34 56"
          />
          <TextField
            label={t('Code de récupération')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={14}
            value={code}
            onChangeText={(t) => setCode(formatRecoveryCode(t))}
            placeholder={t('ABCD-EFGH-JKMN')}
          />
        </Card>

        <Card style={styles.card}>
          <TextField label={t('Nouveau code PIN')} keyboardType="number-pad" secureTextEntry maxLength={4} value={newPin} onChangeText={setNewPin} placeholder="••••" />
          <TextField label={t('Confirmer le code PIN')} keyboardType="number-pad" secureTextEntry maxLength={4} value={confirmPin} onChangeText={setConfirmPin} placeholder="••••" />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    flexOne: { flex: 1 },
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    card: { gap: spacing.lg },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  });
