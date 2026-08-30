import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { DashboardMetrics, FilterStatus, SortOption } from '@/types';
import { Icon } from '@/components/Icon';
import { SOL_COLORS, SHADOWS } from '@/constants/Colors';
import { triggerLightImpact } from '@/lib/haptics';

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
  return (
    <>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={SOL_COLORS.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un adhérent (nom, téléphone)..."
          placeholderTextColor={SOL_COLORS.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => onSearchChange('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close" size={16} color={SOL_COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {([
          { key: 'ALL' as FilterStatus, label: 'Tous', count: metrics.totalMembersCount || membersCount },
          { key: 'PAID_TODAY' as FilterStatus, label: 'À jour', count: metrics.paidTodayCount },
          { key: 'UNPAID_TODAY' as FilterStatus, label: 'À encaisser', count: metrics.unpaidTodayCount },
          { key: 'OVERDUE' as FilterStatus, label: 'Retard', count: metrics.overdueMembersCount, danger: true },
          { key: 'HAND_RECEIVED' as FilterStatus, label: 'Main reçue', count: metrics.handsTouchedCount },
        ] as { key: FilterStatus; label: string; count: number; danger?: boolean }[]).map((chip) => {
          const isActive = filter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              onPress={() => {
                triggerLightImpact();
                onFilterChange(chip.key);
              }}
              style={[
                styles.filterChip,
                isActive && (chip.danger ? styles.filterChipAlertActive : styles.filterChipActive),
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {chip.label} ({chip.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          LISTE DES ADHÉRENTS ({filteredMembersCount !== undefined ? filteredMembersCount : membersCount})
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            triggerLightImpact();
            onSortChange(sort === 'PAYOUT_RANK' ? 'NAME' : 'PAYOUT_RANK');
          }}
          style={styles.sortToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.sortToggleText}>
            Tri : {sort === 'PAYOUT_RANK' ? 'Rang #' : 'Nom A-Z'}
          </Text>
          <Icon name="arrow-right" size={12} color={SOL_COLORS.primaryDark} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
    marginBottom: 10,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: SOL_COLORS.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SOL_COLORS.border,
  },
  filterChipActive: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  filterChipAlertActive: {
    backgroundColor: SOL_COLORS.danger,
    borderColor: SOL_COLORS.dangerDark,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: SOL_COLORS.textMuted,
    letterSpacing: 0.5,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortToggleText: {
    fontSize: 11,
    color: SOL_COLORS.primaryDark,
    fontWeight: '700',
  },
});
