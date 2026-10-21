import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { initDatabase } from '@/db/sqlite';
import { syncEngine } from '@/db/syncEngine';
import { AuthProvider } from '@/context/AuthContext';
import { SyncProvider } from '@/context/SyncContext';
import { Text } from '@/components/ui';
import { ThemeProvider, fontAssets, useTheme } from '@/theme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...fontAssets,
  });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    async function prepare() {
      try {
        await initDatabase();
        syncEngine.startAutoSync(30000);
      } catch (err) {
        console.warn('Database initialization error:', err);
      } finally {
        setDatabaseReady(true);
      }
    }
    prepare();

    return () => {
      syncEngine.stopAutoSync();
    };
  }, []);

  useEffect(() => {
    if (fontError) console.warn('Font loading notice:', fontError);
  }, [fontError]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SyncProvider>
            <RootNavigator ready={databaseReady && (fontsLoaded || !!fontError)} />
          </SyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Stack, status bar and boot screen, themed (rendered inside ThemeProvider). */
function RootNavigator({ ready }: { ready: boolean }) {
  const { colors, fonts, spacing, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {!ready ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, backgroundColor: colors.background }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="bodyStrong">Chargement de SOL…</Text>
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surface,
            },
            headerTintColor: colors.text,
            headerTitleStyle: {
              fontFamily: fonts.bold,
              fontSize: 18,
            },
            contentStyle: {
              backgroundColor: colors.background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="login"
            options={{
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="register"
            options={{
              title: 'Inscription',
              headerBackTitle: 'Connexion',
            }}
          />
          <Stack.Screen name="recover-pin" options={{ title: 'Code PIN oublié', headerBackTitle: 'Connexion' }} />
          <Stack.Screen name="restore-backup" options={{ title: 'Restaurer une sauvegarde', headerBackTitle: 'Retour' }} />
          <Stack.Screen name="recovery-code" options={{ title: 'Code de récupération', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="security" options={{ title: 'Sécurité et sauvegarde', headerBackTitle: 'Retour' }} />
          <Stack.Screen
            name="profile"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="closure"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="setup-business"
            options={{
              title: "Configuration de l'Activité",
              headerBackTitle: 'Retour',
            }}
          />
          <Stack.Screen
            name="scan"
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="client/[id]"
            options={{
              title: 'Dossier Adhérent',
              headerBackTitle: 'Retour',
            }}
          />
          <Stack.Screen
            name="payout/[id]"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="backup-diagnostics"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="client/new"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="cycle-management"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              title: 'Diagnostic & Synchronisation',
            }}
          />
        </Stack>
      )}
    </>
  );
}
