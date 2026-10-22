import React from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { DashboardMetrics, FilterStatus, SortOption } from '@/types';
import { Chip, Icon, SectionHeader } from '@/components/ui';
import { triggerLightImpact } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { t } from '@/i18n';

interface DashboardFiltersProps {
  metrics: DashboardMetrics;
  membersCount: number;
  filteredMembersCount?: number;
  filter: FilterStatus;
  sort: SortOption;
  searchQuery: string;
  onFilterChange: (f: FilterStatus) => void;
  onSortChange: (s: SortOption) => void;
  onSearchChange: (q: string) => void;
}

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  metrics,
  membersCount,
  filteredMembersCount,
  filter,
  sort,
  searchQuery,
  onFilterChange,
  onSortChange,
  onSearchChange,
}) => {
  const { colors, spacing, radius, layout, typography } = useTheme();

  const chips = [
    { key: 'ALL' as FilterStatus, label: t('Tous'), count: metrics.totalMembersCount || membersCount },
    { key: 'PAID_TODAY' as FilterStatus, label: t('À jour'), count: metrics.paidTodayCount },
    { key: 'UNPAID_TODAY' as FilterStatus, label: t('À encaisser'), count: metrics.unpaidTodayCount },
    { key: 'OVERDUE' as FilterStatus, label: t('En retard'), count: metrics.overdueMembersCount },
    { key: 'HAND_RECEIVED' as FilterStatus, label: t('Main reçue'), count: metrics.handsTouchedCount },
  ] as { key: FilterStatus; label: string; count: number }[];

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader
        title={t('Adhérents')}
        count={filteredMembersCount !== undefined ? filteredMembersCount : membersCount}
        action={{
          label: sort === 'PAYOUT_RANK' ? t('Tri : rang') : t('Tri : nom A-Z'),
          onPress: () => {
            triggerLightImpact();
            onSortChange(sort === 'PAYOUT_RANK' ? 'NAME' : 'PAYOUT_RANK');
          },
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: layout.touchTarget,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, ...typography.body, color: colors.text, paddingVertical: spacing.sm }}
          placeholder={t('Nom ou téléphone')}
          placeholderTextColor={colors.textPlaceholder}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
          accessibilityLabel={t('Rechercher un adhérent')}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => onSearchChange('')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Effacer la recherche')}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            label={`${chip.label} (${chip.count})`}
            selected={filter === chip.key}
            onPress={() => onFilterChange(chip.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
};
