/**
 * Official PDF Generation & Sharing Service for SOL Mobile
 * Generates institutional-grade, verifiable, printable and shareable PDF documents.
 * Compliant with Haitian financial documentation standards (SOL / Tontine mutuelle).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/formatters';
import { getReceiptPreferences } from '@/lib/receiptPreferences';

export interface ContributionPdfData {
  transactionId: string;
  businessName: string;
  collectorName: string;
  collectorPhone: string;
  collectorZone?: string;
  clientName: string;
  clientPhone: string;
  payoutRank?: number;
  payoutRanks?: string;
  qrCodeToken: string;
  unitAmount: number;
  handsCount: number;
  totalAmount: number;
  coverageStartDate: string;
  coverageEndDate: string;
  createdAt: string;
}

export interface PayoutPdfData {
  transactionId: string;
  businessName: string;
  collectorName: string;
  collectorPhone: string;
  collectorZone?: string;
  clientName: string;
  clientPhone: string;
  payoutRank?: number;
  payoutRanks?: string;
  totalPotAmount: number;
  registeredChildrenCount: number;
  unitAmount: number;
  note?: string;
  createdAt: string;
}

export interface ManagerBusinessReportPdfData {
  businessName: string;
  collectorName: string;
  collectorPhone: string;
  collectorZone?: string;
  unitAmount: number;
  totalSlots: number;
  registeredChildrenCount: number;
  totalPotAmount: number;
  cycleStartDate: string;
  cycleEndDate: string;
  cycleNumber?: number;
  handsCollectedTotal: number;
  totalCashCollected: number;
  totalDistributed: number;
  netReserveBalance: number;
  completionRate: number;
  members: Array<{
    rank: number;
    fullName: string;
    phoneNumber: string;
    totalPaid: number;
    handsCovered: number;
    /** A_JOUR / EN_AVANCE / A_ENCAISSER / RETARD, or a member status (PAID_TODAY…). */
    coverageStatus: string;
    hasReceivedPayout: boolean;
    handsCount?: number;
    totalDue?: number;
    plannedPayoutDates?: string[];
    receivedPayoutDates?: string[];
  }>;
  generatedAt: string;
  /** Closing instant of an archived cycle. */
  closedAt?: string;
  currentRound?: number;
  /** Owed up to today and not collected (late + today's hands). */
  remainingToCollect?: number;
  /** Who receives at each round (scheduleService.buildPayoutCalendar). */
  payoutCalendar?: Array<{ round: number; date: string; fullName: string; receivedOn: string | null }>;
}

export interface MemberStatementPdfData {
  businessName: string;
  collectorName: string;
  collectorPhone: string;
  collectorZone?: string;
  clientName: string;
  clientPhone: string;
  qrCodeToken: string;
  payoutRanks: number[];
  handsCount: number;
  unitAmount: number;
  cycleStartDate: string;
  cycleEndDate: string;
  rounds: Array<{ index: number; date: string; dueHands: number; paidHands: number; state: string }>;
  paidUntilDate: string | null;
  nextDueDate: string | null;
  totalPaid: number;
  totalDue: number;
  lateHands: number;
  payouts: Array<{ round: number; date: string; receivedOn: string | null }>;
  operations: Array<{ date: string; label: string; amount: number; hands: number; ref: string; reversed: boolean }>;
  generatedAt: string;
}

export interface CashClosurePdfData {
  closureId: string;
  businessName?: string;
  collectorName: string;
  collectorPhone: string;
  collectorZone?: string;
  closureDate: string;
  totalCashDeclared: number;
  totalSystemCalculated: number;
  discrepancy: number;
  discrepancyReason?: string;
  status: string;
  generatedAt: string;
  /** Members not fully paid for the day, closed anyway by the manager. */
  unpaidMembers?: Array<{ fullName: string; missingHands: number; amount: number; state: string }>;
  closureNote?: string;
}

/** Escapes text placed in the HTML templates (names, notes). */
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** One vocabulary for statuses on paper, whatever the source (live status or archive). */
function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'A_JOUR':
    case 'À JOUR':
    case 'PAID_TODAY':
    case 'PAID':
      return { label: 'À jour', cls: 'badge-paid' };
    case 'EN_AVANCE':
    case 'PAID_IN_ADVANCE':
      return { label: 'En avance', cls: 'badge-advance' };
    case 'A_ENCAISSER':
    case 'UNPAID_TODAY':
    case 'DUE_TODAY':
      return { label: 'À encaisser', cls: 'badge-pending' };
    case 'PARTIAL':
      return { label: 'Partiel', cls: 'badge-pending' };
    case 'UPCOMING':
      return { label: 'À venir', cls: 'badge-muted' };
    default:
      return { label: 'En retard', cls: 'badge-late' };
  }
}

/** Badges shared by the report and the member statement. */
const STATUS_BADGE_CSS = `
    .badge-status { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }
    .badge-paid { background-color: #E6F4EC; color: #0B6E47; }
    .badge-advance { background-color: #EBEEFA; color: #1F3FB8; }
    .badge-late { background-color: #FEF2F2; color: #B91C1C; }
    .badge-pending { background-color: #FBF1DF; color: #8A5300; }
    .badge-muted { background-color: #F4F5F8; color: #6B7385; }
    .section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #141B2D; letter-spacing: 0.5px; margin: 6px 0; }
    .period-band { display: flex; justify-content: space-between; gap: 10px; background: #141B2D; color: #FFFFFF; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
    .period-band .k { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #C3CCF2; }
    .period-band .v { font-size: 14px; font-weight: 900; }
`;

/**
 * Generates an SVG vector barcode for receipts and audit trails.
 */
function generateBarcodeSvg(value?: string | null, width = 260, height = 36): string {
  const safeVal = String(value || 'SOL-HAITI-SECURITE');
  const hash = Array.from(safeVal).reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
  const bars: string[] = [];
  let currentX = 10;
  const barWidths = [2, 1, 3, 1, 2, 4, 1, 2, 3, 2];

  for (let i = 0; currentX < width - 15; i++) {
    const charCode = safeVal.charCodeAt(i % safeVal.length) || 48;
    const wIndex = (charCode + hash + i) % barWidths.length;
    const barW = barWidths[wIndex];
    if (i % 2 === 0) {
      bars.push(`<rect x="${currentX}" y="0" width="${barW}" height="${height}" fill="#141B2D" />`);
    }
    currentX += barW + ((i % 3 === 0) ? 2 : 1);
  }

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${bars.join('')}
    </svg>
  `;
}

/**
 * Universal HTML-to-PDF / Print renderer compatible with Android, iOS and Web.
 *
 * On Android (including Expo Go), printToFileAsync writes to an internal sandbox
 * path (file:///data/user/0/.../cache/print/) that expo-sharing cannot access.
 * We bypass file creation entirely and call printAsync({ html }) directly, which
 * opens the native Android print dialog (allows Save as PDF / print).
 */
let printInProgress = false;

/**
 * Opens the system print dialog once at a time. The native module refuses a second request
 * while a dialog is open ("Another print request is already in progress"), which happened on
 * a double tap: the extra request is now ignored instead of surfacing as an error.
 */
async function printHtmlOnce(html: string): Promise<void> {
  if (printInProgress) return;
  printInProgress = true;
  try {
    await Print.printAsync({ html });
  } catch (err: any) {
    if (!String(err?.message || '').includes('already in progress')) throw err;
  } finally {
    printInProgress = false;
  }
}

/**
 * Web: expo-print only calls window.print(), which printed the app screen, not the document.
 * The document goes into a hidden frame and that frame is printed.
 */
function printHtmlOnWeb(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // Leave the frame long enough for the print dialog to read it
      setTimeout(() => frame.remove(), 60_000);
      resolve();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

async function renderHtmlDocument(html: string): Promise<string> {
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return 'web-printed';
  }

  // Android: open system print dialog directly — no file creation needed.
  if (Platform.OS === 'android') {
    await printHtmlOnce(html);
    return 'android-printed';
  }

  // iOS: use file-based approach so the share sheet can attach the PDF.
  try {
    const result = await Print.printToFileAsync({ html });
    if (result && result.uri) {
      return result.uri;
    }
    await Print.printAsync({ html });
    return 'fallback-printed';
  } catch (err: any) {
    console.warn('Print.printToFileAsync error, fallback to Print.printAsync:', err);
    try {
      await Print.printAsync({ html });
      return 'fallback-printed';
    } catch (fallbackErr: any) {
      throw new Error(err?.message || fallbackErr?.message || 'Échec de la génération du document PDF.');
    }
  }
}

/**
 * Shared institutional CSS styling for all A4 documents.
 */
/** Applies the receipt name chosen in Réglages (falls back to the carnet name). */
function withReceiptName<T extends { businessName?: string }>(data: T): T {
  const { receiptName } = getReceiptPreferences();
  return receiptName ? { ...data, businessName: receiptName } : data;
}

/** Optional note printed at the bottom of every document. */
function receiptNoteHtml(): string {
  const { receiptNote } = getReceiptPreferences();
  if (!receiptNote) return '';
  const safe = receiptNote.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  return `<div style="text-align:center;font-size:10px;color:#4A5368;margin-top:10px;">${safe}</div>`;
}

const BASE_PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 12mm 14mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    margin: 0;
    padding: 0;
    color: #141B2D;
    background-color: #FFFFFF;
    font-size: 12px;
    line-height: 1.45;
  }
  .haitian-ribbon {
    height: 4px;
    width: 100%;
    background: linear-gradient(90deg, #00209F 0%, #00209F 50%, #D21034 50%, #D21034 100%);
    border-radius: 2px;
    margin-bottom: 12px;
  }
  .header-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
    border-bottom: 1.5px solid #E6E8EE;
    padding-bottom: 12px;
  }
  .header-table td {
    vertical-align: top;
  }
  .brand-logo-text {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #141B2D;
    margin: 0;
  }
  .brand-logo-text span {
    color: #00209F;
  }
  .brand-subline {
    font-size: 10px;
    font-weight: 700;
    color: #4A5368;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }
  .doc-badge {
    display: inline-block;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    text-align: right;
  }
  .badge-blue {
    background-color: #EBEEFA;
    color: #1F3FB8;
    border: 1px solid #C3CCF2;
  }
  .badge-green {
    background-color: #E6F4EC;
    color: #0B6E47;
    border: 1px solid #A9D9BF;
  }
  .badge-amber {
    background-color: #FBF1DF;
    color: #8A5300;
    border: 1px solid #EBCB91;
  }
  .info-grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 10px;
    margin-bottom: 14px;
  }
  .info-card {
    background-color: #F4F5F8;
    border: 1px solid #E6E8EE;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .info-card-title {
    font-size: 9.5px;
    font-weight: 900;
    text-transform: uppercase;
    color: #4A5368;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    border-bottom: 1px solid #E6E8EE;
    padding-bottom: 4px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
    font-size: 11px;
  }
  .info-label {
    color: #4A5368;
    font-weight: 600;
  }
  .info-value {
    color: #141B2D;
    font-weight: 800;
    text-align: right;
  }
  .hero-amount-box {
    background: linear-gradient(135deg, #F4F5F8 0%, #EBEEFA 100%);
    border: 1.5px solid #C3CCF2;
    border-radius: 10px;
    padding: 14px 16px;
    text-align: center;
    margin-bottom: 16px;
  }
  .hero-amount-box.amber {
    background: linear-gradient(135deg, #FBF1DF 0%, #FBF1DF 100%);
    border-color: #EBCB91;
  }
  .hero-amount-box.green {
    background: linear-gradient(135deg, #E6F4EC 0%, #E6F4EC 100%);
    border-color: #A9D9BF;
  }
  .hero-label {
    font-size: 10px;
    font-weight: 800;
    color: #4A5368;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .hero-value {
    font-size: 28px;
    font-weight: 900;
    color: #141B2D;
    margin: 4px 0;
    letter-spacing: -0.5px;
  }
  .hero-sub {
    font-size: 11px;
    font-weight: 600;
    color: #4A5368;
  }
  .table-clean {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  .table-clean th {
    background-color: #141B2D;
    color: #FFFFFF;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 7px 8px;
    text-align: left;
  }
  .table-clean td {
    padding: 7px 8px;
    border-bottom: 1px solid #E6E8EE;
    font-size: 10.5px;
  }
  .table-clean tr:nth-child(even) {
    background-color: #F4F5F8;
  }
  .signatures-zone {
    width: 100%;
    margin-top: 20px;
    page-break-inside: avoid;
  }
  .sig-box {
    border: 1px dashed #6B7385;
    background-color: #F4F5F8;
    border-radius: 8px;
    padding: 10px;
    height: 80px;
    position: relative;
  }
  .sig-title {
    font-size: 9.5px;
    font-weight: 800;
    color: #4A5368;
    text-transform: uppercase;
  }
  .sig-line {
    position: absolute;
    bottom: 12px;
    left: 10px;
    right: 10px;
    border-bottom: 1px solid #C5CBD8;
    font-size: 8.5px;
    color: #6B7385;
    text-align: right;
    padding-bottom: 2px;
  }
  .security-seal {
    text-align: center;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid #E6E8EE;
    font-size: 9px;
    color: #4A5368;
    page-break-inside: avoid;
  }
  .barcode-wrapper {
    margin: 6px auto;
    display: inline-block;
  }
  .legal-note {
    font-size: 8.5px;
    color: #6B7385;
    line-height: 1.35;
    margin-top: 6px;
    text-align: justify;
  }
`;

/**
 * Generates an official Contribution Receipt PDF document.
 */
export async function generateContributionReceiptPdf(data: ContributionPdfData): Promise<string> {
  data = withReceiptName(data);
  const safeTrxId = (data.transactionId || 'SOL-TRX').toUpperCase();
  const safeToken = (data.qrCodeToken || data.transactionId || 'CERT-SOL').slice(0, 24).toUpperCase();
  const barcodeSvg = generateBarcodeSvg(data.transactionId || data.qrCodeToken);
  const displayRank = data.payoutRanks ? `Rangs: ${data.payoutRanks}` : (data.payoutRank ? `Rang: #${data.payoutRank}` : 'Non assigné');

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>SOL – Reçu de Cotisation – ${data.clientName || 'Adhérent'} – ${data.businessName || data.collectorName} – ${data.createdAt ? data.createdAt.slice(0,10) : ''} – Réf. ${(data.transactionId || '').toUpperCase().slice(0,12)}</title>
  <style>
    ${BASE_PRINT_CSS}
    .receipt-frame {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #141B2D;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
  </style>
</head>
<body>
  <div class="receipt-frame">
    <div class="haitian-ribbon"></div>

    <!-- Header -->
    <table class="header-table">
      <tr>
        <td>
          <div class="brand-logo-text">SOL <span>MOBILE</span></div>
          <div class="brand-subline">SYSTÈME TONTINIER SÉCURISÉ D'HAÏTI</div>
          <div style="font-size: 11px; font-weight: 700; color: #141B2D; margin-top: 4px;">
            ${data.businessName || 'Carnet Tontinier Communautaire'}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="doc-badge badge-green">REÇU OFFICIEL DE COTISATION</div>
          <div style="font-size: 10px; color: #4A5368; margin-top: 4px; font-weight: 600;">
            N° : <strong>${safeTrxId}</strong>
          </div>
          <div style="font-size: 10px; color: #4A5368; font-weight: 600;">
            Date : <strong>${formatDate(data.createdAt)}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- Hero Amount -->
    <div class="hero-amount-box green">
      <div class="hero-label">Montant Total Encaissé (Vèsman Resevwa)</div>
      <div class="hero-value" style="color: #0B6E47;">${formatCurrency(data.totalAmount)}</div>
      <div class="hero-sub">
        <strong>${data.handsCount} main${data.handsCount > 1 ? 's' : ''}</strong> cotisée${data.handsCount > 1 ? 's' : ''} à <strong>${formatCurrency(data.unitAmount)}</strong> / main
      </div>
    </div>

    <!-- Info Cards 2-Col -->
    <table class="info-grid">
      <tr>
        <td style="width: 50%;">
          <div class="info-card">
            <div class="info-card-title">Adhérent Titulaire (Patisipan)</div>
            <div class="info-row">
              <span class="info-label">Nom & Prénom :</span>
              <span class="info-value">${data.clientName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Téléphone :</span>
              <span class="info-value">${data.clientPhone || 'Non renseigné'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Position / Attribution :</span>
              <span class="info-value">${displayRank}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Période Couverte :</span>
              <span class="info-value" style="color: #0B6E47;">${formatDateShort(data.coverageStartDate)} au ${formatDateShort(data.coverageEndDate)}</span>
            </div>
          </div>
        </td>
        <td style="width: 50%;">
          <div class="info-card">
            <div class="info-card-title">Gestionnaire de Caisse (Jesyonè)</div>
            <div class="info-row">
              <span class="info-label">Responsable :</span>
              <span class="info-value">${data.collectorName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Téléphone :</span>
              <span class="info-value">${data.collectorPhone}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Zone / Marché :</span>
              <span class="info-value">${data.collectorZone || 'Zone Standard'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Statut Validation :</span>
              <span class="info-value" style="color: #0B6E47;">ENCAISSÉ & SÉCURISÉ</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Dual Signatures -->
    <table class="signatures-zone">
      <tr>
        <td style="width: 48%;">
          <div class="sig-box">
            <div class="sig-title">Émargement de l'Adhérent (Patisipan)</div>
            <div class="sig-line">Date & Signature</div>
          </div>
        </td>
        <td style="width: 4%;"></td>
        <td style="width: 48%;">
          <div class="sig-box">
            <div class="sig-title">Visa & Cachet du Gestionnaire SOL</div>
            <div class="sig-line">Signature autorisée</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Security Seal & Barcode -->
    <div class="security-seal">
      <div class="barcode-wrapper">
        ${barcodeSvg}
      </div>
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #141B2D;">
        CERT-ID: ${safeToken}
      </div>
      <div class="legal-note">
        Ce reçu officiel fait foi du versement régulier des cotisations au sein du carnet tontinier SOL Mobile. Enregistré sous l'intégrité de la plateforme décentralisée SOL Haïti. Toute falsification est passible des sanctions prévues par la législation en vigueur.
      </div>
    </div>
  </div>
${receiptNoteHtml()}
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Payout Receipt / Décharge PDF document.
 */
export async function generatePayoutReceiptPdf(data: PayoutPdfData): Promise<string> {
  data = withReceiptName(data);
  const safeTrxId = (data.transactionId || 'SOL-DEC').toUpperCase();
  const barcodeSvg = generateBarcodeSvg(data.transactionId);
  const displayRank = data.payoutRanks ? `Rangs: ${data.payoutRanks}` : (data.payoutRank ? `Rang: #${data.payoutRank}` : 'Main standard');

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>SOL – Décharge de Décaissement – ${data.clientName || 'Adhérent'} – ${data.businessName || data.collectorName} – ${data.createdAt ? data.createdAt.slice(0,10) : ''} – Réf. ${(data.transactionId || '').toUpperCase().slice(0,12)}</title>
  <style>
    ${BASE_PRINT_CSS}
    .receipt-frame {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #141B2D;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .legal-box {
      background-color: #FBF1DF;
      border: 1px solid #EBCB91;
      border-radius: 8px;
      padding: 10px 12px;
      margin-top: 12px;
      margin-bottom: 14px;
      font-size: 10px;
      color: #78350F;
      line-height: 1.4;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="receipt-frame">
    <div class="haitian-ribbon"></div>

    <!-- Header -->
    <table class="header-table">
      <tr>
        <td>
          <div class="brand-logo-text">SOL <span>MOBILE</span></div>
          <div class="brand-subline">SYSTÈME TONTINIER SÉCURISÉ D'HAÏTI</div>
          <div style="font-size: 11px; font-weight: 700; color: #141B2D; margin-top: 4px;">
            ${data.businessName || 'Carnet Tontinier Communautaire'}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="doc-badge badge-amber">ATTESTATION DE DÉCAISSEMENT</div>
          <div style="font-size: 10px; color: #4A5368; margin-top: 4px; font-weight: 600;">
            REMISE DE MAIN (BAY MEN)
          </div>
          <div style="font-size: 10px; color: #4A5368; font-weight: 600;">
            Réf : <strong>${safeTrxId}</strong>
          </div>
          <div style="font-size: 10px; color: #4A5368; font-weight: 600;">
            Date : <strong>${formatDate(data.createdAt)}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- Hero Amount -->
    <div class="hero-amount-box amber">
      <div class="hero-label">Montant Total Décaissé (Kòb Men Remèt)</div>
      <div class="hero-value" style="color: #8A5300;">${formatCurrency(data.totalPotAmount)}</div>
      <div class="hero-sub">
        Cagnotte intégrale constituée de <strong>${data.registeredChildrenCount} souscriptions</strong> à <strong>${formatCurrency(data.unitAmount)}</strong>
      </div>
    </div>

    <!-- Info Cards 2-Col -->
    <table class="info-grid">
      <tr>
        <td style="width: 50%;">
          <div class="info-card">
            <div class="info-card-title">Bénéficiaire de la Main (Moun ki Pran Men an)</div>
            <div class="info-row">
              <span class="info-label">Nom & Prénom :</span>
              <span class="info-value">${data.clientName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Téléphone :</span>
              <span class="info-value">${data.clientPhone || 'Non renseigné'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Rang attribué :</span>
              <span class="info-value">${displayRank}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Mode de Remise :</span>
              <span class="info-value">Espèces (Kòb Kach)</span>
            </div>
          </div>
        </td>
        <td style="width: 50%;">
          <div class="info-card">
            <div class="info-card-title">Opérateur & Caisse (Jesyonè Kès)</div>
            <div class="info-row">
              <span class="info-label">Gestionnaire :</span>
              <span class="info-value">${data.collectorName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Téléphone :</span>
              <span class="info-value">${data.collectorPhone}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Zone d'Activité :</span>
              <span class="info-value">${data.collectorZone || 'Zone Standard'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Statut :</span>
              <span class="info-value" style="color: #0B6E47;">DÉCAISSEMENT CERTIFIÉ</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Legal Discharge Declaration -->
    <div class="legal-box">
      <strong>DÉCLARATION SUR L'HONNEUR & BON POUR DÉCHARGE :</strong><br/>
      Je soussigné(e) <strong>${data.clientName}</strong>, certifie sur l'honneur avoir reçu en mains propres la somme totale de <strong>${formatCurrency(data.totalPotAmount)}</strong> au titre du tirage de ma main tontinière. Je m'engage expressément à continuer d'honorer toutes mes cotisations futures jusqu'au terme complet du cycle actuel du carnet SOL.
      ${data.note ? `<br/><br/><em>Note spéciale : ${data.note}</em>` : ''}
    </div>

    <!-- Dual Signatures -->
    <table class="signatures-zone">
      <tr>
        <td style="width: 48%;">
          <div class="sig-box">
            <div class="sig-title">Signature du Bénéficiaire (Bon pour décharge)</div>
            <div class="sig-line">Émargement obligatoire</div>
          </div>
        </td>
        <td style="width: 4%;"></td>
        <td style="width: 48%;">
          <div class="sig-box">
            <div class="sig-title">Visa du Gestionnaire de Caisse</div>
            <div class="sig-line">Cachet & Signature</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Security Seal & Barcode -->
    <div class="security-seal">
      <div class="barcode-wrapper">
        ${barcodeSvg}
      </div>
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #141B2D;">
        AUTH-DEC: ${safeTrxId}
      </div>
      <div class="legal-note">
        Acte de décaissement authentifié par le protocole SOL Mobile Haïti. Valable comme quittance définitive de remise de fonds et engagement mutuel irrévocable.
      </div>
    </div>
  </div>
${receiptNoteHtml()}
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Manager Business Report PDF document.
 */
export async function generateManagerBusinessReportPdf(data: ManagerBusinessReportPdfData): Promise<string> {
  data = withReceiptName(data);
  const barcodeSvg = generateBarcodeSvg(`REP-${data.collectorPhone || '0000'}-${data.generatedAt || Date.now()}`);
  const safeCompletionRate = Number(data.completionRate) || 0;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>SOL – Rapport d'Évolution – ${data.collectorName} (${data.businessName || 'Caisse'}) – ${data.generatedAt ? data.generatedAt.slice(0,10) : ''} – Cycle ${data.cycleNumber || 1}</title>
  <style>
    ${BASE_PRINT_CSS}
    .kpi-grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .kpi-tile {
      width: 31%;
      box-sizing: border-box;
      margin-bottom: 10px;
      background-color: #F4F5F8;
      border: 1px solid #E6E8EE;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-tile-label {
      font-size: 9px;
      font-weight: 800;
      color: #4A5368;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .kpi-tile-val {
      font-size: 16px;
      font-weight: 900;
      margin-top: 2px;
    }
    ${STATUS_BADGE_CSS}
  </style>
</head>
<body>
  <div class="haitian-ribbon"></div>

  <!-- Header -->
  <table class="header-table">
    <tr>
      <td>
        <div class="brand-logo-text">SOL <span>MOBILE</span></div>
        <div class="brand-subline">RAPPORT OFFICIEL D'ÉVOLUTION & AUDIT DE CARNET</div>
        <div style="font-size: 14px; font-weight: 900; color: #141B2D; margin-top: 4px;">
          ${esc(data.businessName || 'Carnet Tontinier')} ${data.cycleNumber ? `• Cycle #${data.cycleNumber}` : ''}
        </div>
        <div style="font-size: 11px; color: #4A5368; margin-top: 2px;">
          Gestionnaire : <strong>${esc(data.collectorName)}</strong> (${esc(data.collectorPhone)})${data.collectorZone ? ` • Zone : <strong>${esc(data.collectorZone)}</strong>` : ''}
        </div>
      </td>
      <td style="text-align: right;">
        <div class="doc-badge ${data.closedAt ? 'badge-amber' : 'badge-blue'}">${data.closedAt ? 'BILAN DE CYCLE CLÔTURÉ' : 'RAPPORT DE CYCLE'}</div>
        <div style="font-size: 10px; color: #4A5368; margin-top: 6px; font-weight: 600;">
          Édité le : <strong>${formatDate(data.generatedAt)}</strong>
        </div>
      </td>
    </tr>
  </table>

  <!-- Period: start, planned end, round, closing -->
  <div class="period-band">
    <div><div class="k">Début</div><div class="v">${formatDateShort(data.cycleStartDate)}</div></div>
    <div><div class="k">Fin prévue</div><div class="v">${formatDateShort(data.cycleEndDate)}</div></div>
    <div><div class="k">Tours</div><div class="v">${data.currentRound ? `${data.currentRound} / ${data.totalSlots}` : `${data.totalSlots}`}</div></div>
    <div><div class="k">${data.closedAt ? 'Clôturé le' : 'Main'}</div><div class="v">${data.closedAt ? formatDateShort(data.closedAt) : formatCurrency(data.unitAmount)}</div></div>
  </div>

  <!-- KPI Matrix -->
  <div class="kpi-grid">
    <div class="kpi-tile">
      <div class="kpi-tile-label">Cagnotte par Main</div>
      <div class="kpi-tile-val" style="color: #1F3FB8;">${formatCurrency(data.totalPotAmount)}</div>
      <div style="font-size: 9px; color: #4A5368; font-weight: 600;">${data.totalSlots} souscriptions attendues</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Total Encaissé</div>
      <div class="kpi-tile-val" style="color: #0B6E47;">+${formatCurrency(data.totalCashCollected)}</div>
      <div style="font-size: 9px; color: #4A5368; font-weight: 600;">${data.handsCollectedTotal} mains reçues</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Total Décaissé</div>
      <div class="kpi-tile-val" style="color: #8A5300;">-${formatCurrency(data.totalDistributed)}</div>
      <div style="font-size: 9px; color: #4A5368; font-weight: 600;">Mains remises aux bénéficiaires</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Solde Net en Caisse</div>
      <div class="kpi-tile-val" style="color: #141B2D;">${formatCurrency(data.netReserveBalance)}</div>
      <div style="font-size: 9px; color: #4A5368; font-weight: 600;">Fonds conservés en réserve</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">${data.remainingToCollect !== undefined ? 'Reste à encaisser' : 'Effectif Adhérents'}</div>
      <div class="kpi-tile-val" style="color: ${data.remainingToCollect ? '#B91C1C' : '#141B2D'};">${
        data.remainingToCollect !== undefined ? formatCurrency(data.remainingToCollect) : `${data.registeredChildrenCount} adhérents`
      }</div>
      <div style="font-size: 9px; color: #4A5368; font-weight: 600;">${
        data.remainingToCollect !== undefined ? `Dû à ce jour · ${data.registeredChildrenCount} adhérents` : 'Membres inscrits au carnet'
      }</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Taux de Recouvrement</div>
      <div class="kpi-tile-val" style="color: ${safeCompletionRate >= 80 ? '#0B6E47' : '#D97706'};">
        ${safeCompletionRate.toFixed(1)}%
      </div>
      <div style="font-size: 9px; color: #4A5368; font-weight: 600;">Complétion de l'échéancier</div>
    </div>
  </div>

  <!-- Members Roster Table -->
  <div class="section-title">État nominatif des adhérents</div>
  <table class="table-clean">
    <thead>
      <tr>
        <th style="width: 7%;">Rang</th>
        <th style="width: 27%;">Adhérent</th>
        <th style="width: 8%; text-align: center;">Mains</th>
        <th style="width: 22%; text-align: right;">Payé / Dû</th>
        <th style="width: 14%; text-align: center;">Statut</th>
        <th style="width: 22%; text-align: center;">Remise de la main</th>
      </tr>
    </thead>
    <tbody>
      ${data.members.map((m) => {
        const badge = statusBadge(m.coverageStatus);
        const planned = (m.plannedPayoutDates || []).map((d) => formatDateShort(d)).join(', ');
        const received = (m.receivedPayoutDates || []).map((d) => formatDateShort(d)).join(', ');
        return `
        <tr>
          <td><strong>#${m.rank}</strong></td>
          <td><strong>${esc(m.fullName)}</strong><div style="font-size: 9px; color: #6B7385;">${esc(m.phoneNumber || '')}</div></td>
          <td style="text-align: center; font-weight: 700;">${m.handsCount || 1}</td>
          <td style="text-align: right;"><strong style="color: #0B6E47;">${formatCurrency(m.totalPaid)}</strong>${
            m.totalDue ? `<div style="font-size: 9px; color: #6B7385;">sur ${formatCurrency(m.totalDue)} · ${m.handsCovered} main(s)</div>` : ''
          }</td>
          <td style="text-align: center;"><span class="badge-status ${badge.cls}">${badge.label}</span></td>
          <td style="text-align: center; font-size: 9.5px;">${
            m.hasReceivedPayout
              ? `<span class="badge-status badge-paid">Reçue${received ? ` le ${received}` : ''}</span>`
              : planned
              ? `Prévue le <strong>${planned}</strong>`
              : '<span class="badge-status badge-muted">En attente</span>'
          }</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  ${
    data.payoutCalendar && data.payoutCalendar.length
      ? `
  <div class="section-title">Calendrier des remises</div>
  <table class="table-clean">
    <thead>
      <tr>
        <th style="width: 12%;">Tour</th>
        <th style="width: 22%;">Date prévue</th>
        <th style="width: 40%;">Bénéficiaire</th>
        <th style="width: 26%; text-align: center;">Remise</th>
      </tr>
    </thead>
    <tbody>
      ${data.payoutCalendar.map((r) => `
        <tr>
          <td><strong>${r.round}</strong></td>
          <td>${formatDateShort(r.date)}</td>
          <td><strong>${esc(r.fullName)}</strong></td>
          <td style="text-align: center;">${
            r.receivedOn
              ? `<span class="badge-status badge-paid">Remise le ${formatDateShort(r.receivedOn)}</span>`
              : `<span class="badge-status badge-muted">À venir</span>`
          }</td>
        </tr>`).join('')}
    </tbody>
  </table>`
      : ''
  }

  <!-- Dual Signatures & Seal -->
  <table class="signatures-zone">
    <tr>
      <td style="width: 48%;">
        <div class="sig-box">
          <div class="sig-title">Attestation du Gestionnaire Titulaire</div>
          <div class="sig-line">Date & Signature certifiée</div>
        </div>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%;">
        <div class="sig-box">
          <div class="sig-title">Contrôle & Visa de Conformité SOL Mobile</div>
          <div class="sig-line">Sceau d'Audit</div>
        </div>
      </td>
    </tr>
  </table>

  <div class="security-seal">
    <div class="barcode-wrapper">
      ${barcodeSvg}
    </div>
    <div style="font-size: 9.5px; font-weight: 700; color: #141B2D;">
      SOL MOBILE HAITI • DOCUMENT D'AUDIT CERTIFIÉ CONFORME AUX REGISTRES
    </div>
  </div>
${receiptNoteHtml()}
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Cash Closure Receipt (Procès-Verbal de Clôture Journalière de Caisse).
 */
export async function generateCashClosureReceiptPdf(data: CashClosurePdfData): Promise<string> {
  data = withReceiptName(data);
  const safeClosureId = (data.closureId || 'CLOTURE').toUpperCase();
  const barcodeSvg = generateBarcodeSvg(safeClosureId);
  const isBalanced = Math.abs(data.discrepancy) < 0.01;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>SOL – PV de Clôture de Caisse – ${data.collectorName} (${data.businessName || 'Caisse'}) – ${data.closureDate ? data.closureDate.slice(0,10) : ''} – Réf. ${safeClosureId.slice(0,12)}</title>
  <style>
    ${BASE_PRINT_CSS}
    .receipt-frame {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #141B2D;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .discrepancy-banner {
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
      font-size: 11px;
      font-weight: 700;
    }
    .discrepancy-balanced {
      background-color: #E6F4EC;
      border: 1.5px solid #A9D9BF;
      color: #0B6E47;
    }
    .discrepancy-alert {
      background-color: #FEF2F2;
      border: 1.5px solid #FECACA;
      color: #B91C1C;
    }
  </style>
</head>
<body>
  <div class="receipt-frame">
    <div class="haitian-ribbon"></div>

    <!-- Header -->
    <table class="header-table">
      <tr>
        <td>
          <div class="brand-logo-text">SOL <span>MOBILE</span></div>
          <div class="brand-subline">SYSTÈME TONTINIER SÉCURISÉ D'HAÏTI</div>
          <div style="font-size: 11px; font-weight: 700; color: #141B2D; margin-top: 4px;">
            ${data.businessName || 'Carnet Tontinier Communautaire'}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="doc-badge ${isBalanced ? 'badge-green' : 'badge-amber'}">PROCÈS-VERBAL DE CLÔTURE DE CAISSE</div>
          <div style="font-size: 10px; color: #4A5368; margin-top: 4px; font-weight: 600;">
            Réf : <strong>${safeClosureId}</strong>
          </div>
          <div style="font-size: 10px; color: #4A5368; font-weight: 600;">
            Date Clôture : <strong>${formatDateShort(data.closureDate)}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- Hero Box -->
    <div class="hero-amount-box ${isBalanced ? 'green' : 'amber'}">
      <div class="hero-label">Total Espèces Déclaré en Caisse (Kòb Kach Fizik)</div>
      <div class="hero-value" style="color: ${isBalanced ? '#0B6E47' : '#8A5300'};">${formatCurrency(data.totalCashDeclared)}</div>
      <div class="hero-sub">
        Solde théorique attendu par le système : <strong>${formatCurrency(data.totalSystemCalculated)}</strong>
      </div>
    </div>

    <!-- Discrepancy Status Banner -->
    <div class="discrepancy-banner ${isBalanced ? 'discrepancy-balanced' : 'discrepancy-alert'}">
      ${isBalanced 
        ? '✓ CAISSE PARFAITEMENT ÉQUILIBRÉE — Aucun écart constaté entre les espèces physiques et les encaissements du système.'
        : `⚠️ ÉCART DE CAISSE CONSTATÉ : ${formatCurrency(data.discrepancy)} (${data.discrepancy > 0 ? 'Excédent' : 'Déficit de caisse'})`
      }
      ${data.discrepancyReason ? `<div style="margin-top: 4px; font-weight: 600; font-size: 10px; color: #141B2D;">Justification consignée : <em>"${data.discrepancyReason}"</em></div>` : ''}
    </div>

    ${
      data.unpaidMembers && data.unpaidMembers.length
        ? `
    <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; color: #B91C1C; margin-bottom: 6px;">
      Adhérents non payés à la clôture (${data.unpaidMembers.length}) · ${formatCurrency(data.unpaidMembers.reduce((sum, u) => sum + u.amount, 0))}
    </div>
    <table class="table-clean">
      <thead>
        <tr>
          <th style="width: 50%;">Adhérent</th>
          <th style="width: 15%; text-align: center;">Mains</th>
          <th style="width: 20%; text-align: right;">Montant dû</th>
          <th style="width: 15%; text-align: center;">État</th>
        </tr>
      </thead>
      <tbody>
        ${data.unpaidMembers.map((u) => `
          <tr>
            <td><strong>${esc(u.fullName)}</strong></td>
            <td style="text-align: center;">${u.missingHands}</td>
            <td style="text-align: right; font-weight: 800;">${formatCurrency(u.amount)}</td>
            <td style="text-align: center;">${u.state === 'LATE' ? 'En retard' : u.state === 'PARTIAL' ? 'Partiel' : 'Non payé'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size: 10px; color: #4A5368; margin-bottom: 12px;">Caisse fermée par le gestionnaire malgré ces impayés${
      data.closureNote ? ` — note : <em>${esc(data.closureNote)}</em>` : ''
    }.</div>`
        : `<div class="discrepancy-banner discrepancy-balanced">✓ Tous les adhérents avaient payé leur tour du ${formatDateShort(data.closureDate)}.</div>`
    }

    <!-- Info Cards -->
    <table class="info-grid">
      <tr>
        <td style="width: 50%;">
          <div class="info-card">
            <div class="info-card-title">Opérateur Responsable de Caisse</div>
            <div class="info-row">
              <span class="info-label">Gestionnaire :</span>
              <span class="info-value">${data.collectorName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Téléphone :</span>
              <span class="info-value">${data.collectorPhone}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Zone de Collecte :</span>
              <span class="info-value">${data.collectorZone || 'Standard'}</span>
            </div>
          </div>
        </td>
        <td style="width: 50%;">
          <div class="info-card">
            <div class="info-card-title">Détails d'Arrêté des Comptes</div>
            <div class="info-row">
              <span class="info-label">Statut Journalier :</span>
              <span class="info-value" style="color: #0B6E47;">${data.status === 'APPROVED' ? 'APPROUVÉE' : data.status === 'DRAFT' ? 'BROUILLON' : 'ENREGISTRÉE'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Validation Sécurité :</span>
              <span class="info-value">Code PIN Vérifié</span>
            </div>
            <div class="info-row">
              <span class="info-label">Horodatage Clôture :</span>
              <span class="info-value">${formatDate(data.generatedAt)}</span>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Dual Signatures -->
    <table class="signatures-zone">
      <tr>
        <td style="width: 48%;">
          <div class="sig-box">
            <div class="sig-title">Visa du Gestionnaire de Caisse</div>
            <div class="sig-line">Signature du Déclarant</div>
          </div>
        </td>
        <td style="width: 4%;"></td>
        <td style="width: 48%;">
          <div class="sig-box">
            <div class="sig-title">Visa Contrôle Interne / Supervision</div>
            <div class="sig-line">Audit & Vérification</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Security Seal & Barcode -->
    <div class="security-seal">
      <div class="barcode-wrapper">
        ${barcodeSvg}
      </div>
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #141B2D;">
        ARRÊTÉ DE CAISSE ID: ${safeClosureId}
      </div>
      <div class="legal-note">
        Procès-verbal officiel d'arrêté de caisse journalière. Les montants déclarés engagent la responsabilité pleine et entière du gestionnaire titulaire du carnet. Certifié par le système central SOL Mobile.
      </div>
    </div>
  </div>
${receiptNoteHtml()}
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Relevé de l'adhérent: identity, the cycle calendar round by round (paid, partial, late, to
 * come), payout days and operations. Replaces the old « fiche » built on a contribution receipt.
 */
export async function generateMemberStatementPdf(data: MemberStatementPdfData): Promise<string> {
  data = withReceiptName(data);
  const barcodeSvg = generateBarcodeSvg(data.qrCodeToken || 'SOL');
  const balance = data.totalDue - data.totalPaid;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>SOL – Relevé – ${esc(data.clientName)} – ${data.generatedAt.slice(0, 10)}</title>
  <style>
    ${BASE_PRINT_CSS}
    ${STATUS_BADGE_CSS}
  </style>
</head>
<body>
  <div class="haitian-ribbon"></div>
  <table class="header-table">
    <tr>
      <td>
        <div class="brand-logo-text">SOL <span>MOBILE</span></div>
        <div class="brand-subline">RELEVÉ DE L'ADHÉRENT</div>
        <div style="font-size: 16px; font-weight: 900; margin-top: 4px;">${esc(data.clientName)}</div>
        <div style="font-size: 11px; color: #4A5368;">${esc(data.clientPhone)} • ${data.handsCount} main(s) • Rang(s) ${data.payoutRanks.join(', ') || '—'}</div>
      </td>
      <td style="text-align: right;">
        <div class="doc-badge badge-blue">${esc(data.businessName)}</div>
        <div style="font-size: 10px; color: #4A5368; margin-top: 6px; font-weight: 600;">Gestionnaire : <strong>${esc(data.collectorName)}</strong></div>
        <div style="font-size: 10px; color: #4A5368; font-weight: 600;">Édité le : <strong>${formatDate(data.generatedAt)}</strong></div>
      </td>
    </tr>
  </table>

  <div class="period-band">
    <div><div class="k">Début</div><div class="v">${formatDateShort(data.cycleStartDate)}</div></div>
    <div><div class="k">Fin prévue</div><div class="v">${formatDateShort(data.cycleEndDate)}</div></div>
    <div><div class="k">Payé jusqu'au</div><div class="v">${data.paidUntilDate ? formatDateShort(data.paidUntilDate) : '—'}</div></div>
    <div><div class="k">Prochaine échéance</div><div class="v">${data.nextDueDate ? formatDateShort(data.nextDueDate) : 'Soldé'}</div></div>
  </div>

  <table class="info-grid">
    <tr>
      <td style="width: 33%;"><div class="info-card"><div class="info-card-title">Cotisé</div><div style="font-size: 16px; font-weight: 900; color: #0B6E47;">${formatCurrency(data.totalPaid)}</div></div></td>
      <td style="width: 33%;"><div class="info-card"><div class="info-card-title">Dû sur le cycle</div><div style="font-size: 16px; font-weight: 900;">${formatCurrency(data.totalDue)}</div><div style="font-size: 9px; color: #4A5368;">${data.handsCount} main(s) × ${data.rounds.length} tours × ${formatCurrency(data.unitAmount)}</div></div></td>
      <td style="width: 33%;"><div class="info-card"><div class="info-card-title">${data.lateHands > 0 ? 'En retard' : 'Reste à verser'}</div><div style="font-size: 16px; font-weight: 900; color: ${data.lateHands > 0 ? '#B91C1C' : '#141B2D'};">${
        data.lateHands > 0 ? `${data.lateHands} main(s) · ${formatCurrency(data.lateHands * data.unitAmount)}` : formatCurrency(Math.max(0, balance))
      }</div></div></td>
    </tr>
  </table>

  <div class="section-title">Échéancier</div>
  <table class="table-clean">
    <thead>
      <tr>
        <th style="width: 12%;">Tour</th>
        <th style="width: 28%;">Date</th>
        <th style="width: 25%; text-align: center;">Mains payées</th>
        <th style="width: 35%; text-align: center;">État</th>
      </tr>
    </thead>
    <tbody>
      ${data.rounds.map((r) => {
        const badge = statusBadge(r.state);
        const payout = data.payouts.find((p) => p.round === r.index);
        return `
        <tr>
          <td><strong>${r.index}</strong></td>
          <td>${formatDateShort(r.date)}${payout ? ' <span class="badge-status badge-advance">Reçoit la main</span>' : ''}</td>
          <td style="text-align: center;">${r.paidHands} / ${r.dueHands}</td>
          <td style="text-align: center;"><span class="badge-status ${badge.cls}">${badge.label}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  ${
    data.payouts.length
      ? `<div class="section-title">Remise de la main</div>
  <table class="table-clean">
    <tbody>
      ${data.payouts.map((p) => `
        <tr>
          <td>Tour ${p.round} · prévue le <strong>${formatDateShort(p.date)}</strong></td>
          <td style="text-align: right;">${p.receivedOn ? `<span class="badge-status badge-paid">Reçue le ${formatDateShort(p.receivedOn)}</span>` : '<span class="badge-status badge-muted">À venir</span>'}</td>
        </tr>`).join('')}
    </tbody>
  </table>`
      : ''
  }

  ${
    data.operations.length
      ? `<div class="section-title">Opérations du cycle</div>
  <table class="table-clean">
    <thead><tr><th>Date</th><th>Opération</th><th style="text-align: center;">Mains</th><th style="text-align: right;">Montant</th><th>Réf.</th></tr></thead>
    <tbody>
      ${data.operations.map((o) => `
        <tr style="${o.reversed ? 'color: #6B7385; text-decoration: line-through;' : ''}">
          <td>${formatDateShort(o.date)}</td>
          <td>${esc(o.label)}</td>
          <td style="text-align: center;">${o.hands || ''}</td>
          <td style="text-align: right; font-weight: 800;">${formatCurrency(o.amount)}</td>
          <td style="font-family: monospace; font-size: 9px;">${esc(o.ref)}</td>
        </tr>`).join('')}
    </tbody>
  </table>`
      : ''
  }

  <div class="security-seal">
    <div class="barcode-wrapper">${barcodeSvg}</div>
    <div style="font-size: 9.5px; font-weight: 700;">${esc(data.qrCodeToken)} • ${esc(data.collectorName)} ${esc(data.collectorPhone)}</div>
  </div>
${receiptNoteHtml()}
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Shares or opens native print dialog for a generated PDF file.
 *
 * Android PDFs are handled directly in renderHtmlDocument (printAsync({ html }))
 * so this function is a no-op for Android sentinels.
 * iOS uses file-based sharing via expo-sharing.
 */
export async function sharePdfFile(pdfUri: string, dialogTitle: string = 'Partager le document PDF'): Promise<void> {
  // Sentinels: print was already triggered upstream — nothing left to do.
  if (
    pdfUri === 'web-printed' ||
    pdfUri === 'android-printed' ||
    pdfUri === 'fallback-printed'
  ) {
    return;
  }

  if (Platform.OS === 'web') {
    if (pdfUri.startsWith('http') || pdfUri.startsWith('blob:') || pdfUri.startsWith('data:')) {
      window.open(pdfUri, '_blank');
    }
    return;
  }

  // iOS: share the generated file via the native share sheet.
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      await Print.printAsync({ uri: pdfUri });
      return;
    }
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.warn('[PDF] shareAsync failed, falling back to printAsync:', error);
    try {
      await Print.printAsync({ uri: pdfUri });
    } catch (printErr) {
      console.error('[PDF] printAsync fallback failed:', printErr);
    }
  }
}
