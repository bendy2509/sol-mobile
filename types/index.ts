export type UserRole = 'ADMIN' | 'MANAGER' | 'COLLECTOR';

export type UserStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

export type BusinessType = 'SABOTAY' | 'SOL';

export type ClientType = 'SABOTAY' | 'SOL' | 'HYBRID';

export type Frequency = 'DAILY' | '8_DAYS' | '15_DAYS' | 'MONTHLY';

// Backward compatibility alias
export type PaymentFrequency =
  | 'DAILY'
  | 'WED_SAT'
  | 'WEEKLY_WED'
  | 'WEEKLY_SAT'
  | '8_DAYS'
  | '15_DAYS'
  | '8J'
  | '15J'
  | 'MONTHLY';

export type TransactionType =
  | 'CONTRIBUTION'
  | 'HAND_PAYOUT'
  | 'SABOTAY_DEPOSIT'
  | 'SOL_CONTRIBUTION'
  | 'SOL_PAYOUT'
  | 'WITHDRAWAL'
  | 'REVERSAL'
  | 'CORRECTION';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export type CycleStatus = 'ACTIVE' | 'COMPLETED' | 'CLOSED' | 'ARCHIVED';

export type MemberPaymentStatus =
  | 'PAID_TODAY'
  | 'UNPAID_TODAY'
  | 'OVERDUE'
  | 'UPCOMING_PAYOUT'
  | 'PAID_IN_ADVANCE';

export type FilterStatus =
  | 'ALL'
  | 'PAID_TODAY'
  | 'UNPAID_TODAY'
  | 'OVERDUE'
  | 'HAND_RECEIVED'
  | 'HAND_PENDING'
  | 'UPCOMING_PAYOUT';

export type SortOption =
  | 'NAME'
  | 'PAYOUT_RANK'
  | 'RECENT'
  | 'BALANCE'
  | 'OVERDUE';

export interface UserSession {
  id: string; // UUID
  fullName: string;
  phoneNumber: string;
  pinHash: string; // 4-digit PIN
  status: UserStatus;
  role: UserRole;
  zone?: string;
  businessId?: string;
  businessName: string;
  businessType: BusinessType;
  unitAmount: number;
  frequency: Frequency;
  totalSlots: number;
  startDate: string;
  endDate: string;
}

export interface Collector {
  id: string; // UUIDv4
  fullName: string;
  phoneNumber: string;
  pinHash: string; // 4 digits
  status: UserStatus;
  role?: UserRole;
  zone?: string;
  createdAt: string;
}

export interface BusinessConfig {
  id: string; // UUIDv4
  collectorId: string;
  name: string;
  type: BusinessType;
  contributionAmount: number; // Montant unitaire d'une main
  frequency: PaymentFrequency;
  totalSlots: number; // Nombre total d'enfants / slots prévus
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CLOSED';
  cycleStatus?: CycleStatus;
  createdAt: string;
}

export interface MemberChild {
  id: string; // UUID
  businessId?: string;
  collectorId: string;
  fullName: string;
  phoneNumber: string;
  rankOrder?: number; // Position/Rang de passage
  hasReceivedHand: boolean; // Main déjà touchée (Oui/Non)
  handReceivedDate?: string; // Date de remise de la main
  totalPaidAmount: number; // Total cotisé en HTG
  paidHandsCount: number; // Nombre total de mains payées
  paidUntilDate: string; // Date jusqu'à laquelle les cotisations sont couvertes (YYYY-MM-DD)
  qrCodeToken: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

// Unified Member interface (aliased to MemberChild with computed display metrics)
export interface Member extends MemberChild {
  type: BusinessType;
  dailyAmount: number;
  currentBalance: number;
  payoutRank?: number | null;
  hasReceivedPayout: boolean;
  paymentStatusToday: MemberPaymentStatus;
  overdueRoundsCount: number;
  lastPaymentDate?: string | null;
  totalPaidInCycle: number;
  handsCoveredAhead: number; // Nombre de jours/mains d'avance
  nextDueDate?: string;
}

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

export interface LocalTransaction {
  id: string; // UUIDv4
  memberId: string;
  collectorId: string;
  businessId?: string | null;
  solGroupId?: string | null;
  amount: number;
  handsCovered: number; // Ex: 750 HTG / 250 HTG = 3 mains
  type: 'CONTRIBUTION' | 'HAND_PAYOUT' | TransactionType;
  paymentMethod?: string;
  note?: string; // Justification obligatoire lors de la remise de la main
  createdAtLocal: string;
  syncedAt?: string | null;
  syncStatus: SyncStatus;
  idempotencyKey?: string | null;
  isReversed?: boolean;
  reversalId?: string | null;
  reversedAt?: string | null;
  memberName?: string;
  memberPhone?: string;
}

export type Transaction = LocalTransaction & {
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
};

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

export type AuditLogAction =
  | 'CREATE_CONTRIBUTION'
  | 'REVERSE_CONTRIBUTION'
  | 'CREATE_PAYOUT'
  | 'PAYOUT_OUT_OF_ORDER'
  | 'UPDATE_PAYOUT_ORDER'
  | 'CREATE_BOOK'
  | 'UPDATE_BOOK'
  | 'CLOSE_DAY'
  | 'REOPEN_DAY'
  | 'CLOSE_CYCLE'
  | 'APPROVE_MANAGER'
  | 'SUSPEND_MANAGER'
  | 'RESTORE_BACKUP'
  | 'UPDATE_SECURITY'
  | 'LOGIN_FAILURE';

export interface AuditLog {
  id: string; // UUIDv4
  userId: string;
  userRole: UserRole;
  action: AuditLogAction;
  entityType: 'TRANSACTION' | 'CLIENT' | 'BUSINESS' | 'COLLECTOR' | 'CLOSURE' | 'SYSTEM';
  entityId: string;
  oldData?: string | null; // JSON string
  newData?: string | null; // JSON string
  reason?: string | null;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface SyncLogEntry {
  id: string;
  tableName: string;
  entityId: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'PUSH';
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  attemptsCount: number;
  lastError?: string | null;
  createdAt: string;
  syncedAt?: string | null;
}

export interface DashboardMetrics {
  unitAmount: number; // Montant unitaire d'une main (ex: 250 HTG)
  totalPotAmount: number; // Cagnotte complète (unitAmount * totalSlots, ex: 2 500 HTG)
  handsCollectedToday: number; // Nombre total de mains collectées aujourd'hui
  handsCollectedTotal: number; // Total cumulé des mains du cycle
  totalHandsExpected: number; // Total attendu sur le cycle (totalSlots)
  daysRemaining: number; // Nombre de jours restants avant la clôture
  overdueMembersCount: number; // Compteur global des enfants en retard
  overdueHandsCount: number; // Nombre total de cotisations en retard
  paidTodayCount: number; // Nombre d'enfants ayant payé aujourd'hui / couverts
  unpaidTodayCount: number; // Nombre d'enfants non payés aujourd'hui
  totalMembersCount: number; // Nombre total d'adhérents inscrits
  handsTouchedCount: number; // Nombre d'enfants ayant déjà touché leur main
  currentPayoutBeneficiary?: Member | null; // Prochain bénéficiaire selon le rang
  businessName: string;
  businessType: BusinessType;
  frequency: Frequency | PaymentFrequency;
  startDate: string;
  endDate: string;
  cycleStatus?: CycleStatus;
  // Legacy aliases for backward compatibility
  handsCollected: number;
  handsRemaining: number;
  totalCashToday: number;
  contributionAmount: number;
  currentRound: number;
  totalRounds: number;
}

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
  syncedCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  error?: string | null;
}
