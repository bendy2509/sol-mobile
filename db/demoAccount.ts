/**
 * The demo carnet (manager +509 37 12 34 56, PIN 1234, four members) exists only for the web
 * preview and development builds. Earlier builds also created it on every new phone.
 *
 * isUntouchedDemoAccount decides, from plain rows, whether such a leftover was never used for
 * real work and can be removed safely. Any sign of real use keeps it: a changed PIN, another
 * carnet, a member or an operation that the seed did not create.
 */
export const DEMO_COLLECTOR_ID = 'c011ec70-0000-0000-0000-000000000001';
export const DEMO_PHONE = '+50937123456';
export const DEMO_PIN = '1234';
export const DEMO_CLIENT_IDS = [
  '11111111-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-000000000002',
  '33333333-0000-0000-0000-000000000003',
  '44444444-0000-0000-0000-000000000004',
] as const;
export const DEMO_BUSINESS_NAME = 'Sol BS 2026';
/** Names the demo carnet had in earlier builds (a leftover from them is still recognised). */
const DEMO_BUSINESS_NAMES = new Set([DEMO_BUSINESS_NAME, 'Sol Mache Klnik 2026']);

export interface DemoCheckInput {
  collector: { id: string; phone_number: string; created_at: string } | null;
  /** True when the stored PIN hash still matches DEMO_PIN. */
  pinIsDefault: boolean;
  businesses: { name: string }[];
  clientIds: string[];
  /** Notes and creation times of the collector's operations. */
  transactions: { note: string | null; created_at_local: string }[];
  /** Cash closures and closed cycles: any of them means real use. */
  otherRecordsCount: number;
}

/** Seed operations carry this note and are written within a minute of the account. */
const SEED_NOTES = new Set(['Cotisation régulière', 'Remise de la main (démo)']);
const SEED_WINDOW_MS = 60_000;

export function isUntouchedDemoAccount(input: DemoCheckInput): boolean {
  const { collector } = input;
  if (!collector || collector.id !== DEMO_COLLECTOR_ID || collector.phone_number !== DEMO_PHONE) return false;
  if (!input.pinIsDefault) return false;
  if (input.otherRecordsCount > 0) return false;
  if (input.businesses.some((b) => !DEMO_BUSINESS_NAMES.has(b.name)) || input.businesses.length > 1) return false;
  if (input.clientIds.some((id) => !(DEMO_CLIENT_IDS as readonly string[]).includes(id))) return false;

  const createdAt = Date.parse(collector.created_at);
  return input.transactions.every((tx) => {
    const at = Date.parse(tx.created_at_local);
    return SEED_NOTES.has(tx.note ?? '') && Number.isFinite(at) && Number.isFinite(createdAt) && Math.abs(at - createdAt) <= SEED_WINDOW_MS;
  });
}

/** Demo data belongs to the web preview and development builds only. */
export function shouldSeedDemo(platform: string, isDev: boolean): boolean {
  return platform === 'web' || isDev;
}
