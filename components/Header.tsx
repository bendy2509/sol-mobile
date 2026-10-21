import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { SyncBadge } from './SyncBadge';
import { Icon, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { triggerLightImpact } from '@/lib/haptics';
import { safeBack } from '@/lib/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

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
  const { activeCollector } = useAuth();
  const { isSmallScreen } = useResponsive();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors } = theme;

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

  const getFirstName = () => {
    if (activeCollector?.fullName) {
      return activeCollector.fullName.split(' ')[0];
    }
    return 'Responsable';
  };

  return (
    <View style={styles.headerWrapper}>
      <View style={styles.container}>
        {showBack && (
          <Pressable
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Icon name="arrow-left" size={22} color={colors.text} />
          </Pressable>
        )}

        <View style={styles.leftSection}>
          <Text variant={isSmallScreen ? 'subheading' : 'heading'} numberOfLines={1} accessibilityRole="header">
            {title || 'SOL'}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} ellipsizeMode="tail">
            {subtitle || `${getFirstName()} • ${activeCollector?.zone || 'Zone Principale'}`}
          </Text>
        </View>

        <View style={styles.rightSection}>
          <SyncBadge onSyncComplete={onRefresh} compact={isSmallScreen} />

          {showScanner && !isScanScreen && (
            <Pressable
              onPress={handleScanPress}
              accessibilityRole="button"
              accessibilityLabel="Scanner Code QR"
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <Icon name="scan" size={22} color={colors.text} />
            </Pressable>
          )}

          {showProfile && !isProfileScreen && (
            <Pressable
              onPress={handleProfilePress}
              accessibilityRole="button"
              accessibilityLabel="Mon Profil"
              style={({ pressed }) => [styles.iconButton, styles.profileButton, pressed && styles.iconButtonPressed]}
            >
              <Icon name="user" size={22} color={colors.onPrimarySoft} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Liseré: brand bicolor accent */}
      <View style={styles.flagRule} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.flagBlue} />
        <View style={styles.flagRed} />
      </View>
    </View>
  );
};

const createStyles = ({ colors, spacing, radius, layout, brand }: Theme) =>
  StyleSheet.create({
    headerWrapper: {
      backgroundColor: colors.surface,
      zIndex: 90,
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      width: '100%',
      maxWidth: layout.maxContentWidth + layout.gutter * 2,
      alignSelf: 'center',
      paddingHorizontal: layout.gutter,
      paddingVertical: spacing.sm,
    },
    leftSection: {
      flex: 1,
      minWidth: 0,
    },
    rightSection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    iconButton: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonPressed: {
      backgroundColor: colors.surfacePressed,
    },
    profileButton: {
      backgroundColor: colors.primarySoft,
    },
    flagRule: {
      flexDirection: 'row',
      height: 2,
    },
    flagBlue: { flex: 1, backgroundColor: brand.haitiBlue },
    flagRed: { flex: 1, backgroundColor: brand.haitiRed },
  });
