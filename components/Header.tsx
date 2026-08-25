import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SyncBadge } from './SyncBadge';
import { Icon } from './Icon';
import { useAuth } from '@/context/AuthContext';
import { triggerLightImpact } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showScanner?: boolean;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showScanner = true,
  onRefresh,
}) => {
  const router = useRouter();
  const { activeCollector } = useAuth();

  const handleScanPress = () => {
    triggerLightImpact();
    router.push('/scan' as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <Text style={styles.appTitle}>{title || 'SOL'}</Text>
        <Text style={styles.collectorInfo} numberOfLines={1}>
          {subtitle ||
            (activeCollector
              ? `${activeCollector.fullName.split(' ')[0]} • ${activeCollector.zone || 'Marché'}`
              : 'Mode Hors-Ligne')}
        </Text>
      </View>

      <View style={styles.rightSection}>
        <SyncBadge onSyncComplete={onRefresh} />

        {showScanner && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleScanPress}
            style={styles.scanButton}
            accessibilityLabel="Scanner Code QR"
          >
            <Icon name="scan" size={18} color={SOL_COLORS.textPrimary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
  },
  leftSection: {
    flex: 1,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    letterSpacing: 0.5,
  },
  collectorInfo: {
    fontSize: 12,
    fontWeight: '600',
    color: SOL_COLORS.textSecondary,
    marginTop: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});
