// VAT invoice (Philippines / BIR-style) — Phase 5 compliance.
//
// Produces a VAT invoice PDF for a completed marketplace purchase. Prices are
// treated as VAT-INCLUSIVE (12% default), so the VATable sale + VAT are backed
// out of the total. Platform tax identity (registered name, TIN, address) is
// admin-configurable via app_settings; sensible placeholders are used until set.
//
// IMPORTANT: until Carbonify is a BIR-registered entity with accredited receipts
// (see POLICY_AND_USER_AGREEMENT.md pre-production constraints), this is a
// PROVISIONAL invoice and is clearly watermarked as not-yet-a-BIR-Official-Receipt.

import { generateReceipt } from '@/services/receiptService'
import { getSetting } from '@/services/settingsService'

const DEFAULT_VAT_RATE = 12 // % — Philippine VAT

/** Back out VAT from a VAT-inclusive gross amount. */
export function computeVatBreakdown(grossAmount, vatRate = DEFAULT_VAT_RATE) {
  const gross = Number(grossAmount) || 0
  const rate = Number(vatRate) || 0
  const vatableSales = rate > 0 ? gross / (1 + rate / 100) : gross
  const vatAmount = gross - vatableSales
  return {
    vatRate: rate,
    vatableSales: round2(vatableSales),
    vatExempt: 0,
    zeroRated: 0,
    vatAmount: round2(vatAmount),
    total: round2(gross),
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function peso(n) {
  return `PHP ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Load the platform's tax identity from app_settings (with placeholders). */
async function getSellerTaxIdentity() {
  const [name, tin, address, businessStyle] = await Promise.all([
    getSetting('company_name', 'Carbonify'),
    getSetting('company_tin', 'TIN: ___-___-___-___'),
    getSetting('company_address', 'Registered address not yet configured'),
    getSetting('company_business_style', 'Carbon credit marketplace'),
  ])
  return { name, tin, address, businessStyle }
}

/**
 * Build the full invoice model for a transaction (pure-ish; reuses the receipt).
 * @returns {Promise<object>}
 */
export async function buildVatInvoice(transactionId) {
  const receipt = await generateReceipt(transactionId)
  const vatRate = Number(await getSetting('vat_rate', DEFAULT_VAT_RATE)) || DEFAULT_VAT_RATE
  const seller = await getSellerTaxIdentity()

  const gross = Number(receipt?.purchase?.totalAmount) || 0
  const breakdown = computeVatBreakdown(gross, vatRate)

  return {
    invoiceNumber: `VINV-${String(receipt.receiptNumber || transactionId).replace(/[^A-Za-z0-9]/g, '').slice(-12)}`,
    issueDate: receipt.issueDate || new Date().toISOString(),
    transactionId,
    seller,
    buyer: {
      name: receipt?.buyer?.name || 'Buyer',
      email: receipt?.buyer?.email || '',
      tin: receipt?.buyer?.tin || '',
      address: receipt?.buyer?.address || '',
    },
    lineItem: {
      description: `Carbon credits — ${receipt?.project?.title || 'Project'}`,
      quantity: Number(receipt?.purchase?.creditsPurchased) || 0,
      unitPrice: Number(receipt?.purchase?.pricePerCredit) || 0,
      amount: gross,
    },
    breakdown,
    currency: receipt?.purchase?.currency || 'PHP',
  }
}

/** Generate + download the VAT invoice PDF for a transaction. */
export async function downloadVatInvoice(transactionId) {
  const inv = await buildVatInvoice(transactionId)
  const jsPDF = (await import('jspdf')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const left = 16
  let y = 18

  // Header — seller identity
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(inv.seller.name, left, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += 6
  doc.text(inv.seller.businessStyle, left, y)
  y += 5
  doc.text(inv.seller.address, left, y)
  y += 5
  doc.text(inv.seller.tin, left, y)

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('VAT INVOICE', 194, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`No. ${inv.invoiceNumber}`, 194, 26, { align: 'right' })
  doc.text(`Date: ${new Date(inv.issueDate).toLocaleDateString()}`, 194, 31, { align: 'right' })

  y += 8
  doc.setDrawColor(200)
  doc.line(left, y, 194, y)
  y += 8

  // Sold to
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('SOLD TO', left, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += 5
  doc.text(inv.buyer.name, left, y)
  if (inv.buyer.email) {
    y += 5
    doc.text(inv.buyer.email, left, y)
  }
  y += 5
  doc.text(`TIN: ${inv.buyer.tin || '___-___-___-___'}`, left, y)
  y += 5
  doc.text(`Address: ${inv.buyer.address || '________________________'}`, left, y)

  // Line items table
  y += 10
  doc.setFillColor(240, 240, 240)
  doc.rect(left, y - 5, 178, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Description', left + 2, y)
  doc.text('Qty', 120, y, { align: 'right' })
  doc.text('Unit Price', 150, y, { align: 'right' })
  doc.text('Amount', 192, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 8
  doc.text(inv.lineItem.description, left + 2, y, { maxWidth: 95 })
  doc.text(String(inv.lineItem.quantity), 120, y, { align: 'right' })
  doc.text(peso(inv.lineItem.unitPrice), 150, y, { align: 'right' })
  doc.text(peso(inv.lineItem.amount), 192, y, { align: 'right' })

  // VAT breakdown (right-aligned summary box)
  y += 12
  const b = inv.breakdown
  const rows = [
    ['VATable Sales', peso(b.vatableSales)],
    ['VAT-Exempt Sales', peso(b.vatExempt)],
    ['Zero-Rated Sales', peso(b.zeroRated)],
    [`VAT (${b.vatRate}%)`, peso(b.vatAmount)],
  ]
  doc.setFontSize(9)
  rows.forEach(([label, value]) => {
    doc.text(label, 150, y, { align: 'right' })
    doc.text(value, 192, y, { align: 'right' })
    y += 6
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL AMOUNT DUE', 150, y + 1, { align: 'right' })
  doc.text(peso(b.total), 192, y + 1, { align: 'right' })

  // Disclaimer — provisional, not a BIR Official Receipt yet
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text(
    'PROVISIONAL — not yet a BIR-accredited Official Receipt. Issued pre-production for ' +
      'record-keeping only. VAT shown is computed at the configured rate on a VAT-inclusive price.',
    left,
    282,
    { maxWidth: 178 },
  )

  doc.save(`carbonify-vat-invoice-${inv.invoiceNumber}.pdf`)
  return inv
}
