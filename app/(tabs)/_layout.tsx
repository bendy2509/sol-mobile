import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

export default function TabLayout() {
  const { isAuthenticated, isPendingApproval, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={SOL_COLORS.primary} />
      </View>
    );
  }

  if (isPendingApproval) {
    return <Redirect href="/pending-approval" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: SOL_COLORS.primary,
        tabBarInactiveTintColor: SOL_COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: SOL_COLORS.border,
          height: 66,
          paddingBottom: 10,
          paddingTop: 8,
          ...SHADOWS.sm,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.1,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon
                name="dashboard"
                size={20}
                color={focused ? SOL_COLORS.primaryDark : color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="collect"
        options={{
          title: 'Cotisation',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon
                name="collect"
                size={20}
                color={focused ? SOL_COLORS.primaryDark : color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="sol"
        options={{
          title: 'Cycle SOL',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon
                name="sol"
                size={20}
                color={focused ? SOL_COLORS.primaryDark : color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Icon
                name="history"
                size={20}
                color={focused ? SOL_COLORS.primaryDark : color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 36,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: SOL_COLORS.primaryLight,
  },
});
