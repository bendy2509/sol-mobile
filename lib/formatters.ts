/**
 * Utility functions for formatting currencies, dates, phone numbers and IDs in French
 */

export function formatCurrency(amount: number, currency: string = 'HTG'): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return `0 ${currency}`;
  }
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

export function formatDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatDateShort(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function formatDayMonth(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return isoString;
  }
}

export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.trim();
}

export function formatShortId(id: string): string {
  if (!id) return '';
  return id.replace(/-/g, '').substring(0, 8).toUpperCase();
}

export function getInitials(fullName: string): string {
  if (!fullName) return 'AD';
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');
}
