import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Member } from '@/types';
import { Icon } from '@/components/Icon';
import { formatCurrency, getInitials } from '@/lib/formatters';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { useResponsive } from '@/hooks/useResponsive';

interface BeneficiaryBannerProps {
  beneficiary: Member;
  potAmount: number;
  onPayout: (member: Member) => void;
}

export const BeneficiaryBanner: React.FC<BeneficiaryBannerProps> = ({
  beneficiary,
  potAmount,
  onPayout,
}) => {
  const { isSmallScreen, isVerySmallScreen } = useResponsive();

  return (
    <View style={[styles.banner, isSmallScreen && { padding: 10 }]}>
      <View style={styles.bannerHeader}>
        <View style={styles.bannerBadgePill}>
          <Icon name="crown" size={13} color="#D97706" style={{ marginRight: 4 }} />
          <Text style={styles.bannerTitle} numberOfLines={1} adjustsFontSizeToFit>
            PROCHAIN BÉNÉFICIAIRE DE LA MAIN
          </Text>
        </View>
        <Text style={styles.bannerAmountPill} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(potAmount)}
        </Text>
      </View>
      <View style={[styles.bannerBody, isVerySmallScreen && styles.bannerBodyStacked]}>
        <View style={styles.bannerLeftSection}>
          <View style={[styles.avatarCircle, isSmallScreen && styles.avatarCircleSmall]}>
            <Text style={[styles.avatarText, isSmallScreen && { fontSize: 14 }]}>
              {getInitials(beneficiary.fullName)}
            </Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.beneficiaryName} numberOfLines={1} adjustsFontSizeToFit>
              {beneficiary.fullName}
            </Text>
            <Text style={styles.beneficiarySub} numberOfLines={2} adjustsFontSizeToFit>
              {beneficiary.handsCount && beneficiary.handsCount > 1
                ? `${beneficiary.handsCount} mains souscrites • Rangs #${beneficiary.payoutRanks || beneficiary.payoutRank} • Main ${(beneficiary.receivedHandsCount || 0) + 1}/${beneficiary.handsCount}`
                : `Main #${beneficiary.rankOrder || 1}`} • Cagnotte : {formatCurrency(potAmount)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onPayout(beneficiary)}
          style={[
            styles.payoutBtn,
            isSmallScreen && styles.payoutBtnSmall,
            isVerySmallScreen && styles.payoutBtnFullWidth,
          ]}
        >
          <Text style={styles.payoutBtnText} numberOfLines={1} adjustsFontSizeToFit>
            {beneficiary.handsCount && beneficiary.handsCount > 1
              ? `Décaisser (${(beneficiary.receivedHandsCount || 0) + 1}/${beneficiary.handsCount})`
              : 'Décaisser'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  bannerBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bannerTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.3,
    flex: 1,
  },
  bannerAmountPill: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bannerBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bannerBodyStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  bannerLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarCircleSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 8,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bannerInfo: {
    flex: 1,
  },
  beneficiaryName: {
    fontSize: 14,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  beneficiarySub: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
    fontWeight: '600',
  },
  payoutBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payoutBtnSmall: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
  },
  payoutBtnFullWidth: {
    width: '100%',
    marginTop: 8,
  },
  payoutBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
