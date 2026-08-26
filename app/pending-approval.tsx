import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { SOL_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback } from '@/lib/haptics';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { activeCollector, userSession, approveAccount, refreshSession, logout } = useAuth();

  const [isChecking, setIsChecking] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const handleCheckStatus = async () => {
    triggerLightImpact();
    setIsChecking(true);
    try {
      await refreshSession();
      if (activeCollector?.status === 'ACTIVE') {
        triggerSuccessFeedback();
        router.replace('/(tabs)' as any);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleSimulateAdminApproval = async () => {
    triggerMediumImpact();
    setIsApproving(true);
    try {
      await approveAccount(activeCollector?.id);
      triggerSuccessFeedback();
      router.replace('/(tabs)' as any);
    } finally {
      setIsApproving(false);
    }
  };

  const handleLogout = async () => {
    triggerLightImpact();
    await logout();
    router.replace('/login' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Pending Icon & Title */}
        <View style={styles.heroSection}>
          <View style={styles.iconCirclePending}>
            <Icon name="clock" size={36} color="#D97706" />
          </View>
          <View style={styles.badgePending}>
            <Text style={styles.badgePendingText}>EN ATTENTE D'APPROBATION</Text>
          </View>
          <Text style={styles.title}>Compte en cours de validation</Text>
          <Text style={styles.subtitle}>
            Votre demande d'inscription et le paramétrage de votre activité ont été enregistrés avec succès.
          </Text>
        </View>

        {/* Account & Business Summary Card */}
        <View style={styles.infoCard}>
          <View style={styles.cardHeader}>
            <Icon name="shield" size={16} color={SOL_COLORS.primary} />
            <Text style={styles.cardHeaderTitle}>DÉTAILS DU COMPTE ENREGISTRÉ</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Gestionnaire :</Text>
            <Text style={styles.infoValue}>{activeCollector?.fullName || userSession?.fullName || 'Non spécifié'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Téléphone :</Text>
            <Text style={styles.infoValue}>{activeCollector?.phoneNumber || userSession?.phoneNumber || 'Non spécifié'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Activité SOL :</Text>
            <Text style={styles.infoValueHighlight}>{userSession?.businessName || 'Sol Mache Klnik'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type de Carnet :</Text>
            <Text style={styles.infoValue}>{userSession?.businessType === 'SOL' ? 'Sol (Rotatif)' : 'Sabotay (Quotidien)'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Main unitaire :</Text>
            <Text style={styles.infoValue}>{formatCurrency(userSession?.unitAmount || 250)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Enfants prévus :</Text>
            <Text style={styles.infoValue}>{userSession?.totalSlots || 10} enfants</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Cagnotte par ramassage :</Text>
            <Text style={styles.potValue}>
              {formatCurrency((userSession?.unitAmount || 250) * (userSession?.totalSlots || 10))}
            </Text>
          </View>
        </View>

        {/* Explanatory Notice */}
        <View style={styles.noticeBox}>
          <Icon name="shield" size={16} color="#0284C7" style={{ marginTop: 2, marginRight: 8 }} />
          <Text style={styles.noticeText}>
            Pour des raisons de sécurité financière sur les marchés, chaque carnet ou SOL doit être validé par un administrateur avant l'ouverture des encaissements.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {/* Check Status Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleCheckStatus}
            disabled={isChecking}
            style={styles.checkStatusBtn}
          >
            {isChecking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Icon name="sync" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.checkStatusBtnText}>Actualiser mon statut</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Logout / Switch Account */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleLogout}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutBtnText}>Se déconnecter / Changer de compte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCirclePending: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginBottom: 8,
  },
  badgePendingText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  infoValueHighlight: {
    fontSize: 14,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  potValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  noticeBox: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 20,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 16,
  },
  actionContainer: {
    width: '100%',
    gap: 10,
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    height: 52,
    borderRadius: 14,
    elevation: 2,
  },
  checkStatusBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  demoApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 52,
    borderRadius: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  demoApproveBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  logoutBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  logoutBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
  },
});
