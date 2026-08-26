import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';

export default function TabLayout() {
  const { isAuthenticated, isPendingApproval, isLoading, userRole } = useAuth();

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
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1.5,
          borderTopColor: '#E2E8F0',
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.2,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tableau de bord',
          tabBarIcon: ({ color, focused }) => (
            <Icon
              name="dashboard"
              size={20}
              color={color}
              style={focused ? styles.iconActive : undefined}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="collect"
        options={{
          title: 'Collecte',
          tabBarIcon: ({ color, focused }) => (
            <Icon
              name="collect"
              size={20}
              color={color}
              style={focused ? styles.iconActive : undefined}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sol"
        options={{
          title: 'Sol (ROSCA)',
          tabBarIcon: ({ color, focused }) => (
            <Icon
              name="sol"
              size={20}
              color={color}
              style={focused ? styles.iconActive : undefined}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, focused }) => (
            <Icon
              name="history"
              size={20}
              color={color}
              style={focused ? styles.iconActive : undefined}
            />
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
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconActive: {
    transform: [{ scale: 1.1 }],
  },
});
