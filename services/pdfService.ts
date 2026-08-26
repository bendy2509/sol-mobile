/**
 * Official PDF Generation & Sharing Service for SOL Mobile
 * Generates branded, verifiable, printable and shareable PDF documents.
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

/**
 * Generates an official Contribution Receipt PDF document.
 */
export async function generateContributionReceiptPdf(data: ContributionPdfData): Promise<string> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reçu SOL - ${data.clientName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 30px;
      color: #0F172A;
      background-color: #FFFFFF;
    }
    .receipt-container {
      max-width: 550px;
      margin: 0 auto;
      border: 2px solid #0F172A;
      border-radius: 12px;
      padding: 24px;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #CBD5E1;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 900;
      color: #1D4ED8;
      letter-spacing: 2px;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .doc-type {
      font-size: 14px;
      font-weight: 900;
      background-color: #EFF6FF;
      color: #1D4ED8;
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      margin-top: 8px;
      border: 1px solid #BFDBFE;
    }
    .section-title {
      font-size: 10px;
      font-weight: 900;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 14px;
      margin-bottom: 6px;
      border-bottom: 1px solid #F1F5F9;
      padding-bottom: 3px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .label {
      color: #64748B;
      font-weight: 600;
    }
    .value {
      font-weight: 800;
      color: #0F172A;
    }
    .highlight-card {
      background-color: #ECFDF5;
      border: 1.5px solid #A7F3D0;
      border-radius: 10px;
      padding: 12px 16px;
      margin: 16px 0;
      text-align: center;
    }
    .amount-label {
      font-size: 10px;
      font-weight: 900;
      color: #065F46;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .amount-value {
      font-size: 28px;
      font-weight: 900;
      color: #059669;
      margin: 4px 0;
    }
    .formula-pill {
      font-size: 12px;
      font-weight: 700;
      color: #047857;
    }
    .coverage-box {
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }
    .footer {
      border-top: 2px dashed #CBD5E1;
      padding-top: 14px;
      margin-top: 16px;
      text-align: center;
      font-size: 10px;
      color: #94A3B8;
      font-weight: 600;
    }
    .qr-badge {
      font-family: monospace;
      font-size: 12px;
      font-weight: 800;
      background-color: #F1F5F9;
      padding: 4px 8px;
      border-radius: 6px;
      color: #0F172A;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div class="brand-title">SOL MOBILE</div>
      <div class="brand-sub">Sistèm Epany & Tontin Dijital Ayiti</div>
      <div class="doc-type">REÇU OFFICIEL D'ENCAISSEMENT</div>
    </div>

    <div class="section-title">Informations du Carnet & Gestionnaire</div>
    <div class="info-row">
      <span class="label">Activité / Carnet :</span>
      <span class="value">${data.businessName}</span>
    </div>
    <div class="info-row">
      <span class="label">Responsable :</span>
      <span class="value">${data.collectorName} (${data.collectorPhone})</span>
    </div>
    ${data.collectorZone ? `
    <div class="info-row">
      <span class="label">Zone / Marché :</span>
      <span class="value">${data.collectorZone}</span>
    </div>` : ''}

    <div class="section-title">Informations de l'Adhérent ("Enfant")</div>
    <div class="info-row">
      <span class="label">Nom complet :</span>
      <span class="value">${data.clientName}</span>
    </div>
    <div class="info-row">
      <span class="label">Numéro Téléphone :</span>
      <span class="value">${data.clientPhone}</span>
    </div>
    <div class="info-row">
      <span class="label">Position / Rang :</span>
      <span class="value">${data.payoutRank ? `Main #${data.payoutRank}` : 'Adhérent standard'}</span>
    </div>
    <div class="info-row">
      <span class="label">Identifiant Unique :</span>
      <span class="qr-badge">${data.qrCodeToken}</span>
    </div>

    <!-- Highlighted Amount Card -->
    <div class="highlight-card">
      <div class="amount-label">Montant Total Encaissé</div>
      <div class="amount-value">${formatCurrency(data.totalAmount)}</div>
      <div class="formula-pill">${data.handsCount} main(s) × ${formatCurrency(data.unitAmount)} / main</div>
    </div>

    <div class="section-title">Couverture de la Cotisation</div>
    <div class="coverage-box">
      <div class="info-row">
        <span class="label">Période couverte :</span>
        <span class="value">Du ${formatDateShort(data.coverageStartDate)} au ${formatDateShort(data.coverageEndDate)}</span>
      </div>
      <div class="info-row">
        <span class="label">Nombre d'échéances :</span>
        <span class="value">${data.handsCount} main(s) validée(s)</span>
      </div>
    </div>

    <div class="footer">
      <div>Réf Opération : #${data.transactionId.replace(/-/g, '').substring(0, 10).toUpperCase()}</div>
      <div>Certifié conforme le ${formatDate(data.createdAt)} via la plateforme sécurisée SOL.</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

/**
 * Generates an official Payout / Disbursement ("Bay Men") PDF document.
 */
export async function generatePayoutReceiptPdf(data: PayoutPdfData): Promise<string> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reçu Décaissement - ${data.clientName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 30px;
      color: #0F172A;
      background-color: #FFFFFF;
    }
    .receipt-container {
      max-width: 550px;
      margin: 0 auto;
      border: 2px solid #065F46;
      border-radius: 12px;
      padding: 24px;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #CBD5E1;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 900;
      color: #059669;
      letter-spacing: 2px;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .doc-type {
      font-size: 14px;
      font-weight: 900;
      background-color: #ECFDF5;
      color: #065F46;
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      margin-top: 8px;
      border: 1px solid #A7F3D0;
    }
    .section-title {
      font-size: 10px;
      font-weight: 900;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 14px;
      margin-bottom: 6px;
      border-bottom: 1px solid #F1F5F9;
      padding-bottom: 3px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .label {
      color: #64748B;
      font-weight: 600;
    }
    .value {
      font-weight: 800;
      color: #0F172A;
    }
    .highlight-card {
      background-color: #ECFDF5;
      border: 2px solid #059669;
      border-radius: 10px;
      padding: 14px 16px;
      margin: 16px 0;
      text-align: center;
    }
    .amount-label {
      font-size: 10px;
      font-weight: 900;
      color: #065F46;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .amount-value {
      font-size: 30px;
      font-weight: 900;
      color: #059669;
      margin: 4px 0;
    }
    .formula-pill {
      font-size: 12px;
      font-weight: 700;
      color: #047857;
    }
    .footer {
      border-top: 2px dashed #CBD5E1;
      padding-top: 14px;
      margin-top: 16px;
      text-align: center;
      font-size: 10px;
      color: #94A3B8;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div class="brand-title">SOL MOBILE</div>
      <div class="brand-sub">Sistèm Epany & Tontin Dijital Ayiti</div>
      <div class="doc-type">ATTESTATION DE DÉCAISSEMENT ("REMISE DE MAIN")</div>
    </div>

    <div class="section-title">Informations du Carnet & Gestionnaire</div>
    <div class="info-row">
      <span class="label">Activité :</span>
      <span class="value">${data.businessName}</span>
    </div>
    <div class="info-row">
      <span class="label">Responsable :</span>
      <span class="value">${data.collectorName} (${data.collectorPhone})</span>
    </div>

    <div class="section-title">Bénéficiaire de la Main</div>
    <div class="info-row">
      <span class="label">Nom complet :</span>
      <span class="value">${data.clientName}</span>
    </div>
    <div class="info-row">
      <span class="label">Numéro Téléphone :</span>
      <span class="value">${data.clientPhone}</span>
    </div>
    <div class="info-row">
      <span class="label">Numéro de la Main :</span>
      <span class="value">${data.payoutRank ? `Main #${data.payoutRank}` : 'Main attribuée'}</span>
    </div>

    <!-- Highlighted Amount Card -->
    <div class="highlight-card">
      <div class="amount-label">Montant Total de la Cagnotte Décaissée</div>
      <div class="amount-value">${formatCurrency(data.totalPotAmount)}</div>
      <div class="formula-pill">Calculée sur ${data.registeredChildrenCount} enfants inscrits × ${formatCurrency(data.unitAmount)}</div>
    </div>

    ${data.note ? `
    <div class="section-title">Motif & Justification</div>
    <div style="font-size: 12px; font-weight: 600; color: #475569; padding: 6px 0;">
      ${data.note}
    </div>` : ''}

    <div class="footer">
      <div>Réf Transaction : #${data.transactionId.replace(/-/g, '').substring(0, 10).toUpperCase()}</div>
      <div>Main décaissée et certifiée le ${formatDate(data.createdAt)} via SOL.</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

/**
 * Generates an Administrator Global Platform Financial Report PDF.
 */
export async function generateAdminGlobalReportPdf(data: AdminReportPdfData): Promise<string> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rapport Global SOL Plateforme</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #0F172A;
      background-color: #FFFFFF;
    }
    .header {
      border-bottom: 3px solid #1D4ED8;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 24px;
      font-weight: 900;
      color: #1D4ED8;
      margin: 0;
    }
    .subtitle {
      font-size: 12px;
      color: #64748B;
      font-weight: 600;
      margin-top: 4px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background-color: #F8FAFC;
      border: 1.5px solid #E2E8F0;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }
    .kpi-label {
      font-size: 9px;
      font-weight: 900;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: 900;
      color: #0F172A;
      margin-top: 4px;
    }
    .kpi-green { color: #059669; }
    .kpi-blue { color: #1D4ED8; }
    .kpi-amber { color: #D97706; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 11px;
    }
    th {
      background-color: #0F172A;
      color: #FFFFFF;
      text-align: left;
      padding: 8px 10px;
      font-weight: 800;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #E2E8F0;
    }
    tr:nth-child(even) {
      background-color: #F8FAFC;
    }
    .status-badge {
      font-size: 9px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .status-active { background-color: #ECFDF5; color: #047857; }
    .status-pending { background-color: #FFFBEB; color: #B45309; }
    .status-suspended { background-color: #FEF2F2; color: #DC2626; }
    .footer {
      margin-top: 30px;
      border-top: 1px solid #E2E8F0;
      padding-top: 12px;
      text-align: center;
      font-size: 10px;
      color: #94A3B8;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">SOL - RAPPORT GLOBAL DE SUPERVISION</div>
    <div class="subtitle">Généré par ${data.adminName} (${data.adminPhone}) • Le ${formatDate(data.generatedAt)}</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Responsables Totaux</div>
      <div class="kpi-value kpi-blue">${data.totalManagers} (${data.activeManagers} Actifs)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Adhérents</div>
      <div class="kpi-value">${data.totalClients} enfants</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Solde Net Global</div>
      <div class="kpi-value kpi-green">${formatCurrency(data.netReserveBalance)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Volume Total Encaissé</div>
      <div class="kpi-value kpi-green">${formatCurrency(data.totalVolumeCollected)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Volume Total Décaissé</div>
      <div class="kpi-value kpi-amber">${formatCurrency(data.totalVolumeDistributed)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">En Attente / Suspendus</div>
      <div class="kpi-value">${data.pendingManagers} att. / ${data.suspendedManagers} susp.</div>
    </div>
  </div>

  <h3 style="font-size: 14px; font-weight: 900; margin-bottom: 6px;">État des Responsables & Carnets</h3>
  <table>
    <thead>
      <tr>
        <th>Responsable</th>
        <th>Téléphone / Zone</th>
        <th>Carnet</th>
        <th>Enfants</th>
        <th>Encaissé</th>
        <th>Décaissé</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
      ${data.managers
        .map(
          (m) => `
        <tr>
          <td><strong>${m.name}</strong></td>
          <td>${m.phone}${m.zone ? ` (${m.zone})` : ''}</td>
          <td>${m.businessName || 'Non configuré'}</td>
          <td>${m.clientsCount}</td>
          <td style="color: #059669; font-weight: 700;">+${formatCurrency(m.totalCollected)}</td>
          <td style="color: #DC2626; font-weight: 700;">-${formatCurrency(m.totalDistributed)}</td>
          <td>
            <span class="status-badge ${
              m.status === 'ACTIVE'
                ? 'status-active'
                : m.status === 'PENDING_APPROVAL'
                ? 'status-pending'
                : 'status-suspended'
            }">
              ${m.status === 'ACTIVE' ? 'ACTIF' : m.status === 'PENDING_APPROVAL' ? 'EN ATTENTE' : 'SUSPENDU'}
            </span>
          </td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    Rapport certifié édité via SOL Mobile Management Module • Document confidentiel d'administration.
  </div>
</body>
</html>
  `.trim();

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

/**
 * Generates an official Business Evolution & Performance Report PDF for a Manager.
 */
export async function generateManagerBusinessReportPdf(data: ManagerBusinessReportPdfData): Promise<string> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rapport Évolution SOL - ${data.businessName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #0F172A;
      background-color: #FFFFFF;
    }
    .header {
      border-bottom: 3px solid #1D4ED8;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #1D4ED8;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      color: #64748B;
      font-weight: 700;
      margin-top: 3px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .kpi-card {
      background-color: #F8FAFC;
      border: 1.5px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .kpi-label {
      font-size: 8px;
      font-weight: 900;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .kpi-value {
      font-size: 16px;
      font-weight: 900;
      color: #0F172A;
      margin-top: 3px;
    }
    .kpi-green { color: #059669; }
    .kpi-amber { color: #D97706; }
    .kpi-blue { color: #1D4ED8; }
    .section-title {
      font-size: 12px;
      font-weight: 900;
      color: #0F172A;
      margin-top: 14px;
      margin-bottom: 6px;
      border-bottom: 1px solid #E2E8F0;
      padding-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-top: 6px;
    }
    th {
      background-color: #1E293B;
      color: #FFFFFF;
      text-align: left;
      padding: 6px 8px;
      font-weight: 800;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #E2E8F0;
    }
    tr:nth-child(even) {
      background-color: #F8FAFC;
    }
    .badge {
      font-size: 8px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    .badge-paid { background-color: #ECFDF5; color: #047857; }
    .badge-pending { background-color: #FFFBEB; color: #B45309; }
    .badge-late { background-color: #FEF2F2; color: #DC2626; }
    .footer {
      margin-top: 24px;
      border-top: 1px solid #E2E8F0;
      padding-top: 10px;
      text-align: center;
      font-size: 9px;
      color: #94A3B8;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand-title">RAPPORT D'ÉVOLUTION DU CARNET SOL</div>
    <div class="brand-sub">
      Carnet : <strong>${data.businessName}</strong> • Responsable : <strong>${data.collectorName}</strong> (${data.collectorPhone}${data.collectorZone ? ` - ${data.collectorZone}` : ''}) • Édité le ${formatDate(data.generatedAt)}
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Enfants Inscrits</div>
      <div class="kpi-value kpi-blue">${data.registeredChildrenCount} / ${data.totalSlots}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Cagnotte de la Main</div>
      <div class="kpi-value kpi-blue">${formatCurrency(data.totalPotAmount)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Encaissé</div>
      <div class="kpi-value kpi-green">+${formatCurrency(data.totalCashCollected)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Décaissé (Mains)</div>
      <div class="kpi-value kpi-amber">-${formatCurrency(data.totalDistributed)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Solde en Réserve</div>
      <div class="kpi-value kpi-green">${formatCurrency(data.netReserveBalance)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Mains Collectées</div>
      <div class="kpi-value">${data.handsCollectedTotal} mains</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Cotisation / Main</div>
      <div class="kpi-value">${formatCurrency(data.unitAmount)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Période du Cycle</div>
      <div class="kpi-value" style="font-size: 11px;">${formatDateShort(data.cycleStartDate)} au ${formatDateShort(data.cycleEndDate)}</div>
    </div>
  </div>

  <div class="section-title">État Nominatif des Adhérents ("Enfants")</div>
  <table>
    <thead>
      <tr>
        <th>Rang</th>
        <th>Nom Complet</th>
        <th>Téléphone</th>
        <th>Total Versé</th>
        <th>Mains Couvertes</th>
        <th>Statut Couverture</th>
        <th>Remise de Main</th>
      </tr>
    </thead>
    <tbody>
      ${data.members
        .map(
          (m) => `
        <tr>
          <td><strong>#${m.rank}</strong></td>
          <td><strong>${m.fullName}</strong></td>
          <td>${m.phoneNumber}</td>
          <td style="color: #059669; font-weight: 700;">${formatCurrency(m.totalPaid)}</td>
          <td><strong>${m.handsCovered}</strong> main(s)</td>
          <td>
            <span class="badge ${
              m.coverageStatus === 'A_JOUR'
                ? 'badge-paid'
                : m.coverageStatus === 'EN_AVANCE'
                ? 'badge-paid'
                : 'badge-late'
            }">
              ${m.coverageStatus === 'A_JOUR' ? 'À JOUR' : m.coverageStatus === 'EN_AVANCE' ? 'EN AVANCE' : 'RETARD'}
            </span>
          </td>
          <td>
            <span class="badge ${m.hasReceivedPayout ? 'badge-paid' : 'badge-pending'}">
              ${m.hasReceivedPayout ? 'MAIN PERÇUE' : 'EN ATTENTE'}
            </span>
          </td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    SOL Mobile Haiti • Rapport officiel de performance et de suivi d'activité généré avec succès.
  </div>
</body>
</html>
  `.trim();

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

/**
 * Shares or opens native print dialog for a generated PDF file.
 */
export async function sharePdfFile(pdfUri: string, dialogTitle: string = 'Partager le document PDF'): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(pdfUri, '_blank');
    return;
  }

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
}
