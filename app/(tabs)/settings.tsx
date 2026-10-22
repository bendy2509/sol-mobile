import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { PinVerificationModal } from '@/components/PinVerificationModal';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Icon,
  Screen,
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  Text,
  TextField,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { getActiveBusinessConfig } from '@/db/businessRepository';
import { getDatabase } from '@/db/sqlite';
import { LANGUAGES, useI18n, t } from '@/i18n';
import { formatCurrency } from '@/lib/formatters';
import { triggerErrorFeedback, triggerSuccessFeedback } from '@/lib/haptics';
import { getReceiptPreferences, ReceiptPreferences, saveReceiptPreferences } from '@/lib/receiptPreferences';
import { exportEncryptedBackup } from '@/services/backupService';
import { MIN_BACKUP_PASSWORD_LENGTH } from '@/services/backupCrypto';
import { exportBusinessReport } from '@/services/reportExport';
import { setPendingRecoveryCode } from '@/services/pendingSecret';
import { AUTO_LOCK_OPTIONS_MIN } from '@/services/securityService';
import { validateNewPin } from '@/services/securityPolicy';
import { BusinessConfig } from '@/types';
import { TEXT_SIZE_PREFERENCES, Theme, ThemePreference, useTheme, useThemePreference } from '@/theme';

type Sheet = null | 'profile' | 'pin' | 'backup' | 'receipt' | 'help';
/** Sensitive actions confirmed by the PIN before they run. */
type PinPurpose = null | 'recovery' | 'backup' | 'biometrics' | 'profile';

/** Réglages: apparence, profil, sécurité, carnet et reçus, langue, données, à propos. */
export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const { language, setLanguage } = useI18n();
  const { preference, setPreference, textSize, setTextSize } = useThemePreference();
  const {
    activeCollector,
    userRole,
    refreshSession,
    changePin,
    biometricAvailable,
    biometricEnabled,
    setBiometricEnabled,
    autoLockMinutes,
    setAutoLockMinutes,
    regenerateRecoveryCode,
    logout,
  } = useAuth();
  const isManager = userRole === 'MANAGER';

  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pinPurpose, setPinPurpose] = useState<PinPurpose>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Profile form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [zone, setZone] = useState('');
  // PIN form
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  // Backup form
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Receipt form
  const [receipt, setReceipt] = useState<ReceiptPreferences>(getReceiptPreferences());

  useFocusEffect(
    useCallback(() => {
      getActiveBusinessConfig()
        .then(setBusiness)
        .catch(() => setBusiness(null));
      setReceipt(getReceiptPreferences());
    }, [])
  );

  const openSheet = (next: Sheet) => {
    setError(null);
    if (next === 'profile') {
      setFullName(activeCollector?.fullName || '');
      setPhone(activeCollector?.phoneNumber || '');
      setZone(activeCollector?.zone || '');
    }
    if (next === 'pin') {
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
    }
    if (next === 'backup') {
      setPassword('');
      setConfirmPassword('');
    }
    if (next === 'receipt') setReceipt(getReceiptPreferences());
    setSheet(next);
  };

  const fail = (message: string) => {
    triggerErrorFeedback();
    setError(message);
  };

  // --- Profil -------------------------------------------------------------
  const validateProfile = () => {
    setError(null);
    if (!fullName.trim()) return fail(t('Le nom est obligatoire.')), false;
    if (!phone.trim()) return fail(t('Le numéro de téléphone est obligatoire.')), false;
    return true;
  };

  const saveProfile = async () => {
    if (!activeCollector) return;
    setBusy(true);
    try {
      const db = await getDatabase();
      await db.runAsync(`UPDATE collectors SET full_name = ?, phone_number = ?, zone = ?, sync_status = 'PENDING' WHERE id = ?`, [
        fullName.trim(),
        phone.trim(),
        zone.trim() || null,
        activeCollector.id,
      ]);
      await refreshSession();
      triggerSuccessFeedback();
      setSheet(null);
    } catch (e: any) {
      fail(e?.message || t('Mise à jour impossible.'));
      setSheet('profile');
    } finally {
      setBusy(false);
    }
  };

  // --- Code PIN -----------------------------------------------------------
  const submitPinChange = async () => {
    setError(null);
    if (oldPin.length !== 4) return fail(t('Saisissez votre code PIN actuel.'));
    const rule = validateNewPin(newPin);
    if (rule) return fail(rule);
    if (newPin !== confirmPin) return fail(t('Les deux nouveaux codes ne correspondent pas.'));
    setBusy(true);
    try {
      const res = await changePin(oldPin, newPin);
      if (!res.success) return fail(res.error || t('Modification impossible.'));
      triggerSuccessFeedback();
      setSheet(null);
      Alert.alert(t('Code PIN modifié'), t('Utilisez votre nouveau code dès la prochaine connexion.'));
    } finally {
      setBusy(false);
    }
  };

  // --- Sauvegarde ---------------------------------------------------------
  const submitBackup = () => {
    setError(null);
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) return fail(t('Choisissez un mot de passe d\'au moins {0} caractères.', MIN_BACKUP_PASSWORD_LENGTH));
    if (password !== confirmPassword) return fail(t('Les deux mots de passe ne correspondent pas.'));
    if (!activeCollector) return;
    setBusy(true);
    // Let the spinner render before the key derivation blocks the JS thread
    setTimeout(async () => {
      try {
        const fileName = await exportEncryptedBackup(activeCollector.id, password);
        triggerSuccessFeedback();
        setSheet(null);
        Alert.alert(t('Sauvegarde créée'), t('{0}\n\nConservez ce fichier et son mot de passe : sans le mot de passe, il est illisible.', fileName));
      } catch (e: any) {
        fail(e?.message || t('Échec de l\'export.'));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const handleReport = async () => {
    setBusy(true);
    try {
      await exportBusinessReport();
    } catch {
      Alert.alert(t('Rapport PDF'), t('Impossible de générer le rapport d\'évolution.'));
    } finally {
      setBusy(false);
    }
  };

  // --- PIN-confirmed actions ---------------------------------------------
  const onPinConfirmed = async () => {
    const purpose = pinPurpose;
    setPinPurpose(null);
    if (purpose === 'recovery') {
      setPendingRecoveryCode(await regenerateRecoveryCode());
      router.push('/recovery-code' as any);
    } else if (purpose === 'backup') {
      openSheet('backup');
    } else if (purpose === 'biometrics') {
      const res = await setBiometricEnabled(true);
      if (!res.success && res.error) Alert.alert(t('Biométrie'), res.error);
    } else if (purpose === 'profile') {
      saveProfile();
    }
  };

  const handleLogout = () => {
    Alert.alert(t('settings.logout'), t('Le code PIN sera demandé à la prochaine ouverture.'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login' as any);
        },
      },
    ]);
  };

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('settings.theme.system') },
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') },
  ];
  const sizeOptions = TEXT_SIZE_PREFERENCES.map((value) => ({ value, label: t(`settings.textSize.${value}`) }));
  const lockOptions = AUTO_LOCK_OPTIONS_MIN.map((m) => ({ value: String(m), label: t('{0} min', m) }));
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const errorBox = error ? (
    <Card tone="danger" padding="sm">
      <View style={styles.row}>
        <Icon name="alert" size={16} color={theme.colors.danger} />
        <Text variant="label" tone="danger" style={styles.flexShrink}>
          {error}
        </Text>
      </View>
    </Card>
  ) : null;

  return (
    <Screen edges={['top', 'left', 'right']} contentStyle={styles.content}>
      <Text variant="title" accessibilityRole="header">
        {t('settings.title')}
      </Text>

      {/* 1. Apparence */}
      <SettingsGroup title={t('settings.appearance')}>
        <View style={styles.block}>
          <Text variant="body">{t('settings.theme')}</Text>
          <SegmentedControl options={themeOptions} value={preference} onChange={setPreference} accessibilityLabel={t('settings.theme')} />
        </View>
        <View style={[styles.block, styles.blockDivider]}>
          <Text variant="body">{t('settings.textSize')}</Text>
          <SegmentedControl options={sizeOptions} value={textSize} onChange={setTextSize} accessibilityLabel={t('settings.textSize')} />
          <View style={styles.preview} accessibilityLabel={t('settings.preview')}>
            <Text variant="caption" tone="muted">
              {t('settings.preview')}
            </Text>
            <Text variant="amountLarge">{formatCurrency(1250)}</Text>
            <Text variant="body">{t('settings.preview.body')}</Text>
          </View>
        </View>
      </SettingsGroup>

      {/* 2. Profil */}
      <SettingsGroup title={t('settings.profile')}>
        <View style={styles.identity}>
          <Avatar name={activeCollector?.fullName || 'SOL'} />
          <View style={styles.flexShrink}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {activeCollector?.fullName || t('Responsable du sol')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[activeCollector?.phoneNumber, activeCollector?.zone].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <SettingsRow label={t('settings.profile.edit')} icon="edit" onPress={() => openSheet('profile')} requiresPin divider={false} />
      </SettingsGroup>

      {/* 3. Sécurité */}
      <SettingsGroup
        title={t('settings.security')}
        footer={t('Le code de récupération est le seul moyen de choisir un nouveau PIN si vous l\'oubliez.')}
      >
        <SettingsRow label={t('settings.security.changePin')} icon="key" onPress={() => openSheet('pin')} />
        <SettingsRow
          label={t('settings.security.biometrics')}
          icon="fingerprint"
          description={biometricAvailable ? undefined : t('Non disponible sur cet appareil')}
          toggle={{
            value: biometricEnabled,
            disabled: !biometricAvailable,
            onChange: async (on) => {
              if (on) return setPinPurpose('biometrics');
              await setBiometricEnabled(false);
            },
          }}
        />
        <View style={[styles.block, styles.blockDivider]}>
          <Text variant="body">{t('settings.security.autoLock')}</Text>
          <SegmentedControl
            options={lockOptions}
            value={String(autoLockMinutes)}
            onChange={(v) => setAutoLockMinutes(Number(v))}
            accessibilityLabel={t('settings.security.autoLock')}
          />
        </View>
        <SettingsRow
          label={t('settings.security.recovery')}
          icon="lock"
          onPress={() => setPinPurpose('recovery')}
          requiresPin
          divider={false}
        />
      </SettingsGroup>

      {/* 4. Carnet et reçus */}
      <SettingsGroup title={t('settings.carnet')}>
        {isManager ? (
          <SettingsRow
            label={t('settings.carnet.business')}
            icon="settings"
            value={business?.name}
            onPress={() => router.push('/setup-business' as any)}
          />
        ) : null}
        <SettingsRow
          label={t('settings.carnet.currency')}
          icon="cash"
          value={formatCurrency(1250)}
          onPress={() => openSheet('receipt')}
        />
        <SettingsRow
          label={t('settings.carnet.receiptName')}
          icon="file"
          value={getReceiptPreferences().receiptName || business?.name || '—'}
          onPress={() => openSheet('receipt')}
        />
        <SettingsRow label={t('settings.carnet.closures')} icon="calendar" onPress={() => router.push('/closure' as any)} />
        <SettingsRow label={t('settings.carnet.cycles')} icon="cycle" onPress={() => router.push('/cycle-management' as any)} divider={false} />
      </SettingsGroup>

      {/* 5. Langue */}
      <SettingsGroup title={t('settings.language')}>
        {LANGUAGES.map((lang, i) => (
          <SettingsRow
            key={lang.code}
            label={lang.label}
            icon="globe"
            selected={language === lang.code}
            onPress={() => setLanguage(lang.code)}
            divider={i < LANGUAGES.length - 1}
          />
        ))}
      </SettingsGroup>

      {/* 6. Données */}
      <SettingsGroup title={t('settings.data')} footer={t('Fichier .solbak chiffré en AES-256, illisible sans son mot de passe.')}>
        <SettingsRow label={t('settings.data.backup')} icon="download" onPress={() => setPinPurpose('backup')} requiresPin />
        <SettingsRow label={t('settings.data.restore')} icon="upload" onPress={() => router.push('/restore-backup' as any)} requiresPin />
        <SettingsRow label={t('settings.data.export')} icon="printer" onPress={handleReport} value={busy && !sheet ? '…' : undefined} />
        <SettingsRow label={t('settings.data.sync')} icon="sync" onPress={() => router.push('/modal' as any)} divider={false} />
      </SettingsGroup>

      {/* 7. À propos */}
      <SettingsGroup title={t('settings.about')}>
        <SettingsRow label={t('settings.about.version')} value={version} />
        <SettingsRow label={t('settings.about.help')} icon="help" onPress={() => openSheet('help')} />
        <SettingsRow label={t('Diagnostic des données')} icon="info" onPress={() => router.push('/backup-diagnostics' as any)} divider={false} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow label={t('settings.logout')} icon="logout" tone="danger" onPress={handleLogout} divider={false} />
      </SettingsGroup>

      {/* Sheets */}
      <BottomSheet
        visible={sheet === 'profile'}
        onClose={() => setSheet(null)}
        title={t('settings.profile.edit')}
        subtitle={t('Votre code PIN sera demandé pour enregistrer.')}
        footer={
          <Button
            size="lg"
            fullWidth
            label={t('common.save')}
            loading={busy}
            onPress={() => {
              if (!validateProfile()) return;
              setSheet(null);
              setPinPurpose('profile');
            }}
          />
        }
      >
        {errorBox}
        <TextField label={t('settings.profile.name')} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
        <TextField label={t('settings.profile.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label={t('settings.profile.zone')} value={zone} onChangeText={setZone} />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'pin'}
        onClose={() => setSheet(null)}
        title={t('settings.security.changePin')}
        subtitle={t('Évitez les suites (1234) et les chiffres répétés.')}
        footer={<Button size="lg" fullWidth icon="key" label={t('common.save')} loading={busy} onPress={submitPinChange} />}
      >
        {errorBox}
        <TextField label={t('Code PIN actuel')} value={oldPin} onChangeText={setOldPin} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <TextField label={t('Nouveau code PIN')} value={newPin} onChangeText={setNewPin} keyboardType="number-pad" secureTextEntry maxLength={4} />
        <TextField label={t('Confirmer le nouveau code')} value={confirmPin} onChangeText={setConfirmPin} keyboardType="number-pad" secureTextEntry maxLength={4} />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'backup'}
        onClose={() => setSheet(null)}
        title={t('Mot de passe de la sauvegarde')}
        subtitle={t('Il sera demandé pour restaurer. Il n\'est enregistré nulle part : notez-le.')}
        footer={<Button size="lg" fullWidth icon="download" label={t('Chiffrer et exporter')} loading={busy} onPress={submitBackup} />}
      >
        {errorBox}
        <TextField label={t('Mot de passe')} secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
        <TextField label={t('Confirmer le mot de passe')} secureTextEntry autoCapitalize="none" value={confirmPassword} onChangeText={setConfirmPassword} />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'receipt'}
        onClose={() => setSheet(null)}
        title={t('settings.carnet')}
        footer={
          <Button
            size="lg"
            fullWidth
            label={t('common.save')}
            onPress={() => {
              saveReceiptPreferences({ ...receipt, receiptName: receipt.receiptName.trim(), receiptNote: receipt.receiptNote.trim() });
              triggerSuccessFeedback();
              setSheet(null);
            }}
          />
        }
      >
        <View style={styles.gapSm}>
          <Text variant="body">{t('settings.carnet.currency')}</Text>
          <SegmentedControl
            options={[
              { value: 'HTG', label: t('1 250 HTG') },
              { value: 'G', label: '1 250 G' },
            ]}
            value={receipt.currencyLabel}
            onChange={(currencyLabel) => setReceipt({ ...receipt, currencyLabel })}
            accessibilityLabel={t('settings.carnet.currency')}
          />
        </View>
        <TextField
          label={t('settings.carnet.receiptName')}
          value={receipt.receiptName}
          onChangeText={(receiptName) => setReceipt({ ...receipt, receiptName })}
          placeholder={business?.name || t('Nom du carnet')}
        />
        <TextField
          label={t('settings.carnet.receiptNote')}
          value={receipt.receiptNote}
          onChangeText={(receiptNote) => setReceipt({ ...receipt, receiptNote })}
          placeholder={t('Merci de votre confiance.')}
          maxLength={120}
        />
      </BottomSheet>

      <BottomSheet visible={sheet === 'help'} onClose={() => setSheet(null)} title={t('settings.about.help')}>
        {[
          ['Encaisser', "Onglet Encaisser, touchez l'adhérent, choisissez le nombre de mains puis confirmez avec votre PIN."],
          ['Remettre la main', "Sur l'Accueil ou l'onglet Sol, touchez Remettre au bénéficiaire du tour, puis confirmez avec votre PIN."],
          ['Annuler une opération', 'Historique, touchez l’opération, menu ⋯, Annuler. Un motif et votre PIN sont obligatoires.'],
          ['Code PIN oublié', "Sur l'écran de connexion, « Code PIN oublié ? », puis votre code de récupération."],
          ['Changer de téléphone', 'Créez une sauvegarde chiffrée ici, puis « Restaurer une sauvegarde » sur le nouveau téléphone.'],
        ].map(([title, body]) => (
          <View key={title} style={styles.gapXs}>
            <Text variant="bodyStrong">{t(title)}</Text>
            <Text variant="body" tone="muted">
              {t(body)}
            </Text>
          </View>
        ))}
      </BottomSheet>

      <PinVerificationModal
        visible={pinPurpose !== null}
        title={t('Confirmez avec votre code PIN')}
        subtitle={
          pinPurpose === 'recovery'
            ? t('L\'ancien code de récupération ne fonctionnera plus.')
            : pinPurpose === 'backup'
              ? t('La sauvegarde contient tout votre carnet.')
              : pinPurpose === 'biometrics'
                ? t('L\'empreinte ou le visage pourra ensuite remplacer le code PIN.')
                : t('Pour enregistrer vos informations.')
        }
        onSuccess={onPinConfirmed}
        onCancel={() => setPinPurpose(null)}
      />
    </Screen>
  );
}

const createStyles = ({ spacing, colors, radius }: Theme) =>
  StyleSheet.create({
    content: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
    flexShrink: { flex: 1, minWidth: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
    block: { gap: spacing.md, padding: spacing.lg },
    blockDivider: { borderTopWidth: 1, borderTopColor: colors.divider, borderBottomWidth: 1, borderBottomColor: colors.divider, marginTop: -1 },
    preview: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
    gapSm: { gap: spacing.sm },
    gapXs: { gap: spacing.xs },
  });
