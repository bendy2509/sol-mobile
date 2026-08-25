import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { SOL_COLORS } from '@/constants/Colors';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'dark' | 'success' | 'warning';
}

export const Card: React.FC<CardProps> = ({ children, style, variant = 'default' }) => {
  const getVariantStyle = () => {
    switch (variant) {
      case 'dark':
        return styles.cardDark;
      case 'success':
        return styles.cardSuccess;
      case 'warning':
        return styles.cardWarning;
      default:
        return styles.cardDefault;
    }
  };

  return <View style={[styles.base, getVariantStyle(), style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
  },
  cardDefault: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  cardDark: {
    backgroundColor: SOL_COLORS.secondary,
    borderColor: '#334155',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cardSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  cardWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
});
