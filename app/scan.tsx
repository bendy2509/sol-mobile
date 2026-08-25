import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';

import { getClientByQrToken } from '@/db/clientRepository';
import { Icon } from '@/components/Icon';
import { triggerSuccessFeedback } from '@/lib/haptics';
import { SOL_COLORS } from '@/constants/Colors';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isManualOpen, setIsManualOpen] = useState(false);

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
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.permissionText}>Vérification des autorisations caméra...</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <View style={styles.permissionIconCircle}>
          <Icon name="scan" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.permissionTitle}>Autorisation Caméra Requise</Text>
        <Text style={styles.permissionSub}>
          SOL a besoin de la caméra pour scanner rapidement les codes QR des adhérents sur le marché.
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={requestPermission}
          style={styles.grantBtn}
        >
          <Text style={styles.grantBtnText}>Autoriser la Caméra</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelBtnText}>Annuler</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Target Framing Overlay */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop}>
          <Text style={styles.instructionText}>
            Centrez le code QR de l'adhérent dans le cadre
          </Text>
        </View>

        <View style={styles.overlayCenter}>
          <View style={styles.scanBox}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {/* Controls Bottom */}
        <View style={styles.overlayBottom}>
          <View style={styles.controlsRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setTorch(!torch)}
              style={[styles.controlBtn, torch && styles.controlBtnActive]}
            >
              <Text style={styles.controlIcon}>{torch ? 'Lampe allumée' : 'Flash'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsManualOpen(!isManualOpen)}
              style={styles.controlBtn}
            >
              <Text style={styles.controlIcon}>Saisir Code</Text>
            </TouchableOpacity>
          </View>

          {isManualOpen && (
            <View style={styles.manualInputBox}>
              <TextInput
                style={styles.manualInput}
                placeholder="Code QR (ex: SOL-CLT-MARIECARMEL)"
                placeholderTextColor="#94A3B8"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                onPress={handleManualLookup}
                style={styles.manualSubmitBtn}
              >
                <Text style={styles.manualSubmitText}>Chercher</Text>
              </TouchableOpacity>
            </View>
          )}

          {scanned && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setScanned(false)}
              style={styles.rescanBtn}
            >
              <Text style={styles.rescanBtnText}>Re-scanner</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: SOL_COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionSub: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  grantBtn: {
    backgroundColor: SOL_COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginBottom: 12,
  },
  grantBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  cancelBtn: {
    padding: 10,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlayTop: {
    paddingTop: 40,
    alignItems: 'center',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  overlayCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBox: {
    width: 250,
    height: 250,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#34D399',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  overlayBottom: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  controlBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  controlBtnActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  controlIcon: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  manualInputBox: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  manualInput: {
    flex: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  manualSubmitBtn: {
    backgroundColor: SOL_COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  manualSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  rescanBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  rescanBtnText: {
    color: SOL_COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
});
