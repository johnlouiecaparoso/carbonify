import { describe, it, expect } from 'vitest'
import {
  REQUIRED_PROJECT_DOCS,
  OPTIONAL_PROJECT_DOCS,
  parseSupportingDocuments,
  missingRequiredDocLabels,
} from '@/constants/projectDocuments'

/** A stored document as written to projects.supporting_documents. */
const doc = (key) => ({ name: `${key}.pdf`, type: 'application/pdf', size: 1, label: key })
const allRequired = () => REQUIRED_PROJECT_DOCS.map((d) => doc(d.key))

describe('project document constants', () => {
  it('requires nine compliance documents', () => {
    expect(REQUIRED_PROJECT_DOCS).toHaveLength(9)
  })

  it('never marks feasibility or the MRV report as required', () => {
    const requiredKeys = REQUIRED_PROJECT_DOCS.map((d) => d.key)
    expect(requiredKeys).not.toContain('feasibility')
    expect(requiredKeys).not.toContain('mrv_report')
    expect(OPTIONAL_PROJECT_DOCS.map((d) => d.key)).toEqual(['feasibility', 'mrv_report'])
  })

  it('keeps keys unique across required and optional', () => {
    const keys = [...REQUIRED_PROJECT_DOCS, ...OPTIONAL_PROJECT_DOCS].map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('parseSupportingDocuments', () => {
  it('accepts the JSON string the column actually stores', () => {
    expect(parseSupportingDocuments(JSON.stringify([doc('pdd')]))).toHaveLength(1)
  })

  it('accepts an already-parsed array', () => {
    expect(parseSupportingDocuments([doc('pdd')])).toHaveLength(1)
  })

  it('degrades to an empty list for null, empty and malformed input', () => {
    expect(parseSupportingDocuments(null)).toEqual([])
    expect(parseSupportingDocuments('')).toEqual([])
    expect(parseSupportingDocuments('   ')).toEqual([])
    expect(parseSupportingDocuments('{not json')).toEqual([])
    expect(parseSupportingDocuments(undefined)).toEqual([])
  })

  it('degrades when the JSON is valid but not an array', () => {
    expect(parseSupportingDocuments('{"a":1}')).toEqual([])
    expect(parseSupportingDocuments('42')).toEqual([])
  })
})

describe('missingRequiredDocLabels', () => {
  it('reports every required document when nothing is attached', () => {
    expect(missingRequiredDocLabels(null)).toHaveLength(9)
    expect(missingRequiredDocLabels([])).toHaveLength(9)
  })

  it('reports none when all nine are attached', () => {
    expect(missingRequiredDocLabels(allRequired())).toEqual([])
    expect(missingRequiredDocLabels(JSON.stringify(allRequired()))).toEqual([])
  })

  it('names exactly what is missing, using human labels', () => {
    const docs = allRequired().filter((d) => d.label !== 'ecc' && d.label !== 'moa')
    expect(missingRequiredDocLabels(docs)).toEqual(['ECC / Permits', 'MOA / Agreements'])
  })

  it('does not let optional documents satisfy a requirement', () => {
    const missing = missingRequiredDocLabels([doc('feasibility'), doc('mrv_report')])
    expect(missing).toHaveLength(9)
  })

  it('ignores unlabelled legacy documents rather than counting them', () => {
    // Documents saved before `label` was persisted cannot be identified. Failing
    // closed asks for a re-upload; failing open would wave through a submission
    // whose evidence nobody can match to a requirement.
    const legacy = [{ name: 'a.pdf' }, { name: 'b.pdf' }, { label: '' }, { label: null }]
    expect(missingRequiredDocLabels(legacy)).toHaveLength(9)
  })

  it('tolerates surrounding whitespace on a stored label', () => {
    const docs = allRequired().map((d) => ({ ...d, label: `  ${d.label}  ` }))
    expect(missingRequiredDocLabels(docs)).toEqual([])
  })

  it('ignores duplicates of the same document', () => {
    const docs = [...allRequired(), doc('pdd'), doc('pdd')]
    expect(missingRequiredDocLabels(docs)).toEqual([])
  })
})
