import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Member } from '@/types';
import { Avatar, Icon, StatusBadge, Text } from '@/components/ui';
import { triggerLightImpact, triggerMediumImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';

interface MemberCardProps {
  member: Member;
  isPayoutTurn?: boolean;
  /** Position in the grouped ledger: rounds the outer corners, hides the last rule. */
  isFirst?: boolean;
  isLast?: boolean;
  onQuickCollect?: (member: Member) => void;
}

/**
 * Member ledger row: rank · name, status underneath, one collect action (the paid total
 * lives in the member file: at 360px it would push the status out of the row).
 * Rows are grouped into one ruled sheet. The member whose turn it is gets a filled
 * rank; the payout itself lives once, in the hero band (and in the file / SOL tab).
 */
const MemberCardComponent: React.FC<MemberCardProps> = ({
  member,
  isPayoutTurn = false,
  isFirst = false,
  isLast = false,
  onQuickCollect,
}) => {
  const router = useRouter();
  const { colors, spacing, radius, layout } = useTheme();

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

  const isCovered = member.paymentStatusToday === 'PAID_TODAY' || member.paymentStatusToday === 'PAID_IN_ADVANCE';
  const isMultiHands = (member.handsCount || 1) > 1;
  const isCurrentTurn = isPayoutTurn && !member.hasReceivedHand;

  const statusDetail =
    member.paymentStatusToday === 'PAID_IN_ADVANCE'
      ? `+${member.handsCoveredAhead || 1}`
      : member.paymentStatusToday === 'OVERDUE' && member.overdueRoundsCount > 0
      ? `${member.overdueRoundsCount} tour${member.overdueRoundsCount > 1 ? 's' : ''}`
      : undefined;

  const handsNote = isMultiHands
    ? `${member.receivedHandsCount || 0}/${member.handsCount} mains reçues`
    : member.hasReceivedHand
    ? 'Main reçue'
    : null;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopLeftRadius: isFirst ? radius.lg : 0,
        borderTopRightRadius: isFirst ? radius.lg : 0,
        borderBottomLeftRadius: isLast ? radius.lg : 0,
        borderBottomRightRadius: isLast ? radius.lg : 0,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={handleCardPress}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir la fiche de ${member.fullName}`}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            minHeight: layout.actionHeight + spacing.lg,
            paddingVertical: spacing.md,
            paddingLeft: spacing.md,
            paddingRight: spacing.sm,
            backgroundColor: pressed ? colors.surfacePressed : 'transparent',
          })}
        >
          <Avatar rank={member.rankOrder || member.payoutRank || undefined} name={member.fullName} highlighted={isCurrentTurn} />
          <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {member.fullName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.xs }}>
              <StatusBadge status={member.paymentStatusToday} detail={statusDetail} appearance="inline" />
              {handsNote ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {handsNote}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={handleCollectPress}
          accessibilityRole="button"
          accessibilityLabel={`${isCovered ? 'Ajouter une avance' : 'Encaisser'} pour ${member.fullName}`}
          hitSlop={4}
          style={({ pressed }) => ({
            width: layout.touchTarget,
            height: layout.touchTarget,
            marginRight: spacing.sm,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? colors.surfacePressed : isCovered ? colors.surfaceAlt : colors.primarySoft,
          })}
        >
          <Icon name={isCovered ? 'plus' : 'cash'} size={20} color={isCovered ? colors.textMuted : colors.onPrimarySoft} />
        </Pressable>
      </View>


      {!isLast ? (
        <View style={{ height: 1, marginLeft: spacing.md + spacing.xxxl - spacing.sm + spacing.md, backgroundColor: colors.divider }} />
      ) : null}
    </View>
  );
};

export const MemberCard = React.memo(MemberCardComponent);
