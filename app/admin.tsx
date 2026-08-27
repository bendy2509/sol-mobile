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
  restoreDatabaseBackup,
} from '@/db/adminRepository';
import { updateCollectorStatus, setActiveCollectorId, setActiveBusinessId } from '@/db/sqlite';
import { generateAdminGlobalReportPdf, sharePdfFile } from '@/services/pdfService';
import { getAuditLogs } from '@/services/auditService';
import { getSyncQueueSummary, triggerManualSync } from '@/services/syncQueueService';
import { AuditLog, AuditLogAction, SyncState, Transaction, UserStatus } from '@/types';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';

export default function AdminScreen() {
  const router = useRouter();
  const { logout, getAdminProfile, updateAdminProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'MANAGERS' | 'TRANSACTIONS' | 'AUDIT_LOGS' | 'SYNC_STATUS' | 'SETTINGS'>('MANAGERS');
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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilter, setAuditFilter] = useState<AuditLogAction | 'ALL'>('ALL');
  const [syncSummary, setSyncSummary] = useState<SyncState & { failedErrors: string[] }>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    failedErrors: [],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<UserStatus | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

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

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');

  // Universal Sensitive PIN Action State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingActionTitle, setPendingActionTitle] = useState('');
  const [pendingActionSubtitle, setPendingActionSubtitle] = useState('');
  const [pendingActionCallback, setPendingActionCallback] = useState<(() => Promise<void>) | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [gStats, mList, txList, aProfile, aLogs, sSummary] = await Promise.all([
        getAdminGlobalStats(),
        getAllManagersOverview(),
        getGlobalRecentTransactions(80),
        getAdminProfile(),
        getAuditLogs({ limit: 100 }),
        getSyncQueueSummary(),
      ]);
      setStats(gStats);
      setManagers(mList);
      setTransactions(txList);
      setAdminProfile(aProfile);
      setAdminEditName(aProfile.fullName);
      setAdminEditPhone(aProfile.phoneNumber);
      setAuditLogs(aLogs);
      setSyncSummary(sSummary);
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
    setEditPin('');
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
      `Saisissez votre code PIN Admin pour valider les modifications du compte et du carnet de ${selectedManager.collector.fullName}.`,
      async () => {
        try {
          const normPhone = normalizePhoneNumber(editPhone);

          await updateManagerDetails(selectedManager.collector.id, {
            fullName: editFullName.trim(),
            phoneNumber: normPhone,
            zone: editZone.trim(),
            pin: editPin.trim().length === 4 ? editPin.trim() : undefined,
          });

          if (selectedManager.business) {
            await updateBusinessDetails(selectedManager.business.id, {
              name: editBizName.trim(),
              contributionAmount: parseFloat(editUnitAmount) || 250,
              totalSlots: parseInt(editSlots, 10) || 10,
            });
          }

          triggerSuccessFeedback();
          Alert.alert('Succès', 'Les modifications ont été enregistrées avec succès.');
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
      Alert.alert('Erreur', 'Le code PIN doit comporter exactement 4 chiffres.');
      return;
    }

    requirePinForAction(
      'Mettre à jour le Profil Admin',
      'Saisissez votre code PIN Admin actuel pour valider vos nouvelles coordonnées.',
      async () => {
        try {
          await updateAdminProfile({
            fullName: adminEditName.trim(),
            phoneNumber: adminEditPhone.trim(),
            pin: adminEditPin.trim().length === 4 ? adminEditPin.trim() : undefined,
          });
          triggerSuccessFeedback();
          Alert.alert('Succès', 'Vos coordonnées administratives ont été mises à jour.');
          setIsAdminProfileModalOpen(false);
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la mise à jour.');
        }
      }
    );
  };

  // Export Full PDF Report
  const handleExportPdfReport = async () => {
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

  // Restore JSON Backup
  const handleConfirmRestore = () => {
    if (!restoreJsonInput.trim()) {
      Alert.alert('Erreur', 'Veuillez coller le contenu JSON de la sauvegarde.');
      return;
    }

    requirePinForAction(
      'Confirmation Restauration',
      'ATTENTION : La restauration remplacera les données locales par celles de la sauvegarde. Un instantané de secours préalable sera conservé. Saisissez votre PIN Admin :',
      async () => {
        try {
          const res = await restoreDatabaseBackup(restoreJsonInput.trim(), 'admin');
          if (res.success) {
            triggerSuccessFeedback();
            Alert.alert(
              'Restauration Réussie !',
              `Données restaurées :\n- ${res.stats.collectors} responsables\n- ${res.stats.businesses} carnets\n- ${res.stats.clients} adhérents\n- ${res.stats.transactions} transactions.`
            );
            setIsRestoreModalOpen(false);
            setRestoreJsonInput('');
            loadData();
          } else {
            triggerErrorFeedback();
            Alert.alert('Erreur de Restauration', res.error || 'Fichier de sauvegarde invalide.');
          }
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la restauration.');
        }
      }
    );
  };

  // Trigger Manual Sync
  const handleManualSyncTrigger = async () => {
    triggerLightImpact();
    setIsManualSyncing(true);
    try {
      const res = await triggerManualSync();
      if (res.success) {
        triggerSuccessFeedback();
        Alert.alert('Synchronisation', 'Synchronisation avec Supabase terminée.');
      } else {
        triggerErrorFeedback();
        Alert.alert('Notice Synchronisation', res.message);
      }
      await loadData();
    } finally {
      setIsManualSyncing(false);
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
    }
  };

  const handleLogout = () => {
    triggerMediumImpact();
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter du Super-Administrateur ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  // Filtered Managers
  const filteredManagers = useMemo(() => {
    let result = managers;

    if (filterStatus !== 'ALL') {
      result = result.filter((m) => m.collector.status === filterStatus);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.collector.fullName.toLowerCase().includes(q) ||
          m.collector.phoneNumber.toLowerCase().includes(q) ||
          m.collector.zone?.toLowerCase().includes(q) ||
          m.business?.name.toLowerCase().includes(q)
      );
    }

    return result;
  }, [managers, filterStatus, searchQuery]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    if (auditFilter === 'ALL') return auditLogs;
    return auditLogs.filter((l) => l.action === auditFilter);
  }, [auditLogs, auditFilter]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.adminBadge}>
            <Icon name="shield" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.adminBadgeText}>SUPER-ADMINISTRATEUR</Text>
          </View>
          <Text style={styles.headerTitle}>Contrôle & Super-Audit</Text>
          <Text style={styles.headerSub}>Plateforme Centrale SOL Mobile</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleExportPdfReport}
            disabled={isExportingPdf}
            style={styles.pdfExportBtn}
          >
            <Icon name="print" size={14} color="#1D4ED8" style={{ marginRight: 4 }} />
            <Text style={styles.pdfExportText}>
              {isExportingPdf ? 'PDF...' : 'Rapport PDF'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleLogout}
            style={styles.logoutBtn}
          >
            <Icon name="shield" size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Global Banner */}
      <View style={styles.kpiContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL GESTIONNAIRES</Text>
            <Text style={styles.kpiValue}>{stats.totalManagers}</Text>
            <Text style={styles.kpiSub}>
              {stats.activeManagers} actifs · {stats.pendingManagers} en attente
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL COTISÉ PLATEFORME</Text>
            <Text style={styles.kpiValueGreen}>{formatCurrency(stats.totalPlatformCollected)}</Text>
            <Text style={styles.kpiSub}>{stats.totalTransactionsCount} transactions</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL DISTRIBUÉ (MAINS)</Text>
            <Text style={styles.kpiValueAmber}>{formatCurrency(stats.totalPlatformDistributed)}</Text>
            <Text style={styles.kpiSub}>{stats.totalBusinesses} carnets SOL</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>RÉSERVE NETTE LOCALE</Text>
            <Text style={styles.kpiValuePrimary}>{formatCurrency(stats.platformNetBalance)}</Text>
            <Text style={styles.kpiSub}>{stats.totalClients} adhérents inscrits</Text>
          </View>
        </ScrollView>
      </View>

      {/* 5 Main Navigation Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
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
              size={13}
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
              size={13}
              color={activeTab === 'TRANSACTIONS' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'TRANSACTIONS' && styles.tabBtnTextActive]}>
              Flux ({transactions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              triggerLightImpact();
              setActiveTab('AUDIT_LOGS');
            }}
            style={[styles.tabBtn, activeTab === 'AUDIT_LOGS' && styles.tabBtnActive]}
          >
            <Icon
              name="shield"
              size={13}
              color={activeTab === 'AUDIT_LOGS' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'AUDIT_LOGS' && styles.tabBtnTextActive]}>
              Audit Logs ({auditLogs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              triggerLightImpact();
              setActiveTab('SYNC_STATUS');
            }}
            style={[styles.tabBtn, activeTab === 'SYNC_STATUS' && styles.tabBtnActive]}
          >
            <Icon
              name="sync"
              size={13}
              color={activeTab === 'SYNC_STATUS' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'SYNC_STATUS' && styles.tabBtnTextActive]}>
              Sync ({syncSummary.pendingCount})
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
              size={13}
              color={activeTab === 'SETTINGS' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'SETTINGS' && styles.tabBtnTextActive]}>
              Paramètres
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TAB 1: MANAGERS */}
      {activeTab === 'MANAGERS' && (
        <>
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher responsable, téléphone, carnet, zone..."
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
              <TouchableOpacity
                onPress={() => setFilterStatus('ALL')}
                style={[styles.filterChip, filterStatus === 'ALL' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filterStatus === 'ALL' && styles.filterChipTextActive]}>
                  Tous ({managers.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterStatus('ACTIVE')}
                style={[styles.filterChip, filterStatus === 'ACTIVE' && styles.filterChipActive, styles.filterChipSuccess]}
              >
                <Text style={[styles.filterChipText, filterStatus === 'ACTIVE' && styles.filterChipTextActive]}>
                  Actifs ({stats.activeManagers})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterStatus('PENDING_APPROVAL')}
                style={[styles.filterChip, filterStatus === 'PENDING_APPROVAL' && styles.filterChipActive, styles.filterChipWarning]}
              >
                <Text style={[styles.filterChipText, filterStatus === 'PENDING_APPROVAL' && styles.filterChipTextActive]}>
                  En attente ({stats.pendingManagers})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterStatus('SUSPENDED')}
                style={[styles.filterChip, filterStatus === 'SUSPENDED' && styles.filterChipActive, styles.filterChipDanger]}
              >
                <Text style={[styles.filterChipText, filterStatus === 'SUSPENDED' && styles.filterChipTextActive]}>
                  Suspendus ({stats.suspendedManagers})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <FlatList
            data={filteredManagers}
            keyExtractor={(item) => item.collector.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[SOL_COLORS.primary]} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const { collector, business, clientsCount, totalCollected, totalDistributed } = item;
              const isPending = collector.status === 'PENDING_APPROVAL';
              const isSuspended = collector.status === 'SUSPENDED';

              return (
                <View style={[styles.managerCard, isPending && styles.managerCardPending, isSuspended && styles.managerCardSuspended]}>
                  <View style={styles.managerTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.managerName}>{collector.fullName}</Text>
                      <Text style={styles.managerPhone}>
                        {collector.phoneNumber} · PIN : <Text style={styles.pinBold}>**** (Chiffré)</Text>
                      </Text>
                      {collector.zone && <Text style={styles.zoneText}>Zone : {collector.zone}</Text>}
                      {business && (
                        <Text style={styles.bizInfoText}>
                          Carnet : <Text style={styles.bizBold}>{business.name}</Text> ({business.totalSlots} enfants · {formatCurrency(business.contributionAmount)})
                        </Text>
                      )}
                    </View>

                    <View style={[styles.statusBadge, isPending ? styles.statusBadgePending : isSuspended ? styles.statusBadgeSuspended : styles.statusBadgeActive]}>
                      <Text style={[styles.statusBadgeText, isPending ? styles.statusBadgeTextPending : isSuspended ? styles.statusBadgeTextSuspended : styles.statusBadgeTextActive]}>
                        {isPending ? 'EN ATTENTE' : isSuspended ? 'SUSPENDU' : 'ACTIF'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.managerStatsRow}>
                    <View style={styles.managerStatItem}>
                      <Text style={styles.managerStatLabel}>ENFANTS</Text>
                      <Text style={styles.managerStatValue}>{clientsCount}</Text>
                    </View>
                    <View style={styles.managerStatItem}>
                      <Text style={styles.managerStatLabel}>TOTAL COTISÉ</Text>
                      <Text style={styles.managerStatGreen}>{formatCurrency(totalCollected)}</Text>
                    </View>
                    <View style={styles.managerStatItem}>
                      <Text style={styles.managerStatLabel}>TOTAL DISTRIBUÉ</Text>
                      <Text style={styles.managerStatRed}>{formatCurrency(totalDistributed)}</Text>
                    </View>
                  </View>

                  <View style={styles.managerActionRow}>
                    <TouchableOpacity onPress={() => handleCallManager(collector.phoneNumber)} style={styles.actionCircleBtn}>
                      <Icon name="phone" size={14} color="#0284C7" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleWhatsAppManager(collector.phoneNumber)} style={styles.actionCircleBtn}>
                      <Icon name="phone" size={14} color="#059669" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleOpenEditModal(item)} style={styles.actionEditBtn}>
                      <Icon name="user" size={12} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.actionEditText}>Modifier</Text>
                    </TouchableOpacity>
                    {isPending && (
                      <TouchableOpacity onPress={() => handleQuickStatusChange(collector.id, collector.fullName, 'ACTIVE')} style={styles.actionApproveBtn}>
                        <Icon name="check" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.actionApproveText}>Approuver</Text>
                      </TouchableOpacity>
                    )}
                    {collector.status === 'ACTIVE' && (
                      <TouchableOpacity onPress={() => handleQuickStatusChange(collector.id, collector.fullName, 'SUSPENDED')} style={styles.actionSuspendBtn}>
                        <Icon name="shield" size={12} color="#DC2626" style={{ marginRight: 4 }} />
                        <Text style={styles.actionSuspendText}>Suspendre</Text>
                      </TouchableOpacity>
                    )}
                    {isSuspended && (
                      <TouchableOpacity onPress={() => handleQuickStatusChange(collector.id, collector.fullName, 'ACTIVE')} style={styles.actionReactivateBtn}>
                        <Icon name="check" size={12} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.actionReactivateText}>Réactiver</Text>
                      </TouchableOpacity>
                    )}
                    {business && (
                      <TouchableOpacity onPress={() => handleOpenBusinessAsManager(item)} style={styles.actionSwitchBtn}>
                        <Icon name="arrow-right" size={12} color="#4338CA" style={{ marginRight: 4 }} />
                        <Text style={styles.actionSwitchText}>Ouvrir</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </>
      )}

      {/* TAB 2: TRANSACTIONS */}
      {activeTab === 'TRANSACTIONS' && (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[SOL_COLORS.primary]} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isPayout = item.type === 'SOL_PAYOUT' || item.type === 'HAND_PAYOUT' || item.type === 'WITHDRAWAL';
            const isReversal = item.type === 'REVERSAL' || item.isReversed;
            return (
              <View style={[styles.txCard, isReversal && styles.txCardReversed]}>
                <View style={styles.txLeft}>
                  <View style={[styles.txIconBox, isReversal ? styles.txIconReversal : isPayout ? styles.txIconPayout : styles.txIconDeposit]}>
                    <Icon name={isReversal ? 'arrow-left' : isPayout ? 'arrow-right' : 'arrow-left'} size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.txClientName}>{item.clientName || 'Adhérent inconnu'}</Text>
                    <Text style={styles.txNote}>{item.note || item.type}</Text>
                    <Text style={styles.txDate}>{formatDate(item.createdAtLocal)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.txAmount, isReversal ? styles.txAmountReversal : isPayout ? styles.txAmountPayout : styles.txAmountDeposit]}>
                    {isReversal ? '-' : isPayout ? '-' : '+'}
                    {formatCurrency(item.amount)}
                  </Text>
                  <Text style={styles.txRef}>#{item.id.slice(0, 8)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'AUDIT_LOGS' && (
        <>
          <View style={styles.searchSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
              <TouchableOpacity onPress={() => setAuditFilter('ALL')} style={[styles.filterChip, auditFilter === 'ALL' && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, auditFilter === 'ALL' && styles.filterChipTextActive]}>Tous ({auditLogs.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuditFilter('CREATE_CONTRIBUTION')} style={[styles.filterChip, auditFilter === 'CREATE_CONTRIBUTION' && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, auditFilter === 'CREATE_CONTRIBUTION' && styles.filterChipTextActive]}>Cotisations</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuditFilter('REVERSE_CONTRIBUTION')} style={[styles.filterChip, auditFilter === 'REVERSE_CONTRIBUTION' && styles.filterChipActive, styles.filterChipDanger]}>
                <Text style={[styles.filterChipText, auditFilter === 'REVERSE_CONTRIBUTION' && styles.filterChipTextActive]}>Annulations</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuditFilter('CREATE_PAYOUT')} style={[styles.filterChip, auditFilter === 'CREATE_PAYOUT' && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, auditFilter === 'CREATE_PAYOUT' && styles.filterChipTextActive]}>Mains Remises</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuditFilter('SUSPEND_MANAGER')} style={[styles.filterChip, auditFilter === 'SUSPEND_MANAGER' && styles.filterChipActive, styles.filterChipDanger]}>
                <Text style={[styles.filterChipText, auditFilter === 'SUSPEND_MANAGER' && styles.filterChipTextActive]}>Suspensions</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <FlatList
            data={filteredAuditLogs}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[SOL_COLORS.primary]} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.auditCard}>
                <View style={styles.auditTopRow}>
                  <View style={styles.auditActionTag}>
                    <Text style={styles.auditActionText}>{item.action}</Text>
                  </View>
                  <Text style={styles.auditDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.auditUser}>
                  Opérateur : <Text style={styles.auditUserBold}>{item.userRole} [{item.userId.slice(0, 8)}]</Text> · Cible : {item.entityType} #{item.entityId.slice(0, 8)}
                </Text>
                {item.reason && <Text style={styles.auditReason}>Motif : {item.reason}</Text>}
              </View>
            )}
          />
        </>
      )}

      {/* TAB 4: SYNC STATUS */}
      {activeTab === 'SYNC_STATUS' && (
        <ScrollView contentContainerStyle={styles.settingsScrollContent}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>ÉTAT DE LA SYNCHRONISATION</Text>
            <Text style={styles.settingsCardSub}>
              Suivi en temps réel des opérations locales en attente d'envoi vers Supabase.
            </Text>

            <View style={styles.syncStatsGrid}>
              <View style={styles.syncStatBox}>
                <Text style={styles.syncStatLabel}>EN ATTENTE</Text>
                <Text style={styles.syncStatValueAmber}>{syncSummary.pendingCount}</Text>
              </View>
              <View style={styles.syncStatBox}>
                <Text style={styles.syncStatLabel}>SYNCHRONISÉES</Text>
                <Text style={styles.syncStatValueGreen}>{syncSummary.syncedCount}</Text>
              </View>
              <View style={styles.syncStatBox}>
                <Text style={styles.syncStatLabel}>ERREURS</Text>
                <Text style={styles.syncStatValueRed}>{syncSummary.failedCount}</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleManualSyncTrigger}
              disabled={isManualSyncing}
              style={styles.manualSyncBtn}
            >
              <Icon name="sync" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.manualSyncBtnText}>
                {isManualSyncing ? 'Synchronisation...' : 'Relancer la Synchronisation Maintenant'}
              </Text>
            </TouchableOpacity>
          </View>

          {syncSummary.failedErrors.length > 0 && (
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardTitle}>DERNIÈRES ERREURS ENREGISTRÉES</Text>
              {syncSummary.failedErrors.map((err, idx) => (
                <Text key={idx} style={styles.errorLogText}>• {err}</Text>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* TAB 5: SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <ScrollView contentContainerStyle={styles.settingsScrollContent}>
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
            <TouchableOpacity activeOpacity={0.8} onPress={() => setIsAdminProfileModalOpen(true)} style={styles.settingsEditBtn}>
              <Text style={styles.settingsEditBtnText}>Modifier Coordonnées Hotline</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>SAUVEGARDE ET RESTAURATION</Text>
            <Text style={styles.settingsCardSub}>
              Exportez ou restaurez l'intégralité de la base de données locale (responsables, carnets, adhérents, transactions, audit logs).
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity activeOpacity={0.8} onPress={handleExportBackup} style={[styles.backupBtn, { flex: 1 }]}>
                <Icon name="shield" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.backupBtnText}>Exporter JSON</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setIsRestoreModalOpen(true)} style={[styles.restoreBtn, { flex: 1 }]}>
                <Icon name="history" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.restoreBtnText}>Restaurer JSON</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Edit Manager Modal */}
      <Modal visible={isEditModalOpen} transparent animationType="fade" onRequestClose={() => setIsEditModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Modifier le Responsable & Carnet</Text>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOM COMPLET</Text>
                <TextInput style={styles.formInput} value={editFullName} onChangeText={setEditFullName} placeholder="Nom complet" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>TÉLÉPHONE (+509...)</Text>
                <TextInput style={styles.formInput} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>MARCHÉ / ZONE</Text>
                <TextInput style={styles.formInput} value={editZone} onChangeText={setEditZone} placeholder="Ex: Marché Salomon" />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>RÉINITIALISER PIN (4 CHIFFRES)</Text>
                <TextInput style={styles.formInput} value={editPin} onChangeText={setEditPin} placeholder="4 chiffres pour réinitialiser" keyboardType="numeric" maxLength={4} />
              </View>
              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => setIsEditModalOpen(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveEdit} style={styles.modalConfirmBtn}>
                  <Text style={styles.modalConfirmBtnText}>Valider avec PIN</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Admin Profile Modal */}
      <Modal visible={isAdminProfileModalOpen} transparent animationType="fade" onRequestClose={() => setIsAdminProfileModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Coordonnées Hotline Admin</Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NOM DU SUPERVISEUR</Text>
              <TextInput style={styles.formInput} value={adminEditName} onChangeText={setAdminEditName} placeholder="Nom Admin" />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NUMÉRO HOTLINE</Text>
              <TextInput style={styles.formInput} value={adminEditPhone} onChangeText={setAdminEditPhone} keyboardType="phone-pad" />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>NOUVEAU CODE PIN ADMIN (4 CHIFFRES)</Text>
              <TextInput style={styles.formInput} value={adminEditPin} onChangeText={setAdminEditPin} placeholder="Laisser vide pour ne pas changer" keyboardType="numeric" maxLength={4} />
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsAdminProfileModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveAdminProfile} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Restore JSON Backup Modal */}
      <Modal visible={isRestoreModalOpen} transparent animationType="fade" onRequestClose={() => setIsRestoreModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Restaurer une Sauvegarde JSON</Text>
            <Text style={styles.modalSub}>Collez ci-dessous le contenu textuel complet du fichier JSON exporté :</Text>
            <TextInput
              style={[styles.formInput, { height: 120, textAlignVertical: 'top' }]}
              value={restoreJsonInput}
              onChangeText={setRestoreJsonInput}
              placeholder='{"exportedAt": "...", "version": "...", "data": {...}}'
              placeholderTextColor="#94A3B8"
              multiline
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsRestoreModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmRestore} style={styles.restoreConfirmBtn}>
                <Text style={styles.modalConfirmBtnText}>Restaurer avec PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Universal Sensitive Action PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title={pendingActionTitle}
        subtitle={pendingActionSubtitle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
  },
  headerLeft: { flex: 1 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  adminBadgeText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  headerSub: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pdfExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pdfExportText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  logoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiContainer: { backgroundColor: '#0F172A', paddingBottom: 12 },
  kpiScroll: { paddingHorizontal: 16, gap: 10 },
  kpiCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#334155',
  },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  kpiValue: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', marginTop: 2 },
  kpiValueGreen: { fontSize: 18, fontWeight: '900', color: '#059669', marginTop: 2 },
  kpiValueAmber: { fontSize: 18, fontWeight: '900', color: '#D97706', marginTop: 2 },
  kpiValuePrimary: { fontSize: 18, fontWeight: '900', color: SOL_COLORS.primary, marginTop: 2 },
  kpiSub: { fontSize: 10, color: '#64748B', fontWeight: '600', marginTop: 2 },
  tabsWrapper: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabBtnActive: { backgroundColor: SOL_COLORS.primary },
  tabBtnText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  tabBtnTextActive: { color: '#FFFFFF' },
  searchSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, backgroundColor: '#FFFFFF' },
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
  searchInput: { flex: 1, fontSize: 12, fontWeight: '600', color: SOL_COLORS.textPrimary },
  filterChipsRow: { gap: 6, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9' },
  filterChipActive: { backgroundColor: '#1E293B' },
  filterChipSuccess: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  filterChipWarning: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  filterChipDanger: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 40 },
  managerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  managerCardPending: { borderColor: '#F59E0B', backgroundColor: '#FFFDF5' },
  managerCardSuspended: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  managerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  managerName: { fontSize: 16, fontWeight: '900', color: SOL_COLORS.textPrimary },
  managerPhone: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 1 },
  pinBold: { color: '#1D4ED8', fontWeight: '800' },
  zoneText: { fontSize: 11, color: '#475569', fontWeight: '600', marginTop: 2 },
  bizInfoText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  bizBold: { fontWeight: '800', color: SOL_COLORS.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeActive: { backgroundColor: '#ECFDF5' },
  statusBadgePending: { backgroundColor: '#FFFBEB' },
  statusBadgeSuspended: { backgroundColor: '#FEF2F2' },
  statusBadgeText: { fontSize: 9, fontWeight: '900' },
  statusBadgeTextActive: { color: '#059669' },
  statusBadgeTextPending: { color: '#D97706' },
  statusBadgeTextSuspended: { color: '#DC2626' },
  managerStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  managerStatItem: { flex: 1, alignItems: 'center' },
  managerStatLabel: { fontSize: 8, fontWeight: '900', color: '#64748B', letterSpacing: 0.5 },
  managerStatValue: { fontSize: 13, fontWeight: '900', color: SOL_COLORS.textPrimary, marginTop: 1 },
  managerStatGreen: { fontSize: 13, fontWeight: '900', color: '#059669', marginTop: 1 },
  managerStatRed: { fontSize: 13, fontWeight: '900', color: '#DC2626', marginTop: 1 },
  managerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actionCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionEditText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  actionApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
  },
  actionApproveText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  actionSuspendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  actionSuspendText: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  actionReactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  actionReactivateText: { fontSize: 11, fontWeight: '800', color: '#059669' },
  actionSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  actionSwitchText: { fontSize: 11, fontWeight: '800', color: '#4338CA' },
  txCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  txCardReversed: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  txIconDeposit: { backgroundColor: '#059669' },
  txIconPayout: { backgroundColor: '#D97706' },
  txIconReversal: { backgroundColor: '#DC2626' },
  txClientName: { fontSize: 14, fontWeight: '800', color: SOL_COLORS.textPrimary },
  txNote: { fontSize: 11, color: '#64748B', marginTop: 1 },
  txDate: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '900' },
  txAmountDeposit: { color: '#059669' },
  txAmountPayout: { color: '#D97706' },
  txAmountReversal: { color: '#DC2626' },
  txRef: { fontSize: 9, color: '#94A3B8', fontWeight: '700', marginTop: 2 },
  auditCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  auditTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  auditActionTag: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  auditActionText: { fontSize: 10, fontWeight: '800', color: '#334155' },
  auditDate: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  auditUser: { fontSize: 11, color: '#64748B', marginTop: 2 },
  auditUserBold: { fontWeight: '700', color: '#1E293B' },
  auditReason: { fontSize: 11, color: '#0284C7', fontWeight: '600', marginTop: 3 },
  settingsScrollContent: { padding: 16, paddingBottom: 40 },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingsCardTitle: { fontSize: 11, fontWeight: '900', color: '#64748B', letterSpacing: 0.5, marginBottom: 4 },
  settingsCardSub: { fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 16 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  settingsLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  settingsValue: { fontSize: 13, fontWeight: '800', color: SOL_COLORS.textPrimary },
  settingsEditBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  settingsEditBtnText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  backupBtn: {
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  backupBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  restoreBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  restoreBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  syncStatsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  syncStatBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  syncStatLabel: { fontSize: 9, fontWeight: '800', color: '#64748B' },
  syncStatValueGreen: { fontSize: 18, fontWeight: '900', color: '#059669', marginTop: 2 },
  syncStatValueAmber: { fontSize: 18, fontWeight: '900', color: '#D97706', marginTop: 2 },
  syncStatValueRed: { fontSize: 18, fontWeight: '900', color: '#DC2626', marginTop: 2 },
  manualSyncBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  manualSyncBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  errorLogText: { fontSize: 11, color: '#DC2626', fontWeight: '600', marginBottom: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: SOL_COLORS.textPrimary, marginBottom: 4 },
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 14 },
  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', marginBottom: 4 },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' },
  modalCancelBtnText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  modalConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: SOL_COLORS.primary, alignItems: 'center' },
  restoreConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center' },
  modalConfirmBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
