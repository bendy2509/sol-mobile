import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Card, Icon, Screen, Text } from '@/components/ui';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { takePendingRecoveryCode } from '@/services/pendingSecret';
import { triggerLightImpact } from '@/lib/haptics';
import { Theme, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Shows a freshly generated recovery code exactly once. The code is the only way to
 * reset a forgotten PIN, so the manager must confirm they wrote it down before leaving.
 */
export default function RecoveryCodeScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [code] = useState(() => takePendingRecoveryCode());
  const [confirmed, setConfirmed] = useState(false);

  const leave = async () => {
    if (next === 'carnet') {
      const business = await getActiveBusinessConfig();
      router.replace((business ? '/(tabs)' : '/setup-business') as any);
    } else {
      router.back();
    }
  };

  return (
    <Screen
      edges={['left', 'right']}
      contentStyle={styles.content}
      footer={
        <Button
          size="lg"
          fullWidth
          label={code ? t('J\'ai noté mon code') : t('Continuer')}
          disabled={!!code && !confirmed}
          onPress={leave}
        />
      }
    >
      {code ? (
        <>
          <View style={styles.intro}>
            <View style={styles.disc}>
              <Icon name="key" size={28} color={theme.colors.primary} />
            </View>
            <Text variant="title" align="center" accessibilityRole="header">{t('Votre code de récupération')}</Text>
            <Text variant="body" tone="muted" align="center">{t('Il permet de choisir un nouveau code PIN si vous oubliez le vôtre. Personne d\'autre ne peut le faire pour vous.')}</Text>
          </View>

          <Card style={styles.codeCard}>
            <Text variant="amountLarge" align="center" selectable accessibilityLabel={t('Code : {0}', code.split('').join(' '))}>
              {code}
            </Text>
          </Card>

          <View style={styles.rules}>
            {[
              'Écrivez-le sur papier et rangez-le en lieu sûr.',
              'Ne le partagez avec personne, ne le prenez pas en photo.',
              'Il ne sera plus affiché : vous pourrez en générer un nouveau dans Sécurité.',
            ].map((rule) => (
              <View key={t(rule)} style={styles.rule}>
                <Icon name="check" size={16} color={theme.colors.success} />
                <Text variant="body" style={styles.flexShrink}>
                  {rule}
                </Text>
              </View>
            ))}
          </View>

          <Button
            variant={confirmed ? 'primary' : 'secondary'}
            icon={confirmed ? 'check' : undefined}
            fullWidth
            label={confirmed ? t('Code noté') : t('Je confirme avoir noté ce code')}
            onPress={() => {
              triggerLightImpact();
              setConfirmed(!confirmed);
            }}
            accessibilityHint={t('Active le bouton de sortie')}
          />
        </>
      ) : (
        <Card tone="sunken">
          <Text variant="body" tone="muted">{t('Ce code a déjà été affiché. Pour en obtenir un nouveau, ouvrez Sécurité et générez un nouveau code de récupération.')}</Text>
        </Card>
      )}
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    content: { gap: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl },
    intro: { alignItems: 'center', gap: spacing.sm },
    disc: {
      width: layout.touchTarget + spacing.lg,
      height: layout.touchTarget + spacing.lg,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    codeCard: { paddingVertical: spacing.xl },
    rules: { gap: spacing.sm },
    rule: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  });
