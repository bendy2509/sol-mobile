/**
 * Utility functions for formatting currencies, dates, phone numbers and IDs in French
 */

let displayCurrency = 'HTG';

/** Currency label chosen in Réglages (display only). */
export function setDisplayCurrency(label: string): void {
  displayCurrency = label || 'HTG';
}

export function formatCurrency(amount: number, currency: string = displayCurrency): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return `0 ${currency}`;
  }
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

let dateLanguage: 'fr' | 'ht' = 'fr';

/** Language of dates, set by the i18n provider (Kreyòl has no Intl locale on most devices). */
export function setDateLanguage(language: 'fr' | 'ht'): void {
  dateLanguage = language;
}

const HT_MONTHS = ['jan', 'fev', 'mas', 'avr', 'me', 'jen', 'jiy', 'out', 'sep', 'okt', 'nov', 'des'];

function formatKreyolDate(date: Date, withYear: boolean, withTime: boolean): string {
  const day = String(date.getDate()).padStart(2, '0');
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day} ${HT_MONTHS[date.getMonth()]}${withYear ? ` ${date.getFullYear()}` : ''}${withTime ? `, ${time}` : ''}`;
}

export function formatDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (dateLanguage === 'ht') return formatKreyolDate(date, true, true);
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
    if (dateLanguage === 'ht') return formatKreyolDate(date, true, false);
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
    if (dateLanguage === 'ht') return formatKreyolDate(date, false, false);
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
