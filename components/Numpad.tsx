import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SOL_COLORS } from '@/constants/Colors';
import { triggerLightImpact, triggerSuccessFeedback } from '@/lib/haptics';

interface NumpadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  disabled?: boolean;
}

const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];

export const Numpad: React.FC<NumpadProps> = ({
  value,
  onChange,
  onSubmit,
  submitLabel = 'Valide',
  disabled = false,
}) => {
  const handleQuickAmount = (amount: number) => {
    triggerLightImpact();
    onChange(amount.toString());
  };

  const handleDigit = (digit: string) => {
    triggerLightImpact();
    if (value === '0') {
      onChange(digit);
    } else if (value.length < 7) {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    triggerLightImpact();
    if (value.length <= 1) {
      onChange('');
    } else {
      onChange(value.slice(0, -1));
    }
  };

  const handleClear = () => {
    triggerLightImpact();
    onChange('');
  };

  const handleSubmit = () => {
    triggerSuccessFeedback();
    if (onSubmit) onSubmit();
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '⌫'],
  ];

  return (
    <View style={styles.container}>
      {/* Quick Amount Chips */}
      <View style={styles.quickAmountsRow}>
        {QUICK_AMOUNTS.map((amt) => {
          const isSelected = value === amt.toString();
          return (
            <TouchableOpacity
              key={amt}
              activeOpacity={0.7}
              onPress={() => handleQuickAmount(amt)}
              style={[styles.quickChip, isSelected && styles.quickChipSelected]}
            >
              <Text
                style={[
                  styles.quickChipText,
                  isSelected && styles.quickChipTextSelected,
                ]}
              >
                +{amt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Grid of Digits */}
      <View style={styles.grid}>
        {keys.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((k) => {
              const isClear = k === 'C';
              const isBackspace = k === '⌫';
              const isAction = isClear || isBackspace;

              return (
                <TouchableOpacity
                  key={k}
                  activeOpacity={0.6}
                  disabled={disabled}
                  onPress={() => {
                    if (isClear) handleClear();
                    else if (isBackspace) handleBackspace();
                    else handleDigit(k);
                  }}
                  style={[
                    styles.keyButton,
                    isAction && styles.actionButton,
                    disabled && styles.disabledButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.keyText,
                      isAction && styles.actionText,
                    ]}
                  >
                    {k}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Submit Button */}
      {onSubmit && (
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={disabled || !value || Number(value) <= 0}
          onPress={handleSubmit}
          style={[
            styles.submitButton,
            (!value || Number(value) <= 0 || disabled) && styles.submitButtonDisabled,
          ]}
        >
          <Text style={styles.submitButtonText}>
            {submitLabel} {value && Number(value) > 0 ? `(${Number(value).toLocaleString()} HTG)` : ''}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 8,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  quickChip: {
    flex: 1,
    marginHorizontal: 3,
    backgroundColor: '#E2E8F0',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickChipSelected: {
    backgroundColor: SOL_COLORS.primary,
    borderColor: SOL_COLORS.primaryDark,
  },
  quickChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: SOL_COLORS.textPrimary,
  },
  quickChipTextSelected: {
    color: SOL_COLORS.white,
  },
  grid: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  keyButton: {
    flex: 1,
    marginHorizontal: 4,
    height: 62,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionButton: {
    backgroundColor: '#F1F5F9',
    borderColor: '#94A3B8',
  },
  disabledButton: {
    opacity: 0.5,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '800',
    color: SOL_COLORS.textPrimary,
  },
  actionText: {
    fontSize: 20,
    fontWeight: '700',
    color: SOL_COLORS.textSecondary,
  },
  submitButton: {
    backgroundColor: SOL_COLORS.primary,
    height: 56,
    borderRadius: 14,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
    elevation: 0,
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: SOL_COLORS.white,
    fontSize: 18,
    fontWeight: '800',
  },
});
