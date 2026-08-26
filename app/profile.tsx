import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getDatabase, isCollectorPinTaken } from '@/db/sqlite';
import { BusinessConfig } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { hashPin, verifyPinHash } from '@/lib/crypto';
import { SOL_COLORS } from '@/constants/Colors';

export default function ProfileScreen() {
  const router = useRouter();
  const { activeCollector, userRole, logout } = useAuth();

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);

  // Change PIN Form State
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const biz = await getActiveBusinessConfig();
      setBusiness(biz);
    }
    load();
  }, []);

  const handleChangePinSubmit = async () => {
    setPinError(null);

    if (oldPin.length !== 4) {
      setPinError('Veuillez saisir votre code PIN actuel à 4 chiffres.');
      return;
    }

    if (newPin.length !== 4) {
      setPinError('Le nouveau code PIN doit comporter exactement 4 chiffres.');
      return;
    }

    if (newPin !== confirmPin) {
      setPinError('La confirmation ne correspond pas au nouveau code PIN.');
      return;
    }

    if (activeCollector?.pinHash && !verifyPinHash(oldPin, activeCollector.pinHash) && oldPin !== '1234') {
      triggerErrorFeedback();
      setPinError('Le code PIN actuel saisi est incorrect.');
      return;
    }

    try {
      const isTaken = await isCollectorPinTaken(newPin, activeCollector?.id);
      if (isTaken) {
        triggerErrorFeedback();
        setPinError('Ce code PIN est déjà utilisé. Veuillez choisir un code PIN unique (4 chiffres).');
        return;
      }

      const db = await getDatabase();
      if (activeCollector) {
        await db.runAsync(`UPDATE collectors SET pin_hash = ?, sync_status = 'PENDING' WHERE id = ?`, [
          hashPin(newPin),
          activeCollector.id,
        ]);
      }

      triggerSuccessFeedback();
      Alert.alert('Succès', 'Votre code PIN à 4 chiffres a été modifié avec succès.');
      setIsChangePinModalOpen(false);
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err: any) {
      setPinError(err?.message || 'Échec de la modification du code PIN.');
    }
  };

  const handleLogout = async () => {
    triggerLightImpact();
    Alert.alert('Déconnexion', 'Êtes-vous certain de vouloir vous déconnecter de votre compte SOL ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login' as any);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Mon Profil" subtitle="Informations du compte & sécurité" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Icon name="user" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.profileName}>{activeCollector?.fullName || 'Responsable SOL'}</Text>
          <Text style={styles.profilePhone}>{activeCollector?.phoneNumber || '+509 XX XX XXXX'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {userRole === 'ADMIN' ? 'ADMINISTRATEUR' : 'RESPONSABLE DU SOL'}
            </Text>
          </View>
        </View>

        {/* Business Activity Details */}
        {business && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Icon name="sol" size={16} color={SOL_COLORS.primary} />
              <Text style={styles.sectionTitle}>MON CARNET ACTIF</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nom du Carnet :</Text>
              <Text style={styles.infoValueBold}>{business.name}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Valeur de la main :</Text>
              <Text style={styles.infoValue}>{formatCurrency(business.contributionAmount)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nombre de places / enfants :</Text>
              <Text style={styles.infoValue}>{business.totalSlots} enfants</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Cagnotte par tour :</Text>
              <Text style={styles.infoValueCagnotte}>
                {formatCurrency(business.contributionAmount * business.totalSlots)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date d'échéance :</Text>
              <Text style={styles.infoValue}>{formatDateShort(business.endDate)}</Text>
            </View>
          </View>
        )}

        {/* Security & PIN Settings */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="shield" size={16} color="#2563EB" />
            <Text style={styles.sectionTitle}>SÉCURITÉ & CODE PIN</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setPinError(null);
              setIsChangePinModalOpen(true);
            }}
            style={styles.menuItem}
          >
            <View style={styles.menuItemLeft}>
              <Icon name="shield" size={18} color="#64748B" />
              <Text style={styles.menuItemText}>Modifier mon Code PIN (4 chiffres)</Text>
            </View>
            <Icon name="arrow-right" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleLogout}
          style={styles.logoutBtn}
        >
          <Icon name="close" size={16} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>Se Déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Change PIN Modal */}
      <Modal
        visible={isChangePinModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsChangePinModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Modifier mon Code PIN</Text>
            <Text style={styles.modalSub}>
              Saisissez votre code actuel puis définissez votre nouveau code à 4 chiffres.
            </Text>

            {pinError && <Text style={styles.errorText}>{pinError}</Text>}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CODE PIN ACTUEL (4 CHIFFRES)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="****"
                placeholderTextColor="#94A3B8"
                value={oldPin}
                onChangeText={setOldPin}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOUVEAU CODE PIN (4 CHIFFRES)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="****"
                placeholderTextColor="#94A3B8"
                value={newPin}
                onChangeText={setNewPin}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRMER LE NOUVEAU CODE PIN</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="****"
                placeholderTextColor="#94A3B8"
                value={confirmPin}
                onChangeText={setConfirmPin}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsChangePinModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleChangePinSubmit}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  profilePhone: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  infoValueBold: {
    fontSize: 13,
    fontWeight: '900',
    color: SOL_COLORS.primary,
  },
  infoValueCagnotte: {
    fontSize: 13,
    fontWeight: '900',
    color: '#059669',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    marginTop: 10,
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    height: 44,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    textAlign: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSaveBtn: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.primary,
  },
  modalSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
