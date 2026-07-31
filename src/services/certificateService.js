import { getSupabase } from '@/services/supabaseClient'
import { logUserAction } from '@/services/auditService'

/**
 * Compute a SHA-256 hex digest of the given string using the Web Crypto API.
 */
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Build the canonical string that the certificate signature is computed over.
 * Only stable, round-trip-safe stored fields are used (no timestamps, which can
 * drift in precision) so the hash recomputed on the public verify page always
 * matches the one stored at issuance.
 */
export function buildCertificateSignaturePayload(cert) {
  const segments = [
    cert.certificate_number,
    cert.certificate_type,
    cert.project_title,
    cert.project_category,
    cert.credits_quantity,
    cert.vintage_year,
    cert.beneficiary_name,
  ]

  // Back-compat: only registry-backed certificates extend the payload. Locally
  // minted certs (registry_serial absent) hash exactly as before, so every
  // certificate signed before Phase 3 still verifies.
  if (cert.registry_serial) {
    segments.push(cert.registry_serial, cert.registry_receipt_url)
  }

  return segments.map((value) => String(value ?? '')).join('|')
}

/**
 * Tamper-evident fingerprint for a certificate.
 */
export async function computeCertificateHash(cert) {
  return sha256Hex(buildCertificateSignaturePayload(cert))
}

/**
 * Compute and persist the signature for a freshly created certificate row.
 * Non-critical: a failure here never blocks issuance.
 */
async function signCertificateRecord(supabase, certificate, { force = false } = {}) {
  try {
    if (!certificate) return certificate
    if (certificate.signature_hash && !force) return certificate
    const hash = await computeCertificateHash(certificate)
    const signedAt = new Date().toISOString()
    const { error } = await supabase
      .from('certificates')
      .update({ signature_hash: hash, signed_at: signedAt })
      .eq('id', certificate.id)
    if (error) {
      console.warn('⚠️ Could not store certificate signature (non-critical):', error.message)
      return certificate
    }
    certificate.signature_hash = hash
    certificate.signed_at = signedAt
    console.log('✅ Certificate signed:', hash.slice(0, 12) + '…')
    return certificate
  } catch (err) {
    console.warn('⚠️ Certificate signing failed (non-critical):', err)
    return certificate
  }
}

/**
 * Best-effort: store the carbon-unit serial (from the transaction/retirement
 * ledger) on the certificate's certificate_data. Non-critical.
 */
async function attachCreditSerial(supabase, certificate, serial) {
  if (!certificate || !serial) return certificate
  try {
    const merged = { ...(certificate.certificate_data || {}), credit_serial: serial }
    const { error } = await supabase
      .from('certificates')
      .update({ certificate_data: merged })
      .eq('id', certificate.id)
    if (!error) {
      certificate.certificate_data = merged
      certificate.credit_serial = serial
    }
  } catch (err) {
    console.warn('⚠️ Could not attach credit serial (non-critical):', err)
  }
  return certificate
}

/**
 * Phase 3 — record an external registry serial + retirement receipt on a
 * certificate after the supplier-fulfillment saga retires the credit, then
 * RE-SIGN the record (the signature payload now includes the registry fields).
 *
 * Called server-side by the fulfillment saga. Accepts a certificate id or a
 * certificate row. Best-effort: returns the (possibly unchanged) record rather
 * than throwing, so a write hiccup never reverses a successful retirement.
 *
 * @param {object} supabase
 * @param {string|object} certificateRef        certificate id, or a row with at least { id }.
 * @param {{registrySerial?: string|null, registryReceiptUrl?: string|null}} info
 * @returns {Promise<object|null>}
 */
export async function attachRegistryInfo(supabase, certificateRef, { registrySerial, registryReceiptUrl } = {}) {
  if (!supabase || !certificateRef) return null
  try {
    let certificate =
      typeof certificateRef === 'string' ? null : certificateRef
    const certId = typeof certificateRef === 'string' ? certificateRef : certificateRef.id
    if (!certId) return certificate

    if (!certificate) {
      const { data } = await supabase.from('certificates').select('*').eq('id', certId).single()
      certificate = data
    }
    if (!certificate) return null

    const { error } = await supabase
      .from('certificates')
      .update({ registry_serial: registrySerial ?? null, registry_receipt_url: registryReceiptUrl ?? null })
      .eq('id', certId)
    if (error) {
      console.warn('⚠️ Could not store registry info (non-critical):', error.message)
      return certificate
    }

    certificate.registry_serial = registrySerial ?? null
    certificate.registry_receipt_url = registryReceiptUrl ?? null

    // Re-sign: the payload now includes the registry fields.
    return signCertificateRecord(supabase, certificate, { force: true })
  } catch (err) {
    console.warn('⚠️ attachRegistryInfo failed (non-critical):', err)
    return null
  }
}

/**
 * Public, no-auth certificate verification used by the /verify page and QR code.
 * Reads the authoritative record via a SECURITY DEFINER RPC (so it works for
 * anonymous visitors) and recomputes the integrity hash to detect tampering.
 *
 * @param {string} certificateNumber
 * @returns {Promise<{found: boolean, certificate?: object, integrityValid?: boolean}>}
 */
export async function verifyCertificatePublic(certificateNumber) {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  const { data, error } = await supabase.rpc('verify_certificate_public', {
    p_certificate_number: certificateNumber,
  })

  if (error) {
    console.error('Error verifying certificate:', error)
    throw error
  }

  const record = Array.isArray(data) ? data[0] : data
  if (!record) {
    return { found: false }
  }

  const expectedHash = await computeCertificateHash(record)
  const integrityValid = !!record.signature_hash && record.signature_hash === expectedHash

  return { found: true, certificate: record, integrityValid }
}

/**
 * Generate a credit certificate for a transaction (purchase)
 */
export async function generateCreditCertificate(transactionId, type = 'purchase') {
  const supabase = getSupabase()

  if (!supabase) {
    console.warn('Supabase client not available, skipping certificate generation')
    return null
  }

  try {
    // Get transaction details - try with joins first, fallback to separate queries if needed
    let transaction = null
    let transactionError = null
    
    // Attempt 1: Try with full join query
    let { data: transactionData, error: transErr } = await supabase
      .from('credit_transactions')
      .select(
        `
        *,
        project_credits!inner(
          *,
          projects!inner(title, description, category, location)
        ),
        buyer:profiles!credit_transactions_buyer_id_fkey(id, full_name, email)
      `,
      )
      .eq('id', transactionId)
      .single()

    if (!transErr && transactionData) {
      transaction = transactionData
      transactionError = null // Clear any previous error
      console.log('✅ Transaction loaded with joins')
    } else {
      console.warn('⚠️ Join query failed, trying separate queries...', transErr?.message)
      
      // Attempt 2: Get transaction without joins
      const { data: transBasic, error: basicErr } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('id', transactionId)
        .single()
      
      if (!basicErr && transBasic) {
        transaction = transBasic
        transactionError = null // Clear error since we got the transaction
        
        // Fetch related data separately
        try {
          // Get project_credits - try both project_credit_id and project_credits_id
          const projectCreditId = transBasic.project_credit_id || transBasic.project_credits_id
          if (projectCreditId) {
            const { data: projectCredit } = await supabase
              .from('project_credits')
              .select('*, projects!inner(title, description, category, location)')
              .eq('id', projectCreditId)
              .single()
            
            if (projectCredit) {
              transaction.project_credits = projectCredit
              console.log('✅ Project credits loaded:', projectCredit.id)
            } else {
              // Try without the inner join
              const { data: projectCreditBasic } = await supabase
                .from('project_credits')
                .select('*')
                .eq('id', projectCreditId)
                .single()
              
              if (projectCreditBasic) {
                // Get project separately
                const { data: project } = await supabase
                  .from('projects')
                  .select('title, description, category, location')
                  .eq('id', projectCreditBasic.project_id)
                  .single()
                
                if (project) {
                  transaction.project_credits = {
                    ...projectCreditBasic,
                    projects: project
                  }
                  console.log('✅ Project credits and project loaded separately')
                } else {
                  transaction.project_credits = projectCreditBasic
                  console.log('✅ Project credits loaded (project info missing)')
                }
              }
            }
          } else {
            console.warn('⚠️ No project_credit_id found in transaction')
          }
          
          // Get buyer profile
          if (transBasic.buyer_id) {
            try {
              const { data: buyerProfile } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('id', transBasic.buyer_id)
                .single()
              
              if (buyerProfile) {
                transaction.buyer = buyerProfile
                console.log('✅ Buyer profile loaded:', buyerProfile.full_name)
              } else {
                console.warn('⚠️ Buyer profile not found for buyer_id:', transBasic.buyer_id)
              }
            } catch (profileErr) {
              console.warn('⚠️ Could not load buyer profile:', profileErr.message)
              // Continue without buyer profile - will use defaults
            }
          }
          
          console.log('✅ Transaction loaded with separate queries')
        } catch (relatedErr) {
          console.warn('⚠️ Could not load related data:', relatedErr)
          // Continue with basic transaction data
        }
      } else {
        transactionError = basicErr
        console.error('❌ Failed to load transaction even with separate query:', basicErr)
      }
    }

    // Final check - only throw if we truly don't have a transaction
    if (!transaction) {
      console.error('❌ Transaction query failed:', {
        transactionId,
        error: transactionError,
        hasTransaction: false
      })
      throw new Error(`Transaction not found: ${transactionError?.message || 'Unknown error'}`)
    }
    
    // Clear error if we have transaction (even if some related data is missing)
    transactionError = null
    
    console.log('✅ Transaction loaded successfully:', {
      id: transaction.id,
      buyer_id: transaction.buyer_id,
      quantity: transaction.quantity,
      hasProjectCredits: !!transaction.project_credits,
      hasBuyer: !!transaction.buyer
    })

    // Generate certificate number
    const certificateNumber = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Get wallet address if available (from user profile or wallet account)
    let walletAddress = null
    try {
      const { data: walletAccount } = await supabase
        .from('wallet_accounts')
        .select('wallet_address')
        .eq('user_id', transaction.buyer_id)
        .single()
      walletAddress = walletAccount?.wallet_address || null
    } catch (err) {
      console.warn('Could not fetch wallet address:', err)
    }

    // Extract project data safely (handle both joined and separate query formats)
    const projectData = transaction.project_credits?.projects || transaction.project_credits?.projects || {}
    const projectCreditData = transaction.project_credits || {}
    
    // Get purchase date/time from transaction (use created_at or transaction_date)
    const purchaseDateTime = transaction.created_at || transaction.transaction_date || transaction.purchased_at || new Date().toISOString()
    
    // Create certificate record with all required fields
    const certificateData = {
      user_id: transaction.buyer_id,
      transaction_id: transactionId,
      certificate_number: certificateNumber,
      certificate_type: type, // 'purchase' or 'retirement'
      project_title: projectData.title || 'Unknown Project',
      project_description: projectData.description || '',
      project_category: projectData.category || 'Unknown',
      project_location: projectData.location || 'Unknown',
      credits_quantity: transaction.quantity || 0,
      tonnes_co2: transaction.quantity || 0, // 1 credit = 1 tonne CO2
      beneficiary_name: transaction.buyer?.full_name || 'Unknown',
      beneficiary_email: transaction.buyer?.email || '',
      purpose: type === 'retirement' 
        ? (transaction.purpose || 'Carbon Offset') 
        : (transaction.purpose || 'Carbon Credit Purchase'),
      transaction_id_ref: transaction.id,
      payment_reference: transaction.payment_reference || '',
      wallet_address: walletAddress,
      vintage_year: projectCreditData.vintage_year || new Date().getFullYear(),
      verification_standard: projectCreditData.verification_standard || 'Unknown',
      purchase_date: purchaseDateTime, // Store purchase date/time
      purchase_datetime: purchaseDateTime, // Alternative field name
      issued_at: new Date().toISOString(),
      timestamp: purchaseDateTime, // Use purchase date as timestamp for display
      status: 'active',
    }

    // Try progressive fallback for certificate creation (schema might be missing columns)
    let certificate = null
    let certificateError = null
    
    // Attempt 1: Try with all fields
    let { data: certData, error: certErr } = await supabase
      .from('certificates')
      .insert(certificateData)
      .select()
      .single()

    if (!certErr && certData) {
      certificate = certData
      console.log('✅ Certificate created with all fields')
    } else {
      certificateError = certErr
      console.error('Error creating certificate with all fields:', certificateError)
      console.log('🔄 Attempting progressive fallback...')
      
      // Progressive fallback - try with fewer fields
      const minimalData = {
        user_id: transaction.buyer_id,
        transaction_id: transactionId,
        certificate_number: certificateNumber,
        project_title: transaction.project_credits.projects.title,
        project_category: transaction.project_credits.projects.category,
        project_location: transaction.project_credits.projects.location,
        credits_quantity: transaction.quantity,
        issued_at: new Date().toISOString(),
        status: 'active',
      }
      
      // Try progressive attempts
      const attempts = [
        // Attempt 2: With optional fields but no problematic ones
        {
          ...minimalData,
          vintage_year: projectCreditData.vintage_year || new Date().getFullYear(),
          verification_standard: projectCreditData.verification_standard || 'Unknown',
          certificate_type: type,
        },
        // Attempt 3: Without certificate_type
        {
          ...minimalData,
          vintage_year: projectCreditData.vintage_year || new Date().getFullYear(),
          verification_standard: projectCreditData.verification_standard || 'Unknown',
        },
        // Attempt 4: Minimal only (most likely to work)
        minimalData,
      ]
      
      for (let attempt = 0; attempt < attempts.length; attempt++) {
        const { data: certData, error: errorData } = await supabase
          .from('certificates')
          .insert(attempts[attempt])
          .select()
          .single()
        
        if (!errorData && certData) {
          certificate = certData
          certificateError = null
          console.log(`✅ Certificate created (attempt ${attempt + 2}/${attempts.length + 1})`)
          break
        } else {
          certificateError = errorData
          console.warn(`⚠️ Certificate creation attempt ${attempt + 2} failed:`, errorData?.message)
        }
      }
      
      if (!certificate) {
        throw new Error(`Failed to create certificate after ${attempts.length + 1} attempts: ${certificateError?.message || 'Unknown error'}`)
      }
      
      // Store additional data in certificate_data JSONB field if available
      try {
      const additionalData = {
        project_description: projectData.description || '',
        tonnes_co2: transaction.quantity || 0,
        beneficiary_name: transaction.buyer?.full_name || 'Unknown',
        beneficiary_email: transaction.buyer?.email || '',
        purpose: type === 'retirement' 
          ? (transaction.purpose || 'Carbon Offset') 
          : (transaction.purpose || 'Carbon Credit Purchase'),
        transaction_id_ref: transaction.id,
        payment_reference: transaction.payment_reference || '',
        wallet_address: walletAddress,
        purchase_date: purchaseDateTime, // Include purchase date/time
        purchase_datetime: purchaseDateTime, // Alternative field name
        timestamp: purchaseDateTime, // Use purchase date as timestamp
        certificate_type: type,
        vintage_year: projectCreditData.vintage_year || new Date().getFullYear(),
        verification_standard: projectCreditData.verification_standard || 'Unknown',
      }
        
        // Try to update with additional data (non-critical)
        const { error: updateError } = await supabase
          .from('certificates')
          .update({ certificate_data: additionalData })
          .eq('id', certificate.id)
        
        if (updateError) {
          console.warn('⚠️ Could not update certificate_data (non-critical):', updateError.message)
        } else {
          console.log('✅ Certificate data enriched with additional fields')
        }
      } catch (updateErr) {
        console.warn('⚠️ Error updating certificate_data (non-critical):', updateErr)
      }
    }
    
    if (!certificate) {
      throw new Error(`Failed to create certificate: ${certificateError?.message || 'Unknown error'}`)
    }

    // Sign the certificate (tamper-evident hash) — non-critical
    await signCertificateRecord(supabase, certificate)
    // Attach the carbon-unit serial from the transaction ledger
    await attachCreditSerial(supabase, certificate, transaction.serial_number)

    // Log the action (non-critical)
    try {
      await logUserAction(
        'CERTIFICATE_GENERATED',
        'certificate',
        transaction.buyer_id,
        certificate.id,
        {
          transaction_id: transactionId,
          certificate_number: certificateNumber,
          type: type,
        },
      )
    } catch (logErr) {
      console.warn('⚠️ Could not log certificate action (non-critical):', logErr)
    }

    console.log('✅ Certificate generated successfully!')
    console.log('✅ Certificate Number:', certificateNumber)
    console.log('✅ Certificate ID:', certificate.id)
    console.log('✅ Transaction ID:', transactionId)
    console.log('✅ User ID:', transaction.buyer_id)
    console.log('✅ Certificate will appear in certificate dashboard and retire section')
    
    // Verify certificate was actually created in database
    try {
      const { data: verifyCert, error: verifyError } = await supabase
        .from('certificates')
        .select('id, certificate_number, user_id, transaction_id')
        .eq('id', certificate.id)
        .single()
      
      if (verifyCert && !verifyError) {
        console.log('✅ Certificate verified in database:', verifyCert.certificate_number)
      } else {
        console.warn('⚠️ Certificate verification failed:', verifyError)
      }
    } catch (verifyErr) {
      console.warn('⚠️ Could not verify certificate in database:', verifyErr)
    }
    
    return certificate
  } catch (error) {
    console.error('Error generating certificate:', error)
    throw error
  }
}

/**
 * Generate a retirement certificate for a retirement record
 */
export async function generateRetirementCertificate(retirementId, userId) {
  const supabase = getSupabase()

  if (!supabase) {
    console.warn('Supabase client not available, skipping certificate generation')
    return null
  }

  try {
    // Get retirement details with project and user information
    const { data: retirement, error: retirementError } = await supabase
      .from('credit_retirements')
      .select(
        `
        *,
        projects!inner(id, title, description, category, location),
        profiles!credit_retirements_user_id_fkey(id, full_name, email)
      `,
      )
      .eq('id', retirementId)
      .single()

    if (retirementError || !retirement) {
      throw new Error('Retirement record not found')
    }

    // Get project credits for vintage year and verification standard
    const { data: projectCredit } = await supabase
      .from('project_credits')
      .select('vintage_year, verification_standard')
      .eq('project_id', retirement.project_id)
      .single()

    // Generate certificate number
    const certificateNumber = `RET-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

    // Get wallet address if available
    let walletAddress = null
    try {
      const { data: walletAccount } = await supabase
        .from('wallet_accounts')
        .select('wallet_address')
        .eq('user_id', userId)
        .single()
      walletAddress = walletAccount?.wallet_address || null
    } catch (err) {
      console.warn('Could not fetch wallet address:', err)
    }

    // Create retirement certificate record
    const certificateData = {
      user_id: userId,
      retirement_id: retirementId,
      certificate_number: certificateNumber,
      certificate_type: 'retirement',
      project_title: retirement.projects.title,
      project_description: retirement.projects.description || '',
      project_category: retirement.projects.category,
      project_location: retirement.projects.location,
      credits_quantity: retirement.quantity,
      tonnes_co2: retirement.quantity, // 1 credit = 1 tonne CO2
      beneficiary_name: retirement.profiles?.full_name || 'Unknown',
      beneficiary_email: retirement.profiles?.email || '',
      purpose: retirement.reason || 'Carbon Offset',
      transaction_id_ref: null, // Retirement doesn't have transaction_id
      payment_reference: null,
      wallet_address: walletAddress,
      vintage_year: projectCredit?.vintage_year || null,
      verification_standard: projectCredit?.verification_standard || null,
      issued_at: new Date().toISOString(),
      timestamp: retirement.retired_at || new Date().toISOString(),
      status: 'active',
    }

    const { data: certificate, error: certificateError } = await supabase
      .from('certificates')
      .insert(certificateData)
      .select()
      .single()

    if (certificateError) {
      console.error('Error creating retirement certificate:', certificateError)
      // Try with minimal fields
      const minimalData = {
        user_id: userId,
        certificate_number: certificateNumber,
        project_title: retirement.projects.title,
        project_category: retirement.projects.category,
        project_location: retirement.projects.location,
        credits_quantity: retirement.quantity,
        vintage_year: projectCredit?.vintage_year || null,
        verification_standard: projectCredit?.verification_standard || null,
        issued_at: new Date().toISOString(),
        status: 'active',
      }
      
      const { data: cert, error: minimalError } = await supabase
        .from('certificates')
        .insert(minimalData)
        .select()
        .single()
        
      if (minimalError) {
        throw new Error('Failed to create retirement certificate')
      }
      
      // Store additional data in certificate_data JSONB field if available
      const additionalData = {
        retirement_id: retirementId,
        project_description: retirement.projects.description || '',
        tonnes_co2: retirement.quantity,
        beneficiary_name: retirement.profiles?.full_name || 'Unknown',
        beneficiary_email: retirement.profiles?.email || '',
        purpose: retirement.reason || 'Carbon Offset',
        wallet_address: walletAddress,
        timestamp: retirement.retired_at || new Date().toISOString(),
        certificate_type: 'retirement',
      }
      
      await supabase
        .from('certificates')
        .update({ certificate_data: additionalData })
        .eq('id', cert.id)

      await signCertificateRecord(supabase, cert)
      await attachCreditSerial(supabase, cert, retirement.serial_number)
      return cert
    }

    // Sign the certificate (tamper-evident hash) — non-critical
    await signCertificateRecord(supabase, certificate)
    await attachCreditSerial(supabase, certificate, retirement.serial_number)

    // Log the action
    await logUserAction(
      'CERTIFICATE_GENERATED',
      'certificate',
      userId,
      certificate.id,
      {
        retirement_id: retirementId,
        certificate_number: certificateNumber,
        type: 'retirement',
      },
    )

    console.log('Retirement certificate generated successfully:', certificateNumber)
    return certificate
  } catch (error) {
    console.error('Error generating retirement certificate:', error)
    throw error
  }
}

/**
 * Generate missing certificates for existing purchases
 * This retroactively creates certificates for purchases that don't have them
 */
export async function generateMissingCertificates(userId) {
  const supabase = getSupabase()

  if (!supabase) {
    console.warn('Supabase client not available')
    return { generated: 0, errors: [] }
  }

  try {
    // Get all completed transactions without certificates
    const { data: transactions, error: transError } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('buyer_id', userId)
      .eq('status', 'completed')

    if (transError || !transactions || transactions.length === 0) {
      console.log('ℹ️ No transactions found for user')
      return { generated: 0, errors: [] }
    }

    // Get existing certificates to find which transactions are missing certificates
    const { data: existingCerts } = await supabase
      .from('certificates')
      .select('transaction_id')
      .eq('user_id', userId)

    const existingTransactionIds = new Set((existingCerts || []).map(c => c.transaction_id).filter(Boolean))
    const transactionsWithoutCerts = transactions.filter(t => !existingTransactionIds.has(t.id))

    if (transactionsWithoutCerts.length === 0) {
      console.log('✅ All transactions already have certificates')
      return { generated: 0, errors: [] }
    }

    console.log(`🔄 Generating ${transactionsWithoutCerts.length} missing certificates...`)

    const errors = []
    let generated = 0

    for (const transaction of transactionsWithoutCerts) {
      try {
        await generateCreditCertificate(transaction.id, 'purchase')
        generated++
        console.log(`✅ Generated certificate for transaction ${transaction.id}`)
      } catch (err) {
        console.error(`❌ Failed to generate certificate for transaction ${transaction.id}:`, err)
        errors.push({ transactionId: transaction.id, error: err.message })
      }
    }

    console.log(`✅ Generated ${generated} missing certificates`)
    return { generated, errors }
  } catch (error) {
    console.error('Error generating missing certificates:', error)
    return { generated: 0, errors: [{ error: error.message }] }
  }
}

/**
 * Get user's certificates.
 *
 * Throws on failure rather than returning []. Two reasons, and the second is
 * the one that bites: a retirement certificate is a buyer's evidence that they
 * offset something, so an empty list reads as "you have retired nothing" — and
 * CertificateView responds to a zero-length result by calling
 * generateMissingCertificates(), so a transient read failure sent the app off
 * to re-issue certificates for a user who already had them. Its `catch` already
 * renders the error state; until now that branch could never run.
 */
export async function getUserCertificates(userId) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  try {
    // Fetch certificates - start with minimal fields to avoid schema issues
    // certificate_data column may not exist
    let { data: certificates, error } = await supabase
      .from('certificates')
      .select('id, user_id, transaction_id, certificate_number, project_title, project_category, project_location, credits_quantity, vintage_year, verification_standard, issued_at, status')
      .eq('user_id', userId)
      .order('issued_at', { ascending: false })

    // If that fails, try select * as fallback
    if (error && error.message?.includes('column')) {
      console.warn('⚠️ Error with explicit columns, trying select *...')
      const { data: certsAll, error: allError } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', userId)
        .order('issued_at', { ascending: false })
      
      if (!allError && certsAll) {
        certificates = certsAll
        error = null
        console.log('✅ Fetched certificates with select *')
      } else {
        error = allError
      }
    }
    
    // Try to add certificate_data if it exists (optional, non-critical)
    // Note: certificate_data column may not exist, so we'll skip this enrichment
    // The certificates already have all necessary fields in the main query
    if (!error && certificates && certificates.length > 0) {
      // Skip certificate_data enrichment since the column doesn't exist
      // All certificate data is already in the main fields
      if (import.meta.env.DEV) {
        console.log('ℹ️ Skipping certificate_data enrichment (column does not exist)')
      }
    }

    if (error) {
      console.error('Error fetching certificates:', error)
      throw new Error(error.message || 'Failed to load certificates')
    }

    // Enrich certificates with data from certificate_data if needed
    const enrichedCertificates = (certificates || []).map(cert => {
      // If certificate_data exists, merge it with the certificate
      if (cert.certificate_data && typeof cert.certificate_data === 'object') {
        return {
          ...cert,
          ...cert.certificate_data,
        }
      }
      return cert
    })

    console.log('✅ Loaded certificates for user:', enrichedCertificates.length)
    return enrichedCertificates
  } catch (error) {
    console.error('Error in getUserCertificates:', error)
    throw error instanceof Error ? error : new Error('Failed to load certificates')
  }
}

/**
 * Get certificate by ID
 */
export async function getCertificate(certificateId, options = {}) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  try {
    const includeAll = options.includeAll === true

    let query = supabase.from('certificates').select('*').eq('id', certificateId)

    if (!includeAll) {
      let ownerId = options.userId || null

      if (!ownerId) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        ownerId = user?.id || null
      }

      if (!ownerId) {
        throw new Error('User not authenticated')
      }

      query = query.eq('user_id', ownerId)
    }

    const { data: certificate, error } = await query.single()

    if (error) {
      throw new Error('Certificate not found')
    }

    return certificate
  } catch (error) {
    console.error('Error fetching certificate:', error)
    throw error
  }
}

/**
 * Verify certificate
 */
export async function verifyCertificate(certificateNumber) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  try {
    const { data: certificate, error } = await supabase
      .from('certificates')
      .select(
        `
        *,
        credit_transactions!inner(
          *,
          project_credits!inner(
            *,
            projects!inner(title, category, location)
          )
        )
      `,
      )
      .eq('certificate_number', certificateNumber)
      .eq('status', 'active')
      .single()

    if (error || !certificate) {
      throw new Error('Certificate not found or invalid')
    }

    return certificate
  } catch (error) {
    console.error('Error verifying certificate:', error)
    throw error
  }
}
