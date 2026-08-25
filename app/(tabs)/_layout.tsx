import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';

export default function TabLayout() {
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
  iconActive: {
    transform: [{ scale: 1.1 }],
  },
});
