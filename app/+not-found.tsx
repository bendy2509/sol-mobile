import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Page introuvable' }} />
      <Screen scroll={false} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <EmptyState
            icon="search"
            title="Cette page n'existe pas"
            message="Le lien suivi ne correspond à aucun écran de SOL Mobile."
            action={{ label: "Retour à l'accueil", icon: 'home', onPress: () => router.replace('/') }}
          />
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
