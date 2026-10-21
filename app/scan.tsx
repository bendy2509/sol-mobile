import React, { useState, useMemo } from 'react';
import { View, Pressable, StyleSheet, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';

import { getClientByQrToken } from '@/db/clientRepository';
import { Button, Card, Icon, Screen, Text } from '@/components/ui';
import { triggerSuccessFeedback } from '@/lib/haptics';
import { safeBack } from '@/lib/navigation';
import { Theme, useTheme } from '@/theme';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isManualOpen, setIsManualOpen] = useState(false);
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);

    triggerSuccessFeedback();

    const token = data.trim();
    const client = await getClientByQrToken(token);

    if (client) {
      router.replace({
        pathname: '/(tabs)/collect',
        params: { clientId: client.id },
      } as any);
    } else {
      Alert.alert(
        'Adhérent non trouvé',
        `Aucun adhérent ne correspond au code "${token}" dans la base locale. Voulez-vous inscrire un nouvel adhérent ?`,
        [
          {
            text: 'Re-scanner',
            onPress: () => setScanned(false),
            style: 'cancel',
          },
          {
            text: '+ Inscrire Adhérent',
            onPress: () => {
              router.replace('/client/new' as any);
            },
          },
        ]
      );
    }
  };

  const handleManualLookup = async () => {
    if (!manualCode.trim()) return;
    const client = await getClientByQrToken(manualCode.trim());
    if (client) {
      router.replace({
        pathname: '/(tabs)/collect',
        params: { clientId: client.id },
      } as any);
    } else {
      Alert.alert('Non trouvé', `Le code "${manualCode}" ne correspond à aucun adhérent.`);
    }
  };

  if (!permission) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']} scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="body" tone="muted" align="center">
            Vérification des autorisations caméra…
          </Text>
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen
        edges={['top', 'left', 'right']}
        scroll={false}
        footer={
          <View style={styles.footer}>
            <Button size="lg" fullWidth icon="scan" label="Autoriser la caméra" onPress={requestPermission} />
            <Button variant="ghost" fullWidth label="Annuler" onPress={() => safeBack(router)} />
          </View>
        }
      >
        <View style={styles.center}>
          <View style={styles.disc}>
            <Icon name="scan" size={32} color={theme.colors.primary} />
          </View>
          <Text variant="title" align="center" accessibilityRole="header">
            Autorisation caméra requise
          </Text>
          <Text variant="body" tone="muted" align="center">
            SOL a besoin de la caméra pour scanner rapidement les codes QR des adhérents sur le marché.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Target Framing Overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => safeBack(router)}
            accessibilityRole="button"
            accessibilityLabel="Fermer le scanner"
            style={({ pressed }) => [styles.roundBtn, pressed && styles.roundBtnPressed]}
          >
            <Icon name="close" size={22} color={theme.brand.white} />
          </Pressable>
          <View style={styles.instruction}>
            <Text variant="label" style={styles.onCamera} align="center">
              Centrez le code QR de l'adhérent dans le cadre
            </Text>
          </View>
        </View>

        <View style={styles.center}>
          <View style={styles.scanBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {/* Controls Bottom */}
        <View style={styles.bottom}>
          <View style={styles.controlsRow}>
            <Pressable
              onPress={() => setTorch(!torch)}
              accessibilityRole="switch"
              accessibilityState={{ checked: torch }}
              accessibilityLabel="Lampe torche"
              style={({ pressed }) => [styles.control, torch && styles.controlActive, pressed && styles.roundBtnPressed]}
            >
              <Text variant="label" style={torch ? styles.onLight : styles.onCamera}>
                {torch ? 'Lampe allumée' : 'Lampe'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIsManualOpen(!isManualOpen)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isManualOpen }}
              style={({ pressed }) => [styles.control, isManualOpen && styles.controlActive, pressed && styles.roundBtnPressed]}
            >
              <Icon name="edit" size={16} color={isManualOpen ? theme.colors.primary : theme.brand.white} />
              <Text variant="label" style={isManualOpen ? styles.onLight : styles.onCamera}>
                Saisir le code
              </Text>
            </Pressable>
          </View>

          {isManualOpen && (
            <Card padding="sm" style={styles.manualCard}>
              <TextInput
                style={styles.manualInput}
                placeholder="Code QR (ex : SOL-CLT-MARIECARMEL)"
                placeholderTextColor={theme.colors.textPlaceholder}
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                accessibilityLabel="Code QR de l'adhérent"
              />
              <Button icon="search" label="Chercher" onPress={handleManualLookup} />
            </Card>
          )}

          {scanned && <Button variant="secondary" size="lg" fullWidth icon="scan" label="Re-scanner" onPress={() => setScanned(false)} />}
        </View>
      </View>
    </View>
  );
}

const CORNER = 36;

const createStyles = ({ colors, spacing, radius, layout, typography, brand }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: brand.black },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    footer: { gap: spacing.xs },
    disc: {
      width: layout.touchTarget + spacing.xl,
      height: layout.touchTarget + spacing.xl,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
      marginBottom: spacing.sm,
    },

    // Camera overlay: always light-on-dark, whatever the app theme.
    overlay: { flex: 1, justifyContent: 'space-between', paddingHorizontal: layout.gutter },
    onCamera: { color: brand.white },
    onLight: { color: colors.primary },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    roundBtn: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
    },
    roundBtnPressed: { opacity: 0.8 },
    instruction: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.overlay,
    },
    scanBox: { width: 250, height: 250 },
    corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: brand.white },
    topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.md },
    topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.md },
    bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.md },
    bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.md },

    bottom: { alignItems: 'center', gap: spacing.md },
    controlsRow: { flexDirection: 'row', gap: spacing.md },
    control: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: layout.touchTarget,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.overlay,
    },
    controlActive: { backgroundColor: brand.white },
    manualCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    manualInput: { ...typography.body, flex: 1, minWidth: 0, minHeight: layout.touchTarget, paddingHorizontal: spacing.sm, color: colors.text },
  });
