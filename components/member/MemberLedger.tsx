import React from 'react';
import { View } from 'react-native';

import { AmountText, Card, EmptyState, Icon, ListItem, SectionHeader, UiIconName } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { LedgerEntryKind, ledgerEntryKind } from '@/services/memberSheet';
import { Transaction } from '@/types';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

/** Display label of a ledger entry. */
export function ledgerEntryLabel(tx: Transaction): string {
  const kind = ledgerEntryKind(tx);
  if (kind === 'REVERSAL') return t('Annulation');
  if (tx.type === 'SABOTAY_DEPOSIT') return t('Dépôt Sabotay');
  if (kind === 'CONTRIBUTION') return t('Cotisation Sol');
  return t('Remise de la main (bay men)');
}

const ICONS: Record<LedgerEntryKind, UiIconName> = { CONTRIBUTION: 'cash', PAYOUT: 'payout', REVERSAL: 'alert' };

/** The member's passbook: every operation, newest first. */
export function MemberLedger({ transactions, onPress }: { transactions: Transaction[]; onPress: (tx: Transaction) => void }) {
  const { colors, spacing, radius } = useTheme();
  const tones: Record<LedgerEntryKind, { fg: string; bg: string }> = {
    CONTRIBUTION: { fg: colors.success, bg: colors.successSoft },
    PAYOUT: { fg: colors.primary, bg: colors.primarySoft },
    REVERSAL: { fg: colors.danger, bg: colors.dangerSoft },
  };

  return (
    <>
      <SectionHeader title={t('Historique des opérations')} count={transactions.length} />
      {transactions.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="history" title={t('Aucune opération')} message={t('Aucun versement enregistré pour cet adhérent.')} />
        </Card>
      ) : (
        <Card padding="none" style={{ overflow: 'hidden' }}>
          {transactions.map((tx, i) => {
            const kind = ledgerEntryKind(tx);
            const tone = tones[kind];
            return (
              <ListItem
                key={tx.id}
                divider={i < transactions.length - 1}
                onPress={() => onPress(tx)}
                accessibilityLabel={`${ledgerEntryLabel(tx)}, ${formatCurrency(tx.amount)}, ${formatDate(tx.createdAtLocal)}`}
                leading={
                  <View
                    style={{
                      width: spacing.xxl + spacing.sm,
                      height: spacing.xxl + spacing.sm,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: tone.bg,
                    }}
                  >
                    <Icon name={ICONS[kind]} size={18} color={tone.fg} />
                  </View>
                }
                title={ledgerEntryLabel(tx)}
                subtitle={formatDate(tx.createdAtLocal)}
                trailing={
                  <AmountText
                    amount={tx.amount}
                    size="small"
                    sign={kind === 'CONTRIBUTION' ? 'credit' : 'debit'}
                    tone={kind === 'REVERSAL' ? 'danger' : kind === 'CONTRIBUTION' ? 'success' : 'default'}
                  />
                }
              />
            );
          })}
        </Card>
      )}
    </>
  );
}
