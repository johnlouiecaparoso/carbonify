/**
 * Project comment thread — developer ↔ verifier communication.
 *
 * Backs the "needs revision" loop: verifiers explain what to fix, developers
 * reply and resubmit. RLS (see *_project_comments.sql) enforces visibility —
 * owners never see `is_internal` comments, and only verifiers/admins may post
 * internal notes — so this service stays thin.
 */
import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { notifyProjectComment } from '@/services/notificationService'

/**
 * List comments on a project, oldest first. RLS already filters out internal
 * notes for non-verifier callers, so the caller gets exactly what they may see.
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function listProjectComments(projectId) {
  const supabase = getSupabase()
  if (!supabase || !projectId) return []

  const { data, error } = await supabase
    .from('project_comments')
    .select('id, project_id, author_id, author_role, body, is_internal, created_at, profiles:author_id (full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    // Not []: this thread is where a verifier asks for a revision and a
    // developer answers. An empty thread reads as "nothing has been asked of
    // you" — which is how a requested revision goes unanswered.
    console.warn('Failed to load project comments:', error.message)
    throw new Error(error.message || 'Failed to load project comments')
  }
  return (data || []).map((c) => ({
    ...c,
    author_name: c.profiles?.full_name || 'User',
  }))
}

/**
 * Post a comment on a project.
 * @param {string} projectId
 * @param {string} body
 * @param {Object} [opts]
 * @param {boolean} [opts.isInternal=false] - verifier/admin-only note
 * @param {string} [opts.authorRole] - role snapshot for display
 * @returns {Promise<Object>}
 */
export async function addProjectComment(projectId, body, opts = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const trimmed = String(body || '').trim()
  if (!projectId) throw new Error('Project is required')
  if (!trimmed) throw new Error('Comment cannot be empty')

  const userId = await getCurrentUserId()
  if (!userId) throw new Error('You must be signed in to comment.')

  const { data, error } = await supabase
    .from('project_comments')
    .insert([
      {
        project_id: projectId,
        author_id: userId,
        author_role: opts.authorRole || null,
        body: trimmed,
        is_internal: !!opts.isInternal,
      },
    ])
    .select('id, project_id, author_id, author_role, body, is_internal, created_at')
    .single()

  if (error) throw new Error(error.message || 'Failed to post comment')

  // Notify the other party so the conversation is actually seen. Best-effort:
  // never fail a posted comment because a notification couldn't be created.
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, title')
      .eq('id', projectId)
      .single()
    if (project) {
      await notifyProjectComment({
        project,
        authorId: userId,
        authorRole: opts.authorRole,
        body: trimmed,
        isInternal: !!opts.isInternal,
      })
    }
  } catch (notifyError) {
    console.warn('Comment posted but notification failed:', notifyError?.message)
  }

  return data
}
