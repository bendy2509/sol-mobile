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
  BackHandler,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { useAuth, AdminProfile } from '@/context/AuthContext';
import { getActiveBusinessConfig, getClosedCycles } from '@/db/businessRepository';
import { getCashClosures } from '@/db/cashClosureRepository';
import { getDatabase } from '@/db/sqlite';
import { BusinessConfig, ClosedCycle } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { hashPin, verifyPinHash } from '@/lib/crypto';
import { safeBack } from '@/lib/navigation';
import { SOL_COLORS } from '@/constants/Colors';
import { useResponsive } from '@/hooks/useResponsive';

export default function ProfileScreen() {
  const router = useRouter();
  const { activeCollector, userRole, logout, refreshSession, isImpersonating, exitImpersonation, getAdminProfile } = useAuth();
  const { contentMaxWidth, horizontalPadding, width } = useResponsive();

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [adminContact, setAdminContact] = useState<AdminProfile | null>(null);
  const [closedCyclesCount, setClosedCyclesCount] = useState(0);
  const [cashClosuresCount, setCashClosuresCount] = useState(0);

  useEffect(() => {
    const onBackPress = () => {
      safeBack(router, '/(tabs)');
      return true;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSub.remove();
  }, [router]);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);

  // Edit Profile Form State
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editZone, setEditZone] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Change PIN Form State
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [biz, aProfile, cCycles, cClosures] = await Promise.all([
          getActiveBusinessConfig(),
          getAdminProfile ? getAdminProfile() : null,
          getClosedCycles(activeCollector?.id).catch(() => []),
          getCashClosures(activeCollector?.id).catch(() => []),
        ]);
        setBusiness(biz);
        if (aProfile) setAdminContact(aProfile);
        setClosedCyclesCount(cCycles.length);
        setCashClosuresCount(cClosures.length);
      } catch (err) {
        console.warn('Profile load notice:', err);
      }
    }
    load();
  }, [activeCollector?.id, getAdminProfile]);

  const handleCallAdmin = (phone?: string) => {
    if (!phone) return;
    const cleanNumber = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Assistance Téléphonique', `Contactez l'administration au : ${phone}`);
    });
  };

  const handleWhatsAppAdmin = (phone?: string) => {
    if (!phone) return;
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${digitsOnly}`).catch(() => {
      Alert.alert('WhatsApp', `Numéro de support : ${phone}`);
    });
  };

  const handleEmailAdmin = (email?: string) => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Email Support', `Adresse email : ${email}`);
    });
  };

  const handleSaveProfileSubmit = async () => {
    setProfileError(null);
    if (!editFullName.trim()) {
      setProfileError('Le nom complet est obligatoire.');
      return;
    }
    if (!editPhoneNumber.trim()) {
      setProfileError('Le numéro de téléphone est obligatoire.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const db = await getDatabase();
      if (activeCollector) {
        await db.runAsync(
          `UPDATE collectors SET full_name = ?, phone_number = ?, zone = ?, sync_status = 'PENDING' WHERE id = ?`,
          [editFullName.trim(), editPhoneNumber.trim(), editZone.trim() || null, activeCollector.id]
        );
        await refreshSession();
      }

      triggerSuccessFeedback();
      Alert.alert('Succès', 'Vos informations ont été mises à jour avec succès.');
      setIsEditProfileModalOpen(false);
    } catch (err: any) {
      triggerErrorFeedback();
      setProfileError(err?.message || 'Erreur lors de la mise à jour des informations.');
    } finally {
      setIsSavingProfile(false);
    }
  };

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

    if (activeCollector?.pinHash && !verifyPinHash(oldPin, activeCollector.pinHash)) {
      triggerErrorFeedback();
      setPinError('Le code PIN actuel saisi est incorrect.');
      return;
    }

    try {
      const db = await getDatabase();
      if (activeCollector) {
        await db.runAsync(`UPDATE collectors SET pin_hash = ?, sync_status = 'PENDING' WHERE id = ?`, [
          hashPin(newPin),
          activeCollector.id,
        ]);
        await refreshSession();
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
      <Header
        title="Mon Profil"
        subtitle="Informations du compte & sécurité"
        showBack={true}
        showProfile={false}
        showScanner={false}
        fallbackBackRoute="/(tabs)"
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%', paddingHorizontal: horizontalPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Supervisor Card for Admin */}
        {(isImpersonating || userRole === 'ADMIN') && (
          <View style={styles.supervisorCard}>
            <View style={styles.supervisorHeader}>
              <View style={styles.supervisorIconBox}>
                <Icon name="crown" size={18} color="#B45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supervisorTitle}>MODE SUPERVISEUR ACTIF</Text>
                <Text style={styles.supervisorSub}>
                  Vous gérez l'espace de {activeCollector?.fullName || 'Gestionnaire'}.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                triggerMediumImpact();
                await exitImpersonation();
                router.replace('/admin' as any);
              }}
              style={styles.supervisorReturnBtn}
            >
              <Icon name="arrow-left" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.supervisorReturnBtnText}>Quitter & Retourner au Dashboard Admin</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Icon name="user" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.profileName}>{activeCollector?.fullName || 'Responsable SOL'}</Text>
          <Text style={styles.profilePhone}>{activeCollector?.phoneNumber || '+509 XX XX XXXX'}</Text>
          {activeCollector?.zone ? (
            <Text style={styles.profileZone}>
              Zone : <Text style={styles.profileZoneBold}>{activeCollector.zone}</Text>
            </Text>
          ) : null}
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {userRole === 'ADMIN' ? 'ADMINISTRATEUR' : 'RESPONSABLE DU SOL'}
            </Text>
          </View>

          {/* Edit Profile Info Button */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setEditFullName(activeCollector?.fullName || '');
              setEditPhoneNumber(activeCollector?.phoneNumber || '');
              setEditZone(activeCollector?.zone || '');
              setProfileError(null);
              setIsEditProfileModalOpen(true);
            }}
            style={styles.editProfileBtn}
          >
            <Icon name="user" size={14} color="#1D4ED8" style={{ marginRight: 6 }} />
            <Text style={styles.editProfileBtnText}>Modifier mes informations</Text>
          </TouchableOpacity>
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

        {/* Admin Contact & Support Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="phone" size={16} color="#059669" />
            <Text style={[styles.sectionTitle, { color: '#065F46' }]}>CONTACT & SUPPORT ADMINISTRATEUR</Text>
          </View>
          <Text style={styles.sectionSubtext}>
            Coordonnées officielles de l'administration pour toute demande d'assistance technique ou financière.
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Superviseur :</Text>
            <Text style={styles.infoValueBold}>{adminContact?.fullName || 'Administration Centrale'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Téléphone Hotline :</Text>
            <Text style={[styles.infoValueBold, { color: '#059669' }]}>{adminContact?.phoneNumber || '+509 34 56 7890'}</Text>
          </View>

          {adminContact?.email ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email Support :</Text>
              <Text style={styles.infoValue}>{adminContact.email}</Text>
            </View>
          ) : null}

          {adminContact?.address ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Bureau / Adresse :</Text>
              <Text style={styles.infoValue}>{adminContact.address}</Text>
            </View>
          ) : null}

          {adminContact?.supportHours ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Disponibilité :</Text>
              <Text style={styles.infoValue}>{adminContact.supportHours}</Text>
            </View>
          ) : null}

          {/* Quick Action Contact Buttons */}
          <View style={styles.contactBtnGrid}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleCallAdmin(adminContact?.phoneNumber)}
              style={styles.contactActionBtnCall}
            >
              <Icon name="phone" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.contactActionBtnTextWhite}>Appeler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleWhatsAppAdmin(adminContact?.phoneNumber)}
              style={styles.contactActionBtnWa}
            >
              <Icon name="user" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.contactActionBtnTextWhite}>WhatsApp</Text>
            </TouchableOpacity>

            {adminContact?.email ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleEmailAdmin(adminContact.email)}
                style={styles.contactActionBtnEmail}
              >
                <Icon name="share" size={14} color="#1E293B" style={{ marginRight: 6 }} />
                <Text style={styles.contactActionBtnTextDark}>Email</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* History & Closed Cycles Overview */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="history" size={16} color="#7C3AED" />
            <Text style={[styles.sectionTitle, { color: '#5B21B6' }]}>HISTORIQUE DES CYCLES & BORDEREAUX</Text>
          </View>
          <Text style={styles.sectionSubtext}>
            Consultez et téléchargez les rapports complets de vos cycles clôturés et de vos journées passées.
          </Text>

          {/* Closed Cycles Entry */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/cycle-management' as any)}
            style={styles.historyLinkCard}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Icon name="sol" size={15} color="#7C3AED" />
                <Text style={styles.historyLinkTitle}>Cycles SOL Clôturés</Text>
              </View>
              <Text style={styles.historyLinkSub}>
                {closedCyclesCount > 0
                  ? `${closedCyclesCount} cycle(s) archivé(s) avec bilans PDF téléchargeables`
                  : 'Aucun cycle clôturé pour le moment'}
              </Text>
            </View>
            <View style={styles.historyBadgeBtn}>
              <Text style={styles.historyBadgeBtnText}>Consulter</Text>
              <Icon name="arrow-right" size={12} color="#7C3AED" />
            </View>
          </TouchableOpacity>

          {/* Cash Closures Entry */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/closure' as any)}
            style={[styles.historyLinkCard, { marginTop: 10 }]}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Icon name="cash" size={15} color="#059669" />
                <Text style={styles.historyLinkTitle}>Clôtures de Caisse Journalières</Text>
              </View>
              <Text style={styles.historyLinkSub}>
                {cashClosuresCount > 0
                  ? `${cashClosuresCount} bordereau(x) de clôture disponibles`
                  : 'Historique des réconciliations de caisse'}
              </Text>
            </View>
            <View style={[styles.historyBadgeBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <Text style={[styles.historyBadgeBtnText, { color: '#059669' }]}>Bordereaux</Text>
              <Icon name="arrow-right" size={12} color="#059669" />
            </View>
          </TouchableOpacity>
        </View>

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

        {/* Cycle Management (Danger Zone) */}
        {(userRole === 'MANAGER' || userRole === 'ADMIN') && (
          <View style={styles.dangerZoneCard}>
            <View style={styles.sectionHeader}>
              <Icon name="alert" size={16} color={SOL_COLORS.danger} />
              <Text style={[styles.sectionTitle, { color: SOL_COLORS.danger }]}>ZONE SENSIBLE</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/cycle-management' as any)}
              style={styles.cycleManagementBtn}
            >
              <View style={styles.menuItemLeft}>
                <Icon name="sync" size={18} color={SOL_COLORS.danger} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.cycleManagementBtnText}>Clôturer & Rouvrir le Cycle</Text>
                  <Text style={styles.cycleManagementBtnSub}>Renouvellement ou remise à zéro du SOL</Text>
                </View>
              </View>
              <Icon name="arrow-right" size={14} color={SOL_COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}

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
          <View style={[styles.modalCard, { maxWidth: Math.min(420, width - 32) }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Modifier mon Code PIN</Text>
              <TouchableOpacity
                onPress={() => setIsChangePinModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
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

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditProfileModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditProfileModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: Math.min(420, width - 32) }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Modifier mes informations</Text>
              <TouchableOpacity
                onPress={() => setIsEditProfileModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Mettez à jour vos données personnelles. Elles seront prises en compte immédiatement sur l'application.
            </Text>

            {profileError && <Text style={styles.errorText}>{profileError}</Text>}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NOM COMPLET</Text>
              <TextInput
                style={[styles.textInput, { textAlign: 'left' }]}
                placeholder="Ex: Jean Baptiste"
                placeholderTextColor="#94A3B8"
                value={editFullName}
                onChangeText={setEditFullName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NUMÉRO DE TÉLÉPHONE</Text>
              <TextInput
                style={[styles.textInput, { textAlign: 'left' }]}
                keyboardType="phone-pad"
                placeholder="+509 XXXX XXXX"
                placeholderTextColor="#94A3B8"
                value={editPhoneNumber}
                onChangeText={setEditPhoneNumber}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ZONE D'ACTIVITÉ / MARCHÉ (OPTIONNEL)</Text>
              <TextInput
                style={[styles.textInput, { textAlign: 'left' }]}
                placeholder="Ex: Marché Salomon, Pétion-Ville..."
                placeholderTextColor="#94A3B8"
                value={editZone}
                onChangeText={setEditZone}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setIsEditProfileModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveProfileSubmit}
                disabled={isSavingProfile}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveBtnText}>{isSavingProfile ? 'Enregistrement...' : 'Enregistrer'}</Text>
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
  profileZone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  profileZoneBold: {
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
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
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editProfileBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
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
  dangerZoneCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    marginBottom: 14,
  },
  cycleManagementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cycleManagementBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.dangerDark,
  },
  cycleManagementBtnSub: {
    fontSize: 11,
    fontWeight: '600',
    color: SOL_COLORS.danger,
    marginTop: 1,
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
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    width: '100%',
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
  supervisorCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  supervisorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  supervisorIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  supervisorTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.5,
  },
  supervisorSub: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 2,
    fontWeight: '600',
  },
  supervisorReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B45309',
    paddingVertical: 10,
    borderRadius: 10,
  },
  supervisorReturnBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionSubtext: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 12,
  },
  contactBtnGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  contactActionBtnCall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    flex: 1,
    minWidth: 100,
  },
  contactActionBtnWa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    flex: 1,
    minWidth: 100,
  },
  contactActionBtnEmail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  contactActionBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  contactActionBtnTextDark: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '800',
  },
  historyLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyLinkTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  historyLinkSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  historyBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginLeft: 10,
  },
  historyBadgeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
});
