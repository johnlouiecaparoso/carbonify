import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { notifyProjectSubmitted } from '@/services/emailService'
import { PROJECT_TYPES, isValidProjectType } from '@/constants/projectTypes'

// Statuses a project developer may still edit or delete their own submission in
// (i.e. before it is validated/minted or under active verifier review). Must
// stay in sync with the projects RLS policies
// (supabase/migrations/20260624000000_projects_rls_owner_and_staff.sql).
const OWNER_EDITABLE_STATUSES = ['draft', 'pending', 'submitted', 'needs_revision']

export class ProjectService {
  constructor() {
    // Don't initialize supabase in constructor to avoid timing issues
  }

  get supabase() {
    const client = getSupabase()
    if (!client) {
      throw new Error(
        'Supabase client not available. Please check your environment variables and try refreshing the page.',
      )
    }
    return client
  }

  /**
   * Create a new project
   * @param {Object} projectData - Project data
   * @param {string} projectData.title - Project title
   * @param {string} projectData.description - Project description
   * @param {string} projectData.category - Project category
   * @param {string} projectData.location - Project location
   * @param {string} projectData.expected_impact - Expected impact
   * @param {string} userId - Optional user ID (if not provided, will try to get from auth)
   * @returns {Promise<Object>} Created project
   */
  async createProject(projectData, userId = null) {
    const { title, description, category, location, expected_impact } = projectData

    // Validate required fields
    if (!title || !description || !category || !location || !expected_impact) {
      throw new Error('All fields are required')
    }

    // Enforce Philippine-eligible project type (defense in depth — the form
    // dropdown is not trusted on its own; the DB CHECK constraint backs this up)
    if (!isValidProjectType(category)) {
      throw new Error('Invalid project type. Please choose a Philippine-eligible category.')
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

      // Prepare insert data with all fields including estimated_credits and credit_price
      const { documents } = projectData
      
      // Convert numeric fields to numbers (form inputs are strings)
      const estimatedCredits = projectData.estimated_credits 
        ? parseFloat(projectData.estimated_credits) 
        : null
      const creditPrice = projectData.credit_price 
        ? parseFloat(projectData.credit_price) 
        : null
      
      // Validate numeric fields
      if (estimatedCredits !== null && (isNaN(estimatedCredits) || estimatedCredits <= 0)) {
        throw new Error('Estimated credits must be a positive number')
      }
      if (creditPrice !== null && (isNaN(creditPrice) || creditPrice <= 0)) {
        throw new Error('Credit price must be a positive number')
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
        ...(estimatedCredits !== null && !isNaN(estimatedCredits) && { estimated_credits: estimatedCredits }),
        ...(creditPrice !== null && !isNaN(creditPrice) && { credit_price: creditPrice }),
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

      console.log('🔍 Creating project with data:', {
        title: insertData.title,
        estimated_credits: insertData.estimated_credits,
        credit_price: insertData.credit_price,
        fullInsertData: insertData
      })

      let { data, error } = await this.supabase.from('projects').insert([insertData]).select().single()

      // Schema-drift safety: drop any optional column missing on this DB and retry.
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
        throw new Error(error.message || 'Failed to create project')
      }

      // Send project submission notification email
      try {
        await notifyProjectSubmitted(data.id, data.user_id)
        console.log('Project submission notification sent')
      } catch (emailError) {
        console.error('Error sending project submission notification:', emailError)
        // Don't fail the entire operation if email sending fails
      }

      return data
    } catch (error) {
      console.error('Error creating project:', error)
      throw error
    }
  }

  /**
   * Get all projects for the current user
   * @returns {Promise<Array>} User's projects
   */
  async getUserProjects() {
    try {
      // SECURITY FIX: Get current user ID and filter by user_id
      const userId = await getCurrentUserId()
      if (!userId) {
        throw new Error('User not authenticated')
      }

      const { data, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId) // CRITICAL: Filter by user_id to show only user's projects
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message || 'Failed to fetch projects')
      }

      return data || []
    } catch (error) {
      console.error('Error fetching user projects:', error)
      throw error
    }
  }

  /**
   * Get a specific project by ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Project data
   */
  async getProject(projectId, options = {}) {
    if (!projectId) {
      throw new Error('Project ID missing')
    }

    try {
      const includeAll = options.includeAll === true

      let query = this.supabase.from('projects').select('*').eq('id', projectId)

      if (!includeAll) {
        const userId = await getCurrentUserId()
        if (!userId) {
          throw new Error('User not authenticated')
        }
        query = query.eq('user_id', userId)
      }

      const { data, error } = await query.single()

      if (error) {
        throw new Error(error.message || 'Failed to fetch project')
      }

      return data
    } catch (error) {
      console.error('Error fetching project:', error)
      throw error
    }
  }

  /**
   * Update a project (only if status is pending)
   * @param {string} projectId - Project ID
   * @param {Object} updates - Project updates
   * @param {boolean} isAdmin - Whether the caller is an admin (fetch any project, not just own)
   * @returns {Promise<Object>} Updated project
   */
  async updateProject(projectId, updates, isAdmin = false) {
    if (!projectId) {
      throw new Error('Project ID missing')
    }

    try {
      // First check if project exists and is still editable by its owner.
      // Admins/verifiers bypass the status gate (they fetch any project).
      const project = await this.getProject(projectId, { includeAll: isAdmin })
      if (!isAdmin && !OWNER_EDITABLE_STATUSES.includes(project.status)) {
        throw new Error('This project can no longer be edited once it is under review or validated.')
      }

      // The submit form sends extra fields that are NOT projects columns (a
      // `documents` array plus collect-only fields like host_entity/start_date/
      // capex that the create path also drops). PostgREST 400s on any unknown
      // column, so map `documents` -> the `supporting_documents` JSON and then
      // keep only real, editable columns. An empty documents array means "no new
      // files attached" — leave existing docs untouched rather than wiping them.
      const sanitized = { ...updates }
      if ('documents' in sanitized) {
        const docs = Array.isArray(sanitized.documents) ? sanitized.documents : []
        if (docs.length) {
          sanitized.supporting_documents = JSON.stringify(
            docs.map((doc) => ({
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
          )
        }
        delete sanitized.documents
      }

      const EDITABLE_COLUMNS = [
        'title',
        'description',
        'category',
        'location',
        'expected_impact',
        'estimated_credits',
        'credit_price',
        'geo_coordinates',
        'barangay',
        'municipality',
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
        'vintage',
        'co_benefits',
        'boundary',
        'project_image',
        'image_name',
        'image_type',
        'image_size',
        'supporting_documents',
        'additionality_type',
        'permanence_years',
        'reversal_risk',
        'status',
      ]
      const payload = {}
      for (const key of EDITABLE_COLUMNS) {
        if (key in sanitized) payload[key] = sanitized[key]
      }

      const { data, error } = await this.supabase
        .from('projects')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message || 'Failed to update project')
      }

      return data
    } catch (error) {
      console.error('Error updating project:', error)
      throw error
    }
  }

  /**
   * Delete a project (only if status is pending for regular users, any status for admins)
   * @param {string} projectId - Project ID
   * @param {boolean} isAdmin - Whether the user is an admin
   * @returns {Promise<boolean>} Success status
   */
  async deleteProject(projectId, isAdmin = false) {
    if (!projectId) {
      throw new Error('Project ID missing')
    }

    try {
      // First check if project exists
      const project = await this.getProject(projectId)

      // For non-admin users, only allow deletion of their own pre-validation
      // submissions (draft/pending/submitted/needs_revision).
      if (!isAdmin && !OWNER_EDITABLE_STATUSES.includes(project.status)) {
        throw new Error(
          'Only projects that are still pending review can be deleted. Contact an administrator for approved/rejected projects.',
        )
      }

      // For admin users, show warning for approved projects
      if (isAdmin && project.status === 'approved') {
        console.warn('⚠️ Admin deleting approved project:', project.title)
      }

      // Step 1: Get all project_credits for this project
      const { data: projectCredits, error: creditsFetchError } = await this.supabase
        .from('project_credits')
        .select('id')
        .eq('project_id', projectId)

      if (creditsFetchError) {
        console.warn('⚠️ Could not fetch project credits (may not exist):', creditsFetchError)
      }

      const projectCreditIds = projectCredits?.map(pc => pc.id) || []
      console.log(`🗑️ Found ${projectCreditIds.length} project credits to delete for project ${projectId}`)

      // Step 2: Delete credit listings associated with these project credits
      if (projectCreditIds.length > 0) {
        try {
          const { error: listingsError, count: deletedListings } = await this.supabase
            .from('credit_listings')
            .delete({ count: 'exact' })
            .in('project_credit_id', projectCreditIds)
          
          if (listingsError) {
            console.warn('⚠️ Could not delete credit listings:', listingsError)
          } else {
            console.log(`✅ Deleted ${deletedListings || 0} credit listings`)
          }
        } catch (err) {
          console.warn('⚠️ Error deleting credit listings:', err)
        }
      }

      // Step 3: Delete project credits
      try {
        const { error: creditsError, count: deletedCredits } = await this.supabase
          .from('project_credits')
          .delete({ count: 'exact' })
          .eq('project_id', projectId)
        
        if (creditsError) {
          console.warn('⚠️ Could not delete project credits:', creditsError)
        } else {
          console.log(`✅ Deleted ${deletedCredits || 0} project credits`)
        }
      } catch (err) {
        console.warn('⚠️ Error deleting project credits:', err)
      }

      // Finally delete the project itself - this physically removes it from Supabase
      const { error, count } = await this.supabase
        .from('projects')
        .delete({ count: 'exact' })
        .eq('id', projectId)

      if (error) {
        console.error('❌ Error deleting project:', error)
        // Provide more detailed error message
        if (error.code === '23503') {
          throw new Error('Cannot delete project: It has related data that must be removed first. Please check database constraints.')
        }
        throw new Error(error.message || 'Failed to delete project')
      }

      // Verify the project was actually deleted
      if (count === 0) {
        console.warn('⚠️ No rows deleted - project may not exist:', projectId)
        throw new Error('Project not found or already deleted')
      }

      console.log(`✅ Project deleted successfully from Supabase (${count} row(s) deleted):`, projectId)
      
      // Double-check: Verify project no longer exists in database
      // Try multiple times to ensure deletion is complete
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { data: verifyProject, error: verifyError } = await this.supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .single()
        
        if (verifyError && verifyError.code === 'PGRST116') {
          // PGRST116 means no rows returned - this is good, project is deleted
          console.log(`✅ Verification attempt ${attempt}: Project confirmed deleted from Supabase database`)
          break
        }
        
        if (verifyProject) {
          if (attempt < 3) {
            console.warn(`⚠️ Verification attempt ${attempt}: Project still exists, waiting and retrying...`)
            await new Promise(resolve => setTimeout(resolve, 500))
          } else {
            console.error('❌ CRITICAL: Project still exists after deletion after 3 attempts!', projectId)
            throw new Error('Project deletion verification failed - project still exists in database after multiple verification attempts')
          }
        } else {
          console.log(`✅ Verification attempt ${attempt}: Project confirmed deleted from Supabase database`)
          break
        }
      }
      
      console.log('✅ Final verification: Project confirmed completely deleted from Supabase database')
      return true
    } catch (error) {
      console.error('Error deleting project:', error)
      throw error
    }
  }

  /**
   * Admin-only: Delete any project regardless of status
   * @param {string} projectId - Project ID
   * @returns {Promise<boolean>} Success status
   */
  async adminDeleteProject(projectId) {
    return this.deleteProject(projectId, true)
  }

  /**
   * Admin-only: Delete multiple projects
   * @param {string[]} projectIds - Array of project IDs
   * @returns {Promise<{success: number, failed: number, errors: string[]}>} Results
   */
  async adminDeleteMultipleProjects(projectIds) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      throw new Error('Project IDs array is required')
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    }

    for (const projectId of projectIds) {
      try {
        await this.adminDeleteProject(projectId)
        results.success++
      } catch (error) {
        results.failed++
        results.errors.push(`Project ${projectId}: ${error.message}`)
      }
    }

    return results
  }

  /**
   * Get all projects (admin/verifier only)
   * @param {Object} filters - Filter options
   * @param {string} filters.status - Filter by status
   * @param {string} filters.category - Filter by category
   * @param {number} filters.limit - Limit results
   * @param {number} filters.offset - Offset for pagination
   * @returns {Promise<Object>} Projects with pagination info
   */
  async getAllProjects(filters = {}) {
    try {
      let query = this.supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.category) {
        query = query.eq('category', filters.category)
      }

      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message || 'Failed to fetch projects')
      }

      return {
        projects: data || [],
        total: data?.length || 0,
      }
    } catch (error) {
      console.error('Error fetching all projects:', error)
      throw error
    }
  }

  /**
   * Update project status (verifier/admin only)
   * @param {string} projectId - Project ID
   * @param {string} status - New status
   * @param {string} verificationNotes - Verification notes
   * @returns {Promise<Object>} Updated project
   */
  async updateProjectStatus(projectId, status, verificationNotes = '', reviewerId = null) {
    if (!projectId) {
      throw new Error('Project ID missing')
    }

    const normalizedStatus = String(status || '').toLowerCase().trim()
    const acceptedStatuses = ['draft', 'pending', 'submitted', 'under_review', 'in_review', 'needs_revision', 'approved', 'validated', 'rejected']
    if (!acceptedStatuses.includes(normalizedStatus)) {
      throw new Error('Invalid status')
    }

    const canonicalStatus = normalizedStatus === 'pending' ? 'submitted' : normalizedStatus === 'under_review' ? 'in_review' : normalizedStatus === 'approved' ? 'validated' : normalizedStatus

    try {
      const { data, error } = await this.supabase
        .from('projects')
        .update({
          status: canonicalStatus,
          verification_notes: verificationNotes,
          // `verified_by` is a uuid column — a literal 'current_user()' string
          // throws invalid-input-syntax. Record the reviewer's id when known,
          // otherwise leave it null (the admin/verifier panel passes reviewerId).
          verified_by: ['validated', 'rejected', 'needs_revision'].includes(canonicalStatus)
            ? reviewerId
            : null,
          verified_at:
            ['validated', 'rejected', 'needs_revision'].includes(canonicalStatus) ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message || 'Failed to update project status')
      }

      return data
    } catch (error) {
      console.error('Error updating project status:', error)
      throw error
    }
  }

  /**
   * Assign project to a verifier
   * @param {string} projectId - Project ID
   * @param {string} verifierId - Verifier user ID
   * @returns {Promise<Object>} Updated project
   */
  async assignProjectToVerifier(projectId, verifierId) {
    if (!projectId || !verifierId) {
      throw new Error('Project ID and Verifier ID are required')
    }

    try {
      const { data, error } = await this.supabase
        .from('projects')
        .update({
          assigned_verifier_id: verifierId,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select()
        .single()

      if (error) {
        throw new Error(error.message || 'Failed to assign project to verifier')
      }

      return data
    } catch (error) {
      console.error('Error assigning project to verifier:', error)
      throw error
    }
  }

  /**
   * Get available verifiers for assignment
   * @returns {Promise<Array>} List of verifiers
   */
  async getAvailableVerifiers() {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'verifier')
        .order('full_name')

      if (error) {
        throw new Error(error.message || 'Failed to fetch verifiers')
      }

      return data || []
    } catch (error) {
      console.error('Error fetching verifiers:', error)
      throw error
    }
  }

  /**
   * Get project statistics
   * @returns {Promise<Object>} Project statistics
   */
  async getProjectStats(options = {}) {
    try {
      const includeAll = options.includeAll === true
      const explicitUserId = options.userId || null

      let query = this.supabase.from('projects').select('status, category, created_at')

      if (!includeAll) {
        const userId = explicitUserId || (await getCurrentUserId())
        if (!userId) {
          throw new Error('User not authenticated')
        }
        query = query.eq('user_id', userId)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message || 'Failed to fetch project statistics')
      }

      const stats = {
        total: data?.length || 0,
        byStatus: {},
        byCategory: {},
        recent: 0,
      }

      // Calculate statistics
      ;(data || []).forEach((project) => {
        // By status
        stats.byStatus[project.status] = (stats.byStatus[project.status] || 0) + 1

        // By category
        stats.byCategory[project.category] = (stats.byCategory[project.category] || 0) + 1

        // Recent projects (last 7 days)
        const projectDate = new Date(project.created_at)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        if (projectDate > weekAgo) {
          stats.recent++
        }
      })

      return stats
    } catch (error) {
      console.error('Error fetching project statistics:', error)
      throw error
    }
  }

  /**
   * Set a project's risk/feasibility assessment scores (verifier action).
   * @param {string} projectId
   * @param {{feasibility_score?:number, social_impact_score?:number, climate_risk_rating?:string}} scores
   */
  async setProjectScores(projectId, scores = {}) {
    const payload = { updated_at: new Date().toISOString() }
    if (scores.feasibility_score !== undefined && scores.feasibility_score !== '') {
      payload.feasibility_score = Number(scores.feasibility_score)
    }
    if (scores.social_impact_score !== undefined && scores.social_impact_score !== '') {
      payload.social_impact_score = Number(scores.social_impact_score)
    }
    if (scores.climate_risk_rating !== undefined) {
      payload.climate_risk_rating = scores.climate_risk_rating || null
    }

    const { data, error } = await this.supabase
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .select()
      .single()

    if (error) throw new Error(error.message || 'Failed to save assessment')
    return data
  }

  /**
   * Get available project categories
   * @returns {Array} List of categories
   */
  getProjectCategories() {
    // Single source of truth: Philippine-eligible project types
    return PROJECT_TYPES.map((type) => type.value)
  }

  /**
   * Get project status options
   * @returns {Array} List of status options
   */
  getProjectStatuses() {
    return [
      { value: 'submitted', label: 'Submitted', color: 'yellow' },
      { value: 'in_review', label: 'In Review', color: 'blue' },
      { value: 'needs_revision', label: 'Needs Revision', color: 'orange' },
      { value: 'validated', label: 'Validated', color: 'green' },
      { value: 'rejected', label: 'Rejected', color: 'red' },
    ]
  }
}

// Export singleton instance
export const projectService = new ProjectService()

// Export individual functions for convenience (bound to service instance)
export const createProject = projectService.createProject.bind(projectService)
export const getUserProjects = projectService.getUserProjects.bind(projectService)
export const getProject = projectService.getProject.bind(projectService)
export const updateProject = projectService.updateProject.bind(projectService)
export const deleteProject = projectService.deleteProject.bind(projectService)
export const getAllProjects = projectService.getAllProjects.bind(projectService)
export const updateProjectStatus = projectService.updateProjectStatus.bind(projectService)
export const assignProjectToVerifier = projectService.assignProjectToVerifier.bind(projectService)
export const getAvailableVerifiers = projectService.getAvailableVerifiers.bind(projectService)
export const getProjectStats = projectService.getProjectStats.bind(projectService)
export const setProjectScores = projectService.setProjectScores.bind(projectService)
export const getProjectCategories = projectService.getProjectCategories.bind(projectService)
export const getProjectStatuses = projectService.getProjectStatuses.bind(projectService)

// Service instance is already exported above as 'export const projectService'
