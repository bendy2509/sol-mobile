import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, ActivityIndicator, ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Icon, UiIconName } from '@/components/ui';
import { useTheme } from '@/theme';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors, spacing, radius, typography, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const renderIcon = (name: UiIconName) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <View
          style={{
            width: spacing.xxxl,
            height: spacing.xxl,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? colors.primarySoft : 'transparent',
          }}
        >
          <Icon name={name} size={22} color={focused ? colors.onPrimarySoft : color} strokeWidth={focused ? 2.4 : 2} />
        </View>
      );
    };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 68 + insets.bottom,
          paddingTop: spacing.xs,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          ...shadows.card,
        },
        tabBarLabelStyle: typography.tab,
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: renderIcon('home') }} />
      <Tabs.Screen name="collect" options={{ title: 'Encaisser', tabBarIcon: renderIcon('cash') }} />
      <Tabs.Screen name="sol" options={{ title: 'Cycle', tabBarIcon: renderIcon('cycle') }} />
      <Tabs.Screen name="history" options={{ title: 'Historique', tabBarIcon: renderIcon('history') }} />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
