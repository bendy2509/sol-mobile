import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Member } from '@/types';
import { Icon } from '@/components/Icon';
import { formatCurrency, getInitials } from '@/lib/formatters';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';

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
  return (
    <View style={styles.banner}>
      <View style={styles.bannerHeader}>
        <View style={styles.bannerBadgePill}>
          <Icon name="crown" size={13} color="#D97706" style={{ marginRight: 4 }} />
          <Text style={styles.bannerTitle}>PROCHAIN BÉNÉFICIAIRE DE LA MAIN</Text>
        </View>
        <Text style={styles.bannerAmountPill}>{formatCurrency(potAmount)}</Text>
      </View>
      <View style={styles.bannerBody}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{getInitials(beneficiary.fullName)}</Text>
        </View>
        <View style={styles.bannerInfo}>
          <Text style={styles.beneficiaryName} numberOfLines={1}>
            {beneficiary.fullName}
          </Text>
          <Text style={styles.beneficiarySub}>
            {beneficiary.handsCount && beneficiary.handsCount > 1
              ? `${beneficiary.handsCount} mains souscrites • Rangs #${beneficiary.payoutRanks || beneficiary.payoutRank} • Main ${(beneficiary.receivedHandsCount || 0) + 1}/${beneficiary.handsCount}`
              : `Main #${beneficiary.rankOrder || 1}`} • Cagnotte : {formatCurrency(potAmount)}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onPayout(beneficiary)}
          style={styles.payoutBtn}
        >
          <Text style={styles.payoutBtnText}>
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
  },
  bannerBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
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
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
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
  },
  payoutBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
