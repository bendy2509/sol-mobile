import React from 'react';
import { View } from 'react-native';
import { Member } from '@/types';
import { Avatar, Button, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

interface BeneficiaryBannerProps {
  beneficiary: Member;
  potAmount: number;
  onPayout: (member: Member) => void;
}

/** Current beneficiary of the pot, under the hero amount, and the one big action: Remettre. */
export const BeneficiaryBanner: React.FC<BeneficiaryBannerProps> = ({ beneficiary, onPayout }) => {
  const { spacing } = useTheme();
  const isMulti = !!beneficiary.handsCount && beneficiary.handsCount > 1;
  const nextHand = (beneficiary.receivedHandsCount || 0) + 1;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar name={beneficiary.fullName} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" tone="onHeroMuted">
            {isMulti ? t('Reçoit la main {0}/{1}', nextHand, beneficiary.handsCount) : t('Reçoit la main {0}', beneficiary.rankOrder || 1)}
          </Text>
          <Text variant="subheading" tone="onHero">
            {beneficiary.fullName}
          </Text>
        </View>
      </View>
      {/* The main action of the day: full width, at thumb reach */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        icon="payout"
        label={t('Remettre')}
        onPress={() => onPayout(beneficiary)}
        accessibilityLabel={t('Remettre la main à {0}', beneficiary.fullName)}
      />
    </View>
  );
};
