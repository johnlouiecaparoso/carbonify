import { getSupabase } from '@/services/supabaseClient'

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(userEmail, userName) {
  // In a real implementation, this would integrate with an email service like SendGrid, AWS SES, etc.
  console.log(`Sending welcome email to ${userEmail} for user ${userName}`)

  // For now, we'll just log the action
  return {
    success: true,
    messageId: `welcome_${Date.now()}`,
    email: userEmail,
    type: 'welcome',
  }
}

/**
 * Notify user when their project is approved
 */
export async function notifyProjectApproved(projectId, userId, verifierNotes) {
  try {
    // Get project and user details
    const supabase = getSupabase()

    const { data: project } = await supabase
      .from('projects')
      .select('title, category, location')
      .eq('id', projectId)
      .single()

    const { data: user } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (!project || !user) {
      throw new Error('Project or user not found')
    }

    const emailData = {
      to: user.email,
      subject: `🎉 Your Project "${project.title}" Has Been Approved!`,
      template: 'project_approved',
      data: {
        userName: user.full_name,
        projectTitle: project.title,
        projectCategory: project.category,
        projectLocation: project.location,
        verifierNotes: verifierNotes,
        approvalDate: new Date().toLocaleDateString(),
      },
    }

    console.log('Sending project approval email:', emailData)
    return {
      success: true,
      messageId: `approval_${projectId}_${Date.now()}`,
      email: user.email,
      type: 'project_approved',
    }
  } catch (error) {
    console.error('Error sending project approval email:', error)
    throw error
  }
}

/**
 * Notify user when their project is rejected
 */
export async function notifyProjectRejected(
  projectId,
  userId,
  verifierNotes,
  improvementSuggestions,
) {
  try {
    // Get project and user details
    const supabase = getSupabase()

    const { data: project } = await supabase
      .from('projects')
      .select('title, category, location')
      .eq('id', projectId)
      .single()

    const { data: user } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (!project || !user) {
      throw new Error('Project or user not found')
    }

    const emailData = {
      to: user.email,
      subject: `Project Review: "${project.title}" Requires Updates`,
      template: 'project_rejected',
      data: {
        userName: user.full_name,
        projectTitle: project.title,
        projectCategory: project.category,
        projectLocation: project.location,
        verifierNotes: verifierNotes,
        improvementSuggestions: improvementSuggestions,
        rejectionDate: new Date().toLocaleDateString(),
      },
    }

    console.log('Sending project rejection email:', emailData)
    return {
      success: true,
      messageId: `rejection_${projectId}_${Date.now()}`,
      email: user.email,
      type: 'project_rejected',
    }
  } catch (error) {
    console.error('Error sending project rejection email:', error)
    throw error
  }
}

/**
 * Notify user when they purchase credits
 */
export async function notifyCreditPurchased(transactionId, userId) {
  try {
    // Get transaction and user details
    const supabase = getSupabase()

    const { data: transaction } = await supabase
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
      .eq('id', transactionId)
      .single()

    const { data: user } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (!transaction || !user) {
      throw new Error('Transaction or user not found')
    }

    const emailData = {
      to: user.email,
      subject: `✅ Carbon Credits Purchased Successfully!`,
      template: 'credit_purchased',
      data: {
        userName: user.full_name,
        projectTitle: transaction.project_credits.projects.title,
        projectCategory: transaction.project_credits.projects.category,
        projectLocation: transaction.project_credits.projects.location,
        creditsPurchased: transaction.quantity,
        pricePerCredit: transaction.price_per_credit,
        totalAmount: transaction.total_amount,
        currency: transaction.currency,
        purchaseDate: new Date(transaction.created_at).toLocaleDateString(),
        transactionId: transaction.id,
      },
    }

    console.log('Sending credit purchase email:', emailData)
    return {
      success: true,
      messageId: `purchase_${transactionId}_${Date.now()}`,
      email: user.email,
      type: 'credit_purchased',
    }
  } catch (error) {
    console.error('Error sending credit purchase email:', error)
    throw error
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(userEmail) {
  console.log(`Sending password reset email to ${userEmail}`)

  return {
    success: true,
    messageId: `reset_${Date.now()}`,
    email: userEmail,
    type: 'password_reset',
  }
}

/**
 * Send email verification
 */
export async function sendEmailVerification(userEmail, userName) {
  console.log(`Sending email verification to ${userEmail} for user ${userName}`)

  return {
    success: true,
    messageId: `verify_${Date.now()}`,
    email: userEmail,
    type: 'email_verification',
  }
}

/**
 * Notify when a project is submitted for review
 */
export async function notifyProjectSubmitted(projectId, userId) {
  if (!projectId) {
    return {
      success: false,
      projectId,
      userId,
      type: 'project_submitted',
      reason: 'Missing project id',
    }
  }

  // Third casualty of the H4 contract change, and the quietest: this posted
  // `{to, subject, html}` per recipient and every one of them 400'd, so no
  // verifier has been emailed about a new project since 2026-07-11. The project
  // details and the reviewer list are now read inside the function — this used
  // to fan out one relay-shaped request per verifier from the browser.
  await sendEmailViaFunction({
    type: 'project_submitted',
    project_id: projectId,
  })

  return {
    success: true,
    messageId: `project_submitted_${Date.now()}`,
    projectId,
    userId,
    type: 'project_submitted',
  }
}

export async function notifyVerifiersOfRoleApplication(application) {
  if (!application?.email) return { success: false, reason: 'Missing application data' }

  await sendEmailViaFunction({
    role_requested: application.role_requested,
    applicant_full_name: application.applicant_full_name,
    applicant_email: application.email,
  })

  return {
    success: true,
    type: 'role_application_submitted',
  }
}

/**
 * Get user email preferences
 */
export async function getUserEmailPreferences(userId) {
  console.log('Getting email preferences for user:', userId)

  // Return default preferences
  return {
    marketing: true,
    projectUpdates: true,
    priceAlerts: true,
    systemNotifications: true,
    weeklyDigest: false,
  }
}

/**
 * Update user email preferences
 */
export async function updateUserEmailPreferences(userId, preferences) {
  console.log('Updating email preferences for user:', userId, preferences)

  // In a real implementation, this would save to database
  return {
    success: true,
    preferences,
  }
}

/**
 * Notify applicant that their specialist role request was approved
 */
const PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_REF
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''

function deriveFunctionsUrl() {
  if (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL) {
    return import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
  }

  if (PROJECT_REF) {
    return `https://${PROJECT_REF}.functions.supabase.co`
  }

  if (SUPABASE_URL) {
    try {
      const parsedUrl = new URL(SUPABASE_URL)
      const host = parsedUrl.hostname.replace('.supabase.co', '.functions.supabase.co')
      return `${parsedUrl.protocol}//${host}`
    } catch (error) {
      console.warn('Could not derive Supabase Functions URL from VITE_SUPABASE_URL:', error)
    }
  }

  return ''
}

const FUNCTIONS_URL = deriveFunctionsUrl()

async function sendEmailViaFunction(payload) {
  const supabase = getSupabase()
  const functionsUrl = FUNCTIONS_URL ? `${FUNCTIONS_URL.replace(/\/$/, '')}/send-approval-email` : ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)
  // No `from`, no `to`, no `html`. The function derives all three; sending them
  // is what made it a relay (A2/H4). The payload is a message type plus a row id.
  const requestBody = { ...payload }

  // The user's own access token, not the anon key. config.toml's A2 note assumed
  // "the app invokes it via supabase.functions.invoke, which forwards the user's
  // token" — but this direct-fetch branch is the one that actually runs, and it
  // was sending the anon key. The function could therefore never tell a verifier
  // from an anonymous visitor, which the decision message now has to know.
  let accessToken = ''
  try {
    const { data: sessionData } = (await supabase?.auth?.getSession?.()) || {}
    accessToken = sessionData?.session?.access_token || ''
  } catch {
    accessToken = ''
  }

  try {
    if (!functionsUrl && supabase?.functions) {
      const { data, error } = await supabase.functions.invoke('send-approval-email', {
        body: requestBody,
      })
      if (error) {
        throw new Error(error.message || 'Failed to send email')
      }
      return data
    }

    if (!functionsUrl) {
      throw new Error(
        'Supabase functions URL is not configured and client invoke is unavailable for send-approval-email.',
      )
    }

    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { apikey: anonKey } : {}),
        ...(accessToken || anonKey
          ? { Authorization: `Bearer ${accessToken || anonKey}` }
          : {}),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || 'Failed to send email')
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

// The decision emails send an application id and nothing else.
//
// Until 2026-08-06 they posted `{to, subject, html}` — the shape the function
// stopped accepting when H4 closed the relay on 2026-07-11 — and had been
// answering 400 "role_requested must be project_developer or verifier" for every
// approval and every rejection since. Both call sites catch and console.error,
// so the verifier saw "Application approved." and the applicant heard nothing.
//
// The recipient address, the applicant's name, the outcome and the reviewer's
// notes now all come off the stored row inside the function. Passing them from
// here would be re-opening the hole with extra steps.
export async function sendRoleApplicationApprovalEmail(details) {
  const { applicationId, role } = details || {}

  if (!applicationId) {
    throw new Error('Approval email requires an application id.')
  }

  const result = await sendEmailViaFunction({
    type: 'role_application_decision',
    application_id: applicationId,
  })

  return {
    ...result,
    success: true,
    applicationId,
    role,
    type: 'role_application_approved',
  }
}

export async function sendRoleApplicationRejectionEmail(details) {
  const { applicationId, role } = details || {}

  if (!applicationId) {
    throw new Error('Rejection email requires an application id.')
  }

  const result = await sendEmailViaFunction({
    type: 'role_application_decision',
    application_id: applicationId,
  })

  return {
    ...result,
    success: true,
    applicationId,
    role,
    type: 'role_application_rejected',
  }
}
