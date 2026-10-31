/**
 * One function per rule about a member's hands, used by every screen and repository.
 * A member reaches these functions either as a database row (snake_case) or as an app object
 * (camelCase): both shapes are accepted, so nobody re-derives a count by hand.
 */

export interface MemberHandsShape {
  handsCount?: number | null;
  hands_count?: number | null;
  payoutRank?: number | null;
  payout_rank?: number | null;
  payoutRanks?: string | number[] | null;
  payout_ranks?: string | number[] | null;
  receivedHandsCount?: number | null;
  received_hands_count?: number | null;
  hasReceivedHand?: boolean | number | null;
  has_received_hand?: boolean | number | null;
  hasReceivedPayout?: boolean | number | null;
  has_received_payout?: boolean | number | null;
  paidHandsCount?: number | null;
  paid_hands_count?: number | null;
}

/** Payout ranks of a member ("2,3" → [2, 3]); the single rank when no list is stored. */
export function parsePayoutRanks(payoutRanks?: string | number[] | null, payoutRank?: number | null): number[] {
  const list = Array.isArray(payoutRanks)
    ? payoutRanks
    : payoutRanks
    ? String(payoutRanks).split(/[,;\s]+/)
    : payoutRank
    ? [payoutRank]
    : [];
  return list.map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

/** Payout ranks of a member, whatever its shape. */
export function memberPayoutRanks(m: MemberHandsShape): number[] {
  return parsePayoutRanks(m.payoutRanks ?? m.payout_ranks, m.payoutRank ?? m.payout_rank);
}

/** Hands a member holds: at least 1, and at least one per payout rank. */
export function memberHandsCount(m: MemberHandsShape): number {
  return Math.max(1, Number(m.handsCount ?? m.hands_count ?? 1) || 1, memberPayoutRanks(m).length);
}

/**
 * Hands already paid out to a member. Old rows only had a yes/no flag: a 1-hand member
 * flagged as paid out counts 1.
 */
export function memberReceivedHands(m: MemberHandsShape): number {
  const stored = Number(m.receivedHandsCount ?? m.received_hands_count ?? 0) || 0;
  if (stored > 0) return stored;
  const flagged = Boolean(m.hasReceivedHand ?? m.has_received_hand) || Boolean(m.hasReceivedPayout ?? m.has_received_payout);
  return flagged && memberHandsCount(m) === 1 ? 1 : 0;
}

/** Every hand of the member has been paid out. */
export function hasReceivedAllHands(m: MemberHandsShape): boolean {
  return memberReceivedHands(m) >= memberHandsCount(m);
}

/** Hands the member has paid in the current cycle. */
export function memberPaidHands(m: MemberHandsShape): number {
  return Math.max(0, Number(m.paidHandsCount ?? m.paid_hands_count ?? 0) || 0);
}

/** Total hands of a cycle = number of rounds: the sum of every member's hands. */
export function cycleTotalHands(members: MemberHandsShape[]): number {
  return (members || []).reduce((sum, m) => sum + memberHandsCount(m), 0);
}

/** Pot of one round (what one hand receives): amount per hand × hands in the cycle. */
export function handPotAmount(unitAmount: number, totalHands: number): number {
  return Math.max(0, Number(unitAmount) || 0) * Math.max(0, Number(totalHands) || 0);
}

/** Hands paid out over the whole cycle (progress of the draw). */
export function cycleHandsPaidOut(members: MemberHandsShape[]): number {
  return (members || []).reduce((sum, m) => sum + memberReceivedHands(m), 0);
}

/** The round being drawn: the first not paid out yet (capped at the last round). */
export function currentRound(members: MemberHandsShape[]): number {
  const total = cycleTotalHands(members);
  return Math.max(1, Math.min(total, cycleHandsPaidOut(members) + 1));
}

/**
 * Next beneficiary: the member holding the lowest payout rank among the hands not paid out
 * yet (a member with ranks 2 and 3 who received one hand is next for rank 3).
 */
export function nextBeneficiary<T extends MemberHandsShape>(members: T[]): { member: T; rank: number } | null {
  let best: { member: T; rank: number } | null = null;
  for (const m of members || []) {
    const ranks = [...memberPayoutRanks(m)].sort((a, b) => a - b);
    const pending = ranks.slice(memberReceivedHands(m));
    if (pending.length && (!best || pending[0] < best.rank)) best = { member: m, rank: pending[0] };
  }
  return best;
}
