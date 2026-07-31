import { getSupabase } from '@/services/supabaseClient'
import { resolveDocumentUrls } from '@/services/storageService'

/**
 * Investor data room (expansion #5's last bullet).
 *
 * Documents live on `projects.supporting_documents` as a JSON array and in the
 * private `project-documents` bucket. This module parses that array, resolves
 * short-lived signed URLs, and records who opened what.
 *
 * The access log is written through the `log_data_room_access` SECURITY DEFINER
 * RPC, which derives BOTH the viewer (auth.uid()) and the developer
 * (projects.user_id) server-side — the client cannot forge either. Self-views
 * are dropped server-side too, so the log stays a record of external interest.
 *
 * Pure helpers are exported for unit testing.
 */

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

const KNOWN_DOC_LABELS = {
  pdd: 'Project Design Document (PDD)',
  baseline: 'Baseline Report',
  additionality: 'Additionality Justification',
  leakage: 'Leakage Assessment',
  safeguards: 'Safeguards Checklist',
  feasibility: 'Feasibility Study',
  mrv_report: 'MRV Report',
  lgu_endorsement: 'LGU Endorsement',
  land_ownership: 'Land Ownership / Lease',
  ecc: 'ECC / Permits',
  moa: 'MOA / Agreements',
}

/** Human label for a document `type` key; falls back to the file name. */
export function documentLabel(doc = {}) {
  return KNOWN_DOC_LABELS[doc.type] || doc.name || 'Document'
}

/**
 * Parse `projects.supporting_documents`, which is a JSON array — sometimes stored
 * as a string, sometimes already an object, and sometimes null. Never throws:
 * a malformed value yields [] rather than breaking the portal.
 */
export function parseDocuments(project) {
  try {
    const raw = project?.supporting_documents
    if (!raw) return []
    const docs = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(docs)) return []
    return docs.filter((d) => d && (d.path || d.url)).map((d) => ({ ...d, label: documentLabel(d) }))
  } catch {
    return []
  }
}

/** Bytes → a short human size. */
export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`
}

/**
 * Roll an access log into per-project interest.
 *
 * Counts DISTINCT viewers, not raw views — one investor refreshing a PDD ten
 * times is one interested party, and reporting "10 viewers" would flatter the
 * developer with a number that means nothing.
 *
 * @param {Array<{project_id:string, viewer_id:string, document_name:string, created_at?:string}>} rows
 */
export function aggregateAccessLog(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const byProject = new Map()

  for (const r of list) {
    if (!r?.project_id) continue
    const cur = byProject.get(r.project_id) || {
      projectId: r.project_id,
      views: 0,
      viewers: new Set(),
      documents: new Map(),
      lastViewedAt: null,
    }
    cur.views += 1
    if (r.viewer_id) cur.viewers.add(r.viewer_id)
    const doc = r.document_name || 'document'
    cur.documents.set(doc, (cur.documents.get(doc) || 0) + 1)
    if (r.created_at && (!cur.lastViewedAt || new Date(r.created_at) > new Date(cur.lastViewedAt))) {
      cur.lastViewedAt = r.created_at
    }
    byProject.set(r.project_id, cur)
  }

  return Array.from(byProject.values())
    .map((p) => ({
      projectId: p.projectId,
      views: p.views,
      uniqueViewers: p.viewers.size,
      lastViewedAt: p.lastViewedAt,
      topDocuments: Array.from(p.documents, ([name, count]) => ({ name, count })).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => b.uniqueViewers - a.uniqueViewers || b.views - a.views)
}

// ── Data access ────────────────────────────────────────────────────────────

/**
 * A project's documents with short-lived signed URLs, ready to open in-portal.
 * Returns [] rather than throwing when storage is unavailable.
 */
export async function getProjectDocuments(project) {
  const docs = parseDocuments(project)
  if (!docs.length) return []
  try {
    return await resolveDocumentUrls(docs)
  } catch (err) {
    console.warn('[dataRoom] could not resolve document URLs:', err?.message)
    return docs
  }
}

/**
 * Record that the signed-in user opened a document. Best-effort: a failed log
 * must never stop an investor from reading a document they are entitled to read.
 */
export async function logAccess(projectId, documentName, action = 'view') {
  const supabase = getSupabase()
  if (!supabase || !projectId) return false
  try {
    const { error } = await supabase.rpc('log_data_room_access', {
      p_project_id: projectId,
      p_document_name: documentName || 'document',
      p_action: action,
    })
    if (error) {
      console.warn('[dataRoom] access log unavailable:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[dataRoom] access log threw:', err?.message)
    return false
  }
}

/** Access-log rows across the signed-in developer's projects. */
export async function getMyDataRoomActivity(limit = 500) {
  const supabase = getSupabase()
  if (!supabase) return []
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('data_room_access_log')
    .select('project_id, viewer_id, document_name, action, created_at')
    .eq('developer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    // Not []: this is an access log. "Nobody viewed your documents" is the
    // opposite conclusion from "we could not read the log", and a developer
    // uses this screen to decide who is actually interested in their project.
    console.warn('[dataRoom] activity unavailable:', error.message)
    throw new Error(error.message || 'Failed to load data room activity')
  }
  return data || []
}
