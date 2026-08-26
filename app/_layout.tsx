import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { initDatabase } from '@/db/sqlite';
import { syncEngine } from '@/db/syncEngine';
import { AuthProvider } from '@/context/AuthContext';
import { SyncProvider } from '@/context/SyncContext';
import { SOL_COLORS } from '@/constants/Colors';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
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
      <AuthProvider>
        <SyncProvider>
          <StatusBar style="dark" backgroundColor="#FFFFFF" />
          {!databaseReady ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={SOL_COLORS.primary} />
              <Text style={styles.loadingText}>Chargement de SOL...</Text>
            </View>
          ) : (
            <Stack
              screenOptions={{
                headerStyle: {
                  backgroundColor: '#FFFFFF',
                },
                headerTintColor: SOL_COLORS.textPrimary,
                headerTitleStyle: {
                  fontWeight: '800',
                  fontSize: 18,
                },
                contentStyle: {
                  backgroundColor: '#F8FAFC',
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
                  title: 'Nouveau Carnet SOL',
                  headerBackTitle: 'Connexion',
                }}
              />
              <Stack.Screen
                name="pending-approval"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="admin"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="profile"
                options={{
                  title: 'Mon Profil',
                  headerBackTitle: 'Retour',
                }}
              />
              <Stack.Screen
                name="closure"
                options={{
                  title: 'Clôture Journalière de Caisse',
                  headerBackTitle: 'Retour',
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
                  title: 'Scanner le Code QR',
                  presentation: 'modal',
                  headerStyle: { backgroundColor: '#0F172A' },
                  headerTintColor: '#FFFFFF',
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
                name="client/new"
                options={{
                  title: 'Nouvel Adhérent ("Enfant")',
                  headerBackTitle: 'Retour',
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
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
});
