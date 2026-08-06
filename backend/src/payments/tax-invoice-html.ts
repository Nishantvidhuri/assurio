/**
 * Tax-invoice PDF renderer — a 1:1 copy of Recriauth's tax-invoice template
 * (server/src/modules/client/billing-documents/templates/tax-invoice/v1.0.0.hbs).
 * The CSS and DOM structure are copied verbatim; the Handlebars fields are
 * filled from our Invoice. Uses the real company stamp SVG + signature PNG
 * overlay (from frontend/public/assets/logo, embedded in invoice-assets.ts),
 * not a coded box.
 *
 * Fed to PdfService.htmlToPdf(html, { printBackground: true }).
 */
import type { Invoice } from '../../generated/prisma/client';
import { SELLER, DEFAULT_SAC, type SellerDetails } from './seller-config';
import { STAMP_SVG, SIGNATURE_PNG_DATA_URI } from './invoice-assets';
import { ASSURIO_LOGO_DATA_URI } from '../subjects/assurio-logo';

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  total: number;
  hsnSac?: string;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function formatCurrency(n: number): string {
  return (n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatDate(d?: Date | string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function formatDateTime(d?: Date | string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/* Indian-system number → words ("Indian … Rupees Only"). */
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim();
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? ONES[h] + ' Hundred' : '', rest ? twoDigits(rest) : '']
    .filter(Boolean)
    .join(' ');
}
function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Indian Zero Rupees Only';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;
  const parts = [
    crore ? twoDigits(crore) + ' Crore' : '',
    lakh ? twoDigits(lakh) + ' Lakh' : '',
    thousand ? twoDigits(thousand) + ' Thousand' : '',
    hundred ? threeDigits(hundred) : '',
  ].filter(Boolean);
  let words = `Indian ${parts.join(' ')} Rupees`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return words + ' Only';
}

export function renderTaxInvoiceHtml(
  inv: Invoice,
  /** The client being billed (account holder). Defaults to the stored customer. */
  buyer?: { name: string; email?: string | null; phone?: string | null },
  seller: SellerDetails = SELLER,
): string {
  const items = ((inv.lineItems ?? []) as unknown as LineItem[]) || [];
  // Billed To = the client (account holder). The stored customer* fields hold
  // the candidate that was verified — that goes in the line item, not here.
  const buyerName = buyer?.name || inv.customerName;
  const buyerEmail = buyer?.email ?? inv.customerEmail;
  const buyerPhone = buyer?.phone ?? inv.customerPhone;
  const candidate = inv.customerName?.trim();
  const isVoid = inv.businessStatus === 'VOID';
  const isPaid = !isVoid && (inv.status === 'paid' || inv.businessStatus === 'PAID');
  const isDue = !isVoid && !isPaid;
  const gstRate = inv.taxRatePercent ?? 18;

  const businessStatusLabel = isVoid ? 'Void' : isPaid ? 'Paid' : 'Due';
  const paymentTermsLabel = inv.paymentTerms
    ? inv.paymentTerms.replace('NET_', 'Net ').replace('_', ' ')
    : isPaid
      ? 'Paid on receipt'
      : 'Due on receipt';

  const sellerAddress = seller.addressLines.join(', ');

  const lineDesc = candidate
    ? `Assurio verification · ${candidate}`
    : 'Background verification services';
  const rows =
    items.length > 0
      ? items
          .map(
            (li, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(lineDesc)}</td>
        <td>${esc(li.hsnSac || DEFAULT_SAC)}</td>
        <td class="text-right">₹${formatCurrency(li.total)}</td>
      </tr>`,
          )
          .join('')
      : `<tr>
        <td>1</td>
        <td>${esc(lineDesc)}</td>
        <td>${esc(DEFAULT_SAC)}</td>
        <td class="text-right">₹${formatCurrency(inv.subtotal)}</td>
      </tr>`;

  const paymentInfo = isPaid
    ? `<div class="payment-section">
          <div class="section-heading">Payment Information</div>
          <div class="payment-row">
            <span class="payment-label">Payment Mode</span>
            <span class="payment-value">Razorpay</span>
          </div>
          ${
            inv.razorpayPaymentId
              ? `<div class="payment-row">
            <span class="payment-label">Payment ID</span>
            <span class="payment-value">${esc(inv.razorpayPaymentId)}</span>
          </div>`
              : ''
          }
          <div class="payment-row">
            <span class="payment-label">Payment Date &amp; Time</span>
            <span class="payment-value">${formatDateTime(inv.paidAt ?? inv.createdAt)}</span>
          </div>
        </div>`
    : '';

  const paidRows = isPaid
    ? `<div class="paid-row">
            <span class="totals-label">Amount Paid</span>
            <span class="totals-value">₹${formatCurrency(inv.total)}</span>
          </div>
          <div class="paid-row">
            <span class="totals-label">Due Amount</span>
            <span class="totals-value">₹0.00</span>
          </div>`
    : isDue
      ? `<div class="paid-row">
            <span class="totals-label">Amount Paid</span>
            <span class="totals-value">₹0.00</span>
          </div>
          <div class="paid-row">
            <span class="totals-label">Due Amount</span>
            <span class="totals-value">₹${formatCurrency(inv.total)}</span>
          </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Manrope', 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      color: #101828;
      background: #fff;
    }
    .page { width: 600px; margin: 0 auto; background: #fff; padding: 40px; position: relative; }
    @page { margin: 0; }
    @media print { body { background: #fff; } }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-title { font-size: 24px; font-weight: 600; color: #0E1321; }
    .void-watermark { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; display: flex; align-items: center; justify-content: center; z-index: 9999; }
    .void-watermark span { font-size: 160px; font-weight: 800; letter-spacing: 16px; color: rgba(217, 45, 32, 0.28); transform: rotate(-30deg); text-transform: uppercase; }
    .logo-container { width: 160px; }
    .logo-container svg { width: 100%; height: auto; }

    .meta-section { margin-bottom: 16px; }
    .meta-row { display: flex; gap: 8px; margin-bottom: 4px; }
    .meta-label { width: 130px; font-size: 10px; font-weight: 500; color: #374150; }
    .meta-value { font-size: 10px; font-weight: 600; color: #374150; }

    .billing-section { display: flex; gap: 16px; margin-bottom: 16px; }
    .billing-box { flex: 1; padding: 8px; border-radius: 8px; background-color: #f9fbff; }
    .billing-title { font-size: 10px; font-weight: 600; color: #374150; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .billing-name { font-size: 10px; font-weight: 500; color: #0E1321; margin-bottom: 4px; }
    .billing-detail { font-size: 10px; color: #374150; line-height: 1.6; font-weight: 500; }

    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .items-table thead, .items-table thead tr { background: #174AB5; }
    .items-table thead th { background: #174AB5; color: #fff; padding: 10px 14px; font-size: 10px; font-weight: 600; text-align: left; letter-spacing: 0.3px; border: 0; }
    .items-table thead th:first-child { border-radius: 8px 0 0 0; width: 40px; text-align: right; }
    .items-table thead th:last-child { border-radius: 0 8px 0 0; text-align: right; }
    .items-table thead th.text-right { text-align: right; }
    .items-table tbody td { padding: 10px 14px; border-bottom: 1px solid #EAECF0; font-size: 10px; vertical-align: top; font-weight: 500; color: #374150; }
    .items-table tbody td:first-child { text-align: center; color: #667085; }
    .items-table tbody td:last-child { text-align: right; }
    .items-table tbody td.text-right { text-align: right; }

    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .info-table thead, .info-table thead tr { background: #174AB5; }
    .info-table thead th { background: #174AB5; color: #fff; padding: 10px 14px; font-size: 10px; font-weight: 600; text-align: left; letter-spacing: 0.3px; border: 0; }
    .info-table thead th:first-child { border-radius: 8px 0 0 0; }
    .info-table thead th:last-child { border-radius: 0 8px 0 0; }
    .info-table tbody td { padding: 10px 14px; border-bottom: 1px solid #EAECF0; font-size: 10px; vertical-align: top; font-weight: 500; color: #374150; }

    .summary-grid { display: grid; grid-template-columns: 1fr auto; column-gap: 32px; align-items: start; }
    .summary-left { display: flex; flex-direction: column; min-width: 0; }
    .summary-left .total-words { margin-bottom: 24px; }
    .summary-right { display: flex; flex-direction: column; align-items: flex-end; gap: 24px; }
    .total-words { max-width: 300px; }
    .total-words-label { font-size: 10px; color: #828D9D; margin-bottom: 4px; font-weight: 500; }
    .total-words-value { font-size: 10px; font-weight: 700; color: #374150; line-height: 1.5; }
    .totals-box { width: 248px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; color: #374150; }
    .totals-row .totals-label { font-weight: 500; }
    .totals-row .totals-value { font-weight: 600; }
    .totals-row.grand { border-top: 1px solid #A5ACB6; margin-top: 4px; padding-top: 10px; }
    .totals-row.grand .totals-label, .totals-row.grand .totals-value { font-size: 12px; font-weight: 600; color: #374150; }
    .paid-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .paid-row .totals-label { font-weight: 500; color: #374150; }
    .paid-row .totals-value { font-weight: 600; color: #374150; }

    .billing-row, .bank-section, .payment-section, .signature-section, .totals-signature-row, .tds-note { page-break-inside: avoid; }

    .bank-section { margin-bottom: 16px; }
    .section-heading { font-size: 10px; font-weight: 700; color: #374150; margin-bottom: 4px; }
    .bank-detail { font-size: 10px; font-weight: 500; color: #374150; line-height: 1.5; }

    .stamp-signature-wrapper { position: relative; width: 120px; display: flex; justify-content: center; }
    .stamp-container { position: relative; width: 149px; height: 55px; display: flex; align-items: center; justify-content: center; }
    .stamp-container svg, .stamp-container img { width: 149px; height: 55px; object-fit: contain; }
    .signature-overlay { position: absolute; top: 50%; left: -46px; transform: translateY(-30%); z-index: 2; width: 100px; height: 60px; }
    .signature-overlay img, .signature-overlay svg { width: 100px; height: 60px; object-fit: contain; transform: rotate(-5deg); }
    .signature-block { text-align: center; margin-top: 8px; }
    .signature-label { font-size: 11px; font-weight: 600; color: #344054; }

    .payment-section { margin-bottom: 24px; }
    .payment-row { display: flex; gap: 8px; margin-bottom: 3px; }
    .payment-label { flex: 0 0 140px; white-space: nowrap; font-size: 10px; color: #374150; font-weight: 500; }
    .payment-value { font-size: 10px; font-weight: 600; color: #374150; white-space: nowrap; }
  </style>
</head>
<body>
  ${isVoid ? '<div class="void-watermark"><span>VOID</span></div>' : ''}
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <span class="header-title">Tax Invoice</span>
      </div>
      <div class="logo-container" style="display:flex;align-items:center;gap:9px;justify-content:flex-end;">
        <img src="${ASSURIO_LOGO_DATA_URI}" alt="Assurio" style="width:40px;height:40px;object-fit:contain;" />
        <span style="font-size:22px;font-weight:700;color:#0e1321;letter-spacing:-0.01em;">Assurio</span>
      </div>
    </div>

    <!-- Invoice Meta -->
    <div class="meta-section">
      <div class="meta-row">
        <span class="meta-label">Invoice No.</span>
        <span class="meta-value">${esc(inv.invoiceNumber)}</span>
      </div>
    </div>

    <!-- Billed By / Billed To -->
    <div class="billing-section">
      <div class="billing-box">
        <div class="billing-title">Billed By</div>
        <div class="billing-name">${esc(seller.legalName)}</div>
        <div class="billing-detail">
          ${esc(sellerAddress)}<br>
          ${esc(seller.email)}<br>
          ${esc(seller.phone)}<br>
          GSTIN: ${esc(seller.gstin)}<br>
          PAN: ${esc(seller.pan)}<br>
          CIN: ${esc(seller.cin)}
        </div>
      </div>
      <div class="billing-box">
        <div class="billing-title">Billed To</div>
        <div class="billing-name">${esc(buyerName)}</div>
        <div class="billing-detail">
          ${buyerEmail ? `${esc(buyerEmail)}<br>` : ''}
          ${buyerPhone ? `${esc(buyerPhone)}<br>` : ''}
          GSTIN: Unregistered
        </div>
      </div>
    </div>

    <!-- Invoice Info Table -->
    <table class="info-table">
      <thead>
        <tr>
          <th style="width: 32%;">Invoice Date</th>
          <th>Terms</th>
          <th>Due Date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${formatDate(inv.paidAt ?? inv.createdAt)}</td>
          <td>${esc(paymentTermsLabel)}</td>
          <td>${inv.dueAt ? formatDate(inv.dueAt) : '—'}</td>
          <td>${esc(businessStatusLabel)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Line Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Item Description</th>
          <th>HSN/SAC</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="summary-grid">
      <div class="summary-left">
        <div class="total-words">
          <div class="total-words-label">Total In Words</div>
          <div class="total-words-value">${esc(amountInWords(inv.total))}</div>
        </div>
        <div class="bank-section">
          <div class="section-heading">Bank Details</div>
          <div class="bank-detail">
            Bank Name: ${esc(seller.bank.name)}<br>
            A/C Number: ${esc(seller.bank.account)}<br>
            IFSC Code: ${esc(seller.bank.ifsc)}<br>
            SWIFT CODE: ${esc(seller.bank.swift)}<br>
            Bank Address: ${esc(seller.bank.addressLines.join(' '))}
          </div>
        </div>
        ${paymentInfo}
      </div>
      <div class="summary-right">
        <div class="totals-box">
          <div class="totals-row">
            <span class="totals-label">Subtotal</span>
            <span class="totals-value">₹${formatCurrency(inv.subtotal)}</span>
          </div>
          <div class="totals-row">
            <span class="totals-label">GST (${gstRate}%)</span>
            <span class="totals-value">₹${formatCurrency(inv.tax)}</span>
          </div>
          <div class="totals-row grand">
            <span class="totals-label">Total</span>
            <span class="totals-value">₹${formatCurrency(inv.total)}</span>
          </div>
          ${paidRows}
        </div>
        <div class="stamp-signature-block">
          <div class="stamp-signature-wrapper">
            <div class="stamp-container">
              ${STAMP_SVG}
            </div>
            <div class="signature-overlay">
              <img src="${SIGNATURE_PNG_DATA_URI}" alt="Signature" />
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-label">Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>

  </div>
</body>
</html>`;
}
