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

/**
 * A date-only value ('2026-10-23') is a calendar day, not an instant: new Date() would read
 * it as midnight UTC and show the previous day in Haiti (UTC−4/−5). Read it as local midnight.
 */
function parseDisplayDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
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
    const date = parseDisplayDate(isoString);
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
    const date = parseDisplayDate(isoString);
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
    const date = parseDisplayDate(isoString);
    if (dateLanguage === 'ht') return formatKreyolDate(date, false, false);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return isoString;
  }
}

/**
 * Heading of a day in a list: « Aujourd'hui », « Hier », else the full date. `day` and `today`
 * are local days (YYYY-MM-DD).
 */
export function formatRelativeDay(day: string, today: string, labels: { today: string; yesterday: string }): string {
  if (day === today) return labels.today;
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(y, m - 1, d - 1, 12);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  return day === yesterdayStr ? labels.yesterday : formatDateShort(day);
}

/**
 * Several days in a short line, the month written once per month: « 07, 08 nov. » or
 * « 30 nov. · 02 déc. » (the payout days of a member holding several hands).
 */
export function formatDaysCompact(days: string[]): string {
  const groups: string[][] = [];
  for (const day of [...days].filter(Boolean).sort()) {
    const last = groups[groups.length - 1];
    if (last && last[0].slice(0, 7) === day.slice(0, 7)) last.push(day);
    else groups.push([day]);
  }
  return groups
    .map((group) => {
      const full = formatDayMonth(group[group.length - 1]);
      const month = full.replace(/^\s*\d+\s*/, '');
      return `${group.map((d) => d.slice(8, 10)).join(', ')} ${month}`.trim();
    })
    .join(' · ');
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
