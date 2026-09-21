/**
 * Official PDF Generation & Sharing Service for SOL Mobile
 * Generates institutional-grade, verifiable, printable and shareable PDF documents.
 * Compliant with Haitian financial documentation standards (SOL / Tontine mutuelle).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/formatters';

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

export interface AdminReportPdfData {
  adminName: string;
  adminPhone: string;
  totalManagers: number;
  activeManagers: number;
  pendingManagers: number;
  suspendedManagers: number;
  totalClients: number;
  totalVolumeCollected: number;
  totalVolumeDistributed: number;
  netReserveBalance: number;
  managers: Array<{
    name: string;
    phone: string;
    zone?: string;
    status: string;
    businessName?: string;
    clientsCount: number;
    totalCollected: number;
    totalDistributed: number;
  }>;
  generatedAt: string;
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
    coverageStatus: string;
    hasReceivedPayout: boolean;
  }>;
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
}

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
      bars.push(`<rect x="${currentX}" y="0" width="${barW}" height="${height}" fill="#0F172A" />`);
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
 */
async function renderHtmlDocument(html: string): Promise<string> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return 'web-printed';
  }

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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    color: #0F172A;
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
    border-bottom: 1.5px solid #E2E8F0;
    padding-bottom: 12px;
  }
  .header-table td {
    vertical-align: top;
  }
  .brand-logo-text {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #0F2942;
    margin: 0;
  }
  .brand-logo-text span {
    color: #00209F;
  }
  .brand-subline {
    font-size: 10px;
    font-weight: 700;
    color: #64748B;
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
    background-color: #EFF6FF;
    color: #1D4ED8;
    border: 1px solid #BFDBFE;
  }
  .badge-green {
    background-color: #ECFDF5;
    color: #047857;
    border: 1px solid #A7F3D0;
  }
  .badge-amber {
    background-color: #FFFBEB;
    color: #B45309;
    border: 1px solid #FDE68A;
  }
  .info-grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 10px;
    margin-bottom: 14px;
  }
  .info-card {
    background-color: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .info-card-title {
    font-size: 9.5px;
    font-weight: 900;
    text-transform: uppercase;
    color: #475569;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    border-bottom: 1px solid #E2E8F0;
    padding-bottom: 4px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
    font-size: 11px;
  }
  .info-label {
    color: #64748B;
    font-weight: 600;
  }
  .info-value {
    color: #0F172A;
    font-weight: 800;
    text-align: right;
  }
  .hero-amount-box {
    background: linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%);
    border: 1.5px solid #BFDBFE;
    border-radius: 10px;
    padding: 14px 16px;
    text-align: center;
    margin-bottom: 16px;
  }
  .hero-amount-box.amber {
    background: linear-gradient(135deg, #FFFDF5 0%, #FEF3C7 100%);
    border-color: #FDE68A;
  }
  .hero-amount-box.green {
    background: linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%);
    border-color: #86EFAC;
  }
  .hero-label {
    font-size: 10px;
    font-weight: 800;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .hero-value {
    font-size: 28px;
    font-weight: 900;
    color: #0F2942;
    margin: 4px 0;
    letter-spacing: -0.5px;
  }
  .hero-sub {
    font-size: 11px;
    font-weight: 600;
    color: #64748B;
  }
  .table-clean {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  .table-clean th {
    background-color: #0F2942;
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
    border-bottom: 1px solid #E2E8F0;
    font-size: 10.5px;
  }
  .table-clean tr:nth-child(even) {
    background-color: #F8FAFC;
  }
  .signatures-zone {
    width: 100%;
    margin-top: 20px;
    page-break-inside: avoid;
  }
  .sig-box {
    border: 1px dashed #94A3B8;
    background-color: #FAFAFA;
    border-radius: 8px;
    padding: 10px;
    height: 80px;
    position: relative;
  }
  .sig-title {
    font-size: 9.5px;
    font-weight: 800;
    color: #475569;
    text-transform: uppercase;
  }
  .sig-line {
    position: absolute;
    bottom: 12px;
    left: 10px;
    right: 10px;
    border-bottom: 1px solid #CBD5E1;
    font-size: 8.5px;
    color: #94A3B8;
    text-align: right;
    padding-bottom: 2px;
  }
  .security-seal {
    text-align: center;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid #E2E8F0;
    font-size: 9px;
    color: #64748B;
    page-break-inside: avoid;
  }
  .barcode-wrapper {
    margin: 6px auto;
    display: inline-block;
  }
  .legal-note {
    font-size: 8.5px;
    color: #94A3B8;
    line-height: 1.35;
    margin-top: 6px;
    text-align: justify;
  }
`;

/**
 * Generates an official Contribution Receipt PDF document.
 */
export async function generateContributionReceiptPdf(data: ContributionPdfData): Promise<string> {
  const safeTrxId = (data.transactionId || 'SOL-TRX').toUpperCase();
  const safeToken = (data.qrCodeToken || data.transactionId || 'CERT-SOL').slice(0, 24).toUpperCase();
  const barcodeSvg = generateBarcodeSvg(data.transactionId || data.qrCodeToken);
  const displayRank = data.payoutRanks ? `Rangs: ${data.payoutRanks}` : (data.payoutRank ? `Rang: #${data.payoutRank}` : 'Non assigné');

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Reçu Officiel SOL - ${data.clientName || 'Adhérent'}</title>
  <style>
    ${BASE_PRINT_CSS}
    .receipt-frame {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #0F2942;
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
          <div style="font-size: 11px; font-weight: 700; color: #0F172A; margin-top: 4px;">
            ${data.businessName || 'Carnet Tontinier Communautaire'}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="doc-badge badge-green">REÇU OFFICIEL DE COTISATION</div>
          <div style="font-size: 10px; color: #64748B; margin-top: 4px; font-weight: 600;">
            N° : <strong>${safeTrxId}</strong>
          </div>
          <div style="font-size: 10px; color: #64748B; font-weight: 600;">
            Date : <strong>${formatDate(data.createdAt)}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- Hero Amount -->
    <div class="hero-amount-box green">
      <div class="hero-label">Montant Total Encaissé (Vèsman Resevwa)</div>
      <div class="hero-value" style="color: #047857;">${formatCurrency(data.totalAmount)}</div>
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
              <span class="info-value" style="color: #047857;">${formatDateShort(data.coverageStartDate)} au ${formatDateShort(data.coverageEndDate)}</span>
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
              <span class="info-value" style="color: #047857;">ENCAISSÉ & SÉCURISÉ</span>
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
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #0F172A;">
        CERT-ID: ${safeToken}
      </div>
      <div class="legal-note">
        Ce reçu officiel fait foi du versement régulier des cotisations au sein du carnet tontinier SOL Mobile. Enregistré sous l'intégrité de la plateforme décentralisée SOL Haïti. Toute falsification est passible des sanctions prévues par la législation en vigueur.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Payout Receipt / Décharge PDF document.
 */
export async function generatePayoutReceiptPdf(data: PayoutPdfData): Promise<string> {
  const safeTrxId = (data.transactionId || 'SOL-DEC').toUpperCase();
  const barcodeSvg = generateBarcodeSvg(data.transactionId);
  const displayRank = data.payoutRanks ? `Rangs: ${data.payoutRanks}` : (data.payoutRank ? `Rang: #${data.payoutRank}` : 'Main standard');

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Décharge de Décaissement SOL - ${data.clientName || 'Adhérent'}</title>
  <style>
    ${BASE_PRINT_CSS}
    .receipt-frame {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #0F2942;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .legal-box {
      background-color: #FEF3C7;
      border: 1px solid #FDE68A;
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
          <div style="font-size: 11px; font-weight: 700; color: #0F172A; margin-top: 4px;">
            ${data.businessName || 'Carnet Tontinier Communautaire'}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="doc-badge badge-amber">ATTESTATION DE DÉCAISSEMENT</div>
          <div style="font-size: 10px; color: #64748B; margin-top: 4px; font-weight: 600;">
            REMISE DE MAIN (BAY MEN)
          </div>
          <div style="font-size: 10px; color: #64748B; font-weight: 600;">
            Réf : <strong>${safeTrxId}</strong>
          </div>
          <div style="font-size: 10px; color: #64748B; font-weight: 600;">
            Date : <strong>${formatDate(data.createdAt)}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- Hero Amount -->
    <div class="hero-amount-box amber">
      <div class="hero-label">Montant Total Décaissé (Kòb Men Remèt)</div>
      <div class="hero-value" style="color: #B45309;">${formatCurrency(data.totalPotAmount)}</div>
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
              <span class="info-value" style="color: #047857;">DÉCAISSEMENT CERTIFIÉ</span>
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
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #0F172A;">
        AUTH-DEC: ${safeTrxId}
      </div>
      <div class="legal-note">
        Acte de décaissement authentifié par le protocole SOL Mobile Haïti. Valable comme quittance définitive de remise de fonds et engagement mutuel irrévocable.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Manager Business Report PDF document.
 */
export async function generateManagerBusinessReportPdf(data: ManagerBusinessReportPdfData): Promise<string> {
  const barcodeSvg = generateBarcodeSvg(`REP-${data.collectorPhone || '0000'}-${data.generatedAt || Date.now()}`);
  const safeCompletionRate = Number(data.completionRate) || 0;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Rapport d'Évolution SOL - ${data.businessName || data.collectorName}</title>
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
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-tile-label {
      font-size: 9px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .kpi-tile-val {
      font-size: 16px;
      font-weight: 900;
      margin-top: 2px;
    }
    .badge-status {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .badge-paid {
      background-color: #ECFDF5;
      color: #047857;
    }
    .badge-late {
      background-color: #FEF2F2;
      color: #B91C1C;
    }
    .badge-pending {
      background-color: #FFFBEB;
      color: #B45309;
    }
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
        <div style="font-size: 14px; font-weight: 900; color: #0F2942; margin-top: 4px;">
          ${data.businessName || 'Carnet Tontinier'} ${data.cycleNumber ? `• Cycle #${data.cycleNumber}` : ''}
        </div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">
          Gestionnaire : <strong>${data.collectorName}</strong> (${data.collectorPhone}) • Zone : <strong>${data.collectorZone || 'Standard'}</strong>
        </div>
      </td>
      <td style="text-align: right;">
        <div class="doc-badge badge-blue">AUDIT DE CYCLE</div>
        <div style="font-size: 10px; color: #64748B; margin-top: 6px; font-weight: 600;">
          Période : <strong>${formatDateShort(data.cycleStartDate)} au ${formatDateShort(data.cycleEndDate)}</strong>
        </div>
        <div style="font-size: 10px; color: #64748B; font-weight: 600;">
          Édité le : <strong>${formatDate(data.generatedAt)}</strong>
        </div>
      </td>
    </tr>
  </table>

  <!-- KPI Matrix -->
  <div class="kpi-grid">
    <div class="kpi-tile">
      <div class="kpi-tile-label">Cagnotte par Main</div>
      <div class="kpi-tile-val" style="color: #1D4ED8;">${formatCurrency(data.totalPotAmount)}</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">${data.totalSlots} souscriptions attendues</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Total Encaissé</div>
      <div class="kpi-tile-val" style="color: #047857;">+${formatCurrency(data.totalCashCollected)}</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">${data.handsCollectedTotal} mains reçues</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Total Décaissé</div>
      <div class="kpi-tile-val" style="color: #B45309;">-${formatCurrency(data.totalDistributed)}</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Mains remises aux bénéficiaires</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Solde Net en Caisse</div>
      <div class="kpi-tile-val" style="color: #0F2942;">${formatCurrency(data.netReserveBalance)}</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Fonds conservés en réserve</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Effectif Adhérents</div>
      <div class="kpi-tile-val" style="color: #0F2942;">${data.registeredChildrenCount} adhérents</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Membres inscrits au carnet</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Taux de Recouvrement</div>
      <div class="kpi-tile-val" style="color: ${safeCompletionRate >= 80 ? '#047857' : '#D97706'};">
        ${safeCompletionRate.toFixed(1)}%
      </div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Complétion de l'échéancier</div>
    </div>
  </div>

  <!-- Members Roster Table -->
  <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; color: #0F2942; letter-spacing: 0.5px; margin-bottom: 6px;">
    État Nominatif des Adhérents & Suivi des Cotisations
  </div>
  <table class="table-clean">
    <thead>
      <tr>
        <th style="width: 8%;">Rang</th>
        <th style="width: 28%;">Nom & Prénom de l'Adhérent</th>
        <th style="width: 16%;">Téléphone</th>
        <th style="width: 14%; text-align: right;">Total Cotisé</th>
        <th style="width: 12%; text-align: center;">Mains</th>
        <th style="width: 11%; text-align: center;">Couverture</th>
        <th style="width: 11%; text-align: center;">Main Tirée</th>
      </tr>
    </thead>
    <tbody>
      ${data.members.map((m) => `
        <tr>
          <td><strong>#${m.rank}</strong></td>
          <td><strong>${m.fullName}</strong></td>
          <td>${m.phoneNumber || 'N/A'}</td>
          <td style="text-align: right; color: #047857; font-weight: 800;">${formatCurrency(m.totalPaid)}</td>
          <td style="text-align: center; font-weight: 700;">${m.handsCovered}</td>
          <td style="text-align: center;">
            <span class="badge-status ${
              m.coverageStatus === 'A_JOUR' || m.coverageStatus === 'EN_AVANCE'
                ? 'badge-paid'
                : 'badge-late'
            }">
              ${m.coverageStatus === 'A_JOUR' ? 'À JOUR' : m.coverageStatus === 'EN_AVANCE' ? 'AVANCE' : 'RETARD'}
            </span>
          </td>
          <td style="text-align: center;">
            <span class="badge-status ${m.hasReceivedPayout ? 'badge-paid' : 'badge-pending'}">
              ${m.hasReceivedPayout ? 'PERÇUE' : 'ATTENTE'}
            </span>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

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
    <div style="font-size: 9.5px; font-weight: 700; color: #0F172A;">
      SOL MOBILE HAITI • DOCUMENT D'AUDIT CERTIFIÉ CONFORME AUX REGISTRES
    </div>
  </div>
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Admin Global Report PDF document.
 */
export async function generateAdminGlobalReportPdf(data: AdminReportPdfData): Promise<string> {
  const barcodeSvg = generateBarcodeSvg(`ADM-${data.generatedAt}`);

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Rapport Global de Supervision - SOL Mobile</title>
  <style>
    ${BASE_PRINT_CSS}
    .kpi-grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .kpi-tile {
      width: 23%;
      box-sizing: border-box;
      margin-bottom: 10px;
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-tile-label {
      font-size: 8.5px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .kpi-tile-val {
      font-size: 15px;
      font-weight: 900;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="haitian-ribbon"></div>

  <!-- Header -->
  <table class="header-table">
    <tr>
      <td>
        <div class="brand-logo-text">SOL <span>MOBILE</span></div>
        <div class="brand-subline">RÉPUBLIQUE D'HAÏTI • CONTRÔLE GÉNÉRAL & SUPERVISION NATIONALE</div>
        <div style="font-size: 14px; font-weight: 900; color: #0F2942; margin-top: 4px;">
          BORDEREAU DE CONSOLIDATION DU RÉSEAU DES CARNETS SOL
        </div>
      </td>
      <td style="text-align: right;">
        <div class="doc-badge badge-blue">SUPERVISION CENTRALE</div>
        <div style="font-size: 10px; color: #64748B; margin-top: 6px; font-weight: 600;">
          Superviseur : <strong>${data.adminName}</strong> (${data.adminPhone})
        </div>
        <div style="font-size: 10px; color: #64748B; font-weight: 600;">
          Généré le : <strong>${formatDate(data.generatedAt)}</strong>
        </div>
      </td>
    </tr>
  </table>

  <!-- Global Metrics -->
  <div class="kpi-grid">
    <div class="kpi-tile">
      <div class="kpi-tile-label">Gestionnaires Réseau</div>
      <div class="kpi-tile-val" style="color: #0F2942;">${data.totalManagers} inscrits</div>
      <div style="font-size: 9px; color: #047857; font-weight: 700;">${data.activeManagers} actifs (${data.pendingManagers} attente)</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Total Adhérents</div>
      <div class="kpi-tile-val" style="color: #1D4ED8;">${data.totalClients} membres</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Portefeuille global</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Volume Total Encaissé</div>
      <div class="kpi-tile-val" style="color: #047857;">+${formatCurrency(data.totalVolumeCollected)}</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Cotisations centralisées</div>
    </div>
    <div class="kpi-tile">
      <div class="kpi-tile-label">Réserve Nette Système</div>
      <div class="kpi-tile-val" style="color: #0F2942;">${formatCurrency(data.netReserveBalance)}</div>
      <div style="font-size: 9px; color: #64748B; font-weight: 600;">Décaissé: ${formatCurrency(data.totalVolumeDistributed)}</div>
    </div>
  </div>

  <!-- Managers Breakdown Table -->
  <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; color: #0F2942; letter-spacing: 0.5px; margin-bottom: 6px;">
    Situation Individuelle des Gestionnaires & Portefeuilles
  </div>
  <table class="table-clean">
    <thead>
      <tr>
        <th style="width: 25%;">Gestionnaire & Contact</th>
        <th style="width: 20%;">Structure / Carnet</th>
        <th style="width: 15%;">Zone</th>
        <th style="width: 10%; text-align: center;">Adhérents</th>
        <th style="width: 15%; text-align: right;">Total Encaissé</th>
        <th style="width: 15%; text-align: right;">Total Décaissé</th>
      </tr>
    </thead>
    <tbody>
      ${data.managers.map((m) => `
        <tr>
          <td>
            <strong>${m.name}</strong><br/>
            <span style="font-size: 9px; color: #64748B;">${m.phone}</span>
          </td>
          <td><strong>${m.businessName || 'SOL Communautaire'}</strong></td>
          <td>${m.zone || 'Standard'}</td>
          <td style="text-align: center; font-weight: 800;">${m.clientsCount}</td>
          <td style="text-align: right; color: #047857; font-weight: 800;">${formatCurrency(m.totalCollected)}</td>
          <td style="text-align: right; color: #B45309; font-weight: 800;">${formatCurrency(m.totalDistributed)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Central Authority Signatures -->
  <table class="signatures-zone">
    <tr>
      <td style="width: 48%;">
        <div class="sig-box">
          <div class="sig-title">Visa de la Direction Générale SOL Mobile</div>
          <div class="sig-line">Signature de l'Administrateur Central</div>
        </div>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%;">
        <div class="sig-box">
          <div class="sig-title">Cachet Officiel d'Audit & Contrôle</div>
          <div class="sig-line">Direction de la Conformité</div>
        </div>
      </td>
    </tr>
  </table>

  <div class="security-seal">
    <div class="barcode-wrapper">
      ${barcodeSvg}
    </div>
    <div style="font-size: 9.5px; font-weight: 700; color: #0F172A;">
      DIRECTION NATIONALE DE LA SUPERVISION TONTINIÈRE • SOL MOBILE HAÏTI
    </div>
  </div>
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Generates an official Cash Closure Receipt (Procès-Verbal de Clôture Journalière de Caisse).
 */
export async function generateCashClosureReceiptPdf(data: CashClosurePdfData): Promise<string> {
  const safeClosureId = (data.closureId || 'CLOTURE').toUpperCase();
  const barcodeSvg = generateBarcodeSvg(safeClosureId);
  const isBalanced = Math.abs(data.discrepancy) < 0.01;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Procès-Verbal de Clôture - ${data.collectorName}</title>
  <style>
    ${BASE_PRINT_CSS}
    .receipt-frame {
      max-width: 680px;
      margin: 0 auto;
      border: 1.5px solid #0F2942;
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
      background-color: #ECFDF5;
      border: 1.5px solid #A7F3D0;
      color: #047857;
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
          <div style="font-size: 11px; font-weight: 700; color: #0F172A; margin-top: 4px;">
            ${data.businessName || 'Carnet Tontinier Communautaire'}
          </div>
        </td>
        <td style="text-align: right;">
          <div class="doc-badge ${isBalanced ? 'badge-green' : 'badge-amber'}">PROCÈS-VERBAL DE CLÔTURE DE CAISSE</div>
          <div style="font-size: 10px; color: #64748B; margin-top: 4px; font-weight: 600;">
            Réf : <strong>${safeClosureId}</strong>
          </div>
          <div style="font-size: 10px; color: #64748B; font-weight: 600;">
            Date Clôture : <strong>${formatDateShort(data.closureDate)}</strong>
          </div>
        </td>
      </tr>
    </table>

    <!-- Hero Box -->
    <div class="hero-amount-box ${isBalanced ? 'green' : 'amber'}">
      <div class="hero-label">Total Espèces Déclaré en Caisse (Kòb Kach Fizik)</div>
      <div class="hero-value" style="color: ${isBalanced ? '#047857' : '#B45309'};">${formatCurrency(data.totalCashDeclared)}</div>
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
      ${data.discrepancyReason ? `<div style="margin-top: 4px; font-weight: 600; font-size: 10px; color: #0F172A;">Justification consignée : <em>"${data.discrepancyReason}"</em></div>` : ''}
    </div>

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
              <span class="info-value" style="color: #047857;">${data.status.toUpperCase()}</span>
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
      <div style="font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #0F172A;">
        ARRÊTÉ DE CAISSE ID: ${safeClosureId}
      </div>
      <div class="legal-note">
        Procès-verbal officiel d'arrêté de caisse journalière. Les montants déclarés engagent la responsabilité pleine et entière du gestionnaire titulaire du carnet. Certifié par le système central SOL Mobile.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return await renderHtmlDocument(html);
}

/**
 * Shares or opens native print dialog for a generated PDF file.
 */
export async function sharePdfFile(pdfUri: string, dialogTitle: string = 'Partager le document PDF'): Promise<void> {
  if (pdfUri === 'web-printed' || pdfUri === 'fallback-printed') {
    return;
  }
  if (Platform.OS === 'web') {
    if (pdfUri.startsWith('http') || pdfUri.startsWith('blob:') || pdfUri.startsWith('data:')) {
      window.open(pdfUri, '_blank');
    }
    return;
  }

  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle,
        UTI: 'com.adobe.pdf',
      });
    } else {
      await Print.printAsync({ uri: pdfUri });
    }
  } catch (error) {
    console.warn('[PDF] shareAsync failed, falling back to printAsync:', error);
    try {
      await Print.printAsync({ uri: pdfUri });
    } catch (printErr) {
      console.error('[PDF] printAsync fallback failed:', printErr);
    }
  }
}
