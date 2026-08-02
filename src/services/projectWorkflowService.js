import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { logUserAction } from '@/services/auditService'
// notifyProjectApproved / notifyProjectRejected went with the approve/reject
// methods removed below — they were only ever called from them.
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

  // ── EVERYTHING ELSE WAS REMOVED 2026-08-02 (DEFERRED_BACKLOG #30 / #33) ──
  //
  // This class had nine methods. Exactly ONE is reachable from the application:
  // `submitProject`, called by ProjectForm. The other eight —
  // getUserProjects, getPendingProjects, approveProject, rejectProject,
  // generateProjectCredits, calculateCreditsAmount, calculateBasePrice and
  // getProjectStats — were called from nowhere, and `calculateCreditsAmount` /
  // `calculateBasePrice` were reachable only from `generateProjectCredits`,
  // which was itself dead.
  //
  // That mattered beyond dead weight: six of the nine name collisions #33
  // recorded across the three project services lived in this block. A second
  // `approveProject` / `getUserProjects` / `getProjectStats` that nothing calls
  // is still somewhere a future fix can land and appear to have worked. The
  // fulfillment saga on 2026-08-02 is what that costs — two copies, the tested
  // one not the live one, drifted apart on the guards that mattered.
  //
  // The live approval path is ProjectApprovalPanel -> projectApprovalService
  // .updateProjectStatus. Verified before deleting: no .vue, .js or .ts file
  // outside this service referenced any of the eight.
}

// Export singleton instance
export const projectWorkflowService = new ProjectWorkflowService()
