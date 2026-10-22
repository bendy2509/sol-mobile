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
import { t } from '@/i18n';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showScanner?: boolean;
  showBack?: boolean;
  onRefresh?: () => void;
  fallbackBackRoute?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showScanner = true,
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

  const isScanScreen = pathname === '/scan' || pathname?.endsWith('/scan');

  const handleBackPress = () => {
    safeBack(router, fallbackBackRoute);
  };

  const handleScanPress = () => {
    if (isScanScreen) return;
    triggerLightImpact();
    router.push('/scan' as any);
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
            accessibilityLabel={t('Retour')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Icon name="arrow-left" size={22} color={colors.text} />
          </Pressable>
        )}

        <View style={styles.leftSection}>
          <Text variant={isSmallScreen ? 'subheading' : 'heading'} numberOfLines={1} accessibilityRole="header">
            {title || t('SOL')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} ellipsizeMode="tail">
            {subtitle || `${getFirstName()} • ${activeCollector?.zone || t('Zone principale')}`}
          </Text>
        </View>

        <View style={styles.rightSection}>
          <SyncBadge onSyncComplete={onRefresh} compact={isSmallScreen} />

          {showScanner && !isScanScreen && (
            <Pressable
              onPress={handleScanPress}
              accessibilityRole="button"
              accessibilityLabel={t('Scanner Code QR')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <Icon name="scan" size={22} color={colors.text} />
            </Pressable>
          )}

        </View>
      </View>

    </View>
  );
};

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    headerWrapper: {
      backgroundColor: colors.background,
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
  });
