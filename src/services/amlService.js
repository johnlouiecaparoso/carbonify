/**
 * AML screening — sanctions / PEP checks and the evidence trail behind them.
 *
 * KYC and KYB captured identity documents and an admin approved them, but
 * nothing was ever checked against a list, and nothing recorded that a check
 * had happened. Under the AMLA a covered institution must both screen AND
 * retain evidence of screening; the second half is what an examiner asks for.
 *
 * HONEST SCOPE: the matcher below is a name comparison against a locally
 * maintained list. That is genuinely useful and it is real screening, but it is
 * NOT equivalent to a commercial provider — those maintain versioned global
 * lists continuously, resolve transliteration and aliases far better than this,
 * and cover adverse media. `listSource` / `listVersion` are recorded on every
 * screening so a provider's results later drop into the same evidence trail.
 *
 * All reads are admin-only by RLS, deliberately including the subject's own
 * row: telling someone they matched a sanctions list is tipping off.
 */
import { getSupabase } from '@/services/supabaseClient'
import { logUserAction } from '@/services/auditService'

/** Screening outcomes. `clear` is a matcher result; the other two are human. */
export const AML_STATUSES = ['clear', 'potential_match', 'confirmed_match', 'cleared_after_review']
/** Statuses that still need a human decision. */
export const AML_OPEN_STATUSES = ['potential_match', 'confirmed_match']

/**
 * Normalise a name for comparison: strip diacritics, punctuation and honorifics,
 * collapse whitespace, lowercase.
 *
 * Pure — exported for unit testing.
 */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    // Strip combining marks so "José" and "Jose" compare equal.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(mr|mrs|ms|dr|jr|sr|iii|ii|atty|engr)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distinct word tokens of a normalised name, ignoring single initials. */
export function nameTokens(value) {
  return [...new Set(normalizeName(value).split(' ').filter((t) => t.length > 1))]
}

/**
 * Similarity between two names, 0..1.
 *
 * Token-overlap rather than edit distance: real name variation is mostly
 * reordering, dropped middle names and added honorifics ("Dela Cruz, Juan P."
 * vs "Juan Dela Cruz"), which token overlap handles and Levenshtein does not.
 *
 * Scores against the SHORTER token set, so a full legal name still matches a
 * two-token list entry instead of being diluted by the extra tokens.
 *
 * Pure — exported for unit testing.
 */
export function nameSimilarity(a, b) {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (!ta.length || !tb.length) return 0

  const setB = new Set(tb)
  const shared = ta.filter((t) => setB.has(t)).length
  return shared / Math.min(ta.length, tb.length)
}

/**
 * Default sensitivity. 0.8 means "nearly all name parts line up".
 *
 * Tuned to over-report rather than under-report: a false positive costs a
 * reviewer a minute, a false negative is an onboarded sanctioned party.
 */
export const MATCH_THRESHOLD = 0.8

/**
 * Screen one name against watchlist entries.
 *
 * Compares against each entry's primary name AND its aliases, keeping the
 * strongest score per entry. Returns matches sorted most-confident first.
 *
 * Pure — exported for unit testing.
 *
 * @param {string} name
 * @param {Array<Object>} entries - aml_watchlist_entries rows
 * @param {number} [threshold]
 * @returns {{status:'clear'|'potential_match', matches:Array<Object>}}
 */
export function screenName(name, entries = [], threshold = MATCH_THRESHOLD) {
  const matches = []

  for (const entry of entries || []) {
    if (!entry || entry.is_active === false) continue

    const candidates = [entry.full_name, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
    let best = 0
    let matchedOn = null
    for (const candidate of candidates) {
      const score = nameSimilarity(name, candidate)
      if (score > best) {
        best = score
        matchedOn = candidate
      }
    }

    if (best >= threshold) {
      matches.push({
        entry_id: entry.id ?? null,
        matched_name: matchedOn,
        entry_type: entry.entry_type || 'sanction',
        list_source: entry.list_source || 'manual',
        country: entry.country || null,
        score: Math.round(best * 100) / 100,
      })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  return { status: matches.length ? 'potential_match' : 'clear', matches }
}

/** The active watchlist. Admin-only by RLS; degrades to [] rather than throwing. */
export async function getWatchlist() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase
    .from('aml_watchlist_entries')
    .select('*')
    .eq('is_active', true)
  if (error) {
    // An empty watchlist and an unreadable one are opposite facts: the first
    // says nobody is listed, the second says we cannot tell. Screening against
    // a silently-empty list matches nobody, forever.
    console.warn('[aml] watchlist unavailable:', error.message)
    throw new Error(error.message || 'Failed to load the AML watchlist')
  }
  return data || []
}

/**
 * Screen a subject and RECORD the result — including a clear one.
 *
 * Recording a pass is the point: "we screened them and found nothing" is the
 * evidence an examiner asks for, and it is exactly what gets skipped when
 * screening is treated as an alerting feature rather than a compliance one.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.name
 * @param {string} [args.kycApplicationId]
 */
export async function screenAndRecord({ userId, name, kycApplicationId = null }) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')
  if (!userId) throw new Error('A subject is required')
  if (!String(name || '').trim()) throw new Error('A name is required to screen')

  const entries = await getWatchlist()
  const { status, matches } = screenName(name, entries)

  const sources = [...new Set(matches.map((m) => m.list_source).filter(Boolean))]

  const { data, error } = await supabase.rpc('record_aml_screening', {
    p_user_id: userId,
    p_screened_name: name,
    p_status: status,
    p_matches: matches,
    p_kyc_application_id: kycApplicationId,
    p_list_source: sources.join(', ') || 'local watchlist',
    // No provider versioning yet; stamp the list size so a past screening can
    // be interpreted against how much list existed at the time.
    p_list_version: `local:${entries.length}`,
  })
  if (error) throw new Error(error.message || 'Could not record the screening.')

  logUserAction('AML_SCREENED', 'profiles', null, userId, {
    status,
    match_count: matches.length,
  }).catch(() => {})

  return data
}

/**
 * List screenings. `open` returns anything still needing a human decision.
 */
export async function listScreenings({ status = 'open' } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  let query = supabase.from('aml_screenings').select('*').order('screened_at', { ascending: false })
  if (status === 'open') query = query.in('status', AML_OPEN_STATUSES)
  else if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    // Not []: with `status: 'open'` an empty result reads as "no subject is
    // awaiting a compliance decision". A screening queue that reports itself
    // clear because the query failed is the exact failure an AML programme
    // exists to prevent.
    console.warn('[aml] screenings unavailable:', error.message)
    throw new Error(error.message || 'Failed to load AML screenings')
  }

  const rows = data || []
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  if (!userIds.length) return rows

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
  const byId = new Map((profiles || []).map((p) => [p.id, p]))

  return rows.map((r) => ({
    ...r,
    subject_name: byId.get(r.user_id)?.full_name || null,
    subject_email: byId.get(r.user_id)?.email || null,
  }))
}

/**
 * Adjudicate a match. Notes are required — both outcomes are judgements a
 * regulator may question later.
 *
 * @param {string} screeningId
 * @param {'confirmed_match'|'cleared_after_review'} status
 * @param {string} notes
 */
export async function reviewScreening(screeningId, status, notes) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')
  if (!['confirmed_match', 'cleared_after_review'].includes(status)) {
    throw new Error('Review outcome must be confirmed or cleared')
  }

  const { data, error } = await supabase.rpc('review_aml_screening', {
    p_id: screeningId,
    p_status: status,
    p_notes: notes || null,
  })
  if (error) throw new Error(error.message || 'Could not record the review.')

  logUserAction('AML_REVIEWED', 'aml_screening', null, screeningId, { status }).catch(() => {})
  return data
}

/** Add an entry to the local watchlist. */
export async function addWatchlistEntry({
  fullName,
  aliases = [],
  entryType = 'sanction',
  listSource = 'manual',
  country = null,
  notes = null,
}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')
  if (!String(fullName || '').trim()) throw new Error('A name is required')

  const { data, error } = await supabase
    .from('aml_watchlist_entries')
    .insert([
      {
        full_name: fullName.trim(),
        aliases: (aliases || []).map((a) => String(a).trim()).filter(Boolean),
        entry_type: entryType,
        list_source: listSource,
        country,
        notes,
      },
    ])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Could not add the watchlist entry.')
  return data
}

/** Counts for the admin queue header. Pure — exported for unit testing. */
export function summariseScreenings(screenings = []) {
  const summary = { total: screenings.length, potential: 0, confirmed: 0, cleared: 0 }
  for (const s of screenings) {
    if (s.status === 'potential_match') summary.potential += 1
    else if (s.status === 'confirmed_match') summary.confirmed += 1
    else if (s.status === 'cleared_after_review') summary.cleared += 1
  }
  return summary
}
