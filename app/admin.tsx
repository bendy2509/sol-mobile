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
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { formatCurrency, formatDateShort, formatDate, getInitials } from '@/lib/formatters';
import { normalizePhoneNumber, arePhoneNumbersEqual, extractRaw8Digits } from '@/lib/phoneUtils';
import {
  AdminGlobalStats,
  ManagerFullOverview,
  getAdminGlobalStats,
  getAllManagersOverview,
  getGlobalRecentTransactions,
  updateManagerDetails,
  updateBusinessDetails,
  createAdminUserAccount,
  deleteUserAccount,
  exportDatabaseBackup,
  restoreDatabaseBackup,
} from '@/db/adminRepository';
import { reverseTransaction } from '@/db/transactionRepository';
import { updateCollectorStatus, setActiveCollectorId, setActiveBusinessId, getDatabase } from '@/db/sqlite';
import { generateAdminGlobalReportPdf, generateManagerBusinessReportPdf, sharePdfFile } from '@/services/pdfService';
import { getAuditLogs } from '@/services/auditService';
import { getSyncQueueSummary, triggerManualSync } from '@/services/syncQueueService';
import { AuditLog, AuditLogAction, SyncState, Transaction, UserRole, UserStatus } from '@/types';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';

export default function AdminScreen() {
  const router = useRouter();
  const { logout, getAdminProfile, updateAdminProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'USERS' | 'TRANSACTIONS' | 'AUDIT_LOGS' | 'SYNC_STATUS' | 'SETTINGS'>('USERS');
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
  const [filterRole, setFilterRole] = useState<UserRole | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<UserStatus | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [generatingManagerReportId, setGeneratingManagerReportId] = useState<string | null>(null);

  // Create User Modal State
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newZone, setNewZone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('MANAGER');
  const [newBizName, setNewBizName] = useState('');
  const [newUnitAmount, setNewUnitAmount] = useState('250');
  const [newSlots, setNewSlots] = useState('10');

  // Edit User & Business Modal State
  const [selectedManager, setSelectedManager] = useState<ManagerFullOverview | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('MANAGER');
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

  // Super-Admin Transaction Cancellation State
  const [selectedTxToCancel, setSelectedTxToCancel] = useState<Transaction | null>(null);
  const [isCancelTxModalOpen, setIsCancelTxModalOpen] = useState(false);
  const [cancelTxReason, setCancelTxReason] = useState('');

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

    Alert.alert(`${actionLabel} l'utilisateur`, explanation, [
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
      Alert.alert('Appel', `Numéro de l'utilisateur : ${phone}`);
    });
  };

  const handleWhatsAppManager = (phone: string) => {
    triggerLightImpact();
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    Linking.openURL(`https://wa.me/${digitsOnly}`).catch(() => {
      Alert.alert('WhatsApp', `Numéro de l'utilisateur : ${phone}`);
    });
  };

  const handleOpenCreateModal = () => {
    triggerLightImpact();
    setNewFullName('');
    setNewPhone('+509');
    setNewZone('');
    setNewPin('');
    setNewRole('MANAGER');
    setNewBizName('');
    setNewUnitAmount('250');
    setNewSlots('10');
    setIsCreateUserModalOpen(true);
  };

  const handleCreateNewUser = () => {
    if (!newFullName.trim()) {
      Alert.alert('Nom requis', "Veuillez saisir le nom complet de l'utilisateur.");
      return;
    }
    if (newPhone.trim().length < 8) {
      Alert.alert('Téléphone requis', "Veuillez saisir un numéro de téléphone valide (+509...).");
      return;
    }
    if (newPin.trim().length !== 4) {
      Alert.alert('Code PIN requis', "Le code PIN doit comporter exactement 4 chiffres.");
      return;
    }

    requirePinForAction(
      'Création Utilisateur',
      `Saisissez votre code PIN Admin pour valider la création du compte ${newRole} pour ${newFullName}.`,
      async () => {
        try {
          await createAdminUserAccount({
            fullName: newFullName.trim(),
            phoneNumber: newPhone.trim(),
            pin: newPin.trim(),
            role: newRole,
            zone: newZone.trim() || undefined,
            businessName: newRole === 'MANAGER' && newBizName.trim() ? newBizName.trim() : undefined,
            contributionAmount: parseInt(newUnitAmount, 10) || 250,
            totalSlots: parseInt(newSlots, 10) || 10,
          });

          triggerSuccessFeedback();
          Alert.alert('Compte Créé !', `Le compte [${newRole}] de ${newFullName} a été créé avec succès.`);
          setIsCreateUserModalOpen(false);
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la création du compte.');
        }
      }
    );
  };

  const handleOpenEditModal = (item: ManagerFullOverview) => {
    triggerLightImpact();
    setSelectedManager(item);
    setEditFullName(item.collector.fullName);
    setEditPhone(item.collector.phoneNumber);
    setEditZone(item.collector.zone || '');
    setEditRole((item.collector.role as UserRole) || 'MANAGER');
    setEditPin('');
    setEditBizName(item.business?.name || '');
    setEditUnitAmount(item.business?.contributionAmount?.toString() || '250');
    setEditSlots(item.business?.totalSlots?.toString() || '10');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedManager) return;
    if (!editFullName.trim()) {
      Alert.alert('Erreur', 'Le nom ne peut pas être vide.');
      return;
    }
    if (editPin.trim().length > 0 && editPin.trim().length !== 4) {
      Alert.alert('Erreur', 'Si vous réinitialisez le code PIN, il doit comporter exactement 4 chiffres.');
      return;
    }

    requirePinForAction(
      'Confirmation des Modifications',
      `Saisissez votre code PIN Admin pour valider les modifications de ${selectedManager.collector.fullName}.`,
      async () => {
        try {
          const normPhone = normalizePhoneNumber(editPhone);

          await updateManagerDetails(selectedManager.collector.id, {
            fullName: editFullName.trim(),
            phoneNumber: normPhone,
            zone: editZone.trim(),
            role: editRole,
            pin: editPin.trim().length === 4 ? editPin.trim() : undefined,
          });

          if (selectedManager.business && editBizName.trim()) {
            await updateBusinessDetails(selectedManager.business.id, {
              name: editBizName.trim(),
              contributionAmount: parseInt(editUnitAmount, 10) || 250,
              totalSlots: parseInt(editSlots, 10) || 10,
            });
          }

          triggerSuccessFeedback();
          Alert.alert('Succès', 'Les données du compte ont été mises à jour avec succès.');
          setIsEditModalOpen(false);
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la mise à jour.');
        }
      }
    );
  };

  const handleDeleteUser = (item: ManagerFullOverview) => {
    triggerMediumImpact();
    Alert.alert(
      "Supprimer l'Utilisateur",
      `Êtes-vous sûr de vouloir supprimer définitivement le compte de ${item.collector.fullName} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            requirePinForAction(
              'Confirmation de Suppression',
              `Saisissez votre code PIN Admin pour supprimer définitivement le compte de ${item.collector.fullName}.`,
              async () => {
                try {
                  await deleteUserAccount(item.collector.id);
                  triggerSuccessFeedback();
                  Alert.alert('Utilisateur Supprimé', `Le compte de ${item.collector.fullName} a été supprimé.`);
                  loadData();
                } catch (err: any) {
                  triggerErrorFeedback();
                  Alert.alert('Erreur', err?.message || "Échec de la suppression.");
                }
              }
            );
          },
        },
      ]
    );
  };

  // Super-Admin Transaction Cancellation Workflow
  const handleInitiateCancelTx = (tx: Transaction) => {
    triggerMediumImpact();
    if (tx.isReversed || tx.type === 'REVERSAL') {
      Alert.alert('Action Impossible', 'Cette transaction est déjà une annulation ou a déjà été annulée.');
      return;
    }
    setSelectedTxToCancel(tx);
    setCancelTxReason('');
    setIsCancelTxModalOpen(true);
  };

  const handleConfirmCancelTx = () => {
    if (!selectedTxToCancel) return;
    if (!cancelTxReason.trim()) {
      Alert.alert('Motif obligatoire', "Veuillez obligatoirement saisir la raison de l'annulation administrative.");
      return;
    }

    setIsCancelTxModalOpen(false);

    requirePinForAction(
      "Validation de l'Annulation Admin",
      `Saisissez votre code PIN Super-Admin pour annuler la transaction #${selectedTxToCancel.id.slice(0, 8)} (${formatCurrency(selectedTxToCancel.amount)}).`,
      async () => {
        try {
          await reverseTransaction({
            transactionId: selectedTxToCancel.id,
            reason: cancelTxReason.trim(),
            userRole: 'ADMIN',
            adminId: adminProfile.phoneNumber || 'Super-Admin',
          });

          triggerSuccessFeedback();
          Alert.alert(
            'Transaction Annulée avec Succès',
            `L'opération #${selectedTxToCancel.id.slice(0, 8)} a été annulée et tracée dans le journal d'audit.\n\nLes métriques de l'adhérent ont été automatiquement recalculées.`
          );
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || "Échec de l'annulation administrative.");
        } finally {
          setSelectedTxToCancel(null);
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

  // Generate Individual Manager Business Report PDF directly from Admin
  const handleGenerateManagerReport = async (item: ManagerFullOverview) => {
    triggerMediumImpact();
    setGeneratingManagerReportId(item.collector.id);
    try {
      const db = await getDatabase();
      const unitAmount = item.business?.contributionAmount || 250;
      const totalSlots = item.business?.totalSlots || 10;
      const totalPotAmount = totalSlots * unitAmount;

      const clientRows = await db.getAllAsync<{
        id: string;
        full_name: string;
        phone_number: string;
        payout_rank: number | null;
        total_paid_amount: number;
        current_balance: number;
        paid_hands_count: number;
        paid_until_date: string | null;
        has_received_hand: number;
        has_received_payout: number;
      }>(
        `SELECT id, full_name, phone_number, payout_rank, total_paid_amount, current_balance, paid_hands_count, paid_until_date, has_received_hand, has_received_payout
         FROM clients WHERE collector_id = ? ORDER BY payout_rank ASC`,
        [item.collector.id]
      );

      const registeredChildrenCount = clientRows.length;
      const totalCashCollected = clientRows.reduce((sum, c) => sum + (c.total_paid_amount || c.current_balance || 0), 0);
      const handsCollectedTotal = clientRows.reduce((sum, c) => sum + (c.paid_hands_count || Math.floor((c.total_paid_amount || c.current_balance || 0) / unitAmount)), 0);
      const totalDistributed = clientRows.filter((c) => c.has_received_hand || c.has_received_payout).length * totalPotAmount;
      const netReserveBalance = totalCashCollected - totalDistributed;
      const completionRate = totalSlots > 0 ? Math.round((handsCollectedTotal / (totalSlots * Math.max(1, registeredChildrenCount))) * 100) : 0;

      const pdfUri = await generateManagerBusinessReportPdf({
        businessName: item.business?.name || `Carnet de ${item.collector.fullName}`,
        collectorName: item.collector.fullName,
        collectorPhone: item.collector.phoneNumber,
        collectorZone: item.collector.zone,
        unitAmount,
        totalSlots,
        registeredChildrenCount,
        totalPotAmount,
        cycleStartDate: item.business?.startDate || new Date().toISOString(),
        cycleEndDate: item.business?.endDate || new Date().toISOString(),
        handsCollectedTotal,
        totalCashCollected,
        totalDistributed,
        netReserveBalance,
        completionRate,
        members: clientRows.map((m) => {
          const hands = m.paid_hands_count || (unitAmount > 0 ? Math.floor((m.total_paid_amount || m.current_balance || 0) / unitAmount) : 1);
          return {
            rank: m.payout_rank || 1,
            fullName: m.full_name,
            phoneNumber: m.phone_number,
            totalPaid: m.total_paid_amount || m.current_balance || 0,
            handsCovered: hands,
            coverageStatus: (m.has_received_hand || m.has_received_payout) ? 'HAND_RECEIVED' : 'PAID_TODAY',
            hasReceivedPayout: Boolean(m.has_received_hand || m.has_received_payout),
          };
        }),
        generatedAt: new Date().toISOString(),
      });

      await sharePdfFile(pdfUri, `Rapport_Carnet_${item.collector.fullName.replace(/\s+/g, '_')}.pdf`);
      triggerSuccessFeedback();
    } catch (err: any) {
      triggerErrorFeedback();
      Alert.alert('Erreur', 'Impossible de générer le rapport pour ce carnet.');
    } finally {
      setGeneratingManagerReportId(null);
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
      'ATTENTION : La restauration remplacera les données locales. Saisissez votre PIN Admin :',
      async () => {
        try {
          const res = await restoreDatabaseBackup(restoreJsonInput.trim(), 'admin');
          if (res.success) {
            triggerSuccessFeedback();
            Alert.alert(
              'Restauration Réussie !',
              `Données restaurées :\n- ${res.stats.collectors} utilisateurs\n- ${res.stats.businesses} carnets\n- ${res.stats.clients} adhérents\n- ${res.stats.transactions} transactions.`
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

  const handleOpenBusinessAsManager = async (item: ManagerFullOverview) => {
    triggerLightImpact();
    if (item.business) {
      await setActiveCollectorId(item.collector.id);
      await setActiveBusinessId(item.business.id);
      Alert.alert(
        'Espace Activé',
        `Vous êtes maintenant positionné sur le carnet "${item.business.name}" de ${item.collector.fullName} (${item.collector.role || 'MANAGER'}).`,
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

  // Filtered Users
  const filteredUsers = useMemo(() => {
    let result = managers;

    if (filterStatus !== 'ALL') {
      result = result.filter((m) => m.collector.status === filterStatus);
    }

    if (filterRole !== 'ALL') {
      result = result.filter((m) => {
        const uRole = m.collector.role || 'MANAGER';
        return uRole === filterRole;
      });
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
  }, [managers, filterStatus, filterRole, searchQuery]);

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
            <Text style={styles.kpiLabel}>TOTAL UTILISATEURS</Text>
            <Text style={styles.kpiValue}>{stats.totalManagers}</Text>
            <Text style={styles.kpiSub}>
              {stats.activeManagers} actifs · {stats.pendingManagers} en attente
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL COTISÉ PLATEFORME</Text>
            <Text style={styles.kpiGreen}>{formatCurrency(stats.totalPlatformCollected)}</Text>
            <Text style={styles.kpiSub}>{stats.totalTransactionsCount} opérations</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL DISTRIBUÉ (MAINS)</Text>
            <Text style={styles.kpiRed}>{formatCurrency(stats.totalPlatformDistributed)}</Text>
            <Text style={styles.kpiSub}>Mains payées aux adhérents</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>RÉSERVE NETTE LOCALE</Text>
            <Text style={styles.kpiValue}>{formatCurrency(stats.platformNetBalance)}</Text>
            <Text style={styles.kpiSub}>Solde net disponible</Text>
          </View>
        </ScrollView>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              triggerLightImpact();
              setActiveTab('USERS');
            }}
            style={[styles.tabBtn, activeTab === 'USERS' && styles.tabBtnActive]}
          >
            <Icon
              name="user"
              size={13}
              color={activeTab === 'USERS' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'USERS' && styles.tabBtnTextActive]}>
              Utilisateurs ({managers.length})
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

      {/* TAB 1: USERS (GESTION DES UTILISATEURS & ROLES) */}
      {activeTab === 'USERS' && (
        <>
          <View style={styles.searchSection}>
            {/* Top Action Row with Create User Button */}
            <View style={styles.userSectionHeader}>
              <View>
                <Text style={styles.userSectionTitle}>RÉPERTOIRE DES COMPTES</Text>
                <Text style={styles.userSectionSub}>{filteredUsers.length} utilisateur(s) trouvé(s)</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleOpenCreateModal}
                style={styles.createUserBtn}
              >
                <Icon name="check" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.createUserBtnText}>+ Créer Utilisateur</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchBar}>
              <Icon name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher nom, téléphone, rôle, zone..."
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

            {/* Role Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
              <TouchableOpacity
                onPress={() => setFilterRole('ALL')}
                style={[styles.filterChip, filterRole === 'ALL' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filterRole === 'ALL' && styles.filterChipTextActive]}>
                  Tous Rôles
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterRole('MANAGER')}
                style={[styles.filterChip, filterRole === 'MANAGER' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filterRole === 'MANAGER' && styles.filterChipTextActive]}>
                  💼 Gestionnaires
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterRole('READ_ONLY')}
                style={[styles.filterChip, filterRole === 'READ_ONLY' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filterRole === 'READ_ONLY' && styles.filterChipTextActive]}>
                  👁️ Lecture Seule
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterRole('ADMIN')}
                style={[styles.filterChip, filterRole === 'ADMIN' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filterRole === 'ADMIN' && styles.filterChipTextActive]}>
                  🛡️ Super-Admins
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Status Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterChipsRow, { marginTop: 6 }]}>
              <TouchableOpacity
                onPress={() => setFilterStatus('ALL')}
                style={[styles.filterChipSubtle, filterStatus === 'ALL' && styles.filterChipSubtleActive]}
              >
                <Text style={[styles.filterChipSubtleText, filterStatus === 'ALL' && styles.filterChipSubtleTextActive]}>
                  Tous Statuts
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterStatus('ACTIVE')}
                style={[styles.filterChipSubtle, filterStatus === 'ACTIVE' && styles.filterChipSubtleActive]}
              >
                <Text style={[styles.filterChipSubtleText, filterStatus === 'ACTIVE' && styles.filterChipSubtleTextActive]}>
                  Actifs ({stats.activeManagers})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterStatus('PENDING_APPROVAL')}
                style={[styles.filterChipSubtle, filterStatus === 'PENDING_APPROVAL' && styles.filterChipSubtleActive]}
              >
                <Text style={[styles.filterChipSubtleText, filterStatus === 'PENDING_APPROVAL' && styles.filterChipSubtleTextActive]}>
                  En attente ({stats.pendingManagers})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFilterStatus('SUSPENDED')}
                style={[styles.filterChipSubtle, filterStatus === 'SUSPENDED' && styles.filterChipSubtleActive]}
              >
                <Text style={[styles.filterChipSubtleText, filterStatus === 'SUSPENDED' && styles.filterChipSubtleTextActive]}>
                  Suspendus ({stats.suspendedManagers})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Users List */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(item, index) => item.collector.id ? `${item.collector.id}-${index}` : String(index)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[SOL_COLORS.primary]} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const { collector, business, clientsCount, totalCollected, totalDistributed } = item;
              const isPending = collector.status === 'PENDING_APPROVAL';
              const isSuspended = collector.status === 'SUSPENDED';
              const role = (collector.role as UserRole) || 'MANAGER';
              const isReadOnly = role === 'READ_ONLY' || role === 'USER';
              const isAdmin = role === 'ADMIN';

              return (
                <View style={[styles.managerCard, isPending && styles.managerCardPending, isSuspended && styles.managerCardSuspended]}>
                  {/* Top Identity Row */}
                  <View style={styles.managerTopRow}>
                    <View style={styles.avatarCircleSmall}>
                      <Text style={styles.avatarTextSmall}>{getInitials(collector.fullName)}</Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.managerName}>{collector.fullName}</Text>
                        {/* Role Badge */}
                        <View style={[styles.roleBadge, isAdmin ? styles.roleBadgeAdmin : isReadOnly ? styles.roleBadgeReadOnly : styles.roleBadgeManager]}>
                          <Text style={[styles.roleBadgeText, isAdmin ? styles.roleBadgeTextAdmin : isReadOnly ? styles.roleBadgeTextReadOnly : styles.roleBadgeTextManager]}>
                            {isAdmin ? '🛡️ ADMIN' : isReadOnly ? '👁️ LECTURE SEULE' : '💼 GESTIONNAIRE'}
                          </Text>
                        </View>
                      </View>

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

                    {/* Status Badge */}
                    <View style={[styles.statusBadge, isPending ? styles.statusBadgePending : isSuspended ? styles.statusBadgeSuspended : styles.statusBadgeActive]}>
                      <Text style={[styles.statusBadgeText, isPending ? styles.statusBadgeTextPending : isSuspended ? styles.statusBadgeTextSuspended : styles.statusBadgeTextActive]}>
                        {isPending ? 'EN ATTENTE' : isSuspended ? 'SUSPENDU' : 'ACTIF'}
                      </Text>
                    </View>
                  </View>

                  {/* Financial Stats Row (Only if has carnet or active transactions) */}
                  {!isReadOnly && (
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
                  )}

                  {isReadOnly && (
                    <View style={styles.readOnlyNoticeBanner}>
                      <Icon name="shield" size={13} color="#64748B" style={{ marginRight: 6 }} />
                      <Text style={styles.readOnlyNoticeText}>
                        Compte en mode consultation seule (accès aux rapports et statistiques).
                      </Text>
                    </View>
                  )}

                  {/* Actions Row */}
                  <View style={styles.managerActionRow}>
                    <TouchableOpacity onPress={() => handleCallManager(collector.phoneNumber)} style={styles.actionCircleBtn}>
                      <Icon name="phone" size={14} color="#0284C7" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleWhatsAppManager(collector.phoneNumber)} style={styles.actionCircleBtn}>
                      <Icon name="phone" size={14} color="#059669" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleOpenEditModal(item)} style={styles.actionEditBtn}>
                      <Icon name="user" size={12} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.actionEditText}>Modifier / Rôle</Text>
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
                    {business && !isReadOnly && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleGenerateManagerReport(item)}
                        disabled={generatingManagerReportId === collector.id}
                        style={styles.actionReportBtn}
                      >
                        <Icon name="print" size={12} color="#7C3AED" style={{ marginRight: 4 }} />
                        <Text style={styles.actionReportText}>
                          {generatingManagerReportId === collector.id ? 'PDF...' : 'Rapport PDF'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {business && (
                      <TouchableOpacity onPress={() => handleOpenBusinessAsManager(item)} style={styles.actionSwitchBtn}>
                        <Icon name="arrow-right" size={12} color="#4338CA" style={{ marginRight: 4 }} />
                        <Text style={styles.actionSwitchText}>Ouvrir</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDeleteUser(item)} style={styles.actionDeleteBtn}>
                      <Icon name="close" size={12} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </>
      )}

      {/* TAB 2: TRANSACTIONS WITH SUPER-ADMIN CANCELLATION */}
      {activeTab === 'TRANSACTIONS' && (
        <FlatList
          data={transactions}
          keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : String(index)}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.txClientName}>{item.clientName || 'Adhérent inconnu'}</Text>
                      {isReversal && (
                        <View style={styles.txCancelledBadge}>
                          <Text style={styles.txCancelledBadgeText}>ANNULÉE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.txNote}>{item.note || item.type}</Text>
                    <Text style={styles.txDate}>{formatDate(item.createdAtLocal)}</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Text style={[styles.txAmount, isReversal ? styles.txAmountReversal : isPayout ? styles.txAmountPayout : styles.txAmountDeposit]}>
                    {isReversal ? '-' : isPayout ? '-' : '+'}
                    {formatCurrency(item.amount)}
                  </Text>
                  <Text style={styles.txRef}>#{item.id.slice(0, 8)}</Text>

                  {!isReversal && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleInitiateCancelTx(item)}
                      style={styles.adminCancelTxBtn}
                    >
                      <Icon name="alert" size={11} color="#DC2626" style={{ marginRight: 3 }} />
                      <Text style={styles.adminCancelTxBtnText}>Annuler</Text>
                    </TouchableOpacity>
                  )}
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
              <TouchableOpacity onPress={() => setAuditFilter('CREATE_CLIENT')} style={[styles.filterChip, auditFilter === 'CREATE_CLIENT' && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, auditFilter === 'CREATE_CLIENT' && styles.filterChipTextActive]}>Inscriptions</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuditFilter('PAYOUT_OUT_OF_ORDER')} style={[styles.filterChip, auditFilter === 'PAYOUT_OUT_OF_ORDER' && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, auditFilter === 'PAYOUT_OUT_OF_ORDER' && styles.filterChipTextActive]}>Décaissements</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAuditFilter('REVERSE_TRANSACTION')} style={[styles.filterChip, auditFilter === 'REVERSE_TRANSACTION' && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, auditFilter === 'REVERSE_TRANSACTION' && styles.filterChipTextActive]}>Annulations</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <FlatList
            data={filteredAuditLogs}
            keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : String(index)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[SOL_COLORS.primary]} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.auditCard}>
                <View style={styles.auditHeader}>
                  <View style={styles.auditActionBadge}>
                    <Text style={styles.auditActionText}>{item.action}</Text>
                  </View>
                  <Text style={styles.auditDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={styles.auditReason}>{item.reason || 'Aucun motif'}</Text>
                <View style={styles.auditFooter}>
                  <Text style={styles.auditUser}>Par : {item.userRole} ({item.userId.slice(0, 8)})</Text>
                  <Text style={styles.auditEntity}>Cible : {item.entityType} #{item.entityId.slice(0, 8)}</Text>
                </View>
              </View>
            )}
          />
        </>
      )}

      {/* TAB 4: SYNC STATUS */}
      {activeTab === 'SYNC_STATUS' && (
        <ScrollView contentContainerStyle={styles.syncScrollContent}>
          <View style={styles.syncCard}>
            <View style={styles.syncHeaderRow}>
              <View>
                <Text style={styles.syncCardTitle}>État de Synchronisation Supabase</Text>
                <Text style={styles.syncCardSub}>
                  {syncSummary.isOnline ? '🟢 En ligne (Cloud connecté)' : '🔴 Hors-ligne'}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={handleRefresh} style={styles.syncActionBtn}>
                <Icon name="sync" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.syncActionBtnText}>Actualiser</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.syncMetricsGrid}>
              <View style={styles.syncMetricBox}>
                <Text style={styles.syncMetricLabel}>EN ATTENTE</Text>
                <Text style={styles.syncMetricYellow}>{syncSummary.pendingCount}</Text>
              </View>
              <View style={styles.syncMetricBox}>
                <Text style={styles.syncMetricLabel}>SYNCHRONISÉS</Text>
                <Text style={styles.syncMetricGreen}>{syncSummary.syncedCount}</Text>
              </View>
              <View style={styles.syncMetricBox}>
                <Text style={styles.syncMetricLabel}>ÉCHECS</Text>
                <Text style={styles.syncMetricRed}>{syncSummary.failedCount}</Text>
              </View>
            </View>
          </View>

          {syncSummary.failedErrors.length > 0 && (
            <View style={styles.errorLogCard}>
              <Text style={styles.errorLogTitle}>JOURNAL DES DERNIÈRES ERREURS</Text>
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
              Exportez ou restaurez l'intégralité de la base de données locale (utilisateurs, carnets, adhérents, transactions, audit logs).
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

      {/* Create User Modal */}
      <Modal visible={isCreateUserModalOpen} transparent animationType="fade" onRequestClose={() => setIsCreateUserModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Créer un Nouvel Utilisateur</Text>
              <TouchableOpacity
                onPress={() => setIsCreateUserModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSub}>Définissez son rôle et ses accès sur la plateforme.</Text>

              {/* Role Selection */}
              <Text style={styles.formLabel}>RÔLE SUR LA PLATEFORME *</Text>
              <View style={styles.rolePickerRow}>
                <TouchableOpacity
                  onPress={() => setNewRole('MANAGER')}
                  style={[styles.roleOption, newRole === 'MANAGER' && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, newRole === 'MANAGER' && styles.roleOptionTextActive]}>
                    💼 Gestionnaire
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setNewRole('READ_ONLY')}
                  style={[styles.roleOption, newRole === 'READ_ONLY' && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, newRole === 'READ_ONLY' && styles.roleOptionTextActive]}>
                    👁️ Consultation
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setNewRole('ADMIN')}
                  style={[styles.roleOption, newRole === 'ADMIN' && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, newRole === 'ADMIN' && styles.roleOptionTextActive]}>
                    🛡️ Admin
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOM COMPLET *</Text>
                <TextInput style={styles.formInput} value={newFullName} onChangeText={setNewFullName} placeholder="Ex: Pierre Richard Joseph" />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>TÉLÉPHONE (+509...) *</Text>
                <TextInput style={styles.formInput} value={newPhone} onChangeText={setNewPhone} placeholder="+509 3X XX XX XX" keyboardType="phone-pad" />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>ZONE / MARCHÉ</Text>
                <TextInput style={styles.formInput} value={newZone} onChangeText={setNewZone} placeholder="Ex: Marché Salomon" />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>CODE PIN (4 CHIFFRES) *</Text>
                <TextInput style={styles.formInput} value={newPin} onChangeText={setNewPin} placeholder="4 chiffres" keyboardType="numeric" maxLength={4} />
              </View>

              {newRole === 'MANAGER' && (
                <>
                  <Text style={[styles.formLabel, { marginTop: 8 }]}>CONFIGURATION DU CARNET ASSOCIÉ</Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>NOM DU CARNET</Text>
                    <TextInput style={styles.formInput} value={newBizName} onChangeText={setNewBizName} placeholder="Ex: Sol Mache Salomon 2026" />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.formLabel}>VALEUR PAR MAIN (HTG)</Text>
                      <TextInput style={styles.formInput} value={newUnitAmount} onChangeText={setNewUnitAmount} keyboardType="numeric" />
                    </View>
                    <View style={[styles.formGroup, { flex: 1 }]}>
                      <Text style={styles.formLabel}>SLOTS PRÉVUS</Text>
                      <TextInput style={styles.formInput} value={newSlots} onChangeText={setNewSlots} keyboardType="numeric" />
                    </View>
                  </View>
                </>
              )}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity onPress={() => setIsCreateUserModalOpen(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateNewUser} style={styles.modalConfirmBtn}>
                  <Text style={styles.modalConfirmBtnText}>Créer avec PIN</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit User Modal */}
      <Modal visible={isEditModalOpen} transparent animationType="fade" onRequestClose={() => setIsEditModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Modifier l'Utilisateur</Text>
              <TouchableOpacity
                onPress={() => setIsEditModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Role Selection */}
              <Text style={styles.formLabel}>RÔLE ATTRIBUÉ</Text>
              <View style={styles.rolePickerRow}>
                <TouchableOpacity
                  onPress={() => setEditRole('MANAGER')}
                  style={[styles.roleOption, editRole === 'MANAGER' && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, editRole === 'MANAGER' && styles.roleOptionTextActive]}>
                    💼 Gestionnaire
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setEditRole('READ_ONLY')}
                  style={[styles.roleOption, editRole === 'READ_ONLY' && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, editRole === 'READ_ONLY' && styles.roleOptionTextActive]}>
                    👁️ Consultation
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setEditRole('ADMIN')}
                  style={[styles.roleOption, editRole === 'ADMIN' && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, editRole === 'ADMIN' && styles.roleOptionTextActive]}>
                    🛡️ Admin
                  </Text>
                </TouchableOpacity>
              </View>

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
                <TextInput style={styles.formInput} value={editPin} onChangeText={setEditPin} placeholder="Laisser vide ou 4 chiffres" keyboardType="numeric" maxLength={4} />
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

      {/* Super-Admin Transaction Cancellation Modal */}
      <Modal visible={isCancelTxModalOpen} transparent animationType="fade" onRequestClose={() => setIsCancelTxModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Annulation Administrative</Text>
              <TouchableOpacity
                onPress={() => setIsCancelTxModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Opération #{selectedTxToCancel?.id.slice(0, 8)} · {selectedTxToCancel?.clientName || 'Adhérent'} · {formatCurrency(selectedTxToCancel?.amount || 0)}
            </Text>

            <View style={styles.cancellationWarningBox}>
              <Icon name="shield" size={16} color="#DC2626" style={{ marginRight: 8 }} />
              <Text style={styles.cancellationWarningText}>
                Cette opération ne supprime pas physiquement l'enregistrement. Une écriture d'annulation certifiée est générée et le solde/échéance de l'adhérent est recalculé.
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>MOTIF OBLIGATOIRE DE L'ANNULATION *</Text>
              <TextInput
                style={[styles.formInput, { height: 75, textAlignVertical: 'top', paddingTop: 8 }]}
                value={cancelTxReason}
                onChangeText={setCancelTxReason}
                placeholder="Ex: Erreur de saisie de montant / doublon..."
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setIsCancelTxModalOpen(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelBtnText}>Abandonner</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmCancelTx} style={styles.restoreConfirmBtn}>
                <Text style={styles.modalConfirmBtnText}>Annuler avec PIN Admin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Profile Modal */}
      <Modal visible={isAdminProfileModalOpen} transparent animationType="fade" onRequestClose={() => setIsAdminProfileModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Coordonnées Hotline Admin</Text>
              <TouchableOpacity
                onPress={() => setIsAdminProfileModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
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
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Restaurer une Sauvegarde JSON</Text>
              <TouchableOpacity
                onPress={() => setIsRestoreModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Fermer"
              >
                <Icon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
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
  container: {
    flex: 1,
    backgroundColor: SOL_COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: SOL_COLORS.secondary,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    ...SHADOWS.sm,
  },
  headerLeft: {
    flex: 1,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  adminBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: SOL_COLORS.primaryLight,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pdfExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  pdfExportText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.info,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiContainer: {
    backgroundColor: SOL_COLORS.secondary,
    paddingBottom: 12,
  },
  kpiScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  kpiCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 12,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#334155',
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  kpiGreen: {
    fontSize: 18,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 4,
  },
  kpiRed: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F87171',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: SOL_COLORS.border,
  },
  tabScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  tabBtnActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  searchSection: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: SOL_COLORS.border,
  },
  userSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  userSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: SOL_COLORS.textMuted,
    letterSpacing: 0.5,
  },
  userSectionSub: {
    fontSize: 11,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  createUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    ...SHADOWS.sm,
  },
  createUserBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: SOL_COLORS.textPrimary,
  },
  filterChipsRow: {
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  filterChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterChipSubtle: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  filterChipSubtleActive: {
    backgroundColor: '#334155',
  },
  filterChipSubtleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipSubtleTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 14,
    paddingBottom: 40,
  },
  managerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  managerCardPending: { borderColor: '#F59E0B', backgroundColor: '#FFFDF5' },
  managerCardSuspended: { borderColor: '#FECDD3', backgroundColor: '#FFF1F2' },
  managerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  avatarCircleSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SOL_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  managerName: {
    fontSize: 15,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeAdmin: { backgroundColor: '#EDE9FE' },
  roleBadgeManager: { backgroundColor: '#DCFCE7' },
  roleBadgeReadOnly: { backgroundColor: '#F1F5F9' },
  roleBadgeText: { fontSize: 9, fontWeight: '900' },
  roleBadgeTextAdmin: { color: '#6D28D9' },
  roleBadgeTextManager: { color: '#15803D' },
  roleBadgeTextReadOnly: { color: '#475569' },
  managerPhone: {
    fontSize: 12,
    color: SOL_COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  pinBold: { color: SOL_COLORS.info, fontWeight: '800' },
  zoneText: { fontSize: 11, color: SOL_COLORS.textSecondary, fontWeight: '600', marginTop: 2 },
  bizInfoText: { fontSize: 11, color: SOL_COLORS.textSecondary, marginTop: 2 },
  bizBold: { fontWeight: '800', color: SOL_COLORS.primaryDark },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeActive: { backgroundColor: SOL_COLORS.successLighter },
  statusBadgePending: { backgroundColor: SOL_COLORS.accentLighter },
  statusBadgeSuspended: { backgroundColor: SOL_COLORS.dangerLighter },
  statusBadgeText: { fontSize: 9, fontWeight: '900' },
  statusBadgeTextActive: { color: SOL_COLORS.successDark },
  statusBadgeTextPending: { color: SOL_COLORS.accent },
  statusBadgeTextSuspended: { color: SOL_COLORS.dangerDark },
  managerStatsRow: {
    flexDirection: 'row',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  managerStatItem: { flex: 1, alignItems: 'center' },
  managerStatLabel: { fontSize: 8, fontWeight: '900', color: SOL_COLORS.textMuted, letterSpacing: 0.3 },
  managerStatValue: { fontSize: 13, fontWeight: '900', color: SOL_COLORS.textPrimary, marginTop: 2 },
  managerStatGreen: { fontSize: 13, fontWeight: '900', color: SOL_COLORS.successDark, marginTop: 2 },
  managerStatRed: { fontSize: 13, fontWeight: '900', color: SOL_COLORS.dangerDark, marginTop: 2 },
  readOnlyNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  readOnlyNoticeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  managerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actionCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  actionEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.surfaceSubtle,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  actionEditText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  actionApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.successDark,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
  },
  actionApproveText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  actionSuspendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.dangerLighter,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  actionSuspendText: { fontSize: 11, fontWeight: '800', color: SOL_COLORS.dangerDark },
  actionReactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.successLighter,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  actionReactivateText: { fontSize: 11, fontWeight: '800', color: SOL_COLORS.successDark },
  actionReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  actionReportText: { fontSize: 11, fontWeight: '800', color: '#7C3AED' },
  actionSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  actionSwitchText: { fontSize: 11, fontWeight: '800', color: '#4338CA' },
  actionDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.dangerLighter,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  txCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  txCardReversed: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  txIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  txIconDeposit: { backgroundColor: SOL_COLORS.successDark },
  txIconPayout: { backgroundColor: SOL_COLORS.accent },
  txIconReversal: { backgroundColor: SOL_COLORS.danger },
  txClientName: { fontSize: 13, fontWeight: '800', color: SOL_COLORS.textPrimary },
  txCancelledBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  txCancelledBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#DC2626',
  },
  adminCancelTxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECDD3',
    marginTop: 4,
  },
  adminCancelTxBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  cancellationWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECDD3',
    marginBottom: 12,
  },
  cancellationWarningText: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  txNote: { fontSize: 11, color: SOL_COLORS.textSecondary, marginTop: 1 },
  txDate: { fontSize: 10, color: SOL_COLORS.textMuted, marginTop: 1 },
  txAmount: { fontSize: 14, fontWeight: '900' },
  txAmountDeposit: { color: SOL_COLORS.successDark },
  txAmountPayout: { color: SOL_COLORS.accent },
  txAmountReversal: { color: SOL_COLORS.danger },
  txRef: { fontSize: 9, color: SOL_COLORS.textMuted, marginTop: 2 },
  auditCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  auditHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  auditActionBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  auditActionText: { fontSize: 10, fontWeight: '800', color: SOL_COLORS.textPrimary },
  auditDate: { fontSize: 10, color: SOL_COLORS.textMuted },
  auditReason: { fontSize: 12, color: SOL_COLORS.textSecondary, marginBottom: 6 },
  auditFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  auditUser: { fontSize: 10, color: SOL_COLORS.textMuted },
  auditEntity: { fontSize: 10, color: SOL_COLORS.textMuted },
  syncScrollContent: { padding: 14 },
  syncCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  syncHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  syncCardTitle: { fontSize: 15, fontWeight: '800', color: SOL_COLORS.textPrimary },
  syncCardSub: { fontSize: 12, fontWeight: '600', color: SOL_COLORS.textSecondary, marginTop: 2 },
  syncActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  syncActionBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  syncMetricsGrid: { flexDirection: 'row', gap: 10 },
  syncMetricBox: {
    flex: 1,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  syncMetricLabel: { fontSize: 9, fontWeight: '800', color: SOL_COLORS.textMuted },
  syncMetricYellow: { fontSize: 16, fontWeight: '900', color: '#D97706', marginTop: 2 },
  syncMetricGreen: { fontSize: 16, fontWeight: '900', color: '#059669', marginTop: 2 },
  syncMetricRed: { fontSize: 16, fontWeight: '900', color: '#DC2626', marginTop: 2 },
  errorLogCard: {
    backgroundColor: '#FFF1F2',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  errorLogTitle: { fontSize: 10, fontWeight: '900', color: '#DC2626', letterSpacing: 0.5, marginBottom: 6 },
  errorLogText: { fontSize: 11, color: '#991B1B', marginTop: 2 },
  settingsScrollContent: { padding: 14 },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    ...SHADOWS.sm,
  },
  settingsCardTitle: { fontSize: 11, fontWeight: '900', color: SOL_COLORS.textMuted, letterSpacing: 0.5 },
  settingsCardSub: { fontSize: 12, color: SOL_COLORS.textSecondary, marginTop: 4, lineHeight: 16 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12 },
  settingsLabel: { fontSize: 10, color: SOL_COLORS.textMuted, fontWeight: '700' },
  settingsValue: { fontSize: 13, fontWeight: '800', color: SOL_COLORS.textPrimary, marginTop: 2 },
  settingsEditBtn: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  settingsEditBtnText: { fontSize: 12, fontWeight: '800', color: SOL_COLORS.textPrimary },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backupBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#475569',
    paddingVertical: 12,
    borderRadius: 12,
  },
  restoreBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    width: '100%',
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: SOL_COLORS.textPrimary },
  modalSub: { fontSize: 12, color: SOL_COLORS.textSecondary, marginTop: 2, marginBottom: 12 },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    alignItems: 'center',
  },
  roleOptionActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primary,
  },
  roleOptionText: {
    fontSize: 11,
    fontWeight: '800',
    color: SOL_COLORS.textSecondary,
  },
  roleOptionTextActive: {
    color: '#FFFFFF',
  },
  formGroup: { marginBottom: 10 },
  formLabel: { fontSize: 9, fontWeight: '900', color: SOL_COLORS.textMuted, letterSpacing: 0.4, marginBottom: 4 },
  formInput: {
    backgroundColor: SOL_COLORS.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: SOL_COLORS.surfaceSubtle,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: { fontSize: 12, fontWeight: '800', color: SOL_COLORS.textSecondary },
  modalConfirmBtn: {
    flex: 1.5,
    backgroundColor: SOL_COLORS.primary,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  restoreConfirmBtn: {
    flex: 1.5,
    backgroundColor: '#DC2626',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
