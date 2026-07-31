/**
 * The compliance documents a project must carry before a verifier can review it.
 *
 * These lived inside ProjectForm.vue, which meant the rule existed only at the
 * moment of first submission. Save-as-draft breaks that assumption: a draft is
 * saved with whatever is attached so far, so the requirement has to be checked
 * again when the draft is submitted for review. Both callers now read the same
 * list from here.
 *
 * `key` is what gets persisted on each stored document (`label` in the upload
 * payload, written to projects.supporting_documents). `field` is the form's
 * file-input model. `label` is what a human sees.
 */

/** Required on any project entering the review queue. */
export const REQUIRED_PROJECT_DOCS = [
  { field: 'pdd_file', label: 'PDD', key: 'pdd' },
  { field: 'baseline_file', label: 'Baseline Report', key: 'baseline' },
  { field: 'additionality_file', label: 'Additionality Justification', key: 'additionality' },
  { field: 'leakage_file', label: 'Leakage Assessment', key: 'leakage' },
  { field: 'safeguards_file', label: 'Safeguards Checklist', key: 'safeguards' },
  { field: 'lgu_endorsement_file', label: 'LGU Endorsement', key: 'lgu_endorsement' },
  { field: 'land_ownership_file', label: 'Land Ownership / Lease', key: 'land_ownership' },
  { field: 'ecc_file', label: 'ECC / Permits', key: 'ecc' },
  { field: 'moa_file', label: 'MOA / Agreements', key: 'moa' },
]

/**
 * Never required. A feasibility study is not always produced, and a new project
 * has no monitoring history yet — attaching an MRV report here is how a
 * published report reaches the public registry page.
 */
export const OPTIONAL_PROJECT_DOCS = [
  { field: 'feasibility_file', label: 'Feasibility Study', key: 'feasibility' },
  { field: 'mrv_report_file', label: 'MRV Report', key: 'mrv_report' },
]

/** Parse projects.supporting_documents, which is stored as a JSON string. */
export function parseSupportingDocuments(supportingDocuments) {
  if (Array.isArray(supportingDocuments)) return supportingDocuments
  if (typeof supportingDocuments !== 'string' || !supportingDocuments.trim()) return []
  try {
    const parsed = JSON.parse(supportingDocuments)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Which required documents are NOT attached to a saved project.
 *
 * Matches on each stored document's `label` (the doc's `key`). Documents saved
 * before that field was persisted carry no label and therefore cannot be
 * identified — they count for nothing here. That is the safe direction to fail:
 * it asks for a re-upload rather than waving through a submission whose
 * evidence nobody can identify.
 *
 * @param {string|Array} supportingDocuments - projects.supporting_documents
 * @returns {string[]} human labels of the missing required documents
 */
export function missingRequiredDocLabels(supportingDocuments) {
  const docs = parseSupportingDocuments(supportingDocuments)
  const present = new Set(
    docs.map((doc) => (typeof doc?.label === 'string' ? doc.label.trim() : '')).filter(Boolean),
  )
  return REQUIRED_PROJECT_DOCS.filter((doc) => !present.has(doc.key)).map((doc) => doc.label)
}
