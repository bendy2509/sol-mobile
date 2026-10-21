import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, BackHandler, Linking } from 'react-native';
import { useRouter } from 'expo-router';

import { Header } from '@/components/Header';
import { Avatar, Button, Card, Dialog, Icon, ListItem, Screen, Text, TextField, UiIconName } from '@/components/ui';
import { useAuth, AdminProfile } from '@/context/AuthContext';
import { getActiveBusinessConfig, getClosedCycles } from '@/db/businessRepository';
import { getCashClosures } from '@/db/cashClosureRepository';
import { getDatabase } from '@/db/sqlite';
import { BusinessConfig, ClosedCycle } from '@/types';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { triggerLightImpact, triggerMediumImpact, triggerSuccessFeedback, triggerErrorFeedback } from '@/lib/haptics';
import { hashPin, verifyPinHash } from '@/lib/crypto';
import { safeBack } from '@/lib/navigation';
import { useResponsive } from '@/hooks/useResponsive';
import { Theme, useTheme } from '@/theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  const isSupervisor = isImpersonating || userRole === 'ADMIN';

  const businessRows = business
    ? [
        { label: 'Nom du carnet', value: business.name },
        { label: "Valeur d'une main", value: formatCurrency(business.contributionAmount) },
        { label: 'Places / enfants', value: `${business.totalSlots} enfants` },
        { label: 'Cagnotte par tour', value: formatCurrency(business.contributionAmount * business.totalSlots), tone: 'success' as const },
        { label: "Date d'échéance", value: business.endDate ? formatDateShort(business.endDate) : '—' },
      ]
    : [];

  const supportRows = [
    { label: 'Superviseur', value: adminContact?.fullName || 'Administration Centrale' },
    { label: 'Hotline', value: adminContact?.phoneNumber || '+509 34 56 7890', tone: 'success' as const },
    ...(adminContact?.email ? [{ label: 'E-mail', value: adminContact.email }] : []),
    ...(adminContact?.address ? [{ label: 'Bureau', value: adminContact.address }] : []),
    ...(adminContact?.supportHours ? [{ label: 'Disponibilité', value: adminContact.supportHours }] : []),
  ];

  const renderRows = (rows: { label: string; value: string; tone?: 'success' }[]) =>
    rows.map((row) => (
      <View key={row.label} style={styles.infoRow}>
        <Text variant="caption" tone="muted" style={styles.infoLabel}>
          {row.label}
        </Text>
        <Text variant="label" tone={row.tone ?? 'default'} selectable style={styles.infoValue}>
          {row.value}
        </Text>
      </View>
    ));

  const navIcon = (name: UiIconName, fg: string, bg: string) => (
    <View style={[styles.navIcon, { backgroundColor: bg }]}>
      <Icon name={name} size={18} color={fg} />
    </View>
  );

  return (
    <Screen
      edges={['top', 'left', 'right', 'bottom']}
      header={
        <Header
          title="Mon profil"
          subtitle="Compte, assistance et sécurité"
          showBack={true}
          showProfile={false}
          showScanner={false}
          fallbackBackRoute="/(tabs)"
        />
      }
    >
      {isSupervisor && (
        <Card tone="supervisor" style={styles.cardGap}>
          <View style={styles.rowStart}>
            <Icon name="crown" size={22} color={theme.colors.supervisor} />
            <View style={styles.flexShrink}>
              <Text variant="subheading" style={{ color: theme.colors.supervisor }}>
                Mode superviseur actif
              </Text>
              <Text variant="body" tone="muted">
                Vous gérez l'espace de {activeCollector?.fullName || 'Gestionnaire'}.
              </Text>
            </View>
          </View>
          <Button
            variant="secondary"
            icon="arrow-left"
            fullWidth
            label="Retourner au dashboard admin"
            onPress={async () => {
              triggerMediumImpact();
              await exitImpersonation();
              router.replace('/admin' as any);
            }}
          />
        </Card>
      )}

      {/* Identity */}
      <Card style={styles.identityCard}>
        <Avatar name={activeCollector?.fullName || 'Responsable SOL'} size="lg" />
        <Text variant="title" align="center">
          {activeCollector?.fullName || 'Responsable SOL'}
        </Text>
        <Text variant="body" tone="muted" align="center" selectable>
          {activeCollector?.phoneNumber || '+509 XX XX XXXX'}
        </Text>
        {activeCollector?.zone ? (
          <Text variant="caption" tone="muted" align="center">
            Zone : {activeCollector.zone}
          </Text>
        ) : null}
        <View style={[styles.roleChip, userRole === 'ADMIN' && styles.roleChipAdmin]}>
          <Text variant="label" style={{ color: userRole === 'ADMIN' ? theme.colors.supervisor : theme.colors.onPrimarySoft }}>
            {userRole === 'ADMIN' ? 'Administrateur' : 'Responsable du sol'}
          </Text>
        </View>
        <Button
          variant="secondary"
          icon="edit"
          label="Modifier mes informations"
          fullWidth
          onPress={() => {
            setEditFullName(activeCollector?.fullName || '');
            setEditPhoneNumber(activeCollector?.phoneNumber || '');
            setEditZone(activeCollector?.zone || '');
            setProfileError(null);
            setIsEditProfileModalOpen(true);
          }}
        />
      </Card>

      {/* Active carnet */}
      {business && (
        <Card style={styles.cardGap}>
          <Text variant="subheading" accessibilityRole="header">
            Mon carnet actif
          </Text>
          {renderRows(businessRows)}
        </Card>
      )}

      {/* Admin support */}
      <Card style={styles.cardGap}>
        <Text variant="subheading" accessibilityRole="header">
          Assistance administrateur
        </Text>
        <Text variant="caption" tone="muted">
          Coordonnées officielles de l'administration pour toute aide technique ou financière.
        </Text>
        {renderRows(supportRows)}
        <View style={styles.actionsRow}>
          <Button label="Appeler" icon="phone" onPress={() => handleCallAdmin(adminContact?.phoneNumber)} style={styles.flexGrow} />
          <Button label="WhatsApp" icon="message" variant="secondary" onPress={() => handleWhatsAppAdmin(adminContact?.phoneNumber)} style={styles.flexGrow} />
        </View>
        {adminContact?.email ? (
          <Button label="Écrire un e-mail" icon="mail" variant="secondary" fullWidth onPress={() => handleEmailAdmin(adminContact.email)} />
        ) : null}
      </Card>

      {/* Archives */}
      <Card padding="none" style={styles.listCard}>
        <ListItem
          onPress={() => router.push('/cycle-management' as any)}
          leading={navIcon('history', theme.colors.primary, theme.colors.primarySoft)}
          title="Cycles SOL clôturés"
          subtitle={closedCyclesCount > 0 ? `${closedCyclesCount} cycle(s) archivé(s) avec bilan PDF` : 'Aucun cycle clôturé pour le moment'}
          showChevron
        />
        <ListItem
          onPress={() => router.push('/closure' as any)}
          leading={navIcon('cash', theme.colors.success, theme.colors.successSoft)}
          title="Clôtures de caisse"
          subtitle={cashClosuresCount > 0 ? `${cashClosuresCount} bordereau(x) disponible(s)` : 'Historique des arrêtés de caisse'}
          showChevron
        />
        <ListItem
          onPress={() => {
            setPinError(null);
            setIsChangePinModalOpen(true);
          }}
          leading={navIcon('lock', theme.colors.textMuted, theme.colors.surfaceAlt)}
          title="Modifier mon code PIN"
          subtitle="Code à 4 chiffres"
          showChevron
          divider={false}
        />
      </Card>

      {/* Sensitive zone */}
      {(userRole === 'MANAGER' || userRole === 'ADMIN') && (
        <Card tone="danger" padding="none" style={styles.listCard}>
          <ListItem
            onPress={() => router.push('/cycle-management' as any)}
            leading={navIcon('cycle', theme.colors.danger, theme.colors.surface)}
            title="Clôturer et rouvrir le cycle"
            subtitle="Zone sensible · renouvellement ou remise à zéro du sol"
            showChevron
            divider={false}
          />
        </Card>
      )}

      <Button label="Se déconnecter" icon="logout" variant="secondary" fullWidth onPress={handleLogout} style={styles.logoutBtn} />

      {/* Change PIN */}
      <Dialog
        visible={isChangePinModalOpen}
        onClose={() => setIsChangePinModalOpen(false)}
        title="Modifier mon code PIN"
        subtitle="Saisissez votre code actuel puis votre nouveau code à 4 chiffres."
        icon="lock"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsChangePinModalOpen(false)} style={styles.flexGrow} />
            <Button label="Enregistrer" onPress={handleChangePinSubmit} style={styles.flexGrow} />
          </>
        }
      >
        {pinError && (
          <Card tone="danger" padding="sm">
            <Text variant="label" tone="danger">
              {pinError}
            </Text>
          </Card>
        )}
        <TextField label="Code PIN actuel" keyboardType="numeric" maxLength={4} secureTextEntry placeholder="••••" value={oldPin} onChangeText={setOldPin} />
        <TextField label="Nouveau code PIN" keyboardType="numeric" maxLength={4} secureTextEntry placeholder="••••" value={newPin} onChangeText={setNewPin} />
        <TextField
          label="Confirmer le nouveau code"
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
          placeholder="••••"
          value={confirmPin}
          onChangeText={setConfirmPin}
        />
      </Dialog>

      {/* Edit profile */}
      <Dialog
        visible={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        title="Modifier mes informations"
        subtitle="Les changements sont pris en compte immédiatement."
        icon="edit"
        actions={
          <>
            <Button label="Annuler" variant="secondary" onPress={() => setIsEditProfileModalOpen(false)} style={styles.flexGrow} />
            <Button label="Enregistrer" loading={isSavingProfile} onPress={handleSaveProfileSubmit} style={styles.flexGrow} />
          </>
        }
      >
        {profileError && (
          <Card tone="danger" padding="sm">
            <Text variant="label" tone="danger">
              {profileError}
            </Text>
          </Card>
        )}
        <TextField label="Nom complet" placeholder="Ex : Jean Baptiste" value={editFullName} onChangeText={setEditFullName} />
        <TextField
          label="Numéro de téléphone"
          keyboardType="phone-pad"
          placeholder="+509 XXXX XXXX"
          value={editPhoneNumber}
          onChangeText={setEditPhoneNumber}
        />
        <TextField
          label="Zone d'activité / marché (optionnel)"
          placeholder="Ex : Marché Salomon, Pétion-Ville"
          value={editZone}
          onChangeText={setEditZone}
        />
      </Dialog>
    </Screen>
  );
}

const createStyles = ({ colors, spacing, radius, layout }: Theme) =>
  StyleSheet.create({
    flexShrink: { flex: 1, minWidth: 0 },
    flexGrow: { flexGrow: 1, flexBasis: 0 },
    cardGap: { gap: spacing.sm },
    rowStart: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },

    identityCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    roleChip: {
      minHeight: spacing.xxl,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
      marginBottom: spacing.sm,
    },
    roleChipAdmin: { backgroundColor: colors.supervisorSoft },

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
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },

    listCard: { overflow: 'hidden' },
    navIcon: {
      width: layout.touchTarget - spacing.sm,
      height: layout.touchTarget - spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutBtn: { marginTop: spacing.sm },
  });
