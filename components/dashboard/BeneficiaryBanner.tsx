import React from 'react';
import { View } from 'react-native';
import { Member } from '@/types';
import { Avatar, Button, Text } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/theme';

interface BeneficiaryBannerProps {
  beneficiary: Member;
  potAmount: number;
  onPayout: (member: Member) => void;
}

/** Current beneficiary of the pot, shown as a white inset inside the hero band. */
export const BeneficiaryBanner: React.FC<BeneficiaryBannerProps> = ({ beneficiary, potAmount, onPayout }) => {
  const { colors, spacing, radius } = useTheme();
  const { isSmallScreen } = useResponsive();
  const isMulti = !!beneficiary.handsCount && beneficiary.handsCount > 1;
  const nextHand = (beneficiary.receivedHandsCount || 0) + 1;

  return (
    <View
      style={{
        flexDirection: isSmallScreen ? 'column' : 'row',
        alignItems: isSmallScreen ? 'stretch' : 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 }}>
        <Avatar name={beneficiary.fullName} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {beneficiary.fullName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {isMulti
              ? `Main ${nextHand}/${beneficiary.handsCount} · rangs ${beneficiary.payoutRanks || beneficiary.payoutRank}`
              : `Reçoit la main ${beneficiary.rankOrder || 1}`}{' '}
            · {formatCurrency(potAmount)}
          </Text>
        </View>
      </View>
      <Button
        label={isMulti ? `Remettre (${nextHand}/${beneficiary.handsCount})` : 'Remettre'}
        icon="payout"
        onPress={() => onPayout(beneficiary)}
        accessibilityLabel={`Remettre la main à ${beneficiary.fullName}`}
      />
    </View>
  );
};
