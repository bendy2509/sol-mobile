import React from 'react';
import { View } from 'react-native';
import { Member } from '@/types';
import { Button, Text } from '@/components/ui';
import { getInitials } from '@/lib/formatters';
import { useTheme } from '@/theme';

interface BeneficiaryBannerProps {
  beneficiary: Member;
  potAmount: number;
  onPayout: (member: Member) => void;
}

/** Current beneficiary of the pot, under the hero amount. One action: Remettre. */
export const BeneficiaryBanner: React.FC<BeneficiaryBannerProps> = ({ beneficiary, onPayout }) => {
  const { colors, spacing, radius, layout } = useTheme();
  const isMulti = !!beneficiary.handsCount && beneficiary.handsCount > 1;
  const nextHand = (beneficiary.receivedHandsCount || 0) + 1;

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: spacing.md,
      }}
    >
      {/* Wraps the button under the name when the name or the text size needs the room */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexBasis: spacing.xxxl * 4, minWidth: 0 }}>
        <View
          style={{
            width: layout.touchTarget,
            height: layout.touchTarget,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text variant="label" style={{ color: colors.onPrimarySoft }}>
            {getInitials(beneficiary.fullName)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" tone="onHeroMuted">
            {isMulti ? `Reçoit la main ${nextHand}/${beneficiary.handsCount}` : `Reçoit la main ${beneficiary.rankOrder || 1}`}
          </Text>
          <Text variant="subheading" tone="onHero" numberOfLines={2}>
            {beneficiary.fullName}
          </Text>
        </View>
      </View>
      <Button
        variant="primary"
        label="Remettre"
        onPress={() => onPayout(beneficiary)}
        accessibilityLabel={`Remettre la main à ${beneficiary.fullName}`}
      />
    </View>
  );
};
