import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { useAuth, AdminProfile } from '@/context/AuthContext';
import { Icon } from '@/components/Icon';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { SOL_COLORS } from '@/constants/Colors';
import { formatCurrency, formatDateShort, formatDate } from '@/lib/formatters';
import { normalizePhoneNumber, arePhoneNumbersEqual, extractRaw8Digits } from '@/lib/phoneUtils';
import {
  AdminGlobalStats,
  ManagerFullOverview,
  getAdminGlobalStats,
  getAllManagersOverview,
  getGlobalRecentTransactions,
  updateManagerDetails,
  updateBusinessDetails,
  exportDatabaseBackup,
} from '@/db/adminRepository';
import { updateCollectorStatus, setActiveCollectorId, setActiveBusinessId } from '@/db/sqlite';
import { generateAdminGlobalReportPdf, sharePdfFile } from '@/services/pdfService';
import { Transaction, UserStatus } from '@/types';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';

export default function AdminScreen() {
  const router = useRouter();
  const { logout, getAdminProfile, updateAdminProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'MANAGERS' | 'TRANSACTIONS' | 'SETTINGS'>('MANAGERS');
  const [stats, setStats] = useState<AdminGlobalStats>({
    totalManagers: 0,
    activeManagers: 0,
    pendingManagers: 0,
    suspendedManagers: 0,
    totalBusinesses: 0,
    totalClients: 0,
    totalTransactionsCount: 0,
    totalPlatformCollected: 0,
    totalPlatformDistributed: 0,
    platformNetBalance: 0,
  });

  const [managers, setManagers] = useState<ManagerFullOverview[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<UserStatus | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Edit Manager & Business Modal State
  const [selectedManager, setSelectedManager] = useState<ManagerFullOverview | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editBizName, setEditBizName] = useState('');
  const [editUnitAmount, setEditUnitAmount] = useState('');
  const [editSlots, setEditSlots] = useState('');

  // Admin Self Profile Modal State
  const [isAdminProfileModalOpen, setIsAdminProfileModalOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    fullName: 'Superviseur Général',
    phoneNumber: '+50900000000',
    pin: '9999',
  });
  const [adminEditName, setAdminEditName] = useState('');
  const [adminEditPhone, setAdminEditPhone] = useState('');
  const [adminEditPin, setAdminEditPin] = useState('');

  // Universal Sensitive PIN Action State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingActionTitle, setPendingActionTitle] = useState('');
  const [pendingActionSubtitle, setPendingActionSubtitle] = useState('');
  const [pendingActionCallback, setPendingActionCallback] = useState<(() => Promise<void>) | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [gStats, mList, txList, aProfile] = await Promise.all([
        getAdminGlobalStats(),
        getAllManagersOverview(),
        getGlobalRecentTransactions(80),
        getAdminProfile(),
      ]);
      setStats(gStats);
      setManagers(mList);
      setTransactions(txList);
      setAdminProfile(aProfile);
      setAdminEditName(aProfile.fullName);
      setAdminEditPhone(aProfile.phoneNumber);
    } catch (err) {
      console.warn('Admin load error:', err);
    }
  }, [getAdminProfile]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const requirePinForAction = (title: string, subtitle: string, action: () => Promise<void>) => {
    setPendingActionTitle(title);
    setPendingActionSubtitle(subtitle);
    setPendingActionCallback(() => action);
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = async () => {
    setIsPinModalOpen(false);
    if (pendingActionCallback) {
      await pendingActionCallback();
      setPendingActionCallback(null);
    }
  };

  // Quick Manager Status Change
  const handleQuickStatusChange = (collectorId: string, managerName: string, newStatus: UserStatus) => {
    triggerMediumImpact();
    const actionLabel =
      newStatus === 'ACTIVE' ? 'Activer' : newStatus === 'SUSPENDED' ? 'Suspendre' : 'Mettre en attente';

    const explanation =
      newStatus === 'SUSPENDED'
        ? `Êtes-vous sûr de vouloir SUSPENDRE le compte de ${managerName} ? Toutes ses autorisations seront immédiatement bloquées sur son téléphone.`
        : `Voulez-vous ${actionLabel.toLowerCase()} le compte de ${managerName} ?`;

    Alert.alert(`${actionLabel} le responsable`, explanation, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: actionLabel,
        style: newStatus === 'SUSPENDED' ? 'destructive' : 'default',
        onPress: () => {
          requirePinForAction(
            `${actionLabel} le compte`,
            `Saisissez votre code PIN Admin pour confirmer le changement de statut de ${managerName} vers [${newStatus}].`,
            async () => {
              try {
                await updateCollectorStatus(collectorId, newStatus);
                triggerSuccessFeedback();
                Alert.alert('Statut Mis à Jour', `Le compte de ${managerName} est désormais [${newStatus}].`);
                loadData();
              } catch (err: any) {
                triggerErrorFeedback();
                Alert.alert('Erreur', err?.message || 'Échec du changement de statut.');
              }
            }
          );
        },
      },
    ]);
  };

  const handleCallManager = (phone: string) => {
    triggerLightImpact();
    const cleanNumber = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Appel', `Numéro du responsable : ${phone}`);
    });
  };

  const handleWhatsAppManager = (phone: string) => {
    triggerLightImpact();
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${digitsOnly}`).catch(() => {
      Alert.alert('WhatsApp', `Numéro du responsable : ${phone}`);
    });
  };

  const handleOpenEditModal = (item: ManagerFullOverview) => {
    triggerLightImpact();
    setSelectedManager(item);
    setEditFullName(item.collector.fullName);
    setEditPhone(item.collector.phoneNumber);
    setEditZone(item.collector.zone || '');
    setEditPin(''); // Never expose old PIN to admin
    setEditBizName(item.business?.name || '');
    setEditUnitAmount(item.business?.contributionAmount?.toString() || '250');
    setEditSlots(item.business?.totalSlots?.toString() || '10');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedManager) return;
    if (!editFullName.trim()) {
      Alert.alert('Erreur', 'Le nom du responsable ne peut pas être vide.');
      return;
    }
    if (editPin.trim().length > 0 && editPin.trim().length !== 4) {
      Alert.alert('Erreur', 'Si vous réinitialisez le code PIN, il doit comporter exactement 4 chiffres.');
      return;
    }

    requirePinForAction(
      'Confirmation des Modifications',
      `Saisissez votre code PIN Admin pour enregistrer les modifications apportées au compte de ${editFullName}.`,
      async () => {
        try {
          const normPhone = normalizePhoneNumber(editPhone);
          const updatePayload: any = {
            fullName: editFullName.trim(),
            phoneNumber: normPhone,
            zone: editZone.trim(),
          };

          if (editPin.trim().length === 4) {
            updatePayload.pin = editPin.trim();
          }

          await updateManagerDetails(selectedManager.collector.id, updatePayload);

          if (selectedManager.business) {
            await updateBusinessDetails(selectedManager.business.id, {
              name: editBizName.trim(),
              contributionAmount: parseFloat(editUnitAmount) || 250,
              totalSlots: parseInt(editSlots, 10) || 10,
            });
          }

          triggerSuccessFeedback();
          Alert.alert('Modifications Enregistrées', 'Les informations du responsable et de son carnet ont été mises à jour.');
          setIsEditModalOpen(false);
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la mise à jour.');
        }
      }
    );
  };

  const handleSaveAdminProfile = () => {
    if (!adminEditName.trim()) {
      Alert.alert('Erreur', 'Le nom administrateur ne peut pas être vide.');
      return;
    }
    if (adminEditPin.trim().length > 0 && adminEditPin.trim().length !== 4) {
      Alert.alert('Erreur', 'Le nouveau code PIN Admin doit comporter exactement 4 chiffres.');
      return;
    }

    requirePinForAction(
      'Mise à jour du Profil Admin',
      'Saisissez votre code PIN Admin actuel pour valider vos nouvelles informations.',
      async () => {
        try {
          const normPhone = normalizePhoneNumber(adminEditPhone);
          const updatePayload: any = {
            fullName: adminEditName.trim(),
            phoneNumber: normPhone,
          };

          if (adminEditPin.trim().length === 4) {
            updatePayload.pin = adminEditPin.trim();
          }

          await updateAdminProfile(updatePayload);

          triggerSuccessFeedback();
          Alert.alert('Profil Admin Mis à Jour', 'Vos coordonnées et vos identifiants ont été enregistrés avec succès.');
          setIsAdminProfileModalOpen(false);
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la mise à jour.');
        }
      }
    );
  };

  // Export Global PDF Report
  const handleExportGlobalPdfReport = async () => {
    triggerMediumImpact();
    setIsExportingPdf(true);
    try {
      const pdfUri = await generateAdminGlobalReportPdf({
        adminName: adminProfile.fullName,
        adminPhone: adminProfile.phoneNumber,
        totalManagers: stats.totalManagers,
        activeManagers: stats.activeManagers,
        pendingManagers: stats.pendingManagers,
        suspendedManagers: stats.suspendedManagers,
        totalClients: stats.totalClients,
        totalVolumeCollected: stats.totalPlatformCollected,
        totalVolumeDistributed: stats.totalPlatformDistributed,
        netReserveBalance: stats.platformNetBalance,
        managers: managers.map((m) => ({
          name: m.collector.fullName,
          phone: m.collector.phoneNumber,
          zone: m.collector.zone,
          status: m.collector.status,
          businessName: m.business?.name,
          clientsCount: m.clientsCount,
          totalCollected: m.totalCollected,
          totalDistributed: m.totalDistributed,
        })),
        generatedAt: new Date().toISOString(),
      });

      await sharePdfFile(pdfUri, 'Rapport_Global_Plateforme_SOL.pdf');
    } catch (err: any) {
      Alert.alert('Erreur PDF', 'Impossible de générer le rapport PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export Full JSON Backup
  const handleExportBackup = async () => {
    triggerMediumImpact();
    try {
      const jsonBackup = await exportDatabaseBackup();
      await Share.share({
        message: jsonBackup,
        title: `SOL_Backup_${new Date().toISOString().split('T')[0]}.json`,
      });
    } catch {
      Alert.alert('Sauvegarde', 'Sauvegarde prête.');
    }
  };

  const handleOpenBusinessAsManager = async (item: ManagerFullOverview) => {
    triggerLightImpact();
    if (item.business) {
      await setActiveCollectorId(item.collector.id);
      await setActiveBusinessId(item.business.id);
      Alert.alert(
        'Espace Gestionnaire Activé',
        `Vous êtes maintenant positionné sur le carnet "${item.business.name}" de ${item.collector.fullName}.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Ouvrir Espace',
            onPress: () => router.replace('/(tabs)' as any),
          },
        ]
      );
    } else {
      Alert.alert('Aucun Carnet', "Ce responsable n'a pas encore configuré de carnet SOL.");
    }
  };

  const handleLogout = async () => {
    triggerLightImpact();
    Alert.alert('Déconnexion Administrateur', 'Voulez-vous quitter la session Super-Admin ?', [
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

  // Filtered Managers with universal phone normalization
  const filteredManagers = useMemo(() => {
    return managers.filter((m) => {
      if (filterStatus !== 'ALL' && m.collector.status !== filterStatus) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const rawQ = extractRaw8Digits(q);

      return (
        m.collector.fullName.toLowerCase().includes(q) ||
        m.collector.phoneNumber.includes(q) ||
        (rawQ.length >= 4 && extractRaw8Digits(m.collector.phoneNumber).includes(rawQ)) ||
        (m.collector.zone && m.collector.zone.toLowerCase().includes(q)) ||
        (m.business && m.business.name.toLowerCase().includes(q))
      );
    });
  }, [managers, filterStatus, searchQuery]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Admin Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.adminBadge}>
            <Icon name="crown" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
            <Text style={styles.adminBadgeText}>SUPER-ADMINISTRATION</Text>
          </View>
          <Text style={styles.headerTitle}>{adminProfile.fullName}</Text>
          <Text style={styles.headerSubtitle}>{adminProfile.phoneNumber}</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsAdminProfileModalOpen(true)}
            style={styles.profileBtn}
          >
            <Icon name="user" size={14} color={SOL_COLORS.primary} style={{ marginRight: 4 }} />
            <Text style={styles.profileBtnText}>Mon Profil</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleLogout}
            style={styles.logoutBtn}
          >
            <Icon name="arrow-left" size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Global Platform KPIs */}
      <View style={styles.kpiContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiScrollContent}
        >
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL GESTIONNAIRES</Text>
            <Text style={styles.kpiValueBlue}>{stats.totalManagers}</Text>
            <Text style={styles.kpiSub}>{stats.activeManagers} actifs • {stats.pendingManagers} en attente</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>ADHÉRENTS ("ENFANTS")</Text>
            <Text style={styles.kpiValue}>{stats.totalClients}</Text>
            <Text style={styles.kpiSub}>Inscrits sur {stats.totalBusinesses} carnets</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL ENCAISSÉ</Text>
            <Text style={styles.kpiValueGreen}>+{formatCurrency(stats.totalPlatformCollected)}</Text>
            <Text style={styles.kpiSub}>{stats.totalTransactionsCount} opérations</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL DÉCAISSÉ (MAINS)</Text>
            <Text style={styles.kpiValueAmber}>-{formatCurrency(stats.totalPlatformDistributed)}</Text>
            <Text style={styles.kpiSub}>Mains remises</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>SOLDE NET PLATEFORME</Text>
            <Text style={styles.kpiValuePrimary}>{formatCurrency(stats.platformNetBalance)}</Text>
            <Text style={styles.kpiSub}>Réserve totale</Text>
          </View>
        </ScrollView>
      </View>

      {/* 3 Main Navigation Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            triggerLightImpact();
            setActiveTab('MANAGERS');
          }}
          style={[styles.tabBtn, activeTab === 'MANAGERS' && styles.tabBtnActive]}
        >
          <Icon
            name="user"
            size={14}
            color={activeTab === 'MANAGERS' ? '#FFFFFF' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'MANAGERS' && styles.tabBtnTextActive]}>
            Responsables ({managers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            triggerLightImpact();
            setActiveTab('TRANSACTIONS');
          }}
          style={[styles.tabBtn, activeTab === 'TRANSACTIONS' && styles.tabBtnActive]}
        >
          <Icon
            name="history"
            size={14}
            color={activeTab === 'TRANSACTIONS' ? '#FFFFFF' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'TRANSACTIONS' && styles.tabBtnTextActive]}>
            Flux Globaux ({transactions.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            triggerLightImpact();
            setActiveTab('SETTINGS');
          }}
          style={[styles.tabBtn, activeTab === 'SETTINGS' && styles.tabBtnActive]}
        >
          <Icon
            name="shield"
            size={14}
            color={activeTab === 'SETTINGS' ? '#FFFFFF' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.tabBtnText, activeTab === 'SETTINGS' && styles.tabBtnTextActive]}>
            Paramètres
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: MANAGERS */}
      {activeTab === 'MANAGERS' && (
        <>
          {/* Search & Filter Section */}
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher nom, téléphone (+509...), zone..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Icon name="close" size={16} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              <TouchableOpacity
                onPress={() => setFilterStatus('ALL')}
                style={[styles.filterChip, filterStatus === 'ALL' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filterStatus === 'ALL' && styles.filterChipTextActive]}>
                  Tous ({managers.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterStatus('PENDING_APPROVAL')}
                style={[
                  styles.filterChip,
                  filterStatus === 'PENDING_APPROVAL' && styles.filterChipWarning,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterStatus === 'PENDING_APPROVAL' && { color: '#B45309', fontWeight: '900' },
                  ]}
                >
                  En Attente ({stats.pendingManagers})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterStatus('ACTIVE')}
                style={[styles.filterChip, filterStatus === 'ACTIVE' && styles.filterChipSuccess]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterStatus === 'ACTIVE' && { color: '#047857', fontWeight: '900' },
                  ]}
                >
                  Actifs ({stats.activeManagers})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterStatus('SUSPENDED')}
                style={[styles.filterChip, filterStatus === 'SUSPENDED' && styles.filterChipDanger]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterStatus === 'SUSPENDED' && { color: '#DC2626', fontWeight: '900' },
                  ]}
                >
                  Suspendus ({stats.suspendedManagers})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Managers List */}
          <FlatList
            data={filteredManagers}
            keyExtractor={(item) => item.collector.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#1D4ED8']}
              />
            }
            renderItem={({ item }) => {
              const isPending = item.collector.status === 'PENDING_APPROVAL';
              const isSuspended = item.collector.status === 'SUSPENDED';

              return (
                <View
                  style={[
                    styles.managerCard,
                    isPending && styles.managerCardPending,
                    isSuspended && styles.managerCardSuspended,
                  ]}
                >
                  {/* Top Bar: Name + Status */}
                  <View style={styles.managerTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.managerName}>{item.collector.fullName}</Text>
                      <Text style={styles.managerPhone}>
                        {item.collector.phoneNumber} • PIN : <Text style={styles.pinBold}>**** (Crypté)</Text>
                      </Text>
                      {item.collector.zone && (
                        <Text style={styles.zoneText}>Zone : {item.collector.zone}</Text>
                      )}
                      {item.business && (
                        <Text style={styles.bizInfoText}>
                          Carnet : <Text style={styles.bizBold}>{item.business.name}</Text> ({formatCurrency(item.business.contributionAmount)}/main • {item.business.totalSlots} enfants)
                        </Text>
                      )}
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        item.collector.status === 'ACTIVE'
                          ? styles.statusBadgeActive
                          : isPending
                          ? styles.statusBadgePending
                          : styles.statusBadgeSuspended,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          item.collector.status === 'ACTIVE'
                            ? styles.statusBadgeTextActive
                            : isPending
                            ? styles.statusBadgeTextPending
                            : styles.statusBadgeTextSuspended,
                        ]}
                      >
                        {item.collector.status === 'ACTIVE'
                          ? 'ACTIF'
                          : isPending
                          ? 'EN ATTENTE'
                          : 'SUSPENDU'}
                      </Text>
                    </View>
                  </View>

                  {/* Financial Stats Bar for this Manager */}
                  <View style={styles.managerStatsRow}>
                    <View style={styles.managerStatItem}>
                      <Text style={styles.managerStatLabel}>ENFANTS INSCRITS</Text>
                      <Text style={styles.managerStatValue}>{item.clientsCount}</Text>
                    </View>
                    <View style={styles.managerStatItem}>
                      <Text style={styles.managerStatLabel}>ENCAISSÉ</Text>
                      <Text style={styles.managerStatGreen}>+{formatCurrency(item.totalCollected)}</Text>
                    </View>
                    <View style={styles.managerStatItem}>
                      <Text style={styles.managerStatLabel}>DÉCAISSÉ</Text>
                      <Text style={styles.managerStatRed}>-{formatCurrency(item.totalDistributed)}</Text>
                    </View>
                  </View>

                  {/* Quick Contact & Action Buttons */}
                  <View style={styles.managerActionRow}>
                    {/* Quick Call */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleCallManager(item.collector.phoneNumber)}
                      style={styles.actionBtnIcon}
                    >
                      <Icon name="phone" size={14} color="#1D4ED8" />
                    </TouchableOpacity>

                    {/* Quick WhatsApp */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleWhatsAppManager(item.collector.phoneNumber)}
                      style={styles.actionBtnIcon}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '900', color: '#059669' }}>WA</Text>
                    </TouchableOpacity>

                    {/* Status Toggle Buttons */}
                    {isPending && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleQuickStatusChange(item.collector.id, item.collector.fullName, 'ACTIVE')}
                        style={styles.actionBtnApprove}
                      >
                        <Icon name="check" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.actionBtnApproveText}>Activer</Text>
                      </TouchableOpacity>
                    )}

                    {!isPending && !isSuspended && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleQuickStatusChange(item.collector.id, item.collector.fullName, 'SUSPENDED')}
                        style={styles.actionBtnSuspend}
                      >
                        <Text style={styles.actionBtnSuspendText}>Suspendre</Text>
                      </TouchableOpacity>
                    )}

                    {isSuspended && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleQuickStatusChange(item.collector.id, item.collector.fullName, 'ACTIVE')}
                        style={styles.actionBtnApprove}
                      >
                        <Icon name="sync" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.actionBtnApproveText}>Réactiver</Text>
                      </TouchableOpacity>
                    )}

                    {/* Edit Manager & Carnet */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenEditModal(item)}
                      style={styles.actionBtnEdit}
                    >
                      <Text style={styles.actionBtnEditText}>Éditer</Text>
                    </TouchableOpacity>

                    {/* Switch to Carnet */}
                    {item.business && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleOpenBusinessAsManager(item)}
                        style={styles.actionBtnCarnet}
                      >
                        <Text style={styles.actionBtnCarnetText}>Carnet</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Icon name="user" size={32} color="#94A3B8" />
                <Text style={styles.emptyText}>Aucun responsable trouvé.</Text>
              </View>
            }
          />
        </>
      )}

      {/* TAB 2: GLOBAL FLUX / TRANSACTIONS */}
      {activeTab === 'TRANSACTIONS' && (
        <View style={{ flex: 1 }}>
          {/* Export PDF Banner */}
          <View style={styles.exportPdfBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.exportPdfTitle}>Rapport Global Financier</Text>
              <Text style={styles.exportPdfSub}>Téléchargez l'audit officiel certifié en fichier PDF.</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleExportGlobalPdfReport}
              disabled={isExportingPdf}
              style={styles.exportPdfBtn}
            >
              <Icon name="print" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.exportPdfBtnText}>
                {isExportingPdf ? 'Génération...' : 'Exporter PDF'}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={['#1D4ED8']}
              />
            }
            renderItem={({ item }) => (
              <View style={styles.txCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txClientName}>{item.clientName || 'Adhérent'}</Text>
                  <Text style={styles.txType}>{item.type} • {formatDate(item.createdAtLocal)}</Text>
                  {item.note && <Text style={styles.txNote}>{item.note}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.txAmount, (item.type.includes('PAYOUT') || item.type.includes('WITHDRAWAL')) ? styles.txAmountRed : styles.txAmountGreen]}>
                    {(item.type.includes('PAYOUT') || item.type.includes('WITHDRAWAL')) ? '-' : '+'}
                    {formatCurrency(item.amount)}
                  </Text>
                  <Text style={styles.txHands}>{item.handsCovered || 1} main(s)</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Aucune transaction enregistrée sur la plateforme.</Text>
              </View>
            }
          />
        </View>
      )}

      {/* TAB 3: SYSTEM SETTINGS & SECURITY */}
      {activeTab === 'SETTINGS' && (
        <ScrollView contentContainerStyle={styles.settingsScrollContent}>
          {/* Admin Hotline Config */}
          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>ASSISTANCE & HOTLINE OFFICIELLE</Text>
            <Text style={styles.settingsCardSub}>
              Numéro de téléphone d'assistance affiché aux gestionnaires suspendus et sur les reçus officiels.
            </Text>

            <View style={styles.settingsRow}>
              <View>
                <Text style={styles.settingsLabel}>Nom Admin :</Text>
                <Text style={styles.settingsValue}>{adminProfile.fullName}</Text>
              </View>
              <View>
                <Text style={styles.settingsLabel}>Téléphone :</Text>
                <Text style={styles.settingsValue}>{adminProfile.phoneNumber}</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsAdminProfileModalOpen(true)}
              style={styles.settingsEditBtn}
            >
              <Text style={styles.settingsEditBtnText}>Modifier Coordonnées Hotline</Text>
            </TouchableOpacity>
          </View>

          {/* Database Backup & Export */}
          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>SAUVEGARDE GLOBALE DES DONNÉES</Text>
            <Text style={styles.settingsCardSub}>
              Exportez l'intégralité de la base de données (responsables, carnets, adhérents, transactions) au format JSON.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleExportBackup}
              style={styles.backupBtn}
            >
              <Icon name="shield" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.backupBtnText}>Exporter la Sauvegarde JSON</Text>
            </TouchableOpacity>
          </View>

          {/* Database Integrity Stats */}
          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>AUDIT D'INTÉGRITÉ DU SYSTÈME</Text>
            <View style={styles.integrityItem}>
              <Text style={styles.integrityLabel}>Total Comptes Responsables :</Text>
              <Text style={styles.integrityVal}>{stats.totalManagers}</Text>
            </View>
            <View style={styles.integrityItem}>
              <Text style={styles.integrityLabel}>Total Carnets Créés :</Text>
              <Text style={styles.integrityVal}>{stats.totalBusinesses}</Text>
            </View>
            <View style={styles.integrityItem}>
              <Text style={styles.integrityLabel}>Total Adhérents Inscrits :</Text>
              <Text style={styles.integrityVal}>{stats.totalClients}</Text>
            </View>
            <View style={styles.integrityItem}>
              <Text style={styles.integrityLabel}>Total Transactions Enregistrées :</Text>
              <Text style={styles.integrityVal}>{stats.totalTransactionsCount}</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Edit Manager Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Modifier le Responsable & Carnet</Text>
              <Text style={styles.modalSub}>
                Ajustez les informations personnelles, le code PIN ou le paramétrage du carnet.
              </Text>

              <Text style={styles.formSectionTitle}>INFORMATIONS GESTIONNAIRE</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOM COMPLET</Text>
                <TextInput
                  style={styles.formInput}
                  value={editFullName}
                  onChangeText={setEditFullName}
                  placeholder="Nom complet"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>TÉLÉPHONE (+509...)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+509 XX XX XXXX"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>MARCHÉ / ZONE</Text>
                <TextInput
                  style={styles.formInput}
                  value={editZone}
                  onChangeText={setEditZone}
                  placeholder="Ex: Marché Salomon"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>RÉINITIALISER CODE PIN (4 CHIFFRES)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editPin}
                  onChangeText={setEditPin}
                  placeholder="Laisser vide ou saisir 4 chiffres pour réinitialiser"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>

              <Text style={styles.formSectionTitle}>PARAMÉTRAGE DU CARNET SOL</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOM DU CARNET / GROUPE</Text>
                <TextInput
                  style={styles.formInput}
                  value={editBizName}
                  onChangeText={setEditBizName}
                  placeholder="Nom du carnet"
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.formLabel}>VALEUR MAIN (HTG)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editUnitAmount}
                    onChangeText={setEditUnitAmount}
                    placeholder="250"
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>ENFANTS (PLACES)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editSlots}
                    onChangeText={setEditSlots}
                    placeholder="10"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  onPress={() => setIsEditModalOpen(false)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelBtnText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveEdit}
                  style={styles.modalSaveBtn}
                >
                  <Text style={styles.modalSaveBtnText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Admin Profile Self-Edit Modal */}
      <Modal
        visible={isAdminProfileModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAdminProfileModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Mon Profil Administrateur</Text>
              <Text style={styles.modalSub}>
                Modifiez votre nom, votre numéro de téléphone et votre code PIN Super-Admin.
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOM COMPLET ADMINISTRATEUR</Text>
                <TextInput
                  style={styles.formInput}
                  value={adminEditName}
                  onChangeText={setAdminEditName}
                  placeholder="Superviseur Général"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NUMÉRO DE TÉLÉPHONE (+509...)</Text>
                <TextInput
                  style={styles.formInput}
                  value={adminEditPhone}
                  onChangeText={setAdminEditPhone}
                  placeholder="+509 XX XX XXXX"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOUVEAU CODE PIN SUPER-ADMIN (4 CHIFFRES)</Text>
                <TextInput
                  style={styles.formInput}
                  value={adminEditPin}
                  onChangeText={setAdminEditPin}
                  placeholder="Laisser vide pour conserver le PIN actuel"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  onPress={() => setIsAdminProfileModalOpen(false)}
                  style={styles.modalCancelBtn}
                >
                  <Text style={styles.modalCancelBtnText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveAdminProfile}
                  style={styles.modalSaveBtn}
                >
                  <Text style={styles.modalSaveBtnText}>Enregistrer Profil</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Universal 4-Digit PIN Security Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        title={pendingActionTitle || 'Validation Administrateur'}
        subtitle={pendingActionSubtitle || 'Veuillez saisir votre code PIN Super-Admin (4 chiffres) pour confirmer cette opération sensible.'}
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setIsPinModalOpen(false);
          setPendingActionCallback(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flex: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  adminBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  profileBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  kpiContainer: {
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  kpiScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  kpiCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    minWidth: 155,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    marginTop: 2,
  },
  kpiValueBlue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1D4ED8',
    marginTop: 2,
  },
  kpiValueGreen: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  kpiValueAmber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#D97706',
    marginTop: 2,
  },
  kpiValuePrimary: {
    fontSize: 18,
    fontWeight: '900',
    color: SOL_COLORS.primary,
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: {
    backgroundColor: SOL_COLORS.primary,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
  },
  filterChipsRow: {
    gap: 6,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#1E293B',
  },
  filterChipSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  filterChipWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  filterChipDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  managerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  managerCardPending: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFDF5',
  },
  managerCardSuspended: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  managerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  managerName: {
    fontSize: 16,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  managerPhone: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  pinBold: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  zoneText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2,
  },
  bizInfoText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  bizBold: {
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgePending: {
    backgroundColor: '#FFFBEB',
  },
  statusBadgeSuspended: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  statusBadgeTextActive: {
    color: '#059669',
  },
  statusBadgeTextPending: {
    color: '#D97706',
  },
  statusBadgeTextSuspended: {
    color: '#DC2626',
  },
  managerStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  managerStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  managerStatLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  managerStatValue: {
    fontSize: 13,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
    marginTop: 1,
  },
  managerStatGreen: {
    fontSize: 13,
    fontWeight: '900',
    color: '#059669',
    marginTop: 1,
  },
  managerStatRed: {
    fontSize: 13,
    fontWeight: '900',
    color: '#DC2626',
    marginTop: 1,
  },
  managerActionRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  actionBtnIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnApprove: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 34,
    borderRadius: 8,
  },
  actionBtnApproveText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionBtnSuspend: {
    flex: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  actionBtnSuspendText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  actionBtnEdit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnEditText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  actionBtnCarnet: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  actionBtnCarnetText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  exportPdfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    margin: 16,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
  },
  exportPdfTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  exportPdfSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  exportPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportPdfBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  txCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  txClientName: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  txType: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  txNote: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '900',
  },
  txAmountGreen: {
    color: '#059669',
  },
  txAmountRed: {
    color: '#DC2626',
  },
  txHands: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 1,
  },
  settingsScrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  settingsCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  settingsCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    marginBottom: 12,
    lineHeight: 16,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  settingsLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
  },
  settingsValue: {
    fontSize: 13,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
    marginTop: 1,
  },
  settingsEditBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  settingsEditBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: SOL_COLORS.primary,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  backupBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  integrityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  integrityLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  integrityVal: {
    fontSize: 13,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SOL_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  formSectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  formGroup: {
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
  },
  formLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    height: 42,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
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
