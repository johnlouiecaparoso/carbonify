import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { logUserAction } from '@/services/auditService'

/**
 * Host (LGU) endorsement service. LGUs review community projects and record an
 * endorsement or decline — a "project host endorsements system".
 */

function client() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase
}

/**
 * Normalise a municipality name for comparison. Mirrors the SQL
 * normalize_jurisdiction() in 20260722000500 so the client filter and the
 * database guard agree on what "the same municipality" means.
 *
 * Pure — exported for unit testing.
 */
export function normalizeJurisdiction(value) {
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return s || null
}

/** True when an LGU with this jurisdiction may act on this project. */
export function inJurisdiction(projectMunicipality, lguMunicipality) {
  const project = normalizeJurisdiction(projectMunicipality)
  const lgu = normalizeJurisdiction(lguMunicipality)
  // Fails open when either side is undeclared — see the migration header.
  if (!project || !lgu) return true
  return project === lgu
}

/** The signed-in user's declared municipality, or null. */
export async function getMyJurisdiction() {
  const supabase = client()
  const uid = await getCurrentUserId()
  if (!uid) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('municipality, province')
    .eq('id', uid)
    .maybeSingle()
  // Throw rather than returning null. Null is a MEANINGFUL value here — it is
  // how "no municipality declared" is represented, and the dashboard unscopes
  // its project lists on the strength of it. Collapsing a failed lookup into
  // that state told an LGU with a declared municipality that it had none, and
  // then offered them out-of-area projects that the endorsement jurisdiction
  // guard (20260722000500) rejects at the database.
  if (error) throw new Error(error.message || 'Could not read your jurisdiction')
  return data?.municipality ? { municipality: data.municipality, province: data.province } : null
}

/** Attach each project's endorsement tally and this user's own decision. */
function withEndorsements(projects, endorsements, uid) {
  return projects.map((p) => {
    const all = (endorsements || []).filter((e) => e.project_id === p.id)
    const mine = all.find((e) => e.lgu_user_id === uid) || null
    return {
      ...p,
      endorsement_count: all.filter((e) => e.decision === 'endorsed').length,
      my_endorsement: mine,
    }
  })
}

const PROJECT_COLUMNS =
  'id, title, category, location, municipality, barangay, status, user_id, created_at, estimated_credits'

/**
 * Validated community projects an LGU can endorse, scoped to its jurisdiction.
 *
 * This previously returned EVERY validated project in the country, so an LGU in
 * one province could endorse a project in another. Filtering happens after the
 * fetch because municipality is free text on both sides and has to be compared
 * normalised; the authoritative check is the DB trigger, which rejects a
 * cross-jurisdiction endorsement outright.
 *
 * An LGU that has not set a municipality still sees everything (there is
 * nothing to scope to) — the dashboard says so rather than implying the list
 * is filtered.
 */
export async function getCommunityProjects() {
  const supabase = client()
  const uid = await getCurrentUserId()
  const jurisdiction = await getMyJurisdiction()

  const { data: projects, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('status', 'validated')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load projects')
  if (!projects || projects.length === 0) return []

  const scoped = projects.filter((p) => inJurisdiction(p.municipality, jurisdiction?.municipality))
  if (!scoped.length) return []

  const { data: endorsements } = await supabase
    .from('project_endorsements')
    .select('*')
    .in('project_id', scoped.map((p) => p.id))

  return withEndorsements(scoped, endorsements, uid)
}

/**
 * Every project in the LGU's municipality, at any stage — the "track community
 * projects in my jurisdiction" capability (role-needs #4), which endorsement
 * alone never provided because it only ever showed validated projects.
 *
 * Drafts are excluded: they are the developer's private workspace and are not
 * yet a claim about anyone's jurisdiction.
 */
export async function getJurisdictionProjects() {
  const supabase = client()
  const uid = await getCurrentUserId()
  const jurisdiction = await getMyJurisdiction()

  const { data: projects, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load projects')
  if (!projects?.length) return []

  const scoped = projects.filter((p) => inJurisdiction(p.municipality, jurisdiction?.municipality))
  if (!scoped.length) return []

  const { data: endorsements } = await supabase
    .from('project_endorsements')
    .select('*')
    .in('project_id', scoped.map((p) => p.id))

  return withEndorsements(scoped, endorsements, uid)
}

/**
 * Roll a jurisdiction's projects into the headline numbers an LGU reports:
 * how many projects, how far along, and how much carbon they represent.
 *
 * Pure — exported for unit testing.
 */
export function summariseJurisdictionProjects(projects = []) {
  const summary = {
    total: projects.length,
    validated: 0,
    inReview: 0,
    rejected: 0,
    endorsedByMe: 0,
    estimatedCredits: 0,
  }
  for (const p of projects) {
    if (['validated', 'approved'].includes(p.status)) summary.validated += 1
    else if (['submitted', 'pending', 'in_review', 'under_review', 'needs_revision'].includes(p.status))
      summary.inReview += 1
    else if (p.status === 'rejected') summary.rejected += 1

    if (p.my_endorsement?.decision === 'endorsed') summary.endorsedByMe += 1
    summary.estimatedCredits += Number(p.estimated_credits) || 0
  }
  return summary
}

/**
 * Record (or update) the current LGU user's endorsement decision for a project.
 */
export async function endorseProject(projectId, decision, notes = '') {
  const supabase = client()
  const uid = await getCurrentUserId()
  if (!uid) throw new Error('User not authenticated')
  if (!['endorsed', 'declined'].includes(decision)) {
    throw new Error('Invalid decision')
  }

  const { data, error } = await supabase
    .from('project_endorsements')
    .upsert(
      {
        project_id: projectId,
        lgu_user_id: uid,
        decision,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,lgu_user_id' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to record endorsement')

  try {
    await logUserAction(
      decision === 'endorsed' ? 'PROJECT_ENDORSED' : 'PROJECT_ENDORSEMENT_DECLINED',
      'project_endorsement',
      uid,
      data.id,
      { project_id: projectId },
    )
  } catch {
    /* non-critical */
  }
  return data
}

/**
 * Endorsements for a single project (e.g. shown to the project owner).
 */
export async function getProjectEndorsements(projectId) {
  const supabase = client()
  const { data, error } = await supabase
    .from('project_endorsements')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw new Error(error.message || 'Failed to load endorsements')
  return data || []
}
