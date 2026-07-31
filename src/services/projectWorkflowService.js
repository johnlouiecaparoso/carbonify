import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { logUserAction } from '@/services/auditService'
import { notifyProjectApproved, notifyProjectRejected } from '@/services/emailService'
import { notifyProjectSubmitted } from '@/services/emailService'

/**
 * Enhanced Project Workflow Service
 * Handles the complete flow from project submission to marketplace listing
 */
export class ProjectWorkflowService {
  constructor() {
    this.supabase = getSupabase()
  }

  /**
   * Submit a new project for verification
   * @param {Object} projectData - Project submission data
   * @returns {Promise<Object>} Created project
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

      // Create the project with all fields including estimated_credits and credit_price
      const { documents } = projectData
      
      // Convert numeric fields to numbers (form inputs are strings)
      const estimatedCredits = projectData.estimated_credits 
        ? (typeof projectData.estimated_credits === 'string' ? parseFloat(projectData.estimated_credits) : projectData.estimated_credits)
        : null
      const creditPrice = projectData.credit_price 
        ? (typeof projectData.credit_price === 'string' ? parseFloat(projectData.credit_price) : projectData.credit_price)
        : null
      
      // Validate numeric fields
      if (estimatedCredits !== null && (isNaN(estimatedCredits) || estimatedCredits <= 0)) {
        throw new Error('Estimated credits must be a positive number')
      }
      if (creditPrice !== null && (isNaN(creditPrice) || creditPrice <= 0)) {
        throw new Error('Credit price must be a positive number (minimum 0.01)')
      }
      
      const insertData = {
        title: projectData.title.trim(),
        description: projectData.description.trim(),
        category: projectData.category.trim(),
        location: projectData.location.trim(),
        expected_impact: projectData.expected_impact.trim(),
        // A draft is the developer's private workspace: it never enters the
        // review queue, so notify_project_submitted_trigger (which fires only
        // for 'submitted'/'pending') stays silent for it. Any other requested
        // status still becomes 'pending' — a client may not self-promote.
        status: projectData.status === 'draft' ? 'draft' : 'pending',
        user_id: finalUserId,
        ...(projectData.geo_coordinates && { geo_coordinates: projectData.geo_coordinates }),
        ...(projectData.boundary && { boundary: projectData.boundary }),
        ...(Array.isArray(projectData.co_benefits) && projectData.co_benefits.length && {
          co_benefits: projectData.co_benefits,
        }),
        ...(estimatedCredits !== null && !isNaN(estimatedCredits) && estimatedCredits > 0 && { estimated_credits: estimatedCredits }),
        ...(creditPrice !== null && !isNaN(creditPrice) && creditPrice > 0 && { credit_price: creditPrice }),
        ...(projectData.project_image && { project_image: projectData.project_image }),
        ...(projectData.image_name && { image_name: projectData.image_name }),
        ...(projectData.image_type && { image_type: projectData.image_type }),
        ...(projectData.image_size && { image_size: projectData.image_size }),
        ...(projectData.additionality_type && { additionality_type: projectData.additionality_type }),
        ...(projectData.permanence_years != null &&
          projectData.permanence_years !== '' && { permanence_years: projectData.permanence_years }),
        ...(projectData.reversal_risk && { reversal_risk: projectData.reversal_risk }),
        ...(projectData.methodology && { methodology: String(projectData.methodology).trim() }),
        ...(projectData.development_status && {
          development_status: String(projectData.development_status).trim(),
        }),
        ...(projectData.feedstock && { feedstock: String(projectData.feedstock).trim() }),
        ...(projectData.capacity != null &&
          projectData.capacity !== '' &&
          !isNaN(Number(projectData.capacity)) && { capacity: Number(projectData.capacity) }),
        ...(projectData.capacity_unit && { capacity_unit: String(projectData.capacity_unit).trim() }),
        ...(projectData.capex != null &&
          projectData.capex !== '' &&
          !isNaN(Number(projectData.capex)) && { capex: Number(projectData.capex) }),
        ...(projectData.opex != null &&
          projectData.opex !== '' &&
          !isNaN(Number(projectData.opex)) && { opex: Number(projectData.opex) }),
        ...(projectData.project_lifetime_years != null &&
          projectData.project_lifetime_years !== '' &&
          !isNaN(Number(projectData.project_lifetime_years)) && {
            project_lifetime_years: Number(projectData.project_lifetime_years),
          }),
        ...(projectData.funding_target != null &&
          projectData.funding_target !== '' &&
          !isNaN(Number(projectData.funding_target)) && { funding_target: Number(projectData.funding_target) }),
        ...(projectData.funding_raised != null &&
          projectData.funding_raised !== '' &&
          !isNaN(Number(projectData.funding_raised)) && { funding_raised: Number(projectData.funding_raised) }),
        ...(documents?.length && {
          supporting_documents: JSON.stringify(
            documents.map((doc) => ({
              name: doc.name,
              type: doc.type,
              size: doc.size,
              // Which compliance slot this file fills (see REQUIRED_PROJECT_DOCS).
              // Dropped until now, so a stored project could not say which file
              // was the PDD and which the ECC.
              label: doc.label || null,
              path: doc.path || null,
              url: doc.url || null,
            })),
          ),
        }),
      }

      let { data, error } = await this.supabase.from('projects').insert([insertData]).select().single()

      // Schema-drift safety: if an optional column is missing on this DB, drop
      // the offending field(s) and retry instead of failing the whole submit.
      const driftCols = [
        'supporting_documents',
        'boundary',
        'geo_coordinates',
        'additionality_type',
        'permanence_years',
        'reversal_risk',
        'methodology',
        'development_status',
        'feedstock',
        'capacity',
        'capacity_unit',
        'capex',
        'opex',
        'project_lifetime_years',
        'funding_target',
        'funding_raised',
      ]
      const blob = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
      if (error && driftCols.some((c) => blob.includes(c))) {
        const fallbackData = { ...insertData }
        driftCols.forEach((c) => {
          if (blob.includes(c)) delete fallbackData[c]
        })
        const retryResult = await this.supabase.from('projects').insert([fallbackData]).select().single()
        data = retryResult.data
        error = retryResult.error
      }

      if (error) {
        throw new Error(error.message || 'Failed to submit project')
      }

      // Log the submission
      await logUserAction('PROJECT_SUBMITTED', 'project', finalUserId, data.id, {
        title: data.title,
        category: data.category,
        location: data.location,
      })

      try {
        await notifyProjectSubmitted(data.id, data.user_id)
      } catch (emailError) {
        console.error('Error sending project submission notification:', emailError)
      }

      return data
    } catch (error) {
      console.error('Error submitting project:', error)
      throw error
    }
  }

  /**
   * Get all projects for a user
   * @param {string} userId - User ID (optional, uses current user if not provided)
   * @returns {Promise<Array>} User's projects
   */
  async getUserProjects(userId = null) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      if (!userId) {
        const {
          data: { user },
        } = await this.supabase.auth.getUser()
        if (!user) {
          throw new Error('User not authenticated')
        }
        userId = user.id
      }

      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message || 'Failed to fetch user projects')
      }

      return data || []
    } catch (error) {
      console.error('Error fetching user projects:', error)
      throw error
    }
  }

  /**
   * Get all pending projects (for verifiers/admins)
   * @returns {Promise<Array>} Pending projects
   */
  async getPendingProjects() {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      const { data, error } = await this.supabase
        .from('projects')
        .select(
          `
          *,
          profiles!user_id(full_name, email)
        `,
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(error.message || 'Failed to fetch pending projects')
      }

      return data || []
    } catch (error) {
      console.error('Error fetching pending projects:', error)
      throw error
    }
  }

  /**
   * Approve a project and generate credits
   * @param {string} projectId - Project ID
   * @param {string} verifierNotes - Verification notes
   * @returns {Promise<Object>} Updated project with generated credits
   */
  async approveProject(projectId, verifierNotes = '') {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Update project status to approved
      const { data: updatedProject, error: updateError } = await this.supabase
        .from('projects')
        .update({
          status: 'approved',
          verification_notes: verifierNotes,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (updateError) {
        throw new Error(updateError.message || 'Failed to approve project')
      }

      // NOTE: Credits are NOT generated at approval time under the decoupled
      // MRV model. They are minted only when a verifier approves a monitoring
      // report's VERs (see monitoringService.approveReport).

      // Send approval notification
      try {
        await notifyProjectApproved(projectId, updatedProject.user_id, verifierNotes)
      } catch (emailError) {
        console.error('Error sending approval notification:', emailError)
      }

      // Log the approval
      await logUserAction('PROJECT_APPROVED', 'project', user.id, projectId, {
        verifier_notes: verifierNotes,
      })

      return {
        project: updatedProject,
        credits: null,
      }
    } catch (error) {
      console.error('Error approving project:', error)
      throw error
    }
  }

  /**
   * Reject a project
   * @param {string} projectId - Project ID
   * @param {string} rejectionNotes - Rejection notes
   * @param {string} improvementSuggestions - Improvement suggestions
   * @returns {Promise<Object>} Updated project
   */
  async rejectProject(projectId, rejectionNotes = '', improvementSuggestions = '') {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Update project status to rejected
      const { data: updatedProject, error: updateError } = await this.supabase
        .from('projects')
        .update({
          status: 'rejected',
          verification_notes: rejectionNotes,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (updateError) {
        throw new Error(updateError.message || 'Failed to reject project')
      }

      // Send rejection notification
      try {
        await notifyProjectRejected(
          projectId,
          updatedProject.user_id,
          rejectionNotes,
          improvementSuggestions,
        )
      } catch (emailError) {
        console.error('Error sending rejection notification:', emailError)
      }

      // Log the rejection
      await logUserAction('PROJECT_REJECTED', 'project', user.id, projectId, {
        rejection_notes: rejectionNotes,
        improvement_suggestions: improvementSuggestions,
      })

      return updatedProject
    } catch (error) {
      console.error('Error rejecting project:', error)
      throw error
    }
  }

  /**
   * Generate credits for an approved project
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Generated credits data
   */
  async generateProjectCredits(projectId) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

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
      // PRIORITY: project.credit_price and project.estimated_credits (developer-set) are the source of truth
      // CRITICAL: estimated_credits is the MAXIMUM limit - we must not exceed it
      const creditsAmount = project.estimated_credits || this.calculateCreditsAmount(project.category, project.expected_impact)
      const basePrice = project.credit_price || this.calculateBasePrice(project.category)

      console.log('💰 Generating project credits:', {
        project_estimated_credits: project.estimated_credits,
        project_credit_price: project.credit_price,
        final_credits_amount: creditsAmount,
        final_base_price: basePrice,
        respects_limit: project.estimated_credits ? creditsAmount === project.estimated_credits : 'no limit set'
      })

      // Check if credits already exist
      const { data: existingCredits } = await this.supabase
        .from('project_credits')
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (existingCredits) {
        // Update existing credits with correct price if it's different
        if (project.credit_price && existingCredits.price_per_credit !== project.credit_price) {
          console.log('💰 Updating existing project_credits price from', existingCredits.price_per_credit, 'to', project.credit_price)
          await this.supabase
            .from('project_credits')
            .update({ price_per_credit: project.credit_price })
            .eq('id', existingCredits.id)
          
          existingCredits.price_per_credit = project.credit_price
        }
        
        // CRITICAL: Update existing credits to respect developer-set limit if it exists
        if (project.estimated_credits && project.estimated_credits > 0 && existingCredits.total_credits > project.estimated_credits) {
          console.warn(`⚠️ Existing credits (${existingCredits.total_credits}) exceed developer limit (${project.estimated_credits}). Updating to respect limit.`)
          const updatedAvailable = Math.min(
            existingCredits.credits_available || existingCredits.total_credits,
            project.estimated_credits
          )
          await this.supabase
            .from('project_credits')
            .update({
              total_credits: project.estimated_credits,
              credits_available: updatedAvailable
            })
            .eq('id', existingCredits.id)
          
          existingCredits.total_credits = project.estimated_credits
          existingCredits.credits_available = updatedAvailable
        }
        
        return existingCredits
      }

      // Create project credits - use project.credit_price (developer-set price)
      const { data: credits, error: creditsError } = await this.supabase
        .from('project_credits')
        .insert([
          {
            project_id: projectId,
            total_credits: creditsAmount,
            // `credits_available` is the canonical column the purchase path
            // decrements. (The legacy `available_credits` stray was retired in
            // 20260718000600 — it was never decremented after a sale.)
            credits_available: creditsAmount,
            price_per_credit: basePrice, // This uses project.credit_price if available
            currency: 'PHP',
          },
        ])
        .select()
        .single()

      if (creditsError) {
        throw new Error(creditsError.message || 'Failed to generate project credits')
      }

      // Create marketplace listing - use project.credit_price (developer-set price)
      const { data: listing, error: listingError } = await this.supabase
        .from('credit_listings')
        .insert([
          {
            project_credit_id: credits.id,
            seller_id: project.user_id,
            quantity: creditsAmount,
            price_per_credit: basePrice, // This uses project.credit_price if available
            currency: 'PHP',
          },
        ])
        .select()
        .single()

      if (listingError) {
        console.error('Error creating marketplace listing:', listingError)
        // Don't fail the entire operation if listing creation fails
      }

      return {
        ...credits,
        listing: listing,
      }
    } catch (error) {
      console.error('Error generating project credits:', error)
      throw error
    }
  }

  /**
   * Calculate credits amount based on project category and impact
   * @param {string} category - Project category
   * @param {string} expectedImpact - Expected impact description
   * @returns {number} Credits amount
   */
  calculateCreditsAmount(category, expectedImpact) {
    // Base credits by category
    const baseCredits = {
      Forestry: 1000,
      'Renewable Energy': 500,
      'Blue Carbon': 800,
      'Energy Efficiency': 300,
      'Waste Management': 400,
      Agriculture: 600,
    }

    let credits = baseCredits[category] || 500

    // Adjust based on impact keywords
    const impactText = expectedImpact.toLowerCase()
    if (impactText.includes('hectare') || impactText.includes('acres')) {
      credits *= 1.5
    }
    if (impactText.includes('tonne') || impactText.includes('ton')) {
      credits *= 2
    }
    if (impactText.includes('mw') || impactText.includes('megawatt')) {
      credits *= 3
    }

    return Math.round(credits)
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
   * Get project statistics
   * @returns {Promise<Object>} Project statistics
   */
  async getProjectStats() {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      // Get total projects
      const { count: totalProjects } = await this.supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })

      // Get projects by status
      const { count: pendingProjects } = await this.supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      const { count: approvedProjects } = await this.supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')

      // Get total credits generated
      const { data: creditsData } = await this.supabase
        .from('project_credits')
        .select('total_credits')

      const totalCreditsGenerated =
        creditsData?.reduce((sum, credit) => sum + credit.total_credits, 0) || 0

      return {
        totalProjects: totalProjects || 0,
        pendingProjects: pendingProjects || 0,
        approvedProjects: approvedProjects || 0,
        totalCreditsGenerated,
      }
    } catch (error) {
      console.error('Error fetching project stats:', error)
      throw error
    }
  }
}

// Export singleton instance
export const projectWorkflowService = new ProjectWorkflowService()
