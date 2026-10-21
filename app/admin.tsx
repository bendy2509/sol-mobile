import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, StyleSheet, RefreshControl, Alert, ScrollView, Linking, Share, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';

import { useAuth, AdminProfile } from '@/context/AuthContext';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import {
  AmountText,
  Avatar,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Icon,
  ListItem,
  MetricTile,
  Screen,
  SectionHeader,
  Text,
  TextField,
  UiIconName,
} from '@/components/ui';
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
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

type AdminTab = 'USERS' | 'TRANSACTIONS' | 'AUDIT_LOGS' | 'SYNC_STATUS' | 'SETTINGS';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'MANAGER', label: 'Gestionnaire' },
  { value: 'READ_ONLY', label: 'Consultation' },
  { value: 'ADMIN', label: 'Admin' },
];

export default function AdminScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { logout, getAdminProfile, updateAdminProfile, impersonateManager, exitImpersonation } = useAuth();
  const { width, isSmallScreen, isVerySmallScreen, isTablet, horizontalPadding } = useResponsive();

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
  const [adminEditEmail, setAdminEditEmail] = useState('');
  const [adminEditAddress, setAdminEditAddress] = useState('');
  const [adminEditHours, setAdminEditHours] = useState('');
  const [adminEditPin, setAdminEditPin] = useState('');

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');

  // Dedicated Reset PIN Modal State for Manager
  const [isResetPinModalOpen, setIsResetPinModalOpen] = useState(false);
  const [targetManagerForPinReset, setTargetManagerForPinReset] = useState<ManagerFullOverview | null>(null);
  const [adminNewPinInput, setAdminNewPinInput] = useState('');

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
      setAdminEditEmail(aProfile.email || '');
      setAdminEditAddress(aProfile.address || '');
      setAdminEditHours(aProfile.supportHours || '');
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

  const handleOpenResetPinModal = (item: ManagerFullOverview) => {
    triggerLightImpact();
    setTargetManagerForPinReset(item);
    setAdminNewPinInput('');
    setIsResetPinModalOpen(true);
  };

  const handleConfirmResetPin = () => {
    if (!targetManagerForPinReset) return;
    if (adminNewPinInput.trim().length !== 4) {
      Alert.alert('Erreur', 'Le code PIN doit comporter exactement 4 chiffres.');
      return;
    }

    setIsResetPinModalOpen(false);

    requirePinForAction(
      'Réinitialiser le Code PIN',
      `Saisissez votre code PIN Admin pour réinitialiser le code d'accès de ${targetManagerForPinReset.collector.fullName} :`,
      async () => {
        try {
          await updateManagerDetails(targetManagerForPinReset.collector.id, {
            pin: adminNewPinInput.trim(),
          });
          triggerSuccessFeedback();
          Alert.alert(
            'Code PIN Réinitialisé',
            `Le code PIN de ${targetManagerForPinReset.collector.fullName} a été réinitialisé à : ${adminNewPinInput.trim()}.\n\nVeuillez le communiquer au gestionnaire.`
          );
          setAdminNewPinInput('');
          setTargetManagerForPinReset(null);
          loadData();
        } catch (err: any) {
          triggerErrorFeedback();
          Alert.alert('Erreur', err?.message || 'Échec de la réinitialisation du code PIN.');
        }
      }
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
            email: adminEditEmail.trim() || undefined,
            address: adminEditAddress.trim() || undefined,
            supportHours: adminEditHours.trim() || undefined,
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
      Alert.alert(
        'Mode Superviseur',
        `Vous allez basculer sur le carnet "${item.business.name}" de ${item.collector.fullName} (${item.collector.role || 'MANAGER'}).\n\nVous pourrez revenir au Dashboard Admin à tout moment via la bannière "Retour Admin" en haut de l'écran.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Ouvrir Espace',
            onPress: async () => {
              await impersonateManager(item.collector, item.business!);
              router.replace('/(tabs)' as any);
            },
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

  const insets = useSafeAreaInsets();

  const selectTab = (tab: AdminTab) => {
    triggerLightImpact();
    setActiveTab(tab);
  };

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'USERS', label: `Utilisateurs (${managers.length})` },
    { key: 'TRANSACTIONS', label: `Flux (${transactions.length})` },
    { key: 'AUDIT_LOGS', label: `Audit (${auditLogs.length})` },
    { key: 'SYNC_STATUS', label: `Synchro (${syncSummary.pendingCount})` },
    { key: 'SETTINGS', label: 'Paramètres' },
  ];

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
  );

  const kpiBlock = (
    <View style={styles.kpiGrid}>
      <MetricTile label="Utilisateurs" icon="users" value={String(stats.totalManagers)} hint={`${stats.activeManagers} actifs · ${stats.pendingManagers} en attente`} style={styles.kpiTile} />
      <MetricTile label="Total cotisé" icon="cash" hint={`${stats.totalTransactionsCount} opérations`} style={styles.kpiTile}>
        <AmountText amount={stats.totalPlatformCollected} size="medium" tone="success" />
      </MetricTile>
      <MetricTile label="Total remis (mains)" icon="payout" hint="Mains payées aux adhérents" style={styles.kpiTile}>
        <AmountText amount={stats.totalPlatformDistributed} size="medium" tone="primary" />
      </MetricTile>
      <MetricTile label="Réserve nette" icon="shield" hint="Solde net disponible" style={styles.kpiTile}>
        <AmountText amount={stats.platformNetBalance} size="medium" />
      </MetricTile>
    </View>
  );

  const statusMeta = (status: UserStatus) =>
    status === 'PENDING_APPROVAL'
      ? { label: 'En attente', icon: 'clock' as UiIconName, fg: theme.colors.warning, bg: theme.colors.warningSoft }
      : status === 'SUSPENDED'
      ? { label: 'Suspendu', icon: 'lock' as UiIconName, fg: theme.colors.danger, bg: theme.colors.dangerSoft }
      : { label: 'Actif', icon: 'check' as UiIconName, fg: theme.colors.success, bg: theme.colors.successSoft };

  const roleMeta = (role: UserRole) =>
    role === 'ADMIN'
      ? { label: 'Admin', icon: 'crown' as UiIconName, fg: theme.colors.supervisor, bg: theme.colors.supervisorSoft }
      : role === 'READ_ONLY' || role === 'USER'
      ? { label: 'Consultation', icon: 'eye' as UiIconName, fg: theme.colors.textMuted, bg: theme.colors.surfaceAlt }
      : { label: 'Gestionnaire', icon: 'user' as UiIconName, fg: theme.colors.onPrimarySoft, bg: theme.colors.primarySoft };

  const pill = (meta: { label: string; icon: UiIconName; fg: string; bg: string }) => (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Icon name={meta.icon} size={14} color={meta.fg} />
      <Text variant="label" style={{ color: meta.fg }}>
        {meta.label}
      </Text>
    </View>
  );

  const toolTile = (icon: UiIconName, label: string, onPress: () => void, opts: { danger?: boolean; busy?: boolean } = {}) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={opts.busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.toolTile, opts.danger && styles.toolTileDanger, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={opts.danger ? theme.colors.danger : theme.colors.primary} />
      <Text variant="caption" tone={opts.danger ? 'danger' : 'default'} numberOfLines={1}>
        {opts.busy ? 'PDF…' : label}
      </Text>
    </Pressable>
  );

  return (
    <Screen
      scroll={false}
      padded={false}
      edges={['left', 'right', 'bottom']}
      header={
        <View style={[styles.adminHeader, { paddingTop: insets.top + theme.spacing.sm }]}>
          <View style={styles.adminHeaderInner}>
            <View style={styles.flexShrink}>
              <View style={styles.adminBadge}>
                <Icon name="crown" size={14} color={theme.colors.onSupervisor} />
                <Text variant="label" style={styles.onSupervisor}>
                  Super-administrateur
                </Text>
              </View>
              <Text variant={isSmallScreen ? 'heading' : 'title'} style={styles.onSupervisor} numberOfLines={1} accessibilityRole="header">
                Contrôle et audit
              </Text>
              <Text variant="caption" style={styles.onSupervisorMuted} numberOfLines={1}>
                Plateforme centrale SOL Mobile
              </Text>
            </View>
            <Pressable
              onPress={handleExportPdfReport}
              disabled={isExportingPdf}
              accessibilityRole="button"
              accessibilityLabel="Rapport PDF de la plateforme"
              style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            >
              <Icon name="printer" size={20} color={theme.colors.onSupervisor} />
              {!isSmallScreen && (
                <Text variant="label" style={styles.onSupervisor}>
                  {isExportingPdf ? 'PDF…' : 'Rapport'}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Se déconnecter"
              style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
            >
              <Icon name="logout" size={20} color={theme.colors.onSupervisor} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {tabs.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => selectTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === t.key }}
                style={({ pressed }) => [styles.tabChip, activeTab === t.key && styles.tabChipActive, pressed && styles.headerBtnPressed]}
              >
                <Text variant="label" style={activeTab === t.key ? { color: theme.colors.supervisor } : styles.onSupervisor}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      }
    >
      {/* TAB 1: USERS */}
      {activeTab === 'USERS' && (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item, index) => (item.collector.id ? `${item.collector.id}-${index}` : String(index))}
          refreshControl={refresh}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {kpiBlock}
              <View style={styles.rowBetween}>
                <View style={styles.flexShrink}>
                  <Text variant="subheading">Répertoire des comptes</Text>
                  <Text variant="caption" tone="muted">
                    {filteredUsers.length} utilisateur(s) trouvé(s)
                  </Text>
                </View>
                <Button label="Créer" icon="plus" onPress={handleOpenCreateModal} />
              </View>
              <View style={styles.searchBar}>
                <Icon name="search" size={18} color={theme.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Nom, téléphone, zone ou carnet"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  accessibilityLabel="Rechercher un utilisateur"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                    <Icon name="close" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <Chip label="Tous les rôles" selected={filterRole === 'ALL'} onPress={() => setFilterRole('ALL')} />
                <Chip label="Gestionnaires" selected={filterRole === 'MANAGER'} onPress={() => setFilterRole('MANAGER')} />
                <Chip label="Consultation" selected={filterRole === 'READ_ONLY'} onPress={() => setFilterRole('READ_ONLY')} />
                <Chip label="Super-admins" selected={filterRole === 'ADMIN'} onPress={() => setFilterRole('ADMIN')} />
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <Chip label="Tous les statuts" selected={filterStatus === 'ALL'} onPress={() => setFilterStatus('ALL')} />
                <Chip label={`Actifs (${stats.activeManagers})`} selected={filterStatus === 'ACTIVE'} onPress={() => setFilterStatus('ACTIVE')} />
                <Chip label={`En attente (${stats.pendingManagers})`} selected={filterStatus === 'PENDING_APPROVAL'} onPress={() => setFilterStatus('PENDING_APPROVAL')} />
                <Chip label={`Suspendus (${stats.suspendedManagers})`} selected={filterStatus === 'SUSPENDED'} tone="danger" onPress={() => setFilterStatus('SUSPENDED')} />
              </ScrollView>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="users" title="Aucun utilisateur" message="Aucun compte ne correspond aux filtres choisis." />}
          renderItem={({ item }) => {
            const { collector, business, clientsCount, totalCollected, totalDistributed } = item;
            const isPending = collector.status === 'PENDING_APPROVAL';
            const isSuspended = collector.status === 'SUSPENDED';
            const role = (collector.role as UserRole) || 'MANAGER';
            const isReadOnly = role === 'READ_ONLY' || role === 'USER';

            return (
              <Card tone={isSuspended ? 'sunken' : 'default'} style={[styles.cardGap, isPending && styles.cardPending]}>
                <View style={styles.identityRow}>
                  <Avatar name={collector.fullName} />
                  <View style={styles.flexShrink}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {collector.fullName}
                    </Text>
                    <Text variant="caption" tone="muted" selectable>
                      {collector.phoneNumber} · PIN chiffré
                    </Text>
                  </View>
                </View>
                <View style={styles.pillsRow}>
                  {pill(roleMeta(role))}
                  {pill(statusMeta(collector.status))}
                </View>
                {collector.zone ? (
                  <Text variant="caption" tone="muted">
                    Zone : {collector.zone}
                  </Text>
                ) : null}
                {business && (
                  <Text variant="caption" tone="muted">
                    Carnet : {business.name} · {business.totalSlots} enfants · {formatCurrency(business.contributionAmount)}
                  </Text>
                )}

                {!isReadOnly ? (
                  <View style={styles.statsRow}>
                    <View style={styles.statCell}>
                      <Text variant="caption" tone="muted">
                        Enfants
                      </Text>
                      <Text variant="amountSmall">{clientsCount}</Text>
                    </View>
                    <View style={styles.statCell}>
                      <Text variant="caption" tone="muted">
                        Cotisé
                      </Text>
                      <AmountText amount={totalCollected} size="small" tone="success" />
                    </View>
                    <View style={styles.statCell}>
                      <Text variant="caption" tone="muted">
                        Remis
                      </Text>
                      <AmountText amount={totalDistributed} size="small" tone="primary" />
                    </View>
                  </View>
                ) : (
                  <Card tone="sunken" padding="sm">
                    <View style={styles.rowStart}>
                      <Icon name="eye" size={16} color={theme.colors.textMuted} />
                      <Text variant="caption" tone="muted" style={styles.flexShrink}>
                        Compte en consultation seule (rapports et statistiques).
                      </Text>
                    </View>
                  </Card>
                )}

                <View style={styles.actionsRow}>
                  {isPending && (
                    <Button label="Approuver" icon="check" onPress={() => handleQuickStatusChange(collector.id, collector.fullName, 'ACTIVE')} style={styles.flexGrow} />
                  )}
                  {collector.status === 'ACTIVE' && (
                    <Button
                      label="Suspendre"
                      icon="lock"
                      variant="danger"
                      onPress={() => handleQuickStatusChange(collector.id, collector.fullName, 'SUSPENDED')}
                      style={styles.flexGrow}
                    />
                  )}
                  {isSuspended && (
                    <Button
                      label="Réactiver"
                      icon="check"
                      variant="secondary"
                      onPress={() => handleQuickStatusChange(collector.id, collector.fullName, 'ACTIVE')}
                      style={styles.flexGrow}
                    />
                  )}
                  {business && (
                    <Button label="Ouvrir" icon="arrow-right" iconPosition="right" onPress={() => handleOpenBusinessAsManager(item)} style={styles.flexGrow} />
                  )}
                </View>

                <View style={styles.toolsGrid}>
                  {toolTile('phone', 'Appeler', () => handleCallManager(collector.phoneNumber))}
                  {toolTile('message', 'WhatsApp', () => handleWhatsAppManager(collector.phoneNumber))}
                  {toolTile('edit', 'Modifier', () => handleOpenEditModal(item))}
                  {toolTile('lock', 'Code PIN', () => handleOpenResetPinModal(item))}
                  {business && !isReadOnly
                    ? toolTile('printer', 'Rapport', () => handleGenerateManagerReport(item), { busy: generatingManagerReportId === collector.id })
                    : null}
                  {toolTile('trash', 'Supprimer', () => handleDeleteUser(item), { danger: true })}
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* TAB 2: TRANSACTIONS WITH SUPER-ADMIN CANCELLATION */}
      {activeTab === 'TRANSACTIONS' && (
        <FlatList
          data={transactions}
          keyExtractor={(item, index) => (item.id ? `${item.id}-${index}` : String(index))}
          refreshControl={refresh}
          contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={<View style={styles.listHeader}>{kpiBlock}</View>}
          ListEmptyComponent={<EmptyState icon="history" title="Aucune opération" message="Les opérations de la plateforme apparaîtront ici." />}
          renderItem={({ item }) => {
            const isPayout = item.type === 'SOL_PAYOUT' || item.type === 'HAND_PAYOUT' || item.type === 'WITHDRAWAL';
            const isReversal = item.type === 'REVERSAL' || item.isReversed;
            const icon: UiIconName = isReversal ? 'alert' : isPayout ? 'payout' : 'cash';
            const fg = isReversal ? theme.colors.danger : isPayout ? theme.colors.primary : theme.colors.success;
            const bg = isReversal ? theme.colors.dangerSoft : isPayout ? theme.colors.primarySoft : theme.colors.successSoft;
            return (
              <Card padding="none" style={styles.ledgerCard}>
                <ListItem
                  divider={false}
                  leading={
                    <View style={[styles.txIcon, { backgroundColor: bg }]}>
                      <Icon name={icon} size={18} color={fg} />
                    </View>
                  }
                  title={item.clientName || 'Adhérent inconnu'}
                  subtitle={[item.note || item.type, formatDate(item.createdAtLocal)].filter(Boolean).join(' · ')}
                  meta={
                    <Text variant="caption" tone={isReversal ? 'danger' : 'muted'} selectable>
                      #{item.id.slice(0, 8)}
                      {isReversal ? ' · Annulée' : ''}
                    </Text>
                  }
                  trailing={<AmountText amount={item.amount} size="small" sign={isReversal || isPayout ? 'debit' : 'credit'} tone={isReversal ? 'danger' : isPayout ? 'default' : 'success'} />}
                />
                {!isReversal && (
                  <View style={styles.txAction}>
                    <Button label="Annuler l'opération" icon="alert" variant="secondary" onPress={() => handleInitiateCancelTx(item)} />
                  </View>
                )}
              </Card>
            );
          }}
        />
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'AUDIT_LOGS' && (
        <FlatList
          data={filteredAuditLogs}
          keyExtractor={(item, index) => (item.id ? `${item.id}-${index}` : String(index))}
          refreshControl={refresh}
          contentContainerStyle={[styles.listContent, isTablet && styles.listContentTablet]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {kpiBlock}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <Chip label={`Tous (${auditLogs.length})`} selected={auditFilter === 'ALL'} onPress={() => setAuditFilter('ALL')} />
                <Chip label="Inscriptions" selected={auditFilter === 'CREATE_CLIENT'} onPress={() => setAuditFilter('CREATE_CLIENT')} />
                <Chip label="Remises hors ordre" selected={auditFilter === 'PAYOUT_OUT_OF_ORDER'} onPress={() => setAuditFilter('PAYOUT_OUT_OF_ORDER')} />
                <Chip label="Annulations" selected={auditFilter === 'REVERSE_TRANSACTION'} tone="danger" onPress={() => setAuditFilter('REVERSE_TRANSACTION')} />
              </ScrollView>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="shield" title="Aucun événement" message="Le journal d'audit est vide pour ce filtre." />}
          renderItem={({ item }) => (
            <Card style={styles.cardGap}>
              <View style={styles.rowBetween}>
                <View style={styles.codeChip}>
                  <Text variant="label" tone="muted" selectable>
                    {item.action}
                  </Text>
                </View>
                <Text variant="caption" tone="muted">
                  {formatDate(item.createdAt)}
                </Text>
              </View>
              <Text variant="body">{item.reason || 'Aucun motif'}</Text>
              <Text variant="caption" tone="muted" selectable>
                Par {item.userRole} ({item.userId.slice(0, 8)}) · cible {item.entityType} #{item.entityId.slice(0, 8)}
              </Text>
            </Card>
          )}
        />
      )}

      {/* TAB 4: SYNC STATUS */}
      {activeTab === 'SYNC_STATUS' && (
        <ScrollView contentContainerStyle={[styles.listContent, styles.listHeader, isTablet && styles.listContentTablet]} refreshControl={refresh}>
          {kpiBlock}
          <Card style={styles.cardGap}>
            <View style={styles.rowBetween}>
              <View style={styles.flexShrink}>
                <Text variant="subheading">Synchronisation Supabase</Text>
                <View style={styles.rowStart}>
                  <Icon name={syncSummary.isOnline ? 'check' : 'alert'} size={16} color={syncSummary.isOnline ? theme.colors.success : theme.colors.textMuted} />
                  <Text variant="caption" tone={syncSummary.isOnline ? 'success' : 'muted'}>
                    {syncSummary.isOnline ? 'En ligne · cloud connecté' : 'Hors ligne'}
                  </Text>
                </View>
              </View>
              <Button label="Actualiser" icon="cycle" variant="secondary" onPress={handleRefresh} />
            </View>
            <View style={styles.statsRow}>
              <MetricTile label="En attente" value={String(syncSummary.pendingCount)} tone={syncSummary.pendingCount > 0 ? 'warning' : 'default'} />
              <MetricTile label="Synchronisés" value={String(syncSummary.syncedCount)} tone="success" />
              <MetricTile label="Échecs" value={String(syncSummary.failedCount)} tone={syncSummary.failedCount > 0 ? 'danger' : 'default'} />
            </View>
          </Card>

          {syncSummary.failedErrors.length > 0 && (
            <Card tone="danger" style={styles.cardGap}>
              <Text variant="subheading" tone="danger">
                Dernières erreurs
              </Text>
              {syncSummary.failedErrors.map((err, idx) => (
                <Text key={idx} variant="caption" tone="danger" selectable>
                  • {err}
                </Text>
              ))}
            </Card>
          )}
        </ScrollView>
      )}

      {/* TAB 5: SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <ScrollView contentContainerStyle={[styles.listContent, styles.listHeader, isTablet && styles.listContentTablet]} keyboardShouldPersistTaps="handled">
          <Card style={styles.cardGap}>
            <Text variant="subheading">Assistance et hotline officielle</Text>
            <Text variant="caption" tone="muted">
              Coordonnées affichées aux gestionnaires suspendus et sur les reçus officiels.
            </Text>
            {[
              { label: 'Nom admin', value: adminProfile.fullName },
              { label: 'Hotline', value: adminProfile.phoneNumber },
              { label: 'E-mail', value: adminProfile.email || 'Non renseigné' },
              { label: 'Bureau', value: adminProfile.address || 'Non renseigné' },
              ...(adminProfile.supportHours ? [{ label: 'Horaires', value: adminProfile.supportHours }] : []),
            ].map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text variant="caption" tone="muted" style={styles.infoLabel}>
                  {row.label}
                </Text>
                <Text variant="label" selectable style={styles.infoValue}>
                  {row.value}
                </Text>
              </View>
            ))}
            <Button label="Modifier les coordonnées" icon="edit" variant="secondary" fullWidth onPress={() => setIsAdminProfileModalOpen(true)} />
          </Card>

          <Card style={styles.cardGap}>
            <Text variant="subheading">Sauvegarde et restauration</Text>
            <Text variant="caption" tone="muted">
              Exportez ou restaurez toute la base locale : utilisateurs, carnets, adhérents, transactions et journal d'audit.
            </Text>
            <View style={styles.actionsRow}>
              <Button label="Exporter JSON" icon="share" onPress={handleExportBackup} style={styles.flexGrow} />
              <Button label="Restaurer JSON" icon="history" variant="danger" onPress={() => setIsRestoreModalOpen(true)} style={styles.flexGrow} />
            </View>
          </Card>
        </ScrollView>
      )}

      {/* Create user */}
      <Dialog
        visible={isCreateUserModalOpen}
        onClose={() => setIsCreateUserModalOpen(false)}
        title="Créer un utilisateur"
        subtitle="Définissez son rôle et ses accès sur la plateforme."
        icon="user"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsCreateUserModalOpen(false)} style={styles.flexGrow} />
            <Button label="Créer (PIN)" onPress={handleCreateNewUser} style={styles.flexGrow} />
          </>
        }
      >
        <Text variant="label">Rôle sur la plateforme</Text>
        <View style={styles.chipsWrap}>
          {ROLE_OPTIONS.map((r) => (
            <Chip key={r.value} label={r.label} selected={newRole === r.value} onPress={() => setNewRole(r.value)} />
          ))}
        </View>
        <TextField label="Nom complet" value={newFullName} onChangeText={setNewFullName} placeholder="Ex : Pierre Richard Joseph" />
        <TextField label="Téléphone (+509…)" value={newPhone} onChangeText={setNewPhone} placeholder="+509 3X XX XX XX" keyboardType="phone-pad" />
        <TextField label="Zone / marché" value={newZone} onChangeText={setNewZone} placeholder="Ex : Marché Salomon" />
        <TextField label="Code PIN (4 chiffres)" value={newPin} onChangeText={setNewPin} placeholder="4 chiffres" keyboardType="numeric" maxLength={4} />
        {newRole === 'MANAGER' && (
          <>
            <Text variant="subheading">Carnet associé</Text>
            <TextField label="Nom du carnet" value={newBizName} onChangeText={setNewBizName} placeholder="Ex : Sol Mache Salomon 2026" />
            <View style={styles.actionsRow}>
              <View style={styles.flexGrow}>
                <TextField label="Valeur par main (HTG)" value={newUnitAmount} onChangeText={setNewUnitAmount} keyboardType="numeric" />
              </View>
              <View style={styles.flexGrow}>
                <TextField label="Places prévues" value={newSlots} onChangeText={setNewSlots} keyboardType="numeric" />
              </View>
            </View>
          </>
        )}
      </Dialog>

      {/* Edit user */}
      <Dialog
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Modifier l'utilisateur"
        icon="edit"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsEditModalOpen(false)} style={styles.flexGrow} />
            <Button label="Valider (PIN)" onPress={handleSaveEdit} style={styles.flexGrow} />
          </>
        }
      >
        <Text variant="label">Rôle attribué</Text>
        <View style={styles.chipsWrap}>
          {ROLE_OPTIONS.map((r) => (
            <Chip key={r.value} label={r.label} selected={editRole === r.value} onPress={() => setEditRole(r.value)} />
          ))}
        </View>
        <TextField label="Nom complet" value={editFullName} onChangeText={setEditFullName} placeholder="Nom complet" />
        <TextField label="Téléphone (+509…)" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
        <TextField label="Marché / zone" value={editZone} onChangeText={setEditZone} placeholder="Ex : Marché Salomon" />
        <TextField
          label="Réinitialiser le PIN (4 chiffres)"
          value={editPin}
          onChangeText={setEditPin}
          placeholder="Laisser vide pour ne pas changer"
          keyboardType="numeric"
          maxLength={4}
        />
      </Dialog>

      {/* Super-admin transaction cancellation */}
      <Dialog
        visible={isCancelTxModalOpen}
        onClose={() => setIsCancelTxModalOpen(false)}
        title="Annulation administrative"
        subtitle={`Opération #${selectedTxToCancel?.id.slice(0, 8) ?? ''} · ${selectedTxToCancel?.clientName || 'Adhérent'} · ${formatCurrency(selectedTxToCancel?.amount || 0)}`}
        icon="alert"
        tone="danger"
        actions={
          <>
            <Button label="Abandonner" variant="secondary" onPress={() => setIsCancelTxModalOpen(false)} style={styles.flexGrow} />
            <Button label="Annuler (PIN admin)" variant="danger" onPress={handleConfirmCancelTx} style={styles.flexGrow} />
          </>
        }
      >
        <Card tone="sunken">
          <View style={styles.rowStart}>
            <Icon name="shield" size={18} color={theme.colors.textMuted} />
            <Text variant="caption" tone="muted" style={styles.flexShrink}>
              L'enregistrement n'est pas supprimé : une écriture d'annulation certifiée est créée et le solde / l'échéance de l'adhérent sont recalculés.
            </Text>
          </View>
        </Card>
        <TextField
          label="Motif obligatoire"
          multiline
          value={cancelTxReason}
          onChangeText={setCancelTxReason}
          placeholder="Ex : erreur de saisie du montant, doublon"
        />
      </Dialog>

      {/* Admin hotline profile */}
      <Dialog
        visible={isAdminProfileModalOpen}
        onClose={() => setIsAdminProfileModalOpen(false)}
        title="Coordonnées de la hotline"
        icon="phone"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsAdminProfileModalOpen(false)} style={styles.flexGrow} />
            <Button label="Enregistrer" onPress={handleSaveAdminProfile} style={styles.flexGrow} />
          </>
        }
      >
        <TextField label="Nom du superviseur / administration" value={adminEditName} onChangeText={setAdminEditName} placeholder="Nom admin" />
        <TextField label="Numéro hotline / assistance" value={adminEditPhone} onChangeText={setAdminEditPhone} keyboardType="phone-pad" placeholder="+509 XX XX XXXX" />
        <TextField
          label="E-mail de support"
          value={adminEditEmail}
          onChangeText={setAdminEditEmail}
          keyboardType="email-address"
          placeholder="support@solmobile.ht"
          autoCapitalize="none"
        />
        <TextField label="Adresse du bureau / zone" value={adminEditAddress} onChangeText={setAdminEditAddress} placeholder="Ex : Port-au-Prince, Haïti" />
        <TextField label="Horaires de disponibilité" value={adminEditHours} onChangeText={setAdminEditHours} placeholder="Ex : Lun - Sam : 08h00 - 18h00" />
        <TextField
          label="Nouveau code PIN admin (4 chiffres)"
          value={adminEditPin}
          onChangeText={setAdminEditPin}
          placeholder="Laisser vide pour ne pas changer"
          keyboardType="numeric"
          maxLength={4}
        />
      </Dialog>

      {/* Restore JSON backup */}
      <Dialog
        visible={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        title="Restaurer une sauvegarde"
        subtitle="Collez le contenu complet du fichier JSON exporté."
        icon="history"
        tone="danger"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsRestoreModalOpen(false)} style={styles.flexGrow} />
            <Button label="Restaurer (PIN)" variant="danger" onPress={handleConfirmRestore} style={styles.flexGrow} />
          </>
        }
      >
        <TextField
          label="Contenu JSON"
          multiline
          numberOfLines={6}
          value={restoreJsonInput}
          onChangeText={setRestoreJsonInput}
          placeholder='{"exportedAt": "...", "version": "...", "data": {...}}'
        />
      </Dialog>

      {/* Reset manager PIN */}
      <Dialog
        visible={isResetPinModalOpen}
        onClose={() => setIsResetPinModalOpen(false)}
        title="Réinitialiser le code PIN"
        subtitle={`Nouveau code à 4 chiffres pour ${targetManagerForPinReset?.collector.fullName ?? ''} (${targetManagerForPinReset?.collector.phoneNumber ?? ''}).`}
        icon="lock"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsResetPinModalOpen(false)} style={styles.flexGrow} />
            <Button label="Valider (PIN admin)" onPress={handleConfirmResetPin} style={styles.flexGrow} />
          </>
        }
      >
        <TextField
          label="Nouveau code PIN"
          value={adminNewPinInput}
          onChangeText={setAdminNewPinInput}
          placeholder="••••"
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
        />
        <View style={styles.chipsWrap}>
          <Chip label='Définir "1234"' onPress={() => setAdminNewPinInput('1234')} />
          <Chip label='Définir "0000"' onPress={() => setAdminNewPinInput('0000')} />
        </View>
      </Dialog>

      {/* Universal Sensitive Action PIN Modal */}
      <PinVerificationModal
        visible={isPinModalOpen}
        onCancel={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title={pendingActionTitle}
        subtitle={pendingActionSubtitle}
      />
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout, typography }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    pressed: { backgroundColor: colors.surfacePressed },
    cardGap: { gap: spacing.sm },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    rowStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    onSupervisor: { color: colors.onSupervisor },
    onSupervisorMuted: { color: colors.onSupervisor, opacity: 0.8 },

    adminHeader: { backgroundColor: colors.supervisor, paddingBottom: spacing.sm, gap: spacing.sm },
    adminHeaderInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      width: '100%',
      maxWidth: layout.maxContentWidth + layout.gutter * 2,
      alignSelf: 'center',
      paddingHorizontal: layout.gutter,
    },
    adminBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
    headerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minWidth: layout.touchTarget,
      height: layout.touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.onSupervisor,
      justifyContent: 'center',
    },
    headerBtnPressed: { opacity: 0.8 },
    tabsRow: { gap: spacing.sm, paddingHorizontal: layout.gutter },
    tabChip: {
      minHeight: layout.touchTarget - spacing.sm,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.onSupervisor,
    },
    tabChipActive: { backgroundColor: colors.onSupervisor },

    listContent: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xxl },
    listContentTablet: { width: '100%', maxWidth: layout.maxContentWidth + layout.gutter * 2, alignSelf: 'center' },
    listHeader: { gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },
    separator: { height: spacing.sm },

    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    kpiTile: { flexBasis: '47%', flexGrow: 1 },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: layout.touchTarget,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    searchInput: { flex: 1, minWidth: 0, ...typography.body, color: colors.text, paddingVertical: spacing.sm },
    chipsRow: { gap: spacing.sm, paddingRight: spacing.lg },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    cardPending: { borderColor: colors.warningLine, borderWidth: 2 },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: spacing.xxl,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
    },
    statsRow: { flexDirection: 'row', gap: spacing.sm },
    statCell: { flex: 1, minWidth: 0, gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    toolTile: {
      flexBasis: '30%',
      flexGrow: 1,
      minHeight: layout.actionHeight + spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    toolTileDanger: { borderColor: colors.dangerLine, backgroundColor: colors.dangerSoft },

    ledgerCard: { overflow: 'hidden' },
    txIcon: {
      width: spacing.xxl + spacing.sm,
      height: spacing.xxl + spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txAction: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, alignItems: 'flex-end' },
    codeChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    infoLabel: { flex: 1 },
    infoValue: { flex: 1.4, textAlign: 'right' },
  });
