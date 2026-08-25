export type ClientType = 'SABOTAY' | 'SOL' | 'HYBRID';

export type BusinessType = 'SABOTAY' | 'SOL';

export type PaymentFrequency =
  | 'DAILY'
  | 'WED_SAT'
  | 'WEEKLY_WED'
  | 'WEEKLY_SAT'
  | '8J'
  | '15J'
  | 'MONTHLY';

export type TransactionType =
  | 'SABOTAY_DEPOSIT'
  | 'SOL_CONTRIBUTION'
  | 'SOL_PAYOUT'
  | 'WITHDRAWAL';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export type MemberPaymentStatus =
  | 'PAID_TODAY'
  | 'UNPAID_TODAY'
  | 'OVERDUE'
  | 'UPCOMING_PAYOUT';

export type FilterStatus =
  | 'ALL'
  | 'PAID_TODAY'
  | 'UNPAID_TODAY'
  | 'OVERDUE'
  | 'UPCOMING_PAYOUT';

export type SortOption =
  | 'NAME'
  | 'PAYOUT_RANK'
  | 'RECENT'
  | 'BALANCE'
  | 'OVERDUE';

export interface Collector {
  id: string; // UUIDv4
  fullName: string;
  phoneNumber: string;
  pinHash: string;
  status: 'ACTIVE' | 'INACTIVE';
  zone?: string;
  createdAt: string;
}

export interface BusinessConfig {
  id: string; // UUIDv4
  collectorId: string;
  name: string;
  type: BusinessType;
  contributionAmount: number;
  frequency: PaymentFrequency;
  totalSlots: number; // Total number of members / "enfants"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  createdAt: string;
}

export interface Member {
  id: string; // UUIDv4
  businessId?: string;
  collectorId: string;
  fullName: string;
  phoneNumber: string;
  type: ClientType;
  dailyAmount: number;
  currentBalance: number;
  payoutRank?: number | null; // e.g. Main #3 / 12
  hasReceivedPayout: boolean;
  qrCodeToken: string;
  createdAt: string;
  syncStatus: SyncStatus;
  paymentStatusToday: MemberPaymentStatus;
  overdueRoundsCount: number;
  lastPaymentDate?: string | null;
  totalPaidInCycle: number;
}

// Alias Client to Member for backward compatibility
export type Client = Member;

export interface SolGroup {
  id: string; // UUIDv4
  name: string;
  contributionAmount: number;
  frequency: string;
  totalRounds: number;
  currentRound: number;
  status: 'ACTIVE' | 'COMPLETED' | 'PENDING';
  createdAt: string;
  members?: SolGroupMember[];
}

export interface SolGroupMember {
  id: string; // UUIDv4
  solGroupId: string;
  clientId: string;
  payoutRank: number;
  hasPaid: boolean;
  client?: Member;
}

export interface Transaction {
  id: string; // UUIDv4
  clientId: string;
  collectorId: string;
  solGroupId?: string | null;
  businessId?: string | null;
  amount: number;
  type: TransactionType;
  paymentMethod: string;
  createdAtLocal: string;
  syncedAt?: string | null;
  syncStatus: SyncStatus;
  clientName?: string;
  clientPhone?: string;
}

export interface CashClosure {
  id: string;
  collectorId: string;
  closureDate: string;
  totalCashDeclared: number;
  totalSystemCalculated: number;
  discrepancyReason?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  createdAt: string;
}

export interface DashboardMetrics {
  handsCollected: number; // Total hands / contributions collected in this cycle
  handsRemaining: number; // Total hands remaining in the cycle
  totalHandsExpected: number; // Total expected hands (totalSlots)
  daysRemaining: number; // Days remaining before cycle end date
  totalCashToday: number; // Cash available in drawer today (HTG)
  overdueMembersCount: number; // Count of members with overdue payments
  overdueHandsCount: number; // Total overdue hands
  paidTodayCount: number;
  unpaidTodayCount: number;
  totalMembersCount: number;
  currentPayoutBeneficiary?: Member | null;
  currentRound: number;
  totalRounds: number;
  businessName: string;
  businessType: BusinessType;
  contributionAmount: number;
  frequency: PaymentFrequency;
  startDate: string;
  endDate: string;
}

// Retain DashboardStats alias for legacy queries
export type DashboardStats = {
  totalCollectedToday: number;
  sabotayDepositsToday: number;
  solContributionsToday: number;
  withdrawalsToday: number;
  activeClientsCount: number;
  pendingTransactionsCount: number;
};

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  error?: string | null;
}
