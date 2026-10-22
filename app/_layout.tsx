import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { initDatabase } from '@/db/sqlite';
import { loadReceiptPreferences } from '@/lib/receiptPreferences';
import { syncEngine } from '@/db/syncEngine';
import { AuthProvider } from '@/context/AuthContext';
import { SyncProvider } from '@/context/SyncContext';
import { Text } from '@/components/ui';
import { I18nProvider, t, useI18n } from '@/i18n';
import { ThemeProvider, fontAssets, useTheme, useThemePreference } from '@/theme';

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
        await Promise.all([initDatabase(), loadReceiptPreferences()]);
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
        <I18nProvider>
          <AuthProvider>
            <SyncProvider>
              <RootNavigator ready={databaseReady && (fontsLoaded || !!fontError)} />
            </SyncProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Stack, status bar and boot screen, themed (rendered inside ThemeProvider). */
function RootNavigator({ ready: bootReady }: { ready: boolean }) {
  const { colors, spacing, isDark, typography } = useTheme();
  const { ready: preferencesReady } = useThemePreference();
  const { language, ready: languageReady } = useI18n();
  const ready = bootReady && preferencesReady && languageReady;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {!ready ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, backgroundColor: colors.background }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="bodyStrong">{t('Chargement de SOL…')}</Text>
        </View>
      ) : (
        <Stack
          // Re-mounted when the language changes, so every t() is evaluated again
          key={language}
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surface,
            },
            headerTintColor: colors.text,
            headerTitleStyle: {
              fontFamily: typography.subheading.fontFamily,
              fontSize: typography.subheading.fontSize,
            },
            headerShadowVisible: false,
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
              title: t('Inscription'),
              headerBackTitle: t('Connexion'),
            }}
          />
          <Stack.Screen name="recover-pin" options={{ title: t('Code PIN oublié'), headerBackTitle: t('Connexion') }} />
          <Stack.Screen name="restore-backup" options={{ title: t('Restaurer une sauvegarde'), headerBackTitle: t('Retour') }} />
          <Stack.Screen name="recovery-code" options={{ title: t('Code de récupération'), headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="security" options={{ headerShown: false }} />
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
              title: t('Configuration de l\'Activité'),
              headerBackTitle: t('Retour'),
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
              title: t('Adhérent'),
              headerBackTitle: t('Retour'),
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
              title: t('Diagnostic & Synchronisation'),
            }}
          />
        </Stack>
      )}
    </>
  );
}
