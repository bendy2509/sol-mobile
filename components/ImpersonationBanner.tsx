import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { triggerMediumImpact } from '@/lib/haptics';

export const ImpersonationBanner: React.FC = () => {
  const router = useRouter();
  const { isImpersonating, userRole, activeCollector, exitImpersonation } = useAuth();

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
    <View style={styles.container}>
      <View style={styles.contentRow}>
        <View style={styles.badgeBox}>
          <Icon name="crown" size={14} color="#B45309" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.bannerTitle}>MODE SUPERVISEUR</Text>
          <Text style={styles.bannerSubtitle} numberOfLines={1}>
            Espace : {managerName}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleReturnToAdmin}
          style={styles.returnBtn}
          accessibilityLabel="Retourner au Dashboard Admin"
        >
          <Icon name="arrow-left" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.returnBtnText}>Retour Admin</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    zIndex: 99,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  bannerTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  bannerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
  },
  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B45309',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    ...SHADOWS.sm,
  },
  returnBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
