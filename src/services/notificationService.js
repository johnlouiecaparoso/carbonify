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

/**
 * Notify the other party on a row you are actually a party to.
 *
 * WHY THIS EXISTS — DEFERRED_BACKLOG #36. `system_notifications`' INSERT policy
 * is `with check (auth.uid() is not null)`: any signed-in user may insert a row
 * for ANY `user_id`. Confirmed against live on 2026-08-02. So every
 * `createNotificationsForUsers([someoneElse], …)` call below was also the
 * mechanism by which anyone could plant a message in anyone else's bell.
 *
 * This routes those through a `SECURITY DEFINER` RPC that derives the recipient
 * from the subject row instead of taking it from the caller. There is no
 * "notify user X" entry point: you can reach the counterparty of a biomass RFQ
 * or a feedstock delivery you are on, both parties, or — by escalation from a
 * trade you are in — the admins. Nothing else.
 *
 * Self-addressed notifications do NOT come through here; they stay on the
 * direct insert, which is what the tightened policy will still allow.
 *
 * Non-fatal by contract, like the calls it replaces: a notification that fails
 * must never fail the action that earned it. It returns the number of rows
 * created so a caller can tell "sent" from "silently nothing", which the old
 * fire-and-forget could not.
 *
 * @param {'biomass_rfq'|'farmer_delivery'} subjectType
 * @param {string} subjectId
 * @param {'counterparty'|'both_parties'|'admins'} audience
 * @returns {Promise<number>} notifications created (0 if the RPC is absent)
 */
export async function notifyCounterparty(subjectType, subjectId, audience, payload = {}) {
  const supabase = getSupabase()
  if (!supabase || !subjectId) return 0

  const title = payload.title?.trim()
  const message = payload.message?.trim()
  if (!title || !message) return 0

  const { data, error } = await supabase.rpc('notify_counterparty', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_audience: audience,
    p_type: payload.type || 'system',
    p_title: title,
    p_message: message,
    p_link: payload.link || null,
    p_metadata: payload.metadata || {},
  })

  if (error) {
    // Degrades to 0 while 20260802000300 is unapplied, so the frontend can ship
    // ahead of the migration — the same "inert rather than broken" shape the
    // counterparty-name RPC used. Said out loud, because a notification that
    // silently stops arriving is the failure this whole change is about.
    if (isMissingRpcFunctionError(error, 'notify_counterparty')) {
      console.warn('[notify] notify_counterparty RPC is not applied yet — notification not sent')
      return 0
    }
    console.error('[notify] notify_counterparty failed:', error.message)
    return 0
  }

  return Number(data) || 0
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
// See DEFERRED_BACKLOG #30. (This block used to end by listing what "stays" —
// createNotificationsForRoles, notifyProjectComment, notifyRoleApplicationDecision.
// All three are gone as of 2026-08-06; see the next block for why.)

// ── Removed 2026-08-06: two more twins of DATABASE TRIGGERS ─────────────────
//
// notifyRoleApplicationDecision and notifyProjectComment were cross-user
// inserts, and 20260802000400 tightened the system_notifications INSERT policy
// to `auth.uid() = user_id`. Both had been rejected with 403 ever since — the
// reviewer is not the applicant, and a commenter is not the person being
// notified. Both call sites swallow the error, so an approved developer was
// simply never told and a commented-on owner was never told.
//
// That migration's header lists "the three remaining direct client inserts" as
// all self-addressed. These two were not in the list and are not self-addressed.
// The gap is now closed on the database side by 20260806000100:
//
//   trg_notify_role_application_decision  (role_applications, AFTER UPDATE)
//   trg_notify_project_comment            (project_comments,  AFTER INSERT)
//
// Both are SECURITY DEFINER, so they bypass the policy the same way the five
// existing notify_* triggers do, and the recipient is derived from the row
// rather than asserted by the browser. Nothing calls these functions any more —
// re-adding a client-side version would just reintroduce the silent 403.
//
// createNotificationsForRoles went with them. It notified a ROLE, so it was
// cross-user by construction and could not satisfy `auth.uid() = user_id` under
// any caller; with its last two callers gone it was an export that could only
// ever fail. createNotificationsForUsers stays — MRV reminders, saved-search
// matches and watchlist price drops all address the caller themselves, which is
// exactly the set 20260802000400 was written around.

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
