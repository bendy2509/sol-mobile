import React from 'react';
import { View } from 'react-native';
import { Member } from '@/types';
import { Button, Text } from '@/components/ui';
import { getInitials } from '@/lib/formatters';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexBasis: spacing.xxxl * 3, minWidth: 0 }}>
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
            {isMulti ? t('Reçoit la main {0}/{1}', nextHand, beneficiary.handsCount) : t('Reçoit la main {0}', beneficiary.rankOrder || 1)}
          </Text>
          <Text variant="subheading" tone="onHero" numberOfLines={2}>
            {beneficiary.fullName}
          </Text>
        </View>
      </View>
      <Button
        variant="primary"
        label={t('Remettre')}
        onPress={() => onPayout(beneficiary)}
        accessibilityLabel={t('Remettre la main à {0}', beneficiary.fullName)}
      />
    </View>
  );
};
