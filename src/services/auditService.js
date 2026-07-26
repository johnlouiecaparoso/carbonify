import { getSupabase } from '@/services/supabaseClient'
import { USE_DATABASE } from '@/config/database'

async function attachAuditLogUsers(supabase, logs = []) {
  const normalizedLogs = Array.isArray(logs) ? logs : []
  const userIds = [...new Set(normalizedLogs.map((log) => log.user_id).filter(Boolean))]

  if (!userIds.length) {
    return normalizedLogs.map((log) => ({
      ...log,
      user_name: 'Unknown User',
      user_role: 'unknown',
    }))
  }

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', userIds)

    if (error) {
      console.error('Error fetching audit log user profiles:', error)
      return normalizedLogs.map((log) => ({
        ...log,
        user_name: 'Unknown User',
        user_role: 'unknown',
      }))
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))

    return normalizedLogs.map((log) => {
      const profile = profileMap.get(log.user_id)
      return {
        ...log,
        user_name: profile?.full_name || 'Unknown User',
        user_role: profile?.role || 'unknown',
      }
    })
  } catch (error) {
    console.error('Error attaching audit log user profiles:', error)
    return normalizedLogs.map((log) => ({
      ...log,
      user_name: 'Unknown User',
      user_role: 'unknown',
    }))
  }
}

/**
 * Log user actions for audit trail
 */
export async function logUserAction(action, entityType, userId, entityId, metadata = {}) {
  // Skip audit logging if database is disabled
  if (!USE_DATABASE) {
    console.log('Database disabled, skipping audit log:', { action, entityType, userId })
    return null
  }

  // Skip audit logging if no user ID
  if (!userId) {
    console.warn('Skipping audit log - no user ID provided')
    return null
  }

  const supabase = getSupabase()

  try {
    const { data, error } = await supabase.from('audit_logs').insert({
      action: action,
      resource_type: entityType,
      user_id: userId,
      resource_id: entityId,
      metadata: metadata,
      created_at: new Date().toISOString(),
      ip_address: getClientIP(), // Would get from request in real implementation
      user_agent: getUserAgent(), // Would get from request in real implementation
    })

    if (error) {
      console.error('Error logging user action:', error)
      // Don't throw error for audit logging failures
    }

    return data
  } catch (error) {
    console.error('Error in logUserAction:', error)
    // Don't throw error for audit logging failures
  }
}

/**
 * Log system events
 */
export async function logSystemEvent(event, entityType, entityId, metadata = {}) {
  const supabase = getSupabase()

  try {
    const { data, error } = await supabase.from('audit_logs').insert({
      action: event,
      resource_type: entityType,
      user_id: null, // System event, no user
      resource_id: entityId,
      metadata: metadata,
      created_at: new Date().toISOString(),
      ip_address: 'system',
      user_agent: 'system',
    })

    if (error) {
      console.error('Error logging system event:', error)
    }

    return data
  } catch (error) {
    console.error('Error in logSystemEvent:', error)
  }
}

/**
 * Get client IP address (placeholder)
 */
function getClientIP() {
  // In a real implementation, this would extract IP from request headers
  return '127.0.0.1'
}

/**
 * Get user agent (placeholder)
 */
function getUserAgent() {
  // In a real implementation, this would extract from request headers
  return typeof window !== 'undefined' ? window.navigator.userAgent : 'server'
}

/**
 * Search audit logs with filters
 */
export async function searchAuditLogs(filters = {}, limit = 100) {
  // Skip if database is disabled
  if (!USE_DATABASE) {
    console.log('Database disabled, returning empty audit logs')
    return []
  }

  const supabase = getSupabase()

  try {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit)

    // Apply filters
    if (filters.action) {
      query = query.eq('action', filters.action)
    }

    if (filters.resourceType) {
      query = query.eq('resource_type', filters.resourceType)
    }

    if (filters.userId) {
      query = query.eq('user_id', filters.userId)
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString())
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString())
    }

    const { data, error } = await query

    // Throw, never []. This is the highest-stakes instance of that pattern in
    // the app: an empty audit log does not read as "the query failed", it reads
    // as "no such events exist". An admin filtering by user or date range
    // during an investigation would conclude nothing happened — and might say
    // so in a report. AuditLogsView already has an error branch waiting.
    if (error) throw new Error(error.message || 'Could not search the audit log')

    const enrichedLogs = await attachAuditLogUsers(supabase, data || [])

    return enrichedLogs.map((log) => ({
      id: log.id,
      action: log.action,
      resource_type: log.resource_type || log.entity_type,
      resource_id: log.resource_id || log.entity_id,
      user_id: log.user_id,
      user_name: log.user_name || 'Unknown User',
      user_role: log.user_role || 'unknown',
      ip_address: log.ip_address,
      metadata: log.metadata,
      created_at: log.created_at || log.timestamp,
    }))
  } catch (error) {
    // Rethrow for the same reason: silence here becomes "nothing happened" on
    // the screen an investigation depends on.
    console.error('Error in searchAuditLogs:', error)
    throw error instanceof Error ? error : new Error('Could not search the audit log')
  }
}

