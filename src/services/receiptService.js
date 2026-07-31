import { getSupabase } from '@/services/supabaseClient'

/**
 * The other party's display name for a transaction the caller is party to.
 *
 * DEFERRED_BACKLOG #3. The `buyer:`/`seller:` embeds below resolve structurally
 * but return NOTHING under `profiles` RLS, which is hardened against role /
 * kyc_level escalation (20260703000300) and must stay that way. And RLS does not
 * error — PostgREST filters rows — so the receipt simply rendered a blank
 * counterparty, silently. Migration `20260801000100` adds a SECURITY DEFINER
 * function returning a NAME ONLY, and only to a party of that exact transaction.
 *
 * DEGRADES TO null, deliberately. Until the owner applies that migration the RPC
 * does not exist and the call 404s; a receipt that refuses to render because it
 * cannot name the counterparty would be a worse outcome than one that omits it.
 * This is the same fail-open reasoning as the policy gate — with the difference
 * that lesson taught: the failure here is a genuine ERROR from PostgREST, not an
 * empty result, so it is distinguishable and is logged.
 *
 * @returns {Promise<{id: string, name: string, role: 'buyer'|'seller'}|null>}
 */
export async function getCounterpartyName(transactionId) {
  const supabase = getSupabase()
  if (!supabase || !transactionId) return null

  const { data, error } = await supabase.rpc('get_transaction_counterparty_name', {
    p_transaction_id: transactionId,
  })

  if (error) {
    console.warn(
      '[receipt] Could not resolve the counterparty name; the receipt will omit it. ' +
        'Has migration 20260801000100 been applied?',
      error.message,
    )
    return null
  }

  // Zero rows is the authorisation answer, not a failure: the caller is not a
  // party to this transaction. Treated the same as "not available".
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  return {
    id: row.counterparty_id,
    name: row.counterparty_name,
    role: row.counterparty_role,
  }
}

async function loadTransactionForReceipt(supabase, transactionId) {
  let transaction = null
  let transactionError = null

  const { data: joinedTransaction, error: joinedError } = await supabase
    .from('credit_transactions')
    .select(
      `
      *,
      project_credits!inner(
        *,
        projects!inner(title, category, location, description)
      ),
      buyer:profiles!credit_transactions_buyer_id_fkey(full_name, email),
      seller:profiles!credit_transactions_seller_id_fkey(full_name, email)
    `,
    )
    .eq('id', transactionId)
    .single()

  if (!joinedError && joinedTransaction) {
    return joinedTransaction
  }

  transactionError = joinedError
  console.warn('Receipt join query failed, trying separate queries...', joinedError?.message)

  const { data: basicTransaction, error: basicError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('id', transactionId)
    .single()

  if (basicError || !basicTransaction) {
    throw new Error(`Transaction not found: ${basicError?.message || transactionError?.message || 'Unknown error'}`)
  }

  transaction = { ...basicTransaction }

  try {
    const projectCreditId = basicTransaction.project_credit_id || basicTransaction.project_credits_id
    if (projectCreditId) {
      const { data: projectCredit } = await supabase
        .from('project_credits')
        .select(
          `
          *,
          projects!inner(title, category, location, description)
        `,
        )
        .eq('id', projectCreditId)
        .single()

      if (projectCredit) {
        transaction.project_credits = projectCredit
      } else {
        const { data: basicProjectCredit } = await supabase
          .from('project_credits')
          .select('*')
          .eq('id', projectCreditId)
          .single()

        if (basicProjectCredit) {
          transaction.project_credits = basicProjectCredit

          if (basicProjectCredit.project_id) {
            const { data: project } = await supabase
              .from('projects')
              .select('title, category, location, description')
              .eq('id', basicProjectCredit.project_id)
              .single()

            if (project) {
              transaction.project_credits.projects = project
            }
          }
        }
      }
    }

    if (basicTransaction.buyer_id) {
      const { data: buyer } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', basicTransaction.buyer_id)
        .single()

      if (buyer) {
        transaction.buyer = buyer
      }
    }

    if (basicTransaction.seller_id) {
      const { data: seller } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', basicTransaction.seller_id)
        .single()

      if (seller) {
        transaction.seller = seller
      }
    }
  } catch (relatedError) {
    console.warn('Receipt related-data lookup failed, continuing with base transaction...', relatedError)
  }

  return transaction
}

function normalizeStoredReceipt(receiptRow) {
  if (!receiptRow) return null

  try {
    const existingData =
      typeof receiptRow.receipt_data === 'string'
        ? JSON.parse(receiptRow.receipt_data)
        : receiptRow.receipt_data

    return (
      existingData || {
        receiptNumber: receiptRow.receipt_number,
        transactionId: receiptRow.transaction_id,
        issueDate: receiptRow.issued_at || receiptRow.created_at,
      }
    )
  } catch (parseError) {
    console.warn('Failed to parse stored receipt_data, falling back to row fields...', parseError)
    return {
      receiptNumber: receiptRow.receipt_number,
      transactionId: receiptRow.transaction_id,
      issueDate: receiptRow.issued_at || receiptRow.created_at,
    }
  }
}

function getReceiptPayload(receiptRow) {
  if (!receiptRow) return null

  const normalized = normalizeStoredReceipt(receiptRow) || {}

  return {
    receiptNumber: normalized.receiptNumber || receiptRow.receipt_number || receiptRow.id,
    transactionId: normalized.transactionId || receiptRow.transaction_id || 'N/A',
    issueDate: normalized.issueDate || receiptRow.issued_at || receiptRow.created_at,
    buyer: normalized.buyer || {},
    seller: normalized.seller || {},
    project: normalized.project || {},
    purchase: {
      currency: 'PHP',
      status: 'completed',
      ...normalized.purchase,
    },
    environmentalImpact: normalized.environmentalImpact || {},
    certification: normalized.certification || {},
  }
}

/**
 * Generate a receipt for a credit purchase transaction
 */
export async function generateReceipt(transactionId) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  if (!transactionId) {
    throw new Error('Transaction ID is required')
  }

  try {
    // Avoid duplicate receipts when multiple completion handlers run for same purchase
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('transaction_id', transactionId)
      .maybeSingle()

    if (existingReceipt) {
      return normalizeStoredReceipt(existingReceipt)
    }

    const transaction = await loadTransactionForReceipt(supabase, transactionId)

    // Generate receipt data
    const buyerName = transaction.buyer?.full_name || transaction.buyer?.email || 'Buyer'
    const buyerEmail = transaction.buyer?.email || 'N/A'
    const sellerName = transaction.seller?.full_name || transaction.seller?.email || 'Seller'
    const sellerEmail = transaction.seller?.email || 'N/A'
    const projectInfo = transaction.project_credits?.projects || {}
    const vintageYear = transaction.project_credits?.vintage_year || null
    const verificationStandard = transaction.project_credits?.verification_standard || null
    const quantity = parseAmount(transaction.quantity) ?? 0
    const pricePerCredit = parseAmount(transaction.price_per_credit) ?? 0
    const platformFeePercentage = parseAmount(transaction.platform_fee_percentage) ?? 2.5
    const subtotal = quantity * pricePerCredit
    const totalAmount = parseAmount(transaction.total_amount) ?? subtotal + subtotal * (platformFeePercentage / 100)

    const receipt = {
      receiptNumber: generateReceiptNumber(transactionId),
      transactionId: transaction.id,
      issueDate: new Date().toISOString(),
      buyer: {
        name: buyerName,
        email: buyerEmail,
      },
      seller: {
        name: sellerName,
        email: sellerEmail,
      },
      project: {
        title: projectInfo.title,
        category: projectInfo.category,
        location: projectInfo.location,
        description: projectInfo.description,
        vintageYear,
        verificationStandard,
      },
      purchase: {
        creditsPurchased: quantity,
        pricePerCredit,
        subtotal,
        platformFeePercentage,
        platformFee: subtotal * (platformFeePercentage / 100),
        totalAmount,
        currency: transaction.currency || 'PHP',
        paymentMethod: transaction.payment_method || 'N/A',
        status: transaction.status || 'completed',
      },
      environmentalImpact: {
        co2Offset: quantity, // Assuming 1 credit = 1 tonne CO2
        equivalentTreesPlanted: Math.round(quantity * 0.5), // Rough estimate
        equivalentCarsOffRoad: Math.round(quantity / 4.6), // Rough estimate
      },
      certification: {
        certificateNumber: transaction.certificate_number,
        issuedDate: transaction.completed_at,
        verificationBody: 'Carbonify Verification Services',
      },
    }

    // Save receipt to database
    const { error: receiptError } = await supabase
      .from('receipts')
      .insert({
        transaction_id: transactionId,
        receipt_number: receipt.receiptNumber,
        buyer_id: transaction.buyer_id,
        seller_id: transaction.seller_id,
        receipt_data: receipt,
        status: 'issued',
        issued_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (receiptError) {
      console.error('Error saving receipt:', receiptError)
      const duplicateReceipt =
        receiptError.code === '23505' ||
        receiptError.message?.toLowerCase().includes('duplicate') ||
        receiptError.details?.toLowerCase().includes('already exists')

      if (duplicateReceipt) {
        const { data: concurrentReceipt } = await supabase
          .from('receipts')
          .select('*')
          .eq('transaction_id', transactionId)
          .maybeSingle()

        if (concurrentReceipt) {
          return normalizeStoredReceipt(concurrentReceipt)
        }
      }
    }

    return receipt
  } catch (error) {
    console.error('Error in generateReceipt:', error)
    throw error
  }
}

/**
 * Get receipts for a user
 */
export async function getUserReceipts(userId) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  if (!userId) {
    throw new Error('User ID is required')
  }

  try {
    let { data, error } = await supabase
      .from('receipts')
      .select('*')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('issued_at', { ascending: false })

    if (error) {
      console.error('Error fetching user receipts:', error)
      throw new Error(`Failed to fetch receipts: ${error.message}`)
    }

    // Backfill missing receipt rows for completed purchases made by this user
    // so older purchases also appear in the Receipts dashboard.
    const { data: completedPurchases, error: completedPurchasesError } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('buyer_id', userId)
      .eq('status', 'completed')

    if (!completedPurchasesError && Array.isArray(completedPurchases) && completedPurchases.length) {
      const existingTransactionIds = new Set(
        (data || [])
          .map((receipt) => receipt?.transaction_id)
          .filter((transactionId) => transactionId != null)
          .map((transactionId) => String(transactionId)),
      )

      const missingTransactionIds = completedPurchases
        .map((transaction) => String(transaction.id))
        .filter((transactionId) => !existingTransactionIds.has(transactionId))

      if (missingTransactionIds.length) {
        await Promise.allSettled(missingTransactionIds.map((transactionId) => generateReceipt(transactionId)))

        const { data: refreshedReceipts, error: refreshedReceiptsError } = await supabase
          .from('receipts')
          .select('*')
          .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
          .order('issued_at', { ascending: false })

        if (!refreshedReceiptsError) {
          data = refreshedReceipts || data
        }
      }
    }

    // Extract project details from receipt_data JSONB if available
    const enrichedReceipts = (data || []).map(receipt => {
      if (receipt.receipt_data) {
        let receiptData = null

        try {
          receiptData =
            typeof receipt.receipt_data === 'string'
              ? JSON.parse(receipt.receipt_data)
              : receipt.receipt_data
        } catch (parseError) {
          console.warn('Failed to parse receipt_data while loading receipts:', parseError)
        }
        
        return {
          ...receipt,
          project_title: receiptData?.project?.title,
          project_location: receiptData?.project?.location,
          credits_purchased: receiptData?.purchase?.creditsPurchased,
          total_amount: receiptData?.purchase?.totalAmount,
          currency: receiptData?.purchase?.currency || receipt.currency || 'PHP',
          payment_method: receiptData?.purchase?.paymentMethod || receipt.payment_method,
          status: receiptData?.purchase?.status || receipt.status || 'completed',
        }
      }
      return receipt
    })

    return enrichedReceipts
  } catch (error) {
    console.error('Error in getUserReceipts:', error)
    throw error
  }
}

/**
 * Download receipt as PDF (placeholder)
 */
export async function downloadReceipt(receiptId) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  if (!receiptId) {
    throw new Error('Receipt ID is required')
  }

  try {
    let jsPDF
    try {
      jsPDF = (await import('jspdf')).default
    } catch (importError) {
      console.error('Error importing jsPDF:', importError)
      throw new Error('PDF download is not available right now')
    }

    const { data: receipt, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receiptId)
      .single()

    if (error) {
      console.error('Error fetching receipt:', error)
      throw new Error(`Receipt not found: ${error.message}`)
    }

    if (!receipt) {
      throw new Error('Receipt not found')
    }

    const receiptData = getReceiptPayload(receipt)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const primaryColor = [6, 158, 45]
    const textColor = [26, 32, 44]
    const mutedColor = [113, 128, 150]
    let currentY = 20

    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, 210, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('Carbonify Receipt', 14, 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Receipt #${receiptData.receiptNumber}`, 14, 25)

    currentY = 44
    doc.setTextColor(...textColor)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Purchase Summary', 14, currentY)
    currentY += 10

    // Track content start for dynamic border — leave gap below heading
    const contentStartY = currentY

    const rows = [
      ['Issue Date', formatReceiptDate(receiptData.issueDate)],
      ['Transaction ID', String(receiptData.transactionId || 'N/A')],
      ['Buyer', receiptData.buyer?.name || receiptData.buyer?.email || 'N/A'],
      ['Buyer Email', receiptData.buyer?.email || 'N/A'],
      ['Seller', receiptData.seller?.name || receiptData.seller?.email || 'N/A'],
      ['Project', receiptData.project?.title || 'Purchase Receipt'],
      ['Category', receiptData.project?.category || 'N/A'],
      ['Location', receiptData.project?.location || 'N/A'],
      ['Credits Purchased', String(receiptData.purchase?.creditsPurchased ?? 'N/A')],
      ['Price per Credit', formatReceiptCurrencyForPdf(receiptData.purchase?.pricePerCredit, receiptData.purchase?.currency)],
      ['Subtotal', formatReceiptCurrencyForPdf(receiptData.purchase?.subtotal, receiptData.purchase?.currency)],
      ['Platform Fee', formatReceiptCurrencyForPdf(receiptData.purchase?.platformFee, receiptData.purchase?.currency)],
      ['Total Amount', formatReceiptCurrencyForPdf(receiptData.purchase?.totalAmount, receiptData.purchase?.currency)],
      ['Payment Method', receiptData.purchase?.paymentMethod || 'N/A'],
      ['Status', receiptData.purchase?.status || 'completed'],
    ]

    // Add inner padding so text sits below border top
    currentY = contentStartY + 5
    doc.setFontSize(10)
    for (const [label, value] of rows) {
      if (currentY > 265) {
        // Draw border on current page before new page
        doc.setDrawColor(...primaryColor)
        doc.setLineWidth(0.4)
        doc.rect(10, contentStartY, 190, currentY - contentStartY + 2)
        doc.addPage()
        currentY = 20
      }

      doc.setTextColor(...mutedColor)
      doc.setFont('helvetica', 'bold')
      doc.text(`${label}:`, 14, currentY)

      doc.setTextColor(...textColor)
      doc.setFont('helvetica', 'normal')
      const wrapped = doc.splitTextToSize(String(value || 'N/A'), 120)
      doc.text(wrapped, 70, currentY)
      currentY += Math.max(7, wrapped.length * 5)
    }

    if (receiptData.project?.description) {
      currentY += 4
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...textColor)
      doc.text('Project Description', 14, currentY)
      currentY += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const descriptionLines = doc.splitTextToSize(receiptData.project.description, 180)
      doc.text(descriptionLines, 14, currentY)
      currentY += descriptionLines.length * 4.5
    }

    // Draw dynamic content border
    const contentEndY = currentY + 4
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(0.4)
    doc.rect(10, contentStartY, 190, contentEndY - contentStartY)

    // Footer — ensure it stays on the page
    const footerY = Math.min(contentEndY + 12, 286)
    doc.setFontSize(9)
    doc.setTextColor(...mutedColor)
    doc.text('Generated by Carbonify', 14, footerY)

    const filename = `receipt-${receiptData.receiptNumber}.pdf`
    doc.save(filename)
    return filename
  } catch (error) {
    console.error('Error in downloadReceipt:', error)
    throw error
  }
}

/**
 * Generate carbon impact report for a user
 */
export async function generateCarbonImpactReport(userId) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  if (!userId) {
    throw new Error('User ID is required')
  }

  try {
    // Get all completed transactions for the user
    const { data: transactions, error } = await supabase
      .from('credit_transactions')
      .select(
        `
        *,
        project_credits!inner(
          *,
          projects!inner(title, category, location)
        )
      `,
      )
      .eq('buyer_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })

    if (error) {
      console.error('Error fetching user transactions:', error)
      throw new Error(`Failed to fetch transactions: ${error.message}`)
    }

    // Handle case where no transactions exist
    if (!transactions || transactions.length === 0) {
      return {
        userId,
        generatedAt: new Date().toISOString(),
        summary: {
          totalCreditsPurchased: 0,
          totalAmountSpent: 0,
          totalTransactions: 0,
          averagePricePerCredit: 0,
        },
        environmentalImpact: {
          co2OffsetTonnes: 0,
          equivalentTreesPlanted: 0,
          equivalentCarsOffRoad: 0,
          equivalentHomesPowered: 0,
        },
        categoryBreakdown: {},
        recentPurchases: [],
      }
    }

    // Calculate impact metrics
    const totalCreditsPurchased = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0)
    const totalAmountSpent = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0)

    // Group by category
    const categoryBreakdown = transactions.reduce((acc, transaction) => {
      // Add null checks for nested objects
      if (transaction.project_credits?.projects?.category) {
        const category = transaction.project_credits.projects.category
        if (!acc[category]) {
          acc[category] = {
            credits: 0,
            amount: 0,
            projects: new Set(),
          }
        }
        acc[category].credits += transaction.quantity || 0
        acc[category].amount += transaction.total_amount || 0
        if (transaction.project_credits.projects.title) {
          acc[category].projects.add(transaction.project_credits.projects.title)
        }
      }
      return acc
    }, {})

    // Convert Sets to Arrays
    Object.keys(categoryBreakdown).forEach((category) => {
      categoryBreakdown[category].projects = Array.from(categoryBreakdown[category].projects)
    })

    const impactReport = {
      userId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCreditsPurchased,
        totalAmountSpent,
        totalTransactions: transactions.length,
        averagePricePerCredit:
          totalCreditsPurchased > 0 ? totalAmountSpent / totalCreditsPurchased : 0,
      },
      environmentalImpact: {
        co2OffsetTonnes: totalCreditsPurchased,
        equivalentTreesPlanted: Math.round(totalCreditsPurchased * 0.5),
        equivalentCarsOffRoad: Math.round(totalCreditsPurchased / 4.6),
        equivalentHomesPowered: Math.round(totalCreditsPurchased / 16), // Rough estimate
      },
      categoryBreakdown,
      recentPurchases: transactions.slice(0, 10).map((t) => ({
        date: t.completed_at,
        project: t.project_credits?.projects?.title || 'Unknown Project',
        category: t.project_credits?.projects?.category || 'Unknown',
        credits: t.quantity || 0,
        amount: t.total_amount || 0,
        currency: t.currency || 'PHP',
      })),
    }

    return impactReport
  } catch (error) {
    console.error('Error in generateCarbonImpactReport:', error)
    throw error
  }
}

/**
 * Generate a unique receipt number
 */
function generateReceiptNumber() {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 4)
  return `RCP-${timestamp}-${random}`.toUpperCase()
}

function formatReceiptDate(dateString) {
  if (!dateString) return 'N/A'

  return new Date(dateString).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatReceiptCurrencyForPdf(amount, currency = 'PHP') {
  const parsedAmount = parseAmount(amount)
  if (parsedAmount === null) return 'N/A'

  // Keep PDF values ASCII-only to avoid glyph mapping issues in standard PDF fonts.
  const formattedAmount = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsedAmount)

  return `${String(currency || 'PHP').toUpperCase()} ${formattedAmount}`
}

function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const numericValue = String(value)
    .replace(/[^0-9.-]/g, '')
    .replace(/(\..*)\./g, '$1')

  if (!numericValue || numericValue === '-' || numericValue === '.' || numericValue === '-.') {
    return null
  }

  const parsed = Number(numericValue)
  return Number.isFinite(parsed) ? parsed : null
}
