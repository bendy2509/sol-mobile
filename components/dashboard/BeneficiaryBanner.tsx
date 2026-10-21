import React from 'react';
import { View } from 'react-native';
import { Member } from '@/types';
import { Button, Text } from '@/components/ui';
import { useResponsive } from '@/hooks/useResponsive';
import { getInitials } from '@/lib/formatters';
import { useTheme } from '@/theme';

interface BeneficiaryBannerProps {
  beneficiary: Member;
  potAmount: number;
  onPayout: (member: Member) => void;
}

/** Current beneficiary of the pot, set directly on the hero band (no inset card). */
export const BeneficiaryBanner: React.FC<BeneficiaryBannerProps> = ({ beneficiary, onPayout }) => {
  const { colors, spacing, radius, layout } = useTheme();
  const { isSmallScreen } = useResponsive();
  const isMulti = !!beneficiary.handsCount && beneficiary.handsCount > 1;
  const nextHand = (beneficiary.receivedHandsCount || 0) + 1;

  return (
    <View
      style={{
        flexDirection: isSmallScreen ? 'column' : 'row',
        alignItems: isSmallScreen ? 'stretch' : 'center',
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: isSmallScreen ? undefined : 1, minWidth: 0 }}>
        <View
          style={{
            width: layout.touchTarget,
            height: layout.touchTarget,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.heroTrack,
          }}
        >
          <Text variant="label" tone="onHero">
            {getInitials(beneficiary.fullName)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" tone="onHeroMuted">
            {isMulti ? `Reçoit la main ${nextHand}/${beneficiary.handsCount}` : `Reçoit la main ${beneficiary.rankOrder || 1}`}
          </Text>
          <Text variant="subheading" tone="onHero" numberOfLines={1}>
            {beneficiary.fullName}
          </Text>
        </View>
      </View>
      <Button
        variant="inverse"
        label={isMulti ? `Remettre (${nextHand}/${beneficiary.handsCount})` : 'Remettre'}
        icon="payout"
        onPress={() => onPayout(beneficiary)}
        accessibilityLabel={`Remettre la main à ${beneficiary.fullName}`}
      />
    </View>
  );
};
