import { readJsonPreference, writePreference } from './preferences';
import { setDisplayCurrency } from './formatters';

/** Réglages → Carnet et reçus. Display-only: amounts stored in the database are unchanged. */
export interface ReceiptPreferences {
  /** How amounts are written: « 1 250 HTG » or « 1 250 G ». */
  currencyLabel: 'HTG' | 'G';
  /** Name printed at the top of receipts (defaults to the carnet name). */
  receiptName: string;
  /** Short note printed at the bottom of receipts. */
  receiptNote: string;
}

export const DEFAULT_RECEIPT_PREFERENCES: ReceiptPreferences = { currencyLabel: 'HTG', receiptName: '', receiptNote: '' };

let current: ReceiptPreferences = DEFAULT_RECEIPT_PREFERENCES;

export function getReceiptPreferences(): ReceiptPreferences {
  return current;
}

export async function loadReceiptPreferences(): Promise<ReceiptPreferences> {
  const stored = await readJsonPreference<Partial<ReceiptPreferences>>('receipt');
  current = { ...DEFAULT_RECEIPT_PREFERENCES, ...(stored || {}) };
  if (current.currencyLabel !== 'G') current.currencyLabel = 'HTG';
  setDisplayCurrency(current.currencyLabel);
  return current;
}

export function saveReceiptPreferences(next: ReceiptPreferences): void {
  current = next;
  setDisplayCurrency(next.currencyLabel);
  writePreference('receipt', next);
}
