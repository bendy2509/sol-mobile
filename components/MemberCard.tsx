import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Member } from '@/types';
import { AmountText, Avatar, Button, Card, ListItem, ProgressBar, StatusBadge, Text } from '@/components/ui';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';

interface MemberCardProps {
  member: Member;
  isPayoutTurn?: boolean;
  onQuickCollect?: (member: Member) => void;
  onPayoutHand?: (member: Member) => void;
}

/**
 * Member ledger card: rank · name · status · amount, then the two field actions.
 * The payout button is primary only for the member whose turn it is.
 */
const MemberCardComponent: React.FC<MemberCardProps> = ({ member, isPayoutTurn = false, onQuickCollect, onPayoutHand }) => {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const handleCardPress = () => {
    triggerLightImpact();
    router.push(`/client/${member.id}` as any);
  };

  const handleCollectPress = () => {
    triggerMediumImpact();
    if (onQuickCollect) {
      onQuickCollect(member);
    } else {
      router.push({
        pathname: '/(tabs)/collect',
        params: { clientId: member.id },
      } as any);
    }
  };

  const handlePayoutPress = () => {
    triggerMediumImpact();
    if (onPayoutHand) {
      onPayoutHand(member);
    }
  };

  const isCovered = member.paymentStatusToday === 'PAID_TODAY' || member.paymentStatusToday === 'PAID_IN_ADVANCE';
  const isMultiHands = (member.handsCount || 1) > 1;
  const isCurrentTurn = isPayoutTurn && !member.hasReceivedHand;

  const statusDetail =
    member.paymentStatusToday === 'PAID_IN_ADVANCE'
      ? `+${member.handsCoveredAhead || 1}`
      : member.paymentStatusToday === 'OVERDUE' && member.overdueRoundsCount > 0
      ? `${member.overdueRoundsCount} tour${member.overdueRoundsCount > 1 ? 's' : ''}`
      : undefined;

  const receivedPct = isMultiHands ? (member.receivedHandsCount || 0) / (member.handsCount || 1) : 0;

  return (
    <Card padding="none" style={[{ overflow: 'hidden' }, isCurrentTurn && { borderColor: colors.primary, borderWidth: 2 }]}>
      <ListItem
        onPress={handleCardPress}
        divider={false}
        accessibilityLabel={`Ouvrir la fiche de ${member.fullName}`}
        leading={<Avatar rank={member.rankOrder || member.payoutRank || undefined} name={member.fullName} highlighted={isCurrentTurn} />}
        title={member.fullName}
        subtitle={isMultiHands ? `${member.handsCount} mains · rangs ${member.payoutRanks || member.payoutRank}` : member.phoneNumber}
        meta={
          <View style={{ gap: spacing.xs }}>
            <StatusBadge status={member.paymentStatusToday} detail={statusDetail} appearance="inline" />
            {isMultiHands && (
              <View style={{ gap: spacing.xs }}>
                <Text variant="caption" tone="muted">
                  Mains reçues : {member.receivedHandsCount || 0} / {member.handsCount}
                </Text>
                <ProgressBar value={receivedPct} size="sm" tone="success" />
              </View>
            )}
          </View>
        }
        trailing={<AmountText amount={member.totalPaidAmount || member.currentBalance || 0} size="small" />}
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
        <Button
          variant="secondary"
          icon={isCovered ? 'plus' : 'cash'}
          label={isCovered ? 'Avance' : isMultiHands ? `Encaisser (${member.handsCount}m)` : 'Encaisser'}
          onPress={handleCollectPress}
          accessibilityLabel={`${isCovered ? 'Ajouter une avance' : 'Encaisser'} pour ${member.fullName}`}
          style={{ flex: 1 }}
        />
        {member.hasReceivedHand ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <StatusBadge
              status="HAND_RECEIVED"
              label={isMultiHands ? `${member.handsCount}/${member.handsCount} perçues` : 'Main remise'}
            />
          </View>
        ) : (
          <Button
            variant={isCurrentTurn ? 'primary' : 'secondary'}
            icon="payout"
            label={isMultiHands ? `Remettre (${(member.receivedHandsCount || 0) + 1}/${member.handsCount})` : 'Remettre'}
            onPress={handlePayoutPress}
            accessibilityLabel={`Remettre la main à ${member.fullName}`}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </Card>
  );
};

export const MemberCard = React.memo(MemberCardComponent);
