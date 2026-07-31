import { getSupabase, getSupabaseAsync } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { notifyProjectSubmitted } from '@/services/emailService'
import { missingRequiredDocLabels } from '@/constants/projectDocuments'
import { logUserAction } from '@/services/auditService'

/**
 * Record a verification decision on the project's audit trail.
 *
 * These decisions produced NO audit rows at all until now, despite the role
 * documentation listing time-stamped audit logs as a verifier feature. Writing
 * one is best-effort: an audit failure must never roll back a decision that has
 * already been persisted.
 */
async function recordProjectAudit(action, projectId, userId, metadata = {}) {
  try {
    // logUserAction is (action, entityType, userId, entityId, metadata) — the
    // user comes BEFORE the resource id.
    await logUserAction(action, 'projects', userId, projectId, metadata)
  } catch (err) {
    console.warn('[audit] failed to record', action, err?.message)
  }
}

const PROJECT_WORKFLOW_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  IN_REVIEW: 'in_review',
  NEEDS_REVISION: 'needs_revision',
  VALIDATED: 'validated',
  REJECTED: 'rejected',
}

function normalizeProjectWorkflowStatus(status) {
  const normalized = String(status || '').toLowerCase().trim()

  if (normalized === 'pending') return PROJECT_WORKFLOW_STATUS.SUBMITTED
  if (normalized === 'under_review') return PROJECT_WORKFLOW_STATUS.IN_REVIEW
  if (normalized === 'approved') return PROJECT_WORKFLOW_STATUS.VALIDATED

  if (Object.values(PROJECT_WORKFLOW_STATUS).includes(normalized)) {
    return normalized
  }

  return normalized
}

/**
 * Simplified Project Approval Service
 * Handles project approval and credit generation for immediate functionality
 */
export class ProjectApprovalService {
  constructor() {
    // Don't initialize here - get dynamically to avoid timing issues
  }

  get supabase() {
    const client = getSupabase()
    if (!client) {
      throw new Error('Supabase client not initialized. Please wait for app initialization.')
    }
    return client
  }

  /**
   * Approve a project and generate credits immediately
   * @param {string} projectId - Project ID
   * @param {string} notes - Approval notes
   * @returns {Promise<Object>} Approval result
   */
  async approveProject(projectId, notes = '') {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      console.log('🔍 Checking authentication in approveProject...')
      
      // Get current user ID using helper (works for test accounts too)
      const userId = await getCurrentUserId()
      console.log('🔍 getCurrentUserId result:', userId)
      
      if (!userId) {
        console.error('❌ No user ID found')
        throw new Error('User not authenticated')
      }

      // Independence: nobody validates their own project. Validating mints a
      // credit pool and an active listing, so this is self-issuance of a
      // sellable asset. Enforced for real by trg_guard_project_self_validation
      // (20260722000100); checked here so the verifier gets a sentence instead
      // of a raw Postgres exception.
      const { data: owned } = await this.supabase
        .from('projects')
        .select('user_id')
        .eq('id', projectId)
        .maybeSingle()

      if (owned?.user_id && owned.user_id === userId) {
        throw new Error(
          'You cannot validate your own project. Verification must be carried out by someone who does not own the project.',
        )
      }

      // Update project status to validated
      console.log('🔄 Validating project:', { projectId, userId })

      const { data: updatedProject, error: updateError } = await this.supabase
        .from('projects')
        .update({
          status: PROJECT_WORKFLOW_STATUS.VALIDATED,
          verification_notes: notes,
          verified_by: userId,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (updateError) {
        console.error('❌ Update failed:', updateError)
        throw new Error(updateError.message || 'Failed to validate project')
      }
      
      console.log('✅ Project validated successfully')

      await recordProjectAudit('project_validated', projectId, userId, { note: notes || null })

      // NOTE: Credits are intentionally NOT issued at validation time.
      // Under the decoupled MRV model, carbon credits are minted only when a
      // verifier approves a monitoring report's Verified Emission Reductions
      // (see monitoringService.approveReport + the mint_credits_on_ver_approval
      // DB trigger). Validation just marks the project eligible to begin MRV.
      return {
        project: updatedProject,
        credits: null,
        success: true,
      }
    } catch (error) {
      console.error('Error approving project:', error)
      throw error
    }
  }

  /**
  * Update project status (submitted -> in_review / needs_revision / validated / rejected)
   * @param {string} projectId
   * @param {string} status
   * @param {string} notes
   */
  async updateProjectStatus(projectId, status, notes = '') {
    if (typeof status !== 'string') {
      throw new Error('Status must be a string')
    }

    const normalizedStatus = normalizeProjectWorkflowStatus(status)

    if (normalizedStatus === PROJECT_WORKFLOW_STATUS.REJECTED && (!notes || notes.trim().length < 5)) {
      throw new Error('Please add a rejection note (at least 5 characters).')
    }

    if (normalizedStatus === PROJECT_WORKFLOW_STATUS.VALIDATED) {
      return this.approveProject(projectId, notes)
    }

    if (!Object.values(PROJECT_WORKFLOW_STATUS).includes(normalizedStatus)) {
      throw new Error('Invalid status')
    }

    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      const userId = await getCurrentUserId()
      if (!userId) {
        throw new Error('User not authenticated')
      }

      const updatePayload = {
        status: normalizedStatus,
        verification_notes: notes,
        verified_by: userId,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await this.supabase
        .from('projects')
        .update(updatePayload)
        .eq('id', projectId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message || 'Failed to update project status')
      }

      await recordProjectAudit(`project_${normalizedStatus}`, projectId, userId, {
        note: notes || null,
      })

      return data
    } catch (error) {
      console.error('Error updating project status:', error)
      throw error
    }
  }

  /**
   * Developer action: resubmit a project that a verifier sent back for revision.
   * Returns it to the review queue (status -> submitted) and bumps revision_count.
   * RLS restricts this to the project owner. Verifiers are alerted in-app by the
   * notify_project_submitted DB trigger (worded as a resubmission) — see
   * migration 20260626000200; client-side inserts can't reach other users' rows.
   * @param {string} projectId
   * @returns {Promise<Object>} updated project row
   */
  async resubmitProject(projectId) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }
    const userId = await getCurrentUserId()
    if (!userId) {
      throw new Error('User not authenticated')
    }

    // Only a needs_revision project belonging to the caller may be resubmitted.
    const { data: project, error: fetchError } = await this.supabase
      .from('projects')
      .select('id, user_id, status, revision_count')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      throw new Error('Project not found')
    }
    if (project.user_id !== userId) {
      throw new Error('You can only resubmit your own projects.')
    }
    if (normalizeProjectWorkflowStatus(project.status) !== PROJECT_WORKFLOW_STATUS.NEEDS_REVISION) {
      throw new Error('Only projects marked "needs revision" can be resubmitted.')
    }

    const { data, error } = await this.supabase
      .from('projects')
      .update({
        status: PROJECT_WORKFLOW_STATUS.SUBMITTED,
        revision_count: (project.revision_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message || 'Failed to resubmit project')
    }

    // Verifiers are notified by the notify_project_submitted DB trigger (RLS
    // blocks a developer from inserting notifications for other users).
    return data
  }

  /**
   * Move the caller's own draft into the review queue.
   *
   * The required-document check that ProjectForm applies at first submission
   * has to run again here — a draft is deliberately saved without it, so this
   * is the point where the rule is actually enforced. Mirrors resubmitProject:
   * ownership and source status are proven before the write, and the
   * notify_project_submitted DB trigger raises the verifier notification.
   *
   * @param {string} projectId
   * @returns {Promise<Object>} the updated project row
   */
  async submitDraftForReview(projectId) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }
    const userId = await getCurrentUserId()
    if (!userId) {
      throw new Error('User not authenticated')
    }

    const { data: project, error: fetchError } = await this.supabase
      .from('projects')
      .select('id, user_id, status, supporting_documents')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      throw new Error('Project not found')
    }
    if (project.user_id !== userId) {
      throw new Error('You can only submit your own projects.')
    }
    if (normalizeProjectWorkflowStatus(project.status) !== PROJECT_WORKFLOW_STATUS.DRAFT) {
      throw new Error('Only a draft can be submitted for review.')
    }

    const missing = missingRequiredDocLabels(project.supporting_documents)
    if (missing.length) {
      throw new Error(
        `Attach all required documents before submitting. Missing: ${missing.join(', ')}.`,
      )
    }

    const { data, error } = await this.supabase
      .from('projects')
      .update({
        status: PROJECT_WORKFLOW_STATUS.SUBMITTED,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message || 'Failed to submit project for review')
    }

    return data
  }

  /**
   * Generate credits for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Generated credits
   */
  async generateCreditsForProject(projectId) {
    try {
      // Get project details
      const { data: project, error: projectError } = await this.supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError || !project) {
        throw new Error('Project not found')
      }

      // Use project's credit data if available, otherwise calculate from category
      const creditsAmount = project.estimated_credits || this.calculateCreditsAmount(project.category)
      const basePrice = project.credit_price || this.calculateBasePrice(project.category)
      
      console.log('🔍 Project pricing data:', {
        projectId: projectId,
        projectTitle: project.title,
        estimated_credits: project.estimated_credits,
        credit_price: project.credit_price,
        usingCreditsAmount: creditsAmount,
        usingBasePrice: basePrice,
        calculatedCredits: this.calculateCreditsAmount(project.category),
        calculatedPrice: this.calculateBasePrice(project.category),
      })

      // Check if credits already exist (handle multiple gracefully)
      const { data: existingCreditsArray } = await this.supabase
        .from('project_credits')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .limit(1)
      
      // Use first existing credits if multiple exist
      const existingCredits = existingCreditsArray && existingCreditsArray.length > 0 
        ? existingCreditsArray[0] 
        : null
      
      // Warn if multiple project_credits exist for same project
      if (existingCreditsArray && existingCreditsArray.length > 1) {
        console.warn(`⚠️ Found ${existingCreditsArray.length} project_credits for project_id ${projectId}, using oldest`)
      }

      let credits = existingCredits
      let listing = null
      let listingCreated = false

      // If credits exist, check for listing and return existing
      if (existingCredits) {
        console.log('✅ Project credits already exist, checking for listing...')
        
        // Check for existing listings (use maybeSingle to handle duplicates gracefully)
        const { data: existingListings } = await this.supabase
          .from('credit_listings')
          .select('*')
          .eq('project_credit_id', existingCredits.id)
          .eq('status', 'active')
        
        // If multiple listings exist, log warning but use first one
        if (existingListings && existingListings.length > 0) {
          if (existingListings.length > 1) {
            console.warn(`⚠️ Found ${existingListings.length} listings for project_credit_id ${existingCredits.id}, using first one`)
          }
          listing = existingListings[0]
          console.log('✅ Marketplace listing already exists')
          return {
            ...credits,
            listing: listing,
          }
        }
        
        // Credits exist but no listing - create with duplicate protection
        console.log('⚠️ Credits exist but no listing found, creating listing...')
        
        // Double-check listing doesn't exist (race condition protection)
        const { data: doubleCheck } = await this.supabase
          .from('credit_listings')
          .select('id')
          .eq('project_credit_id', existingCredits.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (doubleCheck) {
          // Listing was just created by another process
          console.log('✅ Listing exists (race condition detected), fetching...')
          const { data: fetchedListing } = await this.supabase
            .from('credit_listings')
            .select('*')
            .eq('project_credit_id', existingCredits.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle()
          listing = fetchedListing
        } else {
          // Safe to insert - unique constraint will prevent duplicates
          const { data: newListing, error: listingError } = await this.supabase
            .from('credit_listings')
            .insert([
              {
                project_credit_id: existingCredits.id,
                seller_id: project.user_id,
                quantity: existingCredits.total_credits || existingCredits.available_credits || creditsAmount,
                price_per_credit: existingCredits.price_per_credit || basePrice,
                currency: 'PHP',
                status: 'active',
              },
            ])
            .select()
            .maybeSingle()

          // Handle unique constraint violation
          if (listingError) {
            if (listingError.code === '23505') {
              // Unique constraint violation - fetch existing
              console.log('⚠️ Listing already exists (unique constraint), fetching...')
              const { data: fetchedListing } = await this.supabase
                .from('credit_listings')
                .select('*')
                .eq('project_credit_id', existingCredits.id)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle()
              listing = fetchedListing
            } else {
              console.error('Error creating marketplace listing:', listingError)
            }
          } else {
            listing = newListing
            listingCreated = true
          }
        }
        
        return {
          ...credits,
          listing: listing,
          listing_created: listingCreated,
        }
      }

      // Create project credits (new)
      const { data: newCredits, error: creditsError } = await this.supabase
        .from('project_credits')
        .insert([
          {
            project_id: projectId,
            total_credits: creditsAmount,
            // `credits_available` is the canonical column the purchase path
            // decrements. (The legacy `available_credits` stray was retired in
            // 20260718000600 — it was never decremented after a sale.)
            credits_available: creditsAmount,
            price_per_credit: basePrice,
            currency: 'PHP',
          },
        ])
        .select()
        .single()

      if (creditsError) {
        throw new Error(creditsError.message || 'Failed to generate project credits')
      }

      credits = newCredits

      // Check if marketplace listing already exists (safety check - handle duplicates)
      const { data: existingListings } = await this.supabase
        .from('credit_listings')
        .select('*')
        .eq('project_credit_id', credits.id)
        .eq('status', 'active')

      // If multiple listings exist, use first one and log warning
      if (existingListings && existingListings.length > 0) {
        if (existingListings.length > 1) {
          console.warn(`⚠️ Found ${existingListings.length} listings for new project_credit_id ${credits.id}, using first one`)
        }
        listing = existingListings[0]
        console.log('✅ Marketplace listing already exists for new credits')
      } else {
        // Only create new listing if it doesn't exist - with duplicate protection
        console.log('Creating new listing for new credits...')
        
        // Double-check listing doesn't exist (race condition protection)
        const { data: doubleCheck } = await this.supabase
          .from('credit_listings')
          .select('id')
          .eq('project_credit_id', credits.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (doubleCheck) {
          // Listing was just created by another process
          console.log('✅ Listing exists (race condition detected), fetching...')
          const { data: fetchedListing } = await this.supabase
            .from('credit_listings')
            .select('*')
            .eq('project_credit_id', credits.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle()
          listing = fetchedListing
        } else {
          // Safe to insert - unique constraint will prevent duplicates
          const { data: newListing, error: listingError } = await this.supabase
            .from('credit_listings')
            .insert([
              {
                project_credit_id: credits.id,
                seller_id: project.user_id,
                quantity: creditsAmount,
                price_per_credit: basePrice,
                currency: 'PHP',
                status: 'active',
              },
            ])
            .select()
            .maybeSingle()

          // Handle unique constraint violation
          if (listingError) {
            if (listingError.code === '23505') {
              // Unique constraint violation - fetch existing
              console.log('⚠️ Listing already exists (unique constraint), fetching...')
              const { data: fetchedListing } = await this.supabase
                .from('credit_listings')
                .select('*')
                .eq('project_credit_id', credits.id)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle()
              listing = fetchedListing
            } else {
              console.error('Error creating marketplace listing:', listingError)
              // Don't fail the entire operation if listing creation fails
            }
          } else {
            listing = newListing
            listingCreated = true
          }
        }
      }

      return {
        ...credits,
        listing: listing,
        listing_created: listingCreated,
      }
    } catch (error) {
      console.error('Error generating credits:', error)
      throw error
    }
  }

  /**
   * Calculate credits amount based on project category
   * @param {string} category - Project category
   * @returns {number} Credits amount
   */
  calculateCreditsAmount(category) {
    const baseCredits = {
      Forestry: 1000,
      'Renewable Energy': 500,
      'Blue Carbon': 800,
      'Energy Efficiency': 300,
      'Waste Management': 400,
      Agriculture: 600,
    }

    return baseCredits[category] || 500
  }

  /**
   * Calculate base price based on project category
   * @param {string} category - Project category
   * @returns {number} Base price per credit
   */
  calculateBasePrice(category) {
    const basePrices = {
      Forestry: 15.0,
      'Renewable Energy': 20.0,
      'Blue Carbon': 18.0,
      'Energy Efficiency': 12.0,
      'Waste Management': 14.0,
      Agriculture: 16.0,
    }

    return basePrices[category] || 15.0
  }

  /**
   * Get pending projects
   * @returns {Promise<Array>} Pending projects
   */
  async getPendingProjects() {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      // First get the projects
      const { data: projects, error: projectsError } = await this.supabase
        .from('projects')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (projectsError) {
        throw new Error(projectsError.message || 'Failed to fetch pending projects')
      }

      if (!projects || projects.length === 0) {
        return []
      }

      // Then get the user profiles for each project
      const userIds = [...new Set(projects.map((p) => p.user_id))]
      const { data: profiles, error: profilesError } = await this.supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesError) {
        console.warn('Could not fetch user profiles:', profilesError.message)
        // Return projects without profile data
        return projects
      }

      // Combine projects with profile data
      const data = projects.map((project) => {
        const profile = profiles?.find((p) => p.id === project.user_id)
        return {
          ...project,
          user_name: profile?.full_name || 'Unknown User',
          user_email: profile?.email || 'unknown@example.com',
        }
      })

      return data
    } catch (error) {
      console.error('Error fetching pending projects:', error)
      throw error
    }
  }

  /**
   * Submit a new project for approval
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Submitted project
   */
  async submitProject(projectData, userId = null) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      // Use provided userId or try to get from auth
      let finalUserId = userId
      if (!finalUserId) {
        finalUserId = await getCurrentUserId()
      }
      if (!finalUserId) {
        throw new Error('User not authenticated')
      }

      // Prepare project data (exclude documents field as it doesn't exist in DB)
      const projectDataWithoutDocuments = { ...projectData }
      delete projectDataWithoutDocuments.documents
      const submitData = {
        ...projectDataWithoutDocuments,
        user_id: finalUserId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Insert project
      const { data: project, error } = await this.supabase
        .from('projects')
        .insert([submitData])
        .select()
        .single()

      if (error) {
        throw new Error(error.message || 'Failed to submit project')
      }

      try {
        await notifyProjectSubmitted(project.id, project.user_id)
      } catch (emailError) {
        console.error('Error sending project submission notification:', emailError)
      }

      return project
    } catch (error) {
      console.error('Error submitting project:', error)
      throw error
    }
  }

  /**
   * Get all projects for testing
   * @returns {Promise<Array>} All projects
   */
  async getAllProjects() {
    let supabase = this.supabase
    if (!supabase) {
      // Try to initialize if not ready
      supabase = await getSupabaseAsync()
    }

    if (!supabase) {
      console.error('Supabase client not available in getAllProjects')
      throw new Error('Supabase client not available')
    }

    try {
      // Fetch all projects from Supabase - this gets fresh data from the database
      // Deleted projects will NOT appear here because they are physically removed.
      //
      // Drafts are excluded: a draft is the developer's private workspace, not a
      // submission. Without this filter every half-written draft would surface in
      // the verifier console's "All" tab the moment save-as-draft shipped.
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .neq('status', 'draft')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching projects:', error)
        throw new Error(error.message || 'Failed to fetch projects')
      }

      const projects = data || []
      console.log(`📊 Fetched ${projects.length} projects from Supabase database (deleted projects are not included)`)
      
      // Return only projects that actually exist in the database
      // Since Supabase physically deletes records, any project in this array exists in the database
      return projects
    } catch (error) {
      console.error('Error fetching projects:', error)
      throw error
    }
  }
}

// Export singleton instance
export const projectApprovalService = new ProjectApprovalService()
