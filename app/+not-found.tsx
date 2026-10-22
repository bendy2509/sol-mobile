import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui';
import { t } from '@/i18n';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: t('Page introuvable') }} />
      <Screen scroll={false} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <EmptyState
            icon="search"
            title={t('Cette page n\'existe pas')}
            message={t('Le lien suivi ne correspond à aucun écran de SOL Mobile.')}
            action={{ label: t('Retour à l\'accueil'), icon: 'home', onPress: () => router.replace('/') }}
          />
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
