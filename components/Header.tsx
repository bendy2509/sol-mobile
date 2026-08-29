import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SyncBadge } from './SyncBadge';
import { Icon } from './Icon';
import { useAuth } from '@/context/AuthContext';
import { triggerLightImpact } from '@/lib/haptics';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

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
  const { activeCollector, userRole } = useAuth();

  const handleScanPress = () => {
    triggerLightImpact();
    router.push('/scan' as any);
  };

  const getFirstName = () => {
    if (activeCollector?.fullName) {
      return activeCollector.fullName.split(' ')[0];
    }
    return userRole === 'ADMIN' ? 'Admin' : 'Responsable';
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <View style={styles.titleRow}>
          <Text style={styles.appTitle}>{title || 'SOL'}</Text>
          <View style={styles.brandDot} />
        </View>
        <Text style={styles.collectorInfo} numberOfLines={1}>
          {subtitle || `${getFirstName()} • ${activeCollector?.zone || 'Zone Principale'}`}
        </Text>
      </View>

      <View style={styles.rightSection}>
        <SyncBadge onSyncComplete={onRefresh} />

        {showScanner && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleScanPress}
            style={styles.actionButton}
            accessibilityLabel="Scanner Code QR"
          >
            <Icon name="scan" size={18} color={SOL_COLORS.textPrimary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            triggerLightImpact();
            router.push('/profile' as any);
          }}
          style={[styles.actionButton, styles.profileButton]}
          accessibilityLabel="Mon Profil"
        >
          <Icon name="user" size={18} color={SOL_COLORS.primaryDark} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  leftSection: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SOL_COLORS.primary,
    marginTop: 6,
  },
  collectorInfo: {
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textSecondary,
    marginTop: 2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButton: {
    backgroundColor: SOL_COLORS.primaryLight,
    borderColor: '#99F6E4',
  },
});
