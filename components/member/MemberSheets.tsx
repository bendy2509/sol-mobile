import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ClosedCycleNotice } from '@/components/ClosedCycleLockNotice';
import { AmountText, BottomSheet, Button, Card, Icon, Text, TextField } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { triggerLightImpact } from '@/lib/haptics';
import { calculateMemberDuePerRound } from '@/services/financialService';
import { MemberSheet } from '@/services/memberSheet';
import { Client, Transaction } from '@/types';
import { useTheme } from '@/theme';
import { t } from '@/i18n';
import { DetailRow } from './DetailRow';
import { ledgerEntryLabel } from './MemberLedger';

function ActionsRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

const grow = { flexGrow: 1, flexBasis: 0 };

/** One operation: amount, reference, hands, note; receipt, WhatsApp and reversal. */
export function TransactionDetailSheet({
  tx,
  isFromClosedCycle,
  onClose,
  onReceipt,
  onWhatsApp,
  onCancel,
}: {
  tx: Transaction | null;
  isFromClosedCycle: boolean;
  onClose: () => void;
  onReceipt: () => void;
  onWhatsApp: () => void;
  onCancel: () => void;
}) {
  const { spacing, radius, colors } = useTheme();
  const canReverse = !!tx && tx.type !== 'REVERSAL' && !tx.isReversed;
  return (
    <BottomSheet
      visible={!!tx}
      onClose={onClose}
      title={tx ? ledgerEntryLabel(tx) : t('Détail de l\'opération')}
      subtitle={tx ? formatDate(tx.createdAtLocal) : undefined}
    >
      {tx && (
        <>
          <AmountText amount={tx.amount} size="hero" />
          <DetailRow label={t('Référence')} value={`#${tx.id.slice(0, 8)}`} selectable />
          <DetailRow label={t('Mains couvertes')} value={t('{0} main(s)', tx.handsCovered || 1)} selectable />
          {tx.note && (
            <View style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
              <Text variant="caption" tone="muted">
                {t('Note d\'enregistrement')}
              </Text>
              <Text variant="body" selectable>
                {tx.note}
              </Text>
            </View>
          )}
          <ActionsRow>
            <Button label={t('Reçu PDF')} icon="printer" variant="secondary" onPress={onReceipt} style={grow} />
            <Button label={t('WhatsApp')} icon="message" variant="secondary" onPress={onWhatsApp} style={grow} />
          </ActionsRow>
          {canReverse && isFromClosedCycle && <ClosedCycleNotice />}
          {canReverse && <Button label={t('Annuler cette opération')} icon="alert" variant="danger" fullWidth onPress={onCancel} />}
        </>
      )}
    </BottomSheet>
  );
}

export interface MemberEditValues {
  fullName: string;
  phoneNumber: string;
  handsCount: number;
  ranks: string;
}

/** Name, phone, hands and ranks of the member. Owns its form; the screen saves the values. */
export function EditMemberSheet({
  visible,
  initial,
  unitAmount,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: MemberEditValues;
  unitAmount: number;
  onClose: () => void;
  onSave: (values: MemberEditValues) => void;
}) {
  const { colors, spacing, radius, layout } = useTheme();
  const [values, setValues] = useState(initial);
  // Each opening starts from the member as stored
  useEffect(() => {
    if (visible) setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const set = (patch: Partial<MemberEditValues>) => setValues((v) => ({ ...v, ...patch }));
  const step = (delta: number) => {
    triggerLightImpact();
    set({ handsCount: Math.max(1, values.handsCount + delta) });
  };
  const stepButton = {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface,
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('Modifier l\'adhérent')}
      subtitle={t('Mise à jour des informations de l\'adhérent.')}
      footer={
        <ActionsRow>
          <Button label={t('Annuler')} variant="secondary" onPress={onClose} style={grow} />
          <Button label={t('Enregistrer')} onPress={() => onSave(values)} style={grow} />
        </ActionsRow>
      }
    >
      <TextField label={t('Nom complet')} value={values.fullName} onChangeText={(fullName) => set({ fullName })} placeholder={t('Ex : Bendy SERVILUS')} />
      <TextField
        label={t('Numéro de téléphone')}
        value={values.phoneNumber}
        onChangeText={(phoneNumber) => set({ phoneNumber })}
        placeholder={t('+509 XX XX XXXX')}
        keyboardType="phone-pad"
      />
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text variant="label">{t('Mains souscrites')}</Text>
          <Text variant="label" tone="primary">
            {t('{0} / tour', formatCurrency(calculateMemberDuePerRound(values.handsCount, unitAmount)))}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl }}>
          <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={t('Retirer une main')} style={stepButton}>
            <Icon name="minus" size={22} color={colors.text} />
          </Pressable>
          <View style={{ minWidth: layout.actionHeight, alignItems: 'center' }}>
            <Text variant="amountLarge" align="center">
              {values.handsCount}
            </Text>
            <Text variant="caption" tone="muted" align="center">
              {t('main{0}', values.handsCount > 1 ? 's' : '')}
            </Text>
          </View>
          <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={t('Ajouter une main')} style={stepButton}>
            <Icon name="plus" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Text variant="caption" tone="muted">
          {t('Ajouter une main à cet enfant augmente automatiquement la cagnotte du sol.')}
        </Text>
      </View>
      <TextField
        label={t('Rang(s) de tirage')}
        value={values.ranks}
        onChangeText={(ranks) => set({ ranks })}
        placeholder={t('Ex : 1 ou 1, 4, 7')}
        helper={t('Séparez les rangs par des virgules.')}
      />
    </BottomSheet>
  );
}

/** Paying out a hand: beneficiary, pot, and the justification (mandatory out of order). */
export function PayoutSheet({
  visible,
  client,
  sheet,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  client: Client;
  sheet: MemberSheet;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const [note, setNote] = useState('');
  useEffect(() => {
    if (visible) setNote(`Remise de la main #${sheet.payoutRanks[sheet.receivedHands] || sheet.payoutRanks[0] || 1} - ${client.fullName}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('Remise de la main')}
      subtitle={t('Validation par code PIN gestionnaire.')}
      footer={
        <ActionsRow>
          <Button label={t('Annuler')} variant="secondary" onPress={onClose} style={grow} />
          <Button label={t('Valider avec PIN')} icon="lock" onPress={() => onConfirm(note)} style={grow} />
        </ActionsRow>
      }
    >
      {sheet.isOutOfOrder && (
        <Card tone="warning">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <Icon name="alert" size={18} color={colors.warning} />
            <Text variant="label" tone="warning" style={{ flex: 1, minWidth: 0 }}>
              {t('Cette remise ne suit pas l\'ordre prévu (rang #{0} attendu). Justification obligatoire.', sheet.expectedNextRank)}
            </Text>
          </View>
        </Card>
      )}
      <Card tone="sunken" style={{ gap: spacing.sm }}>
        <Text variant="caption" tone="muted">
          {t('Bénéficiaire')}
        </Text>
        <Text variant="bodyStrong">
          {client.fullName} · {client.phoneNumber}
        </Text>
        <Text variant="caption" tone="muted">
          {t('Cagnotte calculée')}
        </Text>
        <AmountText amount={sheet.potAmount} size="large" />
        <Text variant="caption" tone="muted">
          {t('{0} mains au total × {1}', sheet.totalCycleHands, formatCurrency(sheet.unitAmount))}
        </Text>
      </Card>
      <TextField
        label={sheet.isOutOfOrder ? t('Justification (obligatoire)') : t('Motif / justification')}
        value={note}
        onChangeText={setNote}
        placeholder={t('Ex : remise normale du cycle 1')}
      />
    </BottomSheet>
  );
}

/** Reversing an operation: the reason is mandatory. */
export function ReversalSheet({ visible, onClose, onConfirm }: { visible: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('Annuler une opération')}
      subtitle={t('Le solde, les mains payées et la couverture de l\'adhérent seront recalculés.')}
      footer={
        <ActionsRow>
          <Button label={t('Retour')} variant="secondary" onPress={onClose} style={grow} />
          <Button label={t('Confirmer l\'annulation')} variant="danger" onPress={() => onConfirm(reason)} style={grow} />
        </ActionsRow>
      }
    >
      <TextField label={t('Motif obligatoire')} value={reason} onChangeText={setReason} placeholder={t('Ex : erreur de saisie du montant')} />
    </BottomSheet>
  );
}
