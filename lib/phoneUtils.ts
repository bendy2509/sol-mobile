/**
 * Haitian Phone Number Normalization Utility
 * Supports all formats:
 * - "41705257" -> "+50941705257"
 * - "+50941705257" -> "+50941705257"
 * - "50941705257" -> "+50941705257"
 * - "+509 41 70 5257" -> "+50941705257"
 * - "41-70-5257" -> "+50941705257"
 */

export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  // Strip all non-digit characters except leading +
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+509')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('509') && cleaned.length > 8) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Suffix of 8 digits for Haitian numbers
  if (cleaned.length === 8) {
    return `+509${cleaned}`;
  }

  if (cleaned.length > 8) {
    // Take last 8 digits if prefixed with additional country code or extra zeros
    const last8 = cleaned.slice(-8);
    return `+509${last8}`;
  }

  return `+509${cleaned}`;
}

export function arePhoneNumbersEqual(p1: string | null | undefined, p2: string | null | undefined): boolean {
  if (!p1 || !p2) return false;
  const n1 = normalizePhoneNumber(p1);
  const n2 = normalizePhoneNumber(p2);
  return n1 === n2 || extractRaw8Digits(n1) === extractRaw8Digits(n2);
}

export function extractRaw8Digits(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-8);
}
