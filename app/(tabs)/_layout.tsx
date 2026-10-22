import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, ActivityIndicator, ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Icon, UiIconName } from '@/components/ui';
import { t } from '@/i18n';
import { typography as fixedTypography, useTheme } from '@/theme';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors, spacing, layout } = useTheme();
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
      return <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />;
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
          height: layout.rowHeight + spacing.sm + Math.max(insets.bottom, spacing.sm),
          paddingTop: spacing.sm,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
        // Fixed size: five labels must fit at 360px whatever the text-size preference
        tabBarLabelStyle: fixedTypography.tab,
        tabBarAllowFontScaling: false,
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: renderIcon('home') }} />
      <Tabs.Screen name="collect" options={{ title: t('tabs.collect'), tabBarIcon: renderIcon('cash') }} />
      <Tabs.Screen name="sol" options={{ title: t('tabs.sol'), tabBarIcon: renderIcon('cycle') }} />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarIcon: renderIcon('history') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: renderIcon('settings') }} />
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
