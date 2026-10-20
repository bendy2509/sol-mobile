import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Icon, Text } from '@/components/ui';
import { triggerMediumImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';

/**
 * 👑 Supervisor mode banner. Uses the dedicated `supervisor` color (violet), which never
 * appears in manager mode, so an admin can't mistake whose carnet they are acting on.
 */
export const ImpersonationBanner: React.FC = () => {
  const router = useRouter();
  const { isImpersonating, userRole, activeCollector, exitImpersonation } = useAuth();
  const { colors, spacing, radius, layout } = useTheme();

  if (!isImpersonating && userRole !== 'ADMIN') {
    return null;
  }

  const handleReturnToAdmin = async () => {
    triggerMediumImpact();
    await exitImpersonation();
    router.replace('/admin' as any);
  };

  const managerName = activeCollector?.fullName || 'Gestionnaire';

  return (
    <View
      accessibilityRole="summary"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: layout.gutter,
        backgroundColor: colors.supervisor,
        zIndex: 99,
      }}
    >
      <Icon name="crown" size={20} color={colors.onSupervisor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" style={{ color: colors.onSupervisor }}>
          Mode superviseur
        </Text>
        <Text variant="caption" style={{ color: colors.onSupervisor }} numberOfLines={1}>
          Espace : {managerName}
        </Text>
      </View>
      <Pressable
        onPress={handleReturnToAdmin}
        accessibilityRole="button"
        accessibilityLabel="Retourner au Dashboard Admin"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: layout.touchTarget - spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: pressed ? colors.supervisorSoft : colors.surface,
        })}
      >
        <Icon name="arrow-left" size={16} color={colors.supervisor} />
        <Text variant="label" style={{ color: colors.supervisor }}>
          Retour admin
        </Text>
      </Pressable>
    </View>
  );
};
