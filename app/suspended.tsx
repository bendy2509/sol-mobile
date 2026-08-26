import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { getActiveCollector } from '@/db/sqlite';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function SuspendedScreen() {
  const router = useRouter();
  const { logout, refreshSession, activeCollector } = useAuth();

  const [adminName, setAdminName] = useState('Administration SOL');
  const [adminPhone, setAdminPhone] = useState('+50900000000');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    async function loadAdminContact() {
      const name = (await AsyncStorage.getItem('SOL_ADMIN_NAME')) || 'Superviseur Général SOL';
      const phone = (await AsyncStorage.getItem('SOL_ADMIN_PHONE')) || '+50900000000';
      setAdminName(name);
      setAdminPhone(phone);
    }
    loadAdminContact();
  }, []);

  const handleCallAdmin = () => {
    triggerLightImpact();
    const cleanNumber = adminPhone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Contact', `Veuillez appeler l'administration au ${adminPhone}`);
    });
  };

  const handleWhatsAppAdmin = () => {
    triggerLightImpact();
    const digitsOnly = adminPhone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${digitsOnly}`).catch(() => {
      Alert.alert('WhatsApp', `Veuillez contacter le numéro ${adminPhone} sur WhatsApp.`);
    });
  };

  const handleCheckStatus = async () => {
    triggerMediumImpact();
    setIsChecking(true);
    try {
      await refreshSession();
      const current = await getActiveCollector();

      if (current && current.status === 'ACTIVE') {
        triggerSuccessFeedback();
        Alert.alert('Compte Réactivé !', 'Votre compte a été réactivé par l\'administration.', [
          {
            text: 'Accéder à mon espace',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]);
      } else if (current && current.status === 'PENDING_APPROVAL') {
        triggerLightImpact();
        router.replace('/pending-approval' as any);
      } else {
        triggerErrorFeedback();
        Alert.alert(
          'Toujours Suspendu',
          'Votre compte est toujours suspendu. Veuillez contacter l\'administrateur pour débloquer votre accès.'
        );
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de vérifier le statut. Vérifiez votre connexion.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = async () => {
    triggerLightImpact();
    await logout();
    router.replace('/login' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Warning Icon Badge */}
        <View style={styles.iconCircle}>
          <Icon name="shield" size={48} color="#DC2626" />
        </View>

        <Text style={styles.title}>COMPTE SUSPENDU</Text>
        <Text style={styles.subtitle}>
          L'accès de votre compte gestionnaire a été temporairement suspendu par l'administration générale de la plateforme SOL.
        </Text>

        {/* Security Restrictions Box */}
        <View style={styles.restrictionsCard}>
          <Text style={styles.restrictionsHeader}>RESTRICTIONS EN VIGUEUR</Text>
          <View style={styles.restrictionItem}>
            <Icon name="close" size={14} color="#DC2626" style={{ marginTop: 2 }} />
            <Text style={styles.restrictionText}>Encaissements et collectes de cotisations bloqués</Text>
          </View>
          <View style={styles.restrictionItem}>
            <Icon name="close" size={14} color="#DC2626" style={{ marginTop: 2 }} />
            <Text style={styles.restrictionText}>Décaissements et remises de mains ("Bay Men") verrouillés</Text>
          </View>
          <View style={styles.restrictionItem}>
            <Icon name="close" size={14} color="#DC2626" style={{ marginTop: 2 }} />
            <Text style={styles.restrictionText}>Ajout et modification d'adhérents interdits</Text>
          </View>
        </View>

        {/* Administrator Contact Info */}
        <View style={styles.contactCard}>
          <Text style={styles.contactHeader}>CONTACTER L'ADMINISTRATION POUR DÉBLOCAGE</Text>
          <Text style={styles.contactName}>{adminName}</Text>
          <Text style={styles.contactPhone}>{adminPhone}</Text>

          <View style={styles.contactBtnRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleCallAdmin}
              style={styles.callBtn}
            >
              <Icon name="phone" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.callBtnText}>Appeler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleWhatsAppAdmin}
              style={styles.whatsappBtn}
            >
              <Text style={styles.whatsappBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Check Status Button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCheckStatus}
          disabled={isChecking}
          style={styles.refreshBtn}
        >
          <Icon name="sync" size={16} color="#1D4ED8" style={{ marginRight: 6 }} />
          <Text style={styles.refreshBtnText}>
            {isChecking ? 'Vérification en cours...' : 'Actualiser mon statut'}
          </Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleLogout}
          style={styles.logoutBtn}
        >
          <Text style={styles.logoutBtnText}>Se Déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEF2F2',
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#7F1D1D',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  restrictionsCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  restrictionsHeader: {
    fontSize: 10,
    fontWeight: '900',
    color: '#991B1B',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  restrictionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  restrictionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginLeft: 8,
    flex: 1,
  },
  contactCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    marginBottom: 16,
  },
  contactHeader: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  contactPhone: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
    marginTop: 2,
    marginBottom: 12,
  },
  contactBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
    height: 42,
    borderRadius: 10,
  },
  callBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  whatsappBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 42,
    borderRadius: 10,
  },
  whatsappBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 10,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  logoutBtn: {
    padding: 10,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
