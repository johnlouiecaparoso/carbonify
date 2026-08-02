import { getSupabase } from '@/services/supabaseClient'
import { TEST_ACCOUNTS } from '@/utils/testAccounts'

const NOTIFICATION_TABLE = 'system_notifications'

const ROLE_CANONICAL_MAP = Object.freeze({
  admin: 'admin',
  administrator: 'admin',
  super_admin: 'admin',
  superadmin: 'admin',
  verifier: 'verifier',
  verification: 'verifier',
  qa: 'verifier',
  project_developer: 'project_developer',
  projectdeveloper: 'project_developer',
  developer: 'project_developer',
  buyer_investor: 'buyer_investor',
  buyerinvestor: 'buyer_investor',
  investor: 'buyer_investor',
  general_user: 'general_user',
  generaluser: 'general_user',
  user: 'general_user',
})

function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase() : ''
}

function canonicalizeRole(role) {
  const normalized = normalizeRole(role).replace(/[\s-]+/g, '_')
  if (!normalized) return ''
  return ROLE_CANONICAL_MAP[normalized] || normalized
}

function normalizeRoles(roles = []) {
  return Array.from(new Set((roles || []).map((role) => canonicalizeRole(role)).filter(Boolean)))
}

function normalizeIds(values = []) {
  return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))))
}

function isDevelopmentMode() {
  return import.meta.env.DEV || import.meta.env.MODE === 'development'
}

function canUseLocalNotificationFallback() {
  return isDevelopmentMode() && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function getLocalNotificationStorageKey(userId) {
  return `carbonify-notifications:${String(userId || '').trim()}`
}

function readLocalNotifications(userId) {
  if (!canUseLocalNotificationFallback() || !userId) return []

  try {
    const raw = window.localStorage.getItem(getLocalNotificationStorageKey(userId))
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalNotifications(userId, notifications = []) {
  if (!canUseLocalNotificationFallback() || !userId) return []

  try {
    window.localStorage.setItem(
      getLocalNotificationStorageKey(userId),
      JSON.stringify(notifications),
    )
  } catch (error) {
    console.warn('Failed to persist local notifications:', error)
  }

  return notifications
}

function createLocalNotificationRecord(userId, payload = {}) {
  const now = new Date().toISOString()
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    user_id: String(userId),
    type: payload.type || 'system',
    title: payload.title?.trim() || '',
    message: payload.message?.trim() || '',
    link: payload.link || null,
    metadata: payload.metadata || {},
    is_read: false,
    created_at: now,
    read_at: null,
  }
}

function getLocalTestAccountIdsByRoles(roles = [], excludedUserIds = []) {
  const normalizedRoles = normalizeRoles(roles)
  if (!normalizedRoles.length) return []

  const excluded = new Set(normalizeIds(excludedUserIds))

  return normalizeIds(
    Object.values(TEST_ACCOUNTS)
      .filter((account) => normalizedRoles.includes(canonicalizeRole(account.role)))
      .map((account) => account.mockSession?.user?.id)
      .filter((id) => id && !excluded.has(String(id))),
  )
}

async function getAuthenticatedSupabaseUserId(supabase) {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user?.id) return null
    return String(data.user.id)
  } catch {
    return null
  }
}

function isMissingTableError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('does not exist') ||
    message.includes('relation') ||
    error?.code === '42P01'
  )
}

function isMissingRpcFunctionError(error, functionName) {
  const message = String(error?.message || '').toLowerCase()
  const functionNamePattern = String(functionName || '').toLowerCase()

  return (
    error?.code === '42883' ||
    message.includes(`function public.${functionNamePattern}`) ||
    message.includes(`function ${functionNamePattern}`)
  )
}

async function getExistingNotificationRecipients(userIds = []) {
  const supabase = getSupabase()
  if (!supabase) return []

  const normalizedUserIds = normalizeIds(userIds)

  if (!normalizedUserIds.length) return []

  const { data, error } = await supabase.from('profiles').select('id').in('id', normalizedUserIds)

  if (error) {
    throw new Error(error.message || 'Failed to verify notification recipients')
  }

  return (data || []).map((record) => String(record.id))
}

async function resolveNotificationRecipients({ userIds = [], roles = [], excludeUserIds = [] } = {}) {
  const supabase = getSupabase()
  if (!supabase) return []

  const normalizedUserIds = normalizeIds(userIds)
  const normalizedRoles = normalizeRoles(roles)
  const normalizedExcludedUserIds = normalizeIds(excludeUserIds)

  if (!normalizedUserIds.length && !normalizedRoles.length) {
    return []
  }

  if (isDevelopmentMode()) {
    const localRoleRecipients = normalizedRoles.length
      ? getLocalTestAccountIdsByRoles(normalizedRoles, normalizedExcludedUserIds)
      : []

    const localRecipients = normalizeIds([...normalizedUserIds, ...localRoleRecipients]).filter(
      (id) => !normalizedExcludedUserIds.includes(id),
    )

    if (localRecipients.length) {
      return localRecipients
    }
  }

  const { data, error } = await supabase.rpc('resolve_notification_recipient_ids', {
    target_user_ids: normalizedUserIds.length ? normalizedUserIds : null,
    target_roles: normalizedRoles.length ? normalizedRoles : null,
    excluded_user_ids: normalizedExcludedUserIds.length ? normalizedExcludedUserIds : null,
  })

  if (!error) {
    return normalizeIds((data || []).map((record) => record.user_id ?? record.id ?? record.recipient_id))
  }

  if (!isMissingRpcFunctionError(error, 'resolve_notification_recipient_ids')) {
    console.warn('Notification recipient RPC failed, falling back to legacy profile lookup:', error)
  }

  const fallbackRecipientIds = []

  if (normalizedUserIds.length) {
    fallbackRecipientIds.push(...(await getExistingNotificationRecipients(normalizedUserIds)))
  }

  if (normalizedRoles.length) {
    fallbackRecipientIds.push(...(await getUserIdsByRoles(normalizedRoles, normalizedExcludedUserIds)))
  }

  return normalizeIds(fallbackRecipientIds).filter((id) => !normalizedExcludedUserIds.includes(id))
}

export async function getUserNotifications(userId, limit = 25) {
  const supabase = getSupabase()
  if (!userId) return []

  const localNotifications = canUseLocalNotificationFallback() ? readLocalNotifications(userId) : []

  if (!supabase) {
    return localNotifications.slice(0, limit)
  }

  try {
    const { data, error } = await supabase
      .from(NOTIFICATION_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (isMissingTableError(error)) {
        console.warn('Notifications table not found. Apply latest migration to enable in-app notifications.')
        return localNotifications.slice(0, limit)
      }
      if (canUseLocalNotificationFallback()) {
        return localNotifications.slice(0, limit)
      }
      throw new Error(error.message || 'Failed to fetch notifications')
    }

    const remoteNotifications = data || []
    if (canUseLocalNotificationFallback() && localNotifications.length) {
      const merged = [...remoteNotifications, ...localNotifications].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      )

      const seen = new Set()
      const deduped = merged.filter((notification) => {
        const key = notification.id || `${notification.user_id}:${notification.created_at}:${notification.title}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return deduped.slice(0, limit)
    }

    return remoteNotifications
  } catch (error) {
    if (canUseLocalNotificationFallback()) {
      return localNotifications.slice(0, limit)
    }
    throw error
  }
}

export async function markNotificationAsRead(notificationId, userId) {
  const supabase = getSupabase()
  if (!notificationId || !userId) return

  if (canUseLocalNotificationFallback()) {
    const notifications = readLocalNotifications(userId).map((notification) =>
      String(notification.id) === String(notificationId)
        ? { ...notification, is_read: true, read_at: notification.read_at || new Date().toISOString() }
        : notification,
    )
    writeLocalNotifications(userId, notifications)
  }

  if (!supabase) return

  const { error } = await supabase
    .from(NOTIFICATION_TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || 'Failed to mark notification as read')
  }
}

export async function markAllNotificationsAsRead(userId) {
  const supabase = getSupabase()
  if (!userId) return

  if (canUseLocalNotificationFallback()) {
    const notifications = readLocalNotifications(userId).map((notification) => ({
      ...notification,
      is_read: true,
      read_at: notification.read_at || new Date().toISOString(),
    }))
    writeLocalNotifications(userId, notifications)
  }

  if (!supabase) return

  const { error } = await supabase
    .from(NOTIFICATION_TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || 'Failed to mark notifications as read')
  }
}

async function getUserIdsByRoles(roles = [], excludedUserIds = []) {
  const supabase = getSupabase()
  if (!supabase) return []

  const normalizedRoles = normalizeRoles(roles)
  if (!normalizedRoles.length) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .not('role', 'is', null)

  if (error) {
    throw new Error(error.message || 'Failed to resolve notification recipients')
  }

  const excluded = new Set((excludedUserIds || []).map((id) => String(id)))
  const targetRoles = new Set(normalizedRoles)

  return (data || [])
    .filter((record) => targetRoles.has(canonicalizeRole(record.role)))
    .map((record) => record.id)
    .filter((id) => id && !excluded.has(String(id)))
}

export async function createNotificationsForUsers(userIds = [], payload = {}) {
  const supabase = getSupabase()
  const recipients = normalizeIds(userIds)
  if (!recipients.length) return []

  const title = payload.title?.trim()
  const message = payload.message?.trim()
  if (!title || !message) return []

  const authenticatedUserId = await getAuthenticatedSupabaseUserId(supabase)
  if (!supabase || !authenticatedUserId) {
    const localNotifications = canUseLocalNotificationFallback()
      ? recipients.flatMap((userId) => {
          const existing = readLocalNotifications(userId)
          const next = [...existing, createLocalNotificationRecord(userId, payload)]
          writeLocalNotifications(userId, next)
          return next
        })
      : []

    return localNotifications
  }

  const resolvedRecipients = await resolveNotificationRecipients({ userIds })
  if (!resolvedRecipients.length) {
    return []
  }

  const rows = resolvedRecipients.map((userId) => ({
    user_id: userId,
    type: payload.type || 'system',
    title,
    message,
    link: payload.link || null,
    metadata: payload.metadata || {},
    is_read: false,
  }))

  const { data, error } = await supabase.from(NOTIFICATION_TABLE).insert(rows).select('id')

  if (error) {
    if (isMissingTableError(error)) {
      console.warn('Notifications table not found. Apply latest migration to enable in-app notifications.')
      return canUseLocalNotificationFallback()
        ? recipients.flatMap((userId) => {
            const existing = readLocalNotifications(userId)
            const next = [...existing, createLocalNotificationRecord(userId, payload)]
            writeLocalNotifications(userId, next)
            return next
          })
        : []
    }
    if (canUseLocalNotificationFallback()) {
      return recipients.flatMap((userId) => {
        const existing = readLocalNotifications(userId)
        const next = [...existing, createLocalNotificationRecord(userId, payload)]
        writeLocalNotifications(userId, next)
        return next
      })
    }
    throw new Error(error.message || 'Failed to create notifications')
  }

  return data || []
}

export async function createNotificationsForRoles(roles = [], payload = {}, options = {}) {
  const recipients = await resolveNotificationRecipients({ roles, excludeUserIds: options.excludeUserIds || [] })

  if (!recipients.length) return []

  return createNotificationsForUsers(recipients, payload)
}

/**
 * Notify the other party when a comment is posted on a project's review thread.
 * - A verifier/admin comment notifies the project owner.
 * - A developer (owner) comment notifies verifiers/admins.
 * - An internal note notifies only verifiers/admins (never the owner).
 * The author is always excluded. Best-effort: callers should not fail the
 * comment if this throws.
 */
export async function notifyProjectComment({ project, authorId, authorRole, body, isInternal } = {}) {
  if (!project?.id) return

  const role = String(authorRole || '').toLowerCase()
  const isReviewer = role === 'verifier' || role === 'admin'
  const snippet = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 140)
  const projectTitle = project.title || 'a project'

  // Internal notes are reviewer-only — notify verifiers/admins, never the owner.
  if (isInternal) {
    await createNotificationsForRoles(
      ['verifier', 'admin'],
      {
        type: 'project_comment',
        title: `Internal note on "${projectTitle}"`,
        message: snippet,
        link: '/verifier',
        metadata: { project_id: project.id, internal: true },
      },
      { excludeUserIds: authorId ? [authorId] : [] },
    )
    return
  }

  // A reviewer commented → notify the project owner.
  if (isReviewer) {
    if (!project.user_id) return
    await createNotificationsForUsers([project.user_id], {
      type: 'project_comment',
      title: `New comment on "${projectTitle}"`,
      message: snippet,
      link: '/developer/projects',
      metadata: { project_id: project.id },
    })
    return
  }

  // The developer/owner commented → notify the reviewers.
  await createNotificationsForRoles(
    ['verifier', 'admin'],
    {
      type: 'project_comment',
      title: `New developer reply on "${projectTitle}"`,
      message: snippet,
      link: '/verifier',
      metadata: { project_id: project.id },
    },
    { excludeUserIds: authorId ? [authorId] : [] },
  )
}

// ── Removed 2026-08-02: seven notify* twins of live DATABASE TRIGGERS ────────
//
// notifyProjectSubmittedForReview, notifyProjectDecision,
// notifyProjectSubmitterDecision, notifyProjectOwnerMarketplaceLive,
// notifyNewMarketplaceProject, notifyMarketplacePurchaseAndStock and
// notifyReviewersOfRoleApplicationInApp were exported, called by nothing, and
// duplicated what five triggers already do:
//
//   trg_notify_project_submission / trg_notify_project_submitted  (projects)
//   trg_notify_project_status                                     (projects)
//   trg_notify_role_application                                   (role_applications)
//   trg_notify_marketplace_listing                                (credit_listings)
//
// They are not merely dead. `20260626000200`'s own header records WHY the
// trigger exists: the client-side version was rejected by RLS and the bell
// never rang. So the trap was two-sided — call one of these and you either got
// nothing, or a second notification on top of the trigger's.
//
// The live cross-user helpers (createNotificationsForUsers /
// createNotificationsForRoles) and the three live notify* functions
// (notifyProjectComment, notifyRoleApplicationDecision, notifyWelcomeUser)
// stay. See DEFERRED_BACKLOG #30.

export async function notifyRoleApplicationDecision(application, status) {
  if (!application?.user_id) return []

  const normalizedStatus = normalizeRole(status)
  if (!['approved', 'rejected'].includes(normalizedStatus)) return []

  const isApproved = normalizedStatus === 'approved'
  const roleLabel =
    normalizeRole(application.role_requested) === 'verifier' ? 'Verifier' : 'Project Developer'

  return createNotificationsForUsers([application.user_id], {
    type: 'role_application_status',
    title: isApproved ? 'Your specialist account was approved' : 'Your specialist account was rejected',
    message: isApproved
      ? `Your ${roleLabel} application has been approved. You can now use your verified account features.`
      : `Your ${roleLabel} application was rejected. Please check your email or contact Carbonify support for next steps.`,
    link: '/profile',
    metadata: {
      application_id: application.id,
      requested_role: application.role_requested,
      status: normalizedStatus,
    },
  })
}

export async function notifyWelcomeUser(userId, fullName = '') {
  if (!userId) return []

  return createNotificationsForUsers([userId], {
    type: 'welcome',
    title: 'Welcome to Carbonify',
    message: fullName
      ? `Welcome to Carbonify, ${fullName}. Your account is ready to use.`
      : 'Welcome to Carbonify. Your account is ready to use.',
    link: '/home',
    metadata: {
      category: 'welcome',
    },
  })
}
