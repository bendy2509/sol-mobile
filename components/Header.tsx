import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { SyncBadge } from './SyncBadge';
import { Icon } from './Icon';
import { ImpersonationBanner } from './ImpersonationBanner';
import { useAuth } from '@/context/AuthContext';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { safeBack } from '@/lib/navigation';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { useResponsive } from '@/hooks/useResponsive';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showScanner?: boolean;
  showProfile?: boolean;
  showBack?: boolean;
  onRefresh?: () => void;
  fallbackBackRoute?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showScanner = true,
  showProfile = true,
  showBack = false,
  onRefresh,
  fallbackBackRoute = '/(tabs)',
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { activeCollector, userRole, isImpersonating, exitImpersonation } = useAuth();
  const { isSmallScreen, isVerySmallScreen, isTablet } = useResponsive();

  const isProfileScreen = pathname === '/profile' || pathname?.endsWith('/profile');
  const isScanScreen = pathname === '/scan' || pathname?.endsWith('/scan');

  const handleBackPress = () => {
    safeBack(router, fallbackBackRoute);
  };

  const handleScanPress = () => {
    if (isScanScreen) return;
    triggerLightImpact();
    router.push('/scan' as any);
  };

  const handleProfilePress = () => {
    if (isProfileScreen) return;
    triggerLightImpact();
    router.navigate('/profile' as any);
  };

  const handleAdminReturn = async () => {
    triggerMediumImpact();
    await exitImpersonation();
    router.replace('/admin' as any);
  };

  const getFirstName = () => {
    if (activeCollector?.fullName) {
      return activeCollector.fullName.split(' ')[0];
    }
    return userRole === 'ADMIN' ? 'Admin' : 'Responsable';
  };

  return (
    <View style={styles.headerWrapper}>
      {(isImpersonating || userRole === 'ADMIN') && <ImpersonationBanner />}

      <View
        style={[
          styles.container,
          isSmallScreen && { paddingHorizontal: isVerySmallScreen ? 10 : 12, paddingTop: 10, paddingBottom: 12 },
          isTablet && styles.containerTablet,
        ]}
      >
        {showBack && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleBackPress}
            style={[styles.backButton, isSmallScreen && styles.buttonSmall]}
            accessibilityLabel="Retour"
          >
            <Icon name="arrow-left" size={isSmallScreen ? 16 : 18} color={SOL_COLORS.textPrimary} />
          </TouchableOpacity>
        )}

        <View style={styles.leftSection}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.appTitle, isSmallScreen && { fontSize: isVerySmallScreen ? 18 : 20 }]}
              numberOfLines={1}
            >
              {title || 'SOL'}
            </Text>
            <View style={styles.brandDot} />
          </View>
          <Text
            style={[styles.collectorInfo, isSmallScreen && { fontSize: 11 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subtitle || `${getFirstName()} • ${activeCollector?.zone || 'Zone Principale'}`}
          </Text>
        </View>

        <View style={[styles.rightSection, isSmallScreen && { gap: isVerySmallScreen ? 4 : 6 }]}>
          {(isImpersonating || userRole === 'ADMIN') && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleAdminReturn}
              style={[styles.adminQuickBtn, isSmallScreen && styles.adminQuickBtnSmall]}
              accessibilityLabel="Retour Super-Admin"
            >
              <Icon name="crown" size={isSmallScreen ? 11 : 13} color="#B45309" />
              <Text style={[styles.adminQuickBtnText, isSmallScreen && { fontSize: 10 }]}>Admin</Text>
            </TouchableOpacity>
          )}

          <SyncBadge onSyncComplete={onRefresh} />

          {showScanner && !isScanScreen && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleScanPress}
              style={[styles.actionButton, isSmallScreen && styles.buttonSmall]}
              accessibilityLabel="Scanner Code QR"
            >
              <Icon name="scan" size={isSmallScreen ? 16 : 18} color={SOL_COLORS.textPrimary} />
            </TouchableOpacity>
          )}

          {showProfile && !isProfileScreen && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleProfilePress}
              style={[styles.actionButton, styles.profileButton, isSmallScreen && styles.buttonSmall]}
              accessibilityLabel="Mon Profil"
            >
              <Icon name="user" size={isSmallScreen ? 16 : 18} color={SOL_COLORS.primaryDark} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: '#FFFFFF',
    zIndex: 90,
  },
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
  containerTablet: {
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  adminQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 4,
  },
  adminQuickBtnSmall: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 2,
    borderRadius: 8,
  },
  adminQuickBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  buttonSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
    marginRight: 6,
  },
  leftSection: {
    flex: 1,
    marginRight: 6,
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
