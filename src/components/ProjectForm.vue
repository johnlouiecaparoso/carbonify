<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/userStore'
import { projectService } from '@/services/projectService'
import { projectWorkflowService } from '@/services/projectWorkflowService'
import UiButton from '@/components/ui/Button.vue'
import UiInput from '@/components/ui/Input.vue'
import BoundaryMapPicker from '@/components/map/BoundaryMapPicker.vue'
import {
  DEVELOPMENT_STATUSES,
  methodologyGroups,
  isKnownMethodology,
} from '@/constants/projectRegistry'
import { uploadProjectDocument } from '@/services/storageService'
import { REQUIRED_PROJECT_DOCS, OPTIONAL_PROJECT_DOCS } from '@/constants/projectDocuments'
import { PROJECT_TYPES, isValidProjectType } from '@/constants/projectTypes'
import { SDGS, sdgTag } from '@/constants/sdgs'
import {
  ADDITIONALITY_TYPES,
  REVERSAL_RISK_LEVELS,
  normalizeCredibility,
} from '@/services/projectCredibility'

const props = defineProps({
  project: {
    type: Object,
    default: null,
  },
  mode: {
    type: String,
    default: 'create', // 'create' or 'edit'
    validator: (value) => ['create', 'edit'].includes(value),
  },
})

const emit = defineEmits(['success', 'cancel'])

const userStore = useUserStore()

// Philippine-eligible project types (single source of truth)
const projectTypes = PROJECT_TYPES
const selectedTypeDescription = computed(
  () => PROJECT_TYPES.find((type) => type.value === formData.value.category)?.description || '',
)
const additionalityHint = computed(
  () =>
    ADDITIONALITY_TYPES.find((t) => t.value === formData.value.additionality_type)?.description || '',
)

// Form data
const formData = ref({
  title: '',
  description: '',
  category: '',
  location: '',
  geo_coordinates: '',
  boundary: null, // GeoJSON polygon of the project boundary (optional)
  barangay: '',
  municipality: '',
  expected_impact: '',
  co_benefits: [], // Selected UN SDG tags (sdgTag strings)
  project_image: null, // Add project image field
  estimated_credits: '', // Add estimated credits field
  // credit_price is intentionally omitted — the verifier sets the price per
  // credit after reviewing the submitted project.
  start_date: '',
  end_date: '',
  host_entity: '',

  // Registry metadata (optional) — investor-facing project registry fields.
  methodology: '', // canonical key from METHODOLOGY_STANDARDS, or 'other'
  methodology_custom: '', // free text when methodology === 'other'; stored into `methodology`
  development_status: '', // real-world lifecycle, NOT the Carbonify review status
  feedstock: '', // e.g. 'Rice husk', 'Coconut biomass', 'Sugarcane bagasse', 'Bana grass'
  capacity: '', // nameplate/throughput figure (numeric)
  capacity_unit: '', // unit for capacity, e.g. 'MW', 'tonnes/year'

  // Technical & compliance files (single-file inputs)
  pdd_file: null,
  baseline_file: null,
  additionality_file: null,
  leakage_file: null,
  safeguards_file: null,
  feasibility_file: null,
  mrv_report_file: null,

  lgu_endorsement_file: null,
  land_ownership_file: null,
  ecc_file: null,
  moa_file: null,

  // Financials (optional) — power the Investor Portal's return model.
  capex: '', // up-front capital expenditure (PHP)
  opex: '', // annual operating expenditure (PHP/yr)
  project_lifetime_years: '', // crediting/operating horizon (years)
  funding_target: '', // capital being sought (PHP)
  funding_raised: '', // capital committed so far (PHP)
  carbon_yield_projection: '',

  // Credibility metadata (optional, structured)
  additionality_type: '',
  permanence_years: '',
  reversal_risk: '',
})

const additionalityTypes = ADDITIONALITY_TYPES
const reversalRiskLevels = REVERSAL_RISK_LEVELS

/**
 * What actually gets stored in `projects.methodology`.
 *
 * 'other' is a UI affordance for "not in our list" — storing the literal string
 * 'other' would be worse than the free text it replaced. Persist what the
 * developer typed instead; it renders as-is and simply won't match the filter.
 */
function resolvedMethodology() {
  const selected = formData.value.methodology
  if (selected !== 'other') return selected
  return String(formData.value.methodology_custom || '').trim()
}

// File upload state
const uploadedFiles = ref([])
const fileUploadError = ref('')
const uploadingFiles = ref(false)

// Project image upload state
const projectImage = ref(null)
const projectImagePreview = ref('')
const projectImageError = ref('')
const uploadingImage = ref(false)
const isDraggingImage = ref(false)
const isDraggingFiles = ref(false)

// Form state
const loading = ref(false)
// Which button is busy, so only that one shows a spinner label.
const savingDraft = ref(false)
const errors = ref({})
const success = ref('')

// File input refs
const projectImageInput = ref(null)
const projectDocumentsInput = ref(null)
const pddInput = ref(null)
const baselineInput = ref(null)
const additionalityInput = ref(null)
const leakageInput = ref(null)
const safeguardsInput = ref(null)
const feasibilityInput = ref(null)
const mrvReportInput = ref(null)

const lguEndorsementInput = ref(null)
const landOwnershipInput = ref(null)
const eccInput = ref(null)
const moaInput = ref(null)

// Categories are now custom text input - no longer using predefined list

// Form validation rules
const validationRules = {
  title: {
    required: true,
    minLength: 3,
    maxLength: 100,
    message: 'Title must be between 3 and 100 characters',
  },
  description: {
    required: true,
    minLength: 10,
    maxLength: 1000,
    message: 'Description must be between 10 and 1000 characters',
  },
  category: {
    required: true,
    minLength: 2,
    maxLength: 50,
    message: 'Category must be between 2 and 50 characters',
  },
  location: {
    required: true,
    minLength: 2,
    maxLength: 100,
    message: 'Location must be between 2 and 100 characters',
  },
  geo_coordinates: {
    required: true,
    minLength: 3,
    maxLength: 100,
    message: 'Provide geo-coordinates (lat,lon) or a valid location string',
  },
  barangay: {
    required: true,
    minLength: 2,
    maxLength: 100,
    message: 'Barangay is required',
  },
  municipality: {
    required: true,
    minLength: 2,
    maxLength: 100,
    message: 'Municipality is required',
  },
  expected_impact: {
    required: true,
    minLength: 10,
    maxLength: 500,
    message: 'Expected impact must be between 10 and 500 characters',
  },
  start_date: {
    required: true,
    message: 'Start date is required',
  },
  end_date: {
    required: true,
    message: 'End date is required',
  },
  host_entity: {
    required: true,
    minLength: 2,
    maxLength: 200,
    message: 'Host entity is required',
  },
  estimated_credits: {
    required: true,
    min: 1,
    max: 1000000,
    message: 'Estimated credits must be between 1 and 1,000,000',
  },
}

// File upload configuration
const fileUploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxFiles: 5,
}

// Project image upload configuration
const imageUploadConfig = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxWidth: 1920,
  maxHeight: 1080,
}

// Computed properties
const isEditMode = computed(() => props.mode === 'edit')
const formTitle = computed(() => (isEditMode.value ? 'Edit Project' : 'Create New Project'))
const submitButtonText = computed(() => {
  if (loading.value) {
    return isEditMode.value ? 'Updating...' : 'Creating...'
  }
  return isEditMode.value ? 'Update Project' : 'Create Project'
})

const isFormValid = computed(() => {
  const validationResults = {}
  const isValid = Object.keys(validationRules).every((field) => {
    const value = formData.value[field]
    const rule = validationRules[field]

    // Handle required validation - check for empty values (string, number, null, undefined)
    if (rule.required) {
      // Check for null, undefined, empty string, or NaN
      if (value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value))) {
        validationResults[field] = { valid: false, reason: 'required field is empty' }
        return false
      }
      // For strings, also check if trimmed value is empty
      if (typeof value === 'string' && value.trim() === '') {
        validationResults[field] = { valid: false, reason: 'required string field is empty after trim' }
        return false
      }
      // For numbers, check if it's valid and meets minimum requirement
      if (typeof value === 'number' && !isNaN(value)) {
        // Also check if it's 0 or negative for fields that require positive values
        // But only if min is defined and > 0
        if (rule.min !== undefined && rule.min > 0 && value < rule.min) {
          validationResults[field] = { valid: false, reason: `number is below minimum ${rule.min}` }
          return false
        }
      }
    }

    // Handle string length validation (only for strings)
    if (typeof value === 'string' && value) {
      if (rule.minLength && value.length < rule.minLength) {
        validationResults[field] = { valid: false, reason: `string length ${value.length} is below minimum ${rule.minLength}` }
        return false
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        validationResults[field] = { valid: false, reason: `string length ${value.length} exceeds maximum ${rule.maxLength}` }
        return false
      }
    }

    // Handle numeric validation (for number fields)
    if (typeof value === 'number' && !isNaN(value)) {
      if (rule.min !== undefined && value < rule.min) {
        validationResults[field] = { valid: false, reason: `number ${value} is below minimum ${rule.min}` }
        return false
      }
      if (rule.max !== undefined && value > rule.max) {
        validationResults[field] = { valid: false, reason: `number ${value} exceeds maximum ${rule.max}` }
        return false
      }
    }

    validationResults[field] = { valid: true }
    return true
  })
  
  // Log validation results for debugging
  if (!isValid) {
    console.log('[ERROR] Form validation failed. Field status:', JSON.parse(JSON.stringify(validationResults)))
    console.log('[DEBUG] Current form data:', JSON.parse(JSON.stringify({
      title: formData.value.title,
      description: formData.value.description,
      category: formData.value.category,
      location: formData.value.location,
      expected_impact: formData.value.expected_impact,
      estimated_credits: formData.value.estimated_credits,
      project_image: formData.value.project_image ? 'File uploaded' : null
    })))
    
    // Log which fields are failing
    Object.keys(validationResults).forEach(field => {
      if (!validationResults[field].valid) {
        console.log(`  [ERROR] ${field}: ${validationResults[field].reason}`)
      }
    })
  }
  
  return isValid
})

// Methods
function clearFieldError(field) {
  if (errors.value[field]) {
    delete errors.value[field]
  }
  if (Object.keys(errors.value).length === 0) {
    errors.value = {}
  }
  if (errors.value.general) {
    delete errors.value.general
  }
  success.value = ''
}

// The required-error text is built from the field KEY, which is a database
// column name. Capitalizing it alone left the underscore in place, so the form
// told a project developer "Host_entity is required" — six fields did this
// (host_entity, geo_coordinates, expected_impact, start_date, end_date,
// estimated_credits). Underscores become spaces before capitalizing, and a rule
// may override with an explicit `label`.
function fieldLabel(field) {
  const rule = validationRules[field]
  if (rule?.label) return rule.label
  const words = field.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function validateField(field) {
  const value = formData.value[field]
  const rule = validationRules[field]

  // Handle required validation
  if (rule.required) {
    if (value === null || value === undefined || value === '') {
      errors.value[field] = `${fieldLabel(field)} is required`
      return false
    }
    // For strings, also check if trimmed value is empty
    if (typeof value === 'string' && value.trim() === '') {
      errors.value[field] = `${fieldLabel(field)} is required`
      return false
    }
    // For numbers, check if it's a valid number (not NaN)
    if (typeof value === 'number' && isNaN(value)) {
      errors.value[field] = `${fieldLabel(field)} is required`
      return false
    }
  }

  // Category must be one of the predefined Philippine-eligible project types
  if (field === 'category' && value && !isValidProjectType(value)) {
    errors.value[field] = 'Please select a valid Philippine-eligible project type'
    return false
  }

  // Handle string length validation (only for strings)
  if (typeof value === 'string' && value) {
    if (rule.minLength && value.length < rule.minLength) {
      errors.value[field] = rule.message
      return false
    }
    if (rule.maxLength && value.length > rule.maxLength) {
      errors.value[field] = rule.message
      return false
    }
  }

  // Handle numeric validation (for number fields)
  if (typeof value === 'number' && !isNaN(value)) {
    if (rule.min !== undefined && value < rule.min) {
      errors.value[field] = rule.message
      return false
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.value[field] = rule.message
      return false
    }
  }

  // Clear error if validation passes
  delete errors.value[field]
  return true
}

function validateForm() {
  let isValid = true

  Object.keys(validationRules).forEach((field) => {
    if (!validateField(field)) {
      isValid = false
    }
  })

  return isValid
}

function clearErrors() {
  errors.value = {}
  success.value = ''
}

function resetForm() {
  formData.value = {
    title: '',
    description: '',
    category: '',
    location: '',
    expected_impact: '',
    project_image: null,
    estimated_credits: '',
  }
  uploadedFiles.value = []
  fileUploadError.value = ''
  projectImage.value = null
  projectImagePreview.value = ''
  projectImageError.value = ''
  clearErrors()
}

// File upload methods
function validateFile(file) {
  // Check file size
  if (file.size > fileUploadConfig.maxFileSize) {
    return `File "${file.name}" is too large. Maximum size is ${fileUploadConfig.maxFileSize / 1024 / 1024}MB`
  }

  // Check file type
  if (!fileUploadConfig.allowedTypes.includes(file.type)) {
    return `File "${file.name}" format is not supported. Allowed formats: PDF, JPEG, PNG, DOC, DOCX`
  }

  return null
}

async function addFiles(files) {
  const incomingFiles = Array.from(files)
  fileUploadError.value = ''

  // Check max files limit
  if (uploadedFiles.value.length + incomingFiles.length > fileUploadConfig.maxFiles) {
    fileUploadError.value = `Maximum ${fileUploadConfig.maxFiles} files allowed`
    return
  }

  uploadingFiles.value = true

  for (const file of incomingFiles) {
    const validationError = validateFile(file)
    if (validationError) {
      fileUploadError.value = validationError
      continue
    }

    try {
      // In a real implementation, you would upload to a file storage service
      // For now, we'll store the file object locally
      const fileData = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        file: file,
        uploadDate: new Date().toISOString(),
        url: URL.createObjectURL(file), // Temporary URL for preview
      }

      uploadedFiles.value.push(fileData)
    } catch (error) {
      console.error('Error uploading file:', error)
      fileUploadError.value = `Failed to upload ${file.name}`
    }
  }

  uploadingFiles.value = false
}

async function handleFileUpload(event) {
  await addFiles(event.target.files || [])
  event.target.value = ''
}

function removeFile(fileId) {
  const index = uploadedFiles.value.findIndex((f) => f.id === fileId)
  if (index !== -1) {
    // Revoke the object URL to free memory
    URL.revokeObjectURL(uploadedFiles.value[index].url)
    uploadedFiles.value.splice(index, 1)
  }
}

// Project image upload methods
function validateImageFile(file) {
  // Check file size
  if (file.size > imageUploadConfig.maxFileSize) {
    return `Image "${file.name}" is too large. Maximum size is ${imageUploadConfig.maxFileSize / 1024 / 1024}MB`
  }

  // Check file type
  if (!imageUploadConfig.allowedTypes.includes(file.type)) {
    return `Image "${file.name}" format is not supported. Allowed formats: JPEG, PNG, WebP`
  }

  return null
}

// Generic single-document handler used for required technical/compliance docs
async function handleSingleDocUpload(event, fieldName) {
  const file = event.target.files?.[0]
  if (!file) return

  const validationError = validateFile(file)
  if (validationError) {
    fileUploadError.value = validationError
    return
  }

  formData.value[fieldName] = file
  // clear input value to allow re-upload
  event.target.value = ''
}

async function processProjectImageFile(file) {
  projectImageError.value = ''
  uploadingImage.value = true

  try {
    const validationError = validateImageFile(file)
    if (validationError) {
      projectImageError.value = validationError
      return
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file)
    projectImagePreview.value = previewUrl
    projectImage.value = file
    formData.value.project_image = file

    console.log('Project image uploaded:', file.name)
  } catch (error) {
    console.error('Error uploading project image:', error)
    projectImageError.value = `Failed to upload ${file.name}`
  } finally {
    uploadingImage.value = false
  }
}

async function handleProjectImageUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await processProjectImageFile(file)
  event.target.value = ''
}

function removeProjectImage() {
  if (projectImagePreview.value) {
    URL.revokeObjectURL(projectImagePreview.value)
  }
  projectImage.value = null
  projectImagePreview.value = ''
  formData.value.project_image = null
  projectImageError.value = ''
}

async function convertImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function triggerProjectImageSelect() {
  projectImageInput.value?.click()
}

function triggerDocumentsSelect() {
  projectDocumentsInput.value?.click()
}

function handleImageDragOver(event) {
  event.preventDefault()
  isDraggingImage.value = true
}

function handleImageDragLeave(event) {
  event.preventDefault()
  isDraggingImage.value = false
}

async function handleImageDrop(event) {
  event.preventDefault()
  isDraggingImage.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    await processProjectImageFile(file)
  }
}

function onImageZoneClick(event) {
  if (uploadingImage.value) return
  // Ignore clicks on remove button
  if (event.target.closest('.remove-image-btn')) {
    return
  }
  triggerProjectImageSelect()
}

function handleFileDragOver(event) {
  event.preventDefault()
  isDraggingFiles.value = true
}

function handleFileDragLeave(event) {
  event.preventDefault()
  isDraggingFiles.value = false
}

async function handleFileDrop(event) {
  event.preventDefault()
  isDraggingFiles.value = false
  const files = event.dataTransfer?.files
  if (files && files.length) {
    await addFiles(files)
  }
}

function onFileZoneClick(event) {
  if (uploadingFiles.value) return
  if (event.target.closest('.remove-file')) {
    return
  }
  triggerDocumentsSelect()
}

// The required/optional document lists moved to @/constants/projectDocuments so
// that submitting a DRAFT for review later enforces the same rule — the check
// used to exist only here, at first submission.
const REQUIRED_DOCS = REQUIRED_PROJECT_DOCS
const OPTIONAL_DOCS = OPTIONAL_PROJECT_DOCS

// How many required docs are still missing (drives the submit-button hint).
const missingRequiredDocs = computed(() =>
  REQUIRED_DOCS.filter((d) => !formData.value[d.field]).map((d) => d.label),
)

/**
 * Draft saving is offered for a NEW project or one that is already a draft.
 *
 * Never for a project that has been submitted: `status` is an editable column,
 * so saving a pending or needs_revision project "as a draft" would quietly pull
 * it out of the verifier's queue and out of the revision loop, with nobody
 * told. Those projects already have a non-destructive save — the Update button,
 * which preserves whatever status they hold.
 */
const canSaveAsDraft = computed(
  () => !isEditMode.value || props.project?.status === 'draft',
)

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.asDraft=false] - save without entering the review
 *   queue. A draft skips the required-document check and every field validation
 *   except a title (a untitled draft is unfindable in the dashboard list). The
 *   full rules are re-applied when the draft is submitted for review.
 */
async function handleSubmit({ asDraft = false } = {}) {
  clearErrors()

  if (asDraft) {
    // Mirrors canSaveAsDraft. Demoting a submitted project back to a draft would
    // remove it from the review queue without telling anyone.
    if (!canSaveAsDraft.value) {
      errors.value.general = 'This project has already been submitted and cannot be saved as a draft.'
      return
    }
    if (!String(formData.value.title || '').trim()) {
      errors.value.title = 'Give your draft a title so you can find it later.'
      errors.value.general = 'A title is required, even for a draft.'
      return
    }
  } else if (!validateForm() || !isFormValid.value) {
    errors.value.general =
      errors.value.general || 'Please complete the required fields highlighted above.'
    return
  }

  // Require the compliance documents on a NEW submission — without them a
  // verifier has nothing to review. (Edits preserve previously-uploaded docs;
  // drafts are checked at submit-for-review time instead.)
  if (!asDraft && !isEditMode.value && missingRequiredDocs.value.length) {
    errors.value.general = `Please attach all required documents before submitting. Missing: ${missingRequiredDocs.value.join(', ')}.`
    return
  }

  savingDraft.value = asDraft
  loading.value = true

  try {
    // Prepare project data with scalar fields; files will be serialized below
    const projectData = {
      title: formData.value.title,
      description: formData.value.description,
      category: formData.value.category,
      location: formData.value.location,
      geo_coordinates: formData.value.geo_coordinates,
      boundary: formData.value.boundary || null,
      barangay: formData.value.barangay,
      municipality: formData.value.municipality,
      expected_impact: formData.value.expected_impact,
      co_benefits: Array.isArray(formData.value.co_benefits) ? formData.value.co_benefits : [],
      start_date: formData.value.start_date,
      end_date: formData.value.end_date,
      host_entity: formData.value.host_entity,
      estimated_credits: formData.value.estimated_credits,
      // 'other' is a UI affordance, not a stored value — persist what they typed.
      methodology: resolvedMethodology(),
      development_status: formData.value.development_status,
      feedstock: formData.value.feedstock,
      capacity: formData.value.capacity,
      capacity_unit: formData.value.capacity_unit,
      capex: formData.value.capex,
      opex: formData.value.opex,
      project_lifetime_years: formData.value.project_lifetime_years,
      funding_target: formData.value.funding_target,
      funding_raised: formData.value.funding_raised,
      carbon_yield_projection: formData.value.carbon_yield_projection,
      ...normalizeCredibility({
        additionality_type: formData.value.additionality_type,
        permanence_years: formData.value.permanence_years,
        reversal_risk: formData.value.reversal_risk,
      }),
      // Saving as a draft always parks the project in 'draft', including when a
      // draft is edited. Otherwise an edit keeps whatever status it already had
      // (so editing a needs_revision project does not silently re-queue it) and
      // a brand-new submission goes to the review queue.
      status: asDraft
        ? 'draft'
        : isEditMode.value
          ? props.project?.status || 'draft'
          : 'submitted',
      documents: [],
    }

    // Resolve the uploader id up-front — needed to namespace document uploads
    // in storage before we know the created project id.
    let uploaderId = userStore.session?.user?.id || userStore.profile?.id || null
    if (!uploaderId) {
      try {
        const supa = (await import('@/services/supabaseClient')).getSupabase()
        const {
          data: { user },
        } = await supa.auth.getUser()
        uploaderId = user?.id || null
      } catch {
        /* uploadProjectDocument surfaces a clear "sign in" error below */
      }
    }

    // Upload each attached document to storage and store its real public URL.
    // Previously only filename metadata was saved, so every download link was
    // dead and verifiers could not open the evidence they must review.
    const uploadDoc = async (file, label) => {
      if (!file) return
      // Edit mode may hold an already-uploaded doc object (has a path/url) — keep it.
      if ((file.path || file.url) && !(file instanceof File)) {
        projectData.documents.push({
          name: file.name,
          size: file.size,
          type: file.type,
          label,
          path: file.path || null,
          url: file.url || null,
        })
        return
      }
      const path = await uploadProjectDocument(file, uploaderId, label)
      projectData.documents.push({
        name: file.name,
        size: file.size,
        type: file.type,
        label,
        path,
        uploadDate: new Date().toISOString(),
      })
    }

    try {
      for (const d of [...REQUIRED_DOCS, ...OPTIONAL_DOCS]) {
        await uploadDoc(formData.value[d.field], d.key)
      }
      // Include any generic drag-and-drop uploads as well.
      for (const f of uploadedFiles.value) {
        if (f?.file instanceof File) {
          const path = await uploadProjectDocument(f.file, uploaderId, 'other')
          projectData.documents.push({
            name: f.name,
            size: f.size,
            type: f.type,
            label: 'other',
            path,
            uploadDate: f.uploadDate,
          })
        }
      }
    } catch (uploadErr) {
      errors.value.general =
        uploadErr?.message || 'Failed to upload one or more documents. Please try again.'
      loading.value = false
      return
    }

    // On edit, preserve previously-uploaded docs; only overwrite when new files
    // were attached this time (an empty array leaves existing docs untouched).
    if (isEditMode.value && projectData.documents.length) {
      let existing = []
      try {
        const raw = props.project?.supporting_documents
        existing = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
      } catch {
        existing = []
      }
      projectData.documents = [...existing, ...projectData.documents]
    }

    // Convert project image to base64 for database storage
    if (projectImage.value) {
      try {
        const imageBase64 = await convertImageToBase64(projectImage.value)
        projectData.project_image = imageBase64
        projectData.image_name = projectImage.value.name
        projectData.image_type = projectImage.value.type
        projectData.image_size = projectImage.value.size
      } catch (error) {
        console.error('Error converting image to base64:', error)
        errors.value.general = 'Failed to process project image'
        return
      }
    }

    if (isEditMode.value) {
      // Update existing project
      await projectService.updateProject(props.project.id, projectData)
      success.value = 'Project updated successfully!'
    } else {
      // Submit new project - try multiple methods for reliability

      // Get user ID from Supabase (most reliable source)
      let userId = null
      const supabase = (await import('@/services/supabaseClient')).getSupabase()

      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      // Method 1: Try getUser() first (most reliable)
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()
        if (user && !userError) {
          userId = user.id
          console.log('[OK] Using user ID from Supabase getUser():', userId)
        } else {
          console.log('getUser() failed:', userError)
        }
      } catch (error) {
        console.log('getUser() error:', error)
      }

      // Method 2: Try getSession() if getUser() failed
      if (!userId) {
        try {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession()
          if (session?.user && !sessionError) {
            userId = session.user.id
            console.log('[OK] Using user ID from Supabase getSession():', userId)
          } else {
            console.log('getSession() failed:', sessionError)
          }
        } catch (error) {
          console.log('getSession() error:', error)
        }
      }

      // Method 3: Try userStore session as fallback
      if (!userId && userStore.session?.user?.id) {
        userId = userStore.session.user.id
        console.log('[OK] Using user ID from userStore session:', userId)
      }

      // If we still don't have a user ID, throw an error
      if (!userId) {
        throw new Error('Unable to get user ID. Please log in again and try submitting the project.')
      }

      console.log('[OK] Final user ID to use for project submission:', userId)

      // Verify the profile exists before submitting
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .single()

        if (profileError || !profile) {
          console.error('[ERROR] Profile not found for user ID:', userId, profileError)
          throw new Error(
            'Your user profile was not found. Please contact support or try logging out and logging back in.'
          )
        }
        console.log('[OK] Profile verified for user ID:', userId)
      } catch (profileCheckError) {
        if (profileCheckError.message.includes('profile was not found')) {
          throw profileCheckError
        }
        console.warn('[WARN] Could not verify profile, but continuing with submission:', profileCheckError)
      }

      // ONE submission path. There used to be a three-deep cascade here —
      // projectWorkflowService.submitProject -> projectService.createProject ->
      // projectApprovalService.submitProject — taking whichever did not throw.
      // Removed 2026-08-01 (DEFERRED_BACKLOG #33), because the fallbacks were
      // not redundancy, they were an escape hatch around this path's safety:
      //
      //   · Path 2 was a near-verbatim copy of path 1, validating identically.
      //     When path 1 rejected something, path 2 rejected it the same way, so
      //     it could only ever mask a transient blip — while tripling the ways
      //     a submit could half-happen.
      //   · Path 3 had NO numeric validation at all, so `estimated_credits: -5`
      //     — refused by both paths above — was accepted on the third try.
      //   · Path 3 spread the raw form object into the insert instead of
      //     picking known columns, and hardcoded `status: 'pending'`. So a
      //     DRAFT reaching it was silently promoted into the review queue and
      //     fired notify_project_submitted_trigger. A private draft became a
      //     submission, and reviewers were notified, because two other code
      //     paths had failed.
      //
      // This path is also the most robust of the three: it is the one with the
      // schema-drift retry that drops optional columns a given database lacks.
      await projectWorkflowService.submitProject(projectData, userId)

      // Don't set success message here - let the parent component handle it
      // success.value = 'Project submitted successfully! It will be reviewed by our verification team.'
      // Verifiers are notified by the notify_project_submitted DB trigger (a
      // client insert can't create notifications for other users under RLS).
    }

    // Emit success event. projectData.status tells the parent whether this was
    // a draft save (go back to the dashboard) or a real submission (show the
    // "what happens next" card).
    emit('success', projectData)

    // Reset form if creating new project. Not for a draft: the parent navigates
    // to the dashboard, and blanking the fields first just flashes an empty form.
    if (!isEditMode.value && !asDraft) {
      resetForm()
    }
  } catch (error) {
    console.error('[ERROR] Error saving project:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    // Check if it's an auth error
    if (error.message && (error.message.includes('session') || error.message.includes('auth') || error.message.includes('unauthorized'))) {
      errors.value.general = 'Your session may have expired. Please refresh the page and try again.'
      console.warn('[WARN] Auth-related error detected during project submission')
    } else {
      errors.value.general = error.message || 'Failed to save project. Please try again.'
    }

    // Show more detailed error information
    if (error.message) {
      console.log('Detailed error:', error.message)
    }
  } finally {
    loading.value = false
    savingDraft.value = false
  }
}

function handleCancel() {
  resetForm()
  emit('cancel')
}

// Toggle an SDG tag in the selected co-benefits list.
function toggleSdg(tag) {
  const list = Array.isArray(formData.value.co_benefits) ? [...formData.value.co_benefits] : []
  const idx = list.indexOf(tag)
  if (idx === -1) list.push(tag)
  else list.splice(idx, 1)
  formData.value.co_benefits = list
}

// Initialize form with project data if editing
onMounted(() => {
  if (isEditMode.value && props.project) {
    formData.value = {
      ...formData.value,
      title: props.project.title || '',
      description: props.project.description || '',
      category: props.project.category || '',
      location: props.project.location || '',
      geo_coordinates: props.project.geo_coordinates || '',
      boundary: props.project.boundary || null,
      expected_impact: props.project.expected_impact || '',
      // Legacy rows hold arbitrary free text ('Verra VM0044'). Map a canonical key
      // onto the dropdown; anything else lands in "Other" with the text preserved,
      // so editing an old project never silently discards its methodology.
      methodology: isKnownMethodology(props.project.methodology)
        ? props.project.methodology
        : props.project.methodology
          ? 'other'
          : '',
      methodology_custom: isKnownMethodology(props.project.methodology)
        ? ''
        : props.project.methodology || '',
      development_status: props.project.development_status || '',
      feedstock: props.project.feedstock || '',
      capacity: props.project.capacity ?? '',
      capacity_unit: props.project.capacity_unit || '',
      capex: props.project.capex ?? '',
      opex: props.project.opex ?? '',
      project_lifetime_years: props.project.project_lifetime_years ?? '',
      funding_target: props.project.funding_target ?? '',
      funding_raised: props.project.funding_raised ?? '',
      co_benefits: Array.isArray(props.project.co_benefits)
        ? props.project.co_benefits
            .map((c) => (typeof c === 'string' ? c : c?.label || c?.sdg || ''))
            .filter(Boolean)
        : [],
      additionality_type: props.project.additionality_type || '',
      permanence_years: props.project.permanence_years ?? '',
      reversal_risk: props.project.reversal_risk || '',
    }
  }
})
</script>

<template>
  <div class="project-form">
    <div class="form-header">
      <h2>{{ formTitle }}</h2>
      <p v-if="!isEditMode">
        Submit your environmental project for verification and potential funding.
      </p>
      <p v-else>Update your project details below.</p>
    </div>

    <!-- Explicit call: the native submit event would otherwise be destructured
         as the options object. -->
    <form @submit.prevent="handleSubmit()" class="form">
      <!-- General Error Message -->
      <div v-if="errors.general" class="error-message">
        {{ errors.general }}
      </div>

      <!-- Success Message -->
      <div v-if="success" class="success-message">
        {{ success }}
      </div>

      <div class="form-subsection">
        <div class="subsection-header">
          <h4 class="subsection-title">Project Details *</h4>
        </div>
        <div class="project-title-card">
          <label class="project-title-label" for="project-title">
            <span class="material-symbols-outlined credit-card-icon" aria-hidden="true">description</span>
            <span>Project Title *</span>
          </label>
          <UiInput
            id="project-title"
            type="text"
            placeholder="Enter a descriptive title for your project"
            v-model="formData.title"
            :error="errors.title"
            @input="clearFieldError('title')"
          />
          <div class="project-title-hint">
            <span class="material-symbols-outlined help-icon" aria-hidden="true">info</span>
            <span>{{ formData.title.length }}/100 characters</span>
          </div>
        </div>
      </div>

      <div class="form-subsection optional">
        <div class="subsection-header">
          <h4 class="subsection-title">Project Image (Optional)</h4>
        </div>
        <div
          class="upload-dropzone"
          :class="{ dragging: isDraggingImage }"
          @dragover.prevent="handleImageDragOver"
          @dragleave.prevent="handleImageDragLeave"
          @drop.prevent="handleImageDrop"
          @click="onImageZoneClick"
        >
          <input
            ref="projectImageInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="file-input-hidden"
            @change="handleProjectImageUpload"
          />
          <div v-if="uploadingImage" class="upload-loading">
            <div class="loading-spinner"></div>
            <span>Uploading image...</span>
          </div>
          <template v-else>
            <div v-if="projectImagePreview" class="image-preview-container">
              <img :src="projectImagePreview" alt="Project preview" class="image-preview" />
              <button type="button" class="remove-image-btn" @click.stop="removeProjectImage">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div v-else class="upload-placeholder">
              <span class="material-symbols-outlined upload-icon" aria-hidden="true">add_photo_alternate</span>
              <p class="upload-title">Click to upload project image</p>
              <p class="upload-subtitle">or drag and drop image here</p>
              <p class="upload-hint">JPEG, PNG, WebP up to 5MB</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Project Category -->
      <div class="form-group">
        <label for="category" class="form-label"> Project Type * </label>
        <select
          id="category"
          v-model="formData.category"
          :class="['form-select', { error: errors.category }]"
          @blur="validateField('category')"
          @change="clearErrors"
        >
          <option value="" disabled>Select a Philippine-eligible project type</option>
          <option v-for="type in projectTypes" :key="type.value" :value="type.value">
            {{ type.label }}
          </option>
        </select>
        <div v-if="errors.category" class="field-error">
          {{ errors.category }}
        </div>
        <div class="field-help">
          {{ selectedTypeDescription || 'Choose the DENR/CCC-aligned category that best fits your project.' }}
        </div>
      </div>

      <!-- Project Location -->
      <div class="form-group">
        <label for="location" class="form-label"> Project Location * </label>
        <UiInput
          id="location"
          v-model="formData.location"
          :error="errors.location"
          placeholder="City, Province, Country"
          @blur="validateField('location')"
          @input="clearErrors"
        />
        <div class="field-help">{{ formData.location.length }}/100 characters</div>
      </div>

      <!-- Project Description -->
      <div class="form-group">
        <label for="description" class="form-label"> Project Description * </label>
        <textarea
          id="description"
          v-model="formData.description"
          :class="['form-textarea', { error: errors.description }]"
          placeholder="Describe your project in detail. Include objectives, methodology, timeline, and expected outcomes."
          rows="5"
          @blur="validateField('description')"
          @input="clearErrors"
        ></textarea>
        <div v-if="errors.description" class="field-error">
          {{ errors.description }}
        </div>
        <div class="field-help">{{ formData.description.length }}/1000 characters</div>
      </div>

      <!-- Expected Impact -->
      <div class="form-group">
        <label for="expected_impact" class="form-label"> Expected Impact * </label>
        <textarea
          id="expected_impact"
          v-model="formData.expected_impact"
          :class="['form-textarea', { error: errors.expected_impact }]"
          placeholder="Describe the environmental, social, or economic impact your project will have. Include measurable outcomes if possible."
          rows="4"
          @blur="validateField('expected_impact')"
          @input="clearErrors"
        ></textarea>
        <div v-if="errors.expected_impact" class="field-error">
          {{ errors.expected_impact }}
        </div>
        <div class="field-help">{{ formData.expected_impact.length }}/500 characters</div>
      </div>

      <!-- Sustainable Development Goals (co-benefits) -->
      <div class="form-group">
        <label class="form-label">UN Sustainable Development Goals (SDGs)</label>
        <p class="field-help" style="margin-top: 0">
          Select the SDGs your project contributes to — buyers can filter the marketplace by these.
        </p>
        <div class="sdg-grid">
          <button
            v-for="goal in SDGS"
            :key="goal.id"
            type="button"
            class="sdg-chip"
            :class="{ selected: formData.co_benefits.includes(sdgTag(goal)) }"
            @click="toggleSdg(sdgTag(goal))"
          >
            <span class="sdg-num">{{ goal.id }}</span>
            <span class="sdg-label">{{ goal.label }}</span>
          </button>
        </div>
      </div>

        <div class="form-subsection">
          <div class="subsection-header">
            <h4 class="subsection-title">Project Location Details *</h4>
          </div>
          <div class="form-group">
            <label for="geo_coordinates" class="form-label"> Geo-coordinates (lat,lon) * </label>
            <UiInput
              id="geo_coordinates"
              v-model="formData.geo_coordinates"
              :error="errors.geo_coordinates"
              placeholder="e.g., 14.5995,120.9842"
              @blur="validateField('geo_coordinates')"
              @input="clearErrors"
            />
            <div class="field-help">
              Click the map to set the location, or draw the project boundary.
            </div>
            <BoundaryMapPicker
              v-model="formData.geo_coordinates"
              :boundary="formData.boundary"
              class="boundary-map-field"
              @update:boundary="formData.boundary = $event"
              @update:model-value="clearErrors"
            />
          </div>

          <div class="form-group">
            <label for="barangay" class="form-label"> Barangay * </label>
            <UiInput id="barangay" v-model="formData.barangay" :error="errors.barangay" @blur="validateField('barangay')" />
          </div>

          <div class="form-group">
            <label for="municipality" class="form-label"> Municipality / City * </label>
            <UiInput id="municipality" v-model="formData.municipality" :error="errors.municipality" @blur="validateField('municipality')" />
          </div>

          <div class="form-grid two-columns">
            <div class="form-group">
              <label for="start_date" class="form-label"> Start Date * </label>
              <UiInput id="start_date" type="date" v-model="formData.start_date" :error="errors.start_date" @blur="validateField('start_date')" />
            </div>
            <div class="form-group">
              <label for="end_date" class="form-label"> End Date * </label>
              <UiInput id="end_date" type="date" v-model="formData.end_date" :error="errors.end_date" @blur="validateField('end_date')" />
            </div>
          </div>

          <div class="form-group">
            <label for="host_entity" class="form-label"> Host Entity (LGU / Private / Coop) * </label>
            <UiInput id="host_entity" v-model="formData.host_entity" :error="errors.host_entity" @blur="validateField('host_entity')" />
          </div>
        </div>

        <div class="form-subsection optional">
          <div class="subsection-header">
            <h4 class="subsection-title">Registry Details (Optional)</h4>
          </div>
          <p class="field-help" style="margin-top: 0">
            These appear on your public project page and help buyers &amp; investors assess the
            project at a glance.
          </p>

          <div class="form-group">
            <label for="methodology" class="form-label"> Methodology / Standard </label>
            <select id="methodology" v-model="formData.methodology" class="form-select">
              <option value="">Select a standard…</option>
              <optgroup v-for="g in methodologyGroups()" :key="g.group" :label="g.group">
                <option v-for="m in g.items" :key="m.value" :value="m.value">{{ m.label }}</option>
              </optgroup>
            </select>
            <div class="field-help">
              The carbon standard the project follows. Choosing from this list lets buyers and
              investors filter by standard.
            </div>
          </div>

          <div v-if="formData.methodology === 'other'" class="form-group">
            <label for="methodology_custom" class="form-label"> Which standard? </label>
            <UiInput
              id="methodology_custom"
              v-model="formData.methodology_custom"
              placeholder="e.g., Verra VM0044, ISCC PLUS"
            />
            <div class="field-help">
              Recorded as free text, so it won't appear in the standard filter.
            </div>
          </div>

          <div class="form-group">
            <label for="development_status" class="form-label"> Development Status </label>
            <select id="development_status" v-model="formData.development_status" class="form-select">
              <option value="">Not specified</option>
              <option v-for="d in DEVELOPMENT_STATUSES" :key="d.value" :value="d.value">
                {{ d.label }} — {{ d.description }}
              </option>
            </select>
            <div class="field-help">
              Where the project is in the real world. This is separate from its Carbonify review
              status (draft / submitted / validated).
            </div>
          </div>

          <div class="form-group">
            <label for="feedstock" class="form-label"> Feedstock / Input Material </label>
            <UiInput
              id="feedstock"
              v-model="formData.feedstock"
              placeholder="e.g., Rice husk, Coconut biomass, Sugarcane bagasse, Bana grass"
            />
            <div class="field-help">The biomass or input material the project uses.</div>
          </div>

          <div class="form-grid two-columns">
            <div class="form-group">
              <label for="capacity" class="form-label"> Capacity </label>
              <UiInput
                id="capacity"
                type="number"
                min="0"
                step="any"
                v-model.number="formData.capacity"
                placeholder="e.g., 10"
              />
              <div class="field-help">Nameplate or throughput figure.</div>
            </div>
            <div class="form-group">
              <label for="capacity_unit" class="form-label"> Capacity Unit </label>
              <UiInput
                id="capacity_unit"
                v-model="formData.capacity_unit"
                placeholder="e.g., MW, tonnes/year"
              />
            </div>
          </div>
        </div>

        <div class="form-subsection optional">
          <div class="subsection-header">
            <h4 class="subsection-title">Financials (Optional)</h4>
          </div>
          <p class="field-help" style="margin-top: 0">
            Used to model investor returns (IRR / NPV / payback) and funding needs on the Investor
            Portal. All optional — leave blank if not applicable.
          </p>

          <div class="form-grid two-columns">
            <div class="form-group">
              <label for="capex" class="form-label"> Capital expenditure (CAPEX) </label>
              <UiInput id="capex" v-model.number="formData.capex" type="number" min="0" step="any" placeholder="e.g., 5000000" />
              <div class="field-help">Total up-front investment, in ₱.</div>
            </div>
            <div class="form-group">
              <label for="opex" class="form-label"> Operating cost / year (OPEX) </label>
              <UiInput id="opex" v-model.number="formData.opex" type="number" min="0" step="any" placeholder="e.g., 400000" />
              <div class="field-help">Annual running cost, in ₱.</div>
            </div>
          </div>

          <div class="form-group">
            <label for="project_lifetime_years" class="form-label"> Project lifetime (years) </label>
            <UiInput id="project_lifetime_years" v-model.number="formData.project_lifetime_years" type="number" min="0" step="1" placeholder="e.g., 10" />
            <div class="field-help">Crediting / operating horizon used for the cashflow model.</div>
          </div>

          <div class="form-grid two-columns">
            <div class="form-group">
              <label for="funding_target" class="form-label"> Funding target </label>
              <UiInput id="funding_target" v-model.number="formData.funding_target" type="number" min="0" step="any" placeholder="e.g., 6000000" />
              <div class="field-help">Capital you are seeking, in ₱.</div>
            </div>
            <div class="form-group">
              <label for="funding_raised" class="form-label"> Funding raised so far </label>
              <UiInput id="funding_raised" v-model.number="formData.funding_raised" type="number" min="0" step="any" placeholder="e.g., 1500000" />
              <div class="field-help">Capital committed to date, in ₱.</div>
            </div>
          </div>
        </div>

        <div class="form-subsection optional">
          <div class="subsection-header">
            <h4 class="subsection-title">Required Technical &amp; Compliance Documents</h4>
          </div>

          <p class="doc-intro">
            Tap any card below to pick a PDF from your device. Each card explains what the
            document is, so you always know what to upload. Cards marked
            <span class="req">*</span> are required; a green check means your file is attached.
          </p>

          <div class="document-grid">
            <label class="doc-card" :class="{ filled: !!formData.pdd_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.pdd_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">PDD <span class="req">*</span></span>
                <span class="doc-card-desc">Project Design Document — the full blueprint: what your project does, where, the methodology used, and how carbon savings are measured.</span>
                <span class="doc-card-file">{{ formData.pdd_file ? formData.pdd_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="pddInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'pdd_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.baseline_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.baseline_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">Baseline Report <span class="req">*</span></span>
                <span class="doc-card-desc">Shows the emissions that would happen WITHOUT your project — the comparison point used to calculate your carbon savings.</span>
                <span class="doc-card-file">{{ formData.baseline_file ? formData.baseline_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="baselineInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'baseline_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.additionality_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.additionality_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">Additionality Justification <span class="req">*</span></span>
                <span class="doc-card-desc">Explains why the project genuinely needs carbon finance and would not have happened on its own.</span>
                <span class="doc-card-file">{{ formData.additionality_file ? formData.additionality_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="additionalityInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'additionality_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.leakage_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.leakage_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">Leakage Assessment <span class="req">*</span></span>
                <span class="doc-card-desc">Checks whether your project simply shifts emissions to another place instead of truly reducing them.</span>
                <span class="doc-card-file">{{ formData.leakage_file ? formData.leakage_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="leakageInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'leakage_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.safeguards_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.safeguards_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">Safeguards Checklist <span class="req">*</span></span>
                <span class="doc-card-desc">Confirms the project does no social or environmental harm to the community or surroundings.</span>
                <span class="doc-card-file">{{ formData.safeguards_file ? formData.safeguards_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="safeguardsInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'safeguards_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.feasibility_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.feasibility_file ? 'check_circle' : 'description' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">Feasibility Study <span class="opt">Optional</span></span>
                <span class="doc-card-desc">Technical and financial study showing the project is realistic and viable. Helpful but not required.</span>
                <span class="doc-card-file">{{ formData.feasibility_file ? formData.feasibility_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="feasibilityInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'feasibility_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.mrv_report_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.mrv_report_file ? 'check_circle' : 'monitoring' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">MRV Report <span class="opt">Optional</span></span>
                <span class="doc-card-desc">A published monitoring, reporting &amp; verification report. Attach one so buyers and investors can read your measured results on the project page. New projects won't have one yet.</span>
                <span class="doc-card-file">{{ formData.mrv_report_file ? formData.mrv_report_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="mrvReportInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'mrv_report_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.lgu_endorsement_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.lgu_endorsement_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">LGU Endorsement <span class="req">*</span></span>
                <span class="doc-card-desc">An official letter of support for the project from your Local Government Unit (city, municipality, or barangay).</span>
                <span class="doc-card-file">{{ formData.lgu_endorsement_file ? formData.lgu_endorsement_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="lguEndorsementInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'lgu_endorsement_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.land_ownership_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.land_ownership_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">Land Ownership / Lease <span class="req">*</span></span>
                <span class="doc-card-desc">Proof you own or legally lease the project land — e.g. land title, tax declaration, or signed lease contract.</span>
                <span class="doc-card-file">{{ formData.land_ownership_file ? formData.land_ownership_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="landOwnershipInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'land_ownership_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.ecc_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.ecc_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">ECC / Permits <span class="req">*</span></span>
                <span class="doc-card-desc">Environmental Compliance Certificate and any other government permits the project needs to operate.</span>
                <span class="doc-card-file">{{ formData.ecc_file ? formData.ecc_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="eccInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'ecc_file')" />
            </label>

            <label class="doc-card" :class="{ filled: !!formData.moa_file }">
              <span class="doc-card-status" aria-hidden="true">
                <span class="material-symbols-outlined">{{ formData.moa_file ? 'check_circle' : 'upload_file' }}</span>
              </span>
              <span class="doc-card-main">
                <span class="doc-card-title">MOA / Agreements <span class="req">*</span></span>
                <span class="doc-card-desc">Signed Memorandum of Agreement with your partners, landowners, or the community involved in the project.</span>
                <span class="doc-card-file">{{ formData.moa_file ? formData.moa_file.name : 'Click to upload PDF' }}</span>
              </span>
              <input ref="moaInput" type="file" accept="application/pdf" class="file-input-hidden" @change="(e) => handleSingleDocUpload(e, 'moa_file')" />
            </label>
          </div>

          <p v-if="!isEditMode && missingRequiredDocs.length" class="doc-missing-hint">
            <span class="material-symbols-outlined" aria-hidden="true">info</span>
            {{ missingRequiredDocs.length }} required document{{ missingRequiredDocs.length > 1 ? 's' : '' }} still needed:
            {{ missingRequiredDocs.join(', ') }}.
          </p>
          <p v-else-if="!isEditMode" class="doc-complete-hint">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            All required documents attached.
          </p>
        </div>

      <div class="form-subsection">
        <div class="subsection-header">
          <h4 class="subsection-title">Credit Information *</h4>
        </div>
        <div class="credit-grid">
          <div class="credit-card">
            <div class="credit-card-header">
              <span class="material-symbols-outlined credit-card-icon" aria-hidden="true">insights</span>
              <span class="credit-card-title">Estimated Credits *</span>
            </div>
            <div class="credit-field">
              <div class="prefix">#</div>
              <UiInput
                type="number"
                min="1"
                step="1"
                v-model.number="formData.estimated_credits"
                placeholder="0"
                :error="errors.estimated_credits"
                @input="clearFieldError('estimated_credits')"
              />
              <div class="field-hint">Min: 1</div>
            </div>
            <div class="help-card">
              <span class="material-symbols-outlined help-icon" aria-hidden="true">lightbulb</span>
              <span>Number of carbon credits this project will generate</span>
            </div>
          </div>

          <div class="credit-card credit-card--note">
            <div class="credit-card-header">
              <span class="material-symbols-outlined credit-card-icon" aria-hidden="true">verified_user</span>
              <span class="credit-card-title">Price per Credit</span>
            </div>
            <div class="help-card">
              <span class="material-symbols-outlined help-icon" aria-hidden="true">info</span>
              <span>The price per carbon credit is set by the verifier after they review and validate your project.</span>
            </div>
          </div>
        </div>
      </div>

      <div class="form-subsection optional">
        <div class="subsection-header">
          <h4 class="subsection-title">Credibility (Optional)</h4>
          <p class="subsection-hint">
            Helps buyers trust the credits. Shown on the public project page.
          </p>
        </div>
        <div class="credibility-grid">
          <div class="form-group">
            <label for="additionality_type" class="form-label">Additionality basis</label>
            <select
              id="additionality_type"
              v-model="formData.additionality_type"
              class="credibility-select"
            >
              <option value="">Not specified</option>
              <option v-for="t in additionalityTypes" :key="t.value" :value="t.value">
                {{ t.label }}
              </option>
            </select>
            <p v-if="additionalityHint" class="field-hint">{{ additionalityHint }}</p>
          </div>

          <div class="form-group">
            <label for="permanence_years" class="form-label">Permanence (years)</label>
            <UiInput
              id="permanence_years"
              type="number"
              min="0"
              step="1"
              v-model.number="formData.permanence_years"
              placeholder="e.g. 100"
            />
            <p class="field-hint">How long the carbon removal is expected to persist.</p>
          </div>

          <div class="form-group">
            <label for="reversal_risk" class="form-label">Reversal risk</label>
            <select id="reversal_risk" v-model="formData.reversal_risk" class="credibility-select">
              <option value="">Not specified</option>
              <option v-for="r in reversalRiskLevels" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </select>
            <p class="field-hint">Risk the stored carbon is later re-released.</p>
          </div>
        </div>
      </div>

      <div class="form-subsection optional">
        <div class="subsection-header">
          <h4 class="subsection-title">Project Documents (Optional)</h4>
        </div>
        <div
          class="upload-dropzone"
          :class="{ dragging: isDraggingFiles }"
          @dragover.prevent="handleFileDragOver"
          @dragleave.prevent="handleFileDragLeave"
          @drop.prevent="handleFileDrop"
          @click="onFileZoneClick"
        >
          <input
            ref="projectDocumentsInput"
            type="file"
            multiple
            accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
            class="file-input-hidden"
            @change="handleFileUpload"
          />
          <div v-if="uploadingFiles" class="upload-loading">
            <div class="loading-spinner"></div>
            <span>Uploading documents...</span>
          </div>
          <template v-else>
            <div v-if="uploadedFiles.length" class="uploaded-files">
              <div v-for="file in uploadedFiles" :key="file.id || file.name" class="uploaded-file">
                <span class="material-symbols-outlined document-icon" aria-hidden="true">
                  {{ file.type.includes('pdf') ? 'picture_as_pdf' : file.type.includes('image') ? 'image' : 'description' }}
                </span>
                <span class="file-name">{{ file.name }}</span>
                <button type="button" class="remove-file" @click.stop="removeFile(file.id || file.name)">
                  <span class="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <div v-else class="upload-placeholder">
              <span class="material-symbols-outlined upload-icon" aria-hidden="true">folder</span>
              <p class="upload-title">Click to upload documents</p>
              <p class="upload-subtitle">or drag and drop files here</p>
              <p class="upload-hint">PDF, DOC, DOCX, JPEG, PNG up to 10MB each (max 5 files)</p>
            </div>
          </template>
          <div v-if="fileUploadError" class="upload-error">{{ fileUploadError }}</div>
        </div>
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <UiButton type="button" variant="outline" @click="handleCancel" :disabled="loading">
          Cancel
        </UiButton>
        <!-- Save as draft asks for nothing but a title, so it is NOT gated on
             isFormValid. Nine required documents in one sitting was the single
             biggest reason a submission never got finished. -->
        <UiButton
          v-if="canSaveAsDraft"
          type="button"
          variant="outline"
          :disabled="loading"
          @click="handleSubmit({ asDraft: true })"
        >
          {{ savingDraft ? 'Saving…' : 'Save as draft' }}
        </UiButton>
        <UiButton type="submit" :disabled="loading || !isFormValid">
          {{ submitButtonText }}
        </UiButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.project-form {
  max-width: 100%;
  margin: 0;
  padding: 0;
  background: var(--bg-primary, #ffffff);
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 200px);
  border-radius: 1rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--border-light, #e8f5e8);
  overflow: hidden;
  position: relative;
}

.project-form::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-color, #058526), var(--primary-hover, #04701f), var(--primary-color, #058526));
  background-size: 200% 100%;
  animation: shimmer 3s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.form-header {
  padding: 20px 24px 0 24px;
  margin-bottom: 0;
  text-align: center;
  background: var(--bg-primary, #ffffff);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  flex-shrink: 0;
}

.form-header h2 {
  margin: 0 0 4px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
}

.form-header p {
  margin: 0 0 16px 0;
  color: var(--text-secondary, #4a5568);
  font-size: 14px;
}

.form {
  background: var(--bg-primary, #ffffff);
  border: none;
  border-radius: 0;
  padding: 20px 24px;
  box-shadow: none;
  flex: 1;
  overflow-y: auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.form-group {
  margin-bottom: 14px;
}

/* Paired short fields (dates, capacity + unit, CAPEX + OPEX) sit side by side
   instead of each taking a full row. `.form-grid` is global (App.vue). */
.form-grid {
  gap: 0.75rem 1rem;
}

.form-grid.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid .form-group {
  margin-bottom: 0;
}

.form-spacer {
  flex: 1;
  min-height: 0;
}

.form-label {
  display: block;
  margin-bottom: 5px;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  font-size: 14px;
}

.form-select {
  width: 100%;
  padding: 9px 12px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: var(--radius-md, 0.5rem);
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a202c);
  font-size: 15px;
  transition: all 0.2s ease;
}

.form-select:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.form-select.error {
  border-color: var(--error-color, #dc3545);
}

.form-textarea {
  width: 100%;
  padding: 9px 12px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: var(--radius-md, 0.5rem);
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a202c);
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  min-height: 84px;
  transition: all 0.2s ease;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.form-textarea.error {
  border-color: var(--error-color, #dc3545);
}

.field-error {
  margin-top: 4px;
  color: var(--error-color, #dc3545);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
}

.field-help,
.field-hint {
  margin: 4px 0 0;
  color: var(--text-muted, #64748b);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
}

.sdg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px;
  margin-top: 6px;
}

.sdg-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.sdg-chip:hover {
  border-color: var(--primary-color, #058526);
}

.sdg-chip.selected {
  border-color: var(--primary-color, #058526);
  background: #ecfdf5;
}

.sdg-num {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--primary-color, #058526);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sdg-label {
  font-size: 13px;
  color: var(--text-primary, #1f2937);
}

.error-message {
  background: var(--error-light, #f8d7da);
  color: var(--error-color, #dc3545);
  padding: 12px 16px;
  border-radius: var(--radius-md, 0.5rem);
  margin-bottom: 20px;
  font-size: 14px;
}

.success-message {
  background: var(--success-light, #d4edda);
  color: var(--success-color, #058526);
  padding: 12px 16px;
  border-radius: var(--radius-md, 0.5rem);
  margin-bottom: 20px;
  font-size: 14px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: auto;
  padding: 14px 24px;
  border-top: 2px solid var(--border-light, #e8f5e8);
  background: linear-gradient(to bottom, var(--bg-primary, #ffffff), var(--bg-secondary, #f8fdf8));
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 10;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
}

/* Custom Scrollbar */
.form::-webkit-scrollbar {
  width: 8px;
}

.form::-webkit-scrollbar-track {
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 4px;
}

.form::-webkit-scrollbar-thumb {
  background: var(--primary-color, #058526);
  border-radius: 4px;
}

.form::-webkit-scrollbar-thumb:hover {
  background: var(--primary-hover, #04701f);
}

/* File Upload Styles */
.file-upload-section {
  margin-top: 8px;
}

.file-upload-area {
  position: relative;
  border: 2px dashed var(--border-color, #d1e7dd);
  border-radius: var(--radius-md, 0.5rem);
  padding: 32px 16px;
  text-align: center;
  background: var(--bg-secondary, #f8fdf8);
  transition: all 0.2s ease;
  cursor: pointer;
}

.file-upload-area:hover {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, rgba(5, 133, 38, 0.05));
}

.file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.file-upload-label {
  cursor: pointer;
  display: block;
}

.upload-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.upload-text {
  margin-bottom: 8px;
}

.upload-text strong {
  display: block;
  color: var(--text-primary, #1a202c);
  margin-bottom: 4px;
}

.upload-text span {
  color: var(--text-secondary, #4a5568);
  font-size: 14px;
}

.upload-restrictions {
  font-size: 12px;
  color: var(--text-muted, #64748b);
}

.file-upload-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--error-light, #f8d7da);
  color: var(--error-color, #dc3545);
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.upload-progress {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--primary-light);
  color: var(--primary-color);
  border-radius: var(--radius-sm);
  font-size: 14px;
  text-align: center;
}

.uploaded-files {
  margin-top: 16px;
}

.uploaded-files h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 600;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.file-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.file-size {
  font-size: 12px;
  color: var(--text-muted);
}

.remove-file-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  font-size: 16px;
  line-height: 1;
}

.remove-file-btn:hover {
  background: var(--error-light, #f8d7da);
  color: var(--error-color, #dc3545);
}

.remove-file-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Project Image Upload Styles */
.project-image-upload-section {
  margin-top: 8px;
}

.image-preview-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 360px;
  max-height: 240px;
  margin: 0 auto;
  border-radius: var(--radius-md, 0.5rem);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background: white;
}

.image-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.remove-image-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.2s ease;
}

.remove-image-btn:hover {
  background: rgba(220, 38, 38, 0.9);
}

.remove-image-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-upload-area {
  position: relative;
  border: 2px dashed var(--border-color, #d1e7dd);
  border-radius: var(--radius-md, 0.5rem);
  padding: 24px 16px;
  text-align: center;
  background: var(--bg-secondary, #f8fdf8);
  transition: all 0.2s ease;
  cursor: pointer;
}

.image-upload-area:hover {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, rgba(5, 133, 38, 0.05));
}

.image-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.image-upload-label {
  cursor: pointer;
  display: block;
}

.image-upload-label .upload-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.image-upload-label .upload-text {
  margin-bottom: 6px;
}

.image-upload-label .upload-text strong {
  display: block;
  color: var(--text-primary, #1a202c);
  margin-bottom: 2px;
  font-size: 14px;
}

.image-upload-label .upload-text span {
  color: var(--text-secondary, #4a5568);
  font-size: 12px;
}

.image-upload-label .upload-restrictions {
  font-size: 11px;
  color: var(--text-muted, #64748b);
}

.image-upload-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--error-light, #f8d7da);
  color: var(--error-color, #dc3545);
  border-radius: var(--radius-sm);
  font-size: 14px;
}

/* Credit Information Styles */
.credit-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 6px;
}

.credit-field {
  display: flex;
  flex-direction: column;
}

.price-input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.price-input-container-enhanced {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 2px solid var(--border-light, #e8f5e8);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.5rem;
  transition: all 0.3s ease;
}

.price-input-container-enhanced:focus-within {
  border-color: var(--primary-color, #058526);
  background: var(--bg-primary, #ffffff);
  box-shadow: 0 0 0 4px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.currency-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(135deg, var(--primary-color, #058526), var(--primary-hover, #04701f));
  color: white;
  font-weight: 700;
  font-size: 1.125rem;
  border-radius: var(--radius-sm, 0.5rem);
  box-shadow: 0 2px 6px rgba(5, 133, 38, 0.2);
  flex-shrink: 0;
}

.price-helper {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding-right: 0.5rem;
}

.helper-text {
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
  font-weight: 500;
}

.price-field-enhanced {
  background: linear-gradient(135deg, var(--bg-secondary, #f8fdf8) 0%, var(--bg-primary, #ffffff) 100%);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.85rem 1rem;
  border: 2px solid var(--border-light, #e8f5e8);
  transition: all 0.3s ease;
}

.price-field-enhanced:hover {
  border-color: var(--primary-color, #058526);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.1);
}

.price-label-enhanced {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.label-icon {
  font-size: 1.25rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.price-help-enhanced {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: var(--primary-light, rgba(5, 133, 38, 0.05));
  border-radius: var(--radius-sm, 0.5rem);
  border-left: 3px solid var(--primary-color, #058526);
}

.help-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.credits-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.5rem;
  background: linear-gradient(135deg, var(--primary-color, #058526), var(--primary-hover, #04701f));
  color: white;
  font-weight: 700;
  font-size: 1.125rem;
  border-radius: var(--radius-sm, 0.5rem);
  box-shadow: 0 2px 6px rgba(5, 133, 38, 0.2);
  flex-shrink: 0;
}

.credits-field-enhanced {
  background: linear-gradient(135deg, var(--bg-secondary, #f8fdf8) 0%, var(--bg-primary, #ffffff) 100%);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.85rem 1rem;
  border: 2px solid var(--border-light, #e8f5e8);
  transition: all 0.3s ease;
}

.credits-field-enhanced:hover {
  border-color: var(--primary-color, #058526);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.1);
}

.credits-input-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 2px solid var(--border-light, #e8f5e8);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.5rem;
  transition: all 0.3s ease;
}

.credits-input-container:focus-within {
  border-color: var(--primary-color, #058526);
  background: var(--bg-primary, #ffffff);
  box-shadow: 0 0 0 4px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.currency-symbol {
  position: absolute;
  left: 12px;
  color: var(--text-secondary, #4a5568);
  font-weight: 600;
  z-index: 1;
  pointer-events: none;
}

.price-input-container .form-input {
  padding-left: 24px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .form-header {
    padding: 16px 16px 0 16px;
  }

  .form {
    padding: 16px;
  }

  /* Paired fields stack once there isn't room for two readable columns. */
  .form-grid.two-columns,
  .credibility-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 16px keeps iOS from zooming the viewport on focus. */
  .form-select,
  .form-textarea,
  .credibility-select,
  .form :deep(.enhanced-input__field) {
    font-size: 16px;
  }

  .form-actions {
    flex-direction: column;
    padding: 14px 16px;
  }

  .form-actions button {
    width: 100%;
  }

  .image-preview {
    width: 150px;
    height: 112px;
  }

  .credit-info-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .price-input-container-enhanced {
    flex-wrap: wrap;
  }

  .price-helper {
    width: 100%;
    margin-left: 0;
    margin-top: 0.5rem;
  }
}

/* Enhanced Title Field Styles */
.title-field-enhanced {
  background: linear-gradient(135deg, var(--bg-secondary, #f8fdf8) 0%, var(--bg-primary, #ffffff) 100%);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.85rem 1rem;
  border: 2px solid var(--border-light, #e8f5e8);
  transition: all 0.3s ease;
}

.title-field-enhanced:hover {
  border-color: var(--primary-color, #058526);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.1);
}

.title-label-enhanced {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.title-input-wrapper {
  position: relative;
}

.title-input-wrapper::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--primary-color, #058526), transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.title-input-wrapper:focus-within::after {
  opacity: 1;
}

.title-help-enhanced {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: var(--radius-sm, 0.5rem);
  position: relative;
  overflow: hidden;
}

.char-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--primary-color, #058526), var(--primary-hover, #04701f));
  transition: width 0.3s ease;
  opacity: 0.3;
}

.form-subsection {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.subsection-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.15rem 0.6rem;
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.subsection-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0;
}

.project-title-card {
  background: linear-gradient(135deg, var(--bg-secondary, #f8fdf8) 0%, var(--bg-primary, #ffffff) 100%);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.85rem 1rem;
  border: 2px solid var(--border-light, #e8f5e8);
  transition: all 0.3s ease;
}

.project-title-card:hover {
  border-color: var(--primary-color, #058526);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.1);
}

.project-title-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
  color: #1f2937;
}

.project-title-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
}

.upload-dropzone {
  position: relative;
  border: 2px dashed var(--border-color, #d1e7dd);
  border-radius: var(--radius-md, 0.5rem);
  padding: 12px 16px;
  text-align: center;
  background: var(--bg-secondary, #f8fdf8);
  transition: all 0.2s ease;
  cursor: pointer;
  min-height: 104px; /* Ensure a minimum height for the dropzone */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.upload-dropzone:hover {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, rgba(5, 133, 38, 0.05));
}

.upload-dropzone.dragging {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, rgba(5, 133, 38, 0.1));
  box-shadow: 0 0 10px rgba(5, 133, 38, 0.2);
}

.upload-loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md, 0.5rem);
  z-index: 10;
}

.loading-spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-left-color: var(--primary-color, #058526);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.upload-placeholder {
  text-align: center;
  padding: 0.5rem 1rem;
  color: #6b7280;
}

.upload-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  margin-bottom: 0.35rem;
  color: var(--primary-color, #058526);
}

.document-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: var(--primary-color, #058526);
  margin-right: 0.75rem;
}

.remove-file {
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 0.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.remove-file:hover {
  background: var(--error-light, #f8d7da);
  color: var(--error-color, #dc3545);
}

.remove-file:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-input-hidden {
  display: none;
}

/* ── Required Technical & Compliance Documents ── */
.doc-intro {
  margin: -2px 0 10px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--text-secondary, #4a5568);
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: var(--radius-md, 0.625rem);
  padding: 0.55rem 0.7rem;
}

.document-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.6rem;
}

.doc-card {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.65rem 0.8rem;
  background: #fff;
  border: 1.5px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-md, 0.625rem);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease,
    background 0.18s ease;
}

.doc-card:hover {
  border-color: var(--primary-color, #058526);
  background: var(--bg-secondary, #f8fdf8);
  box-shadow: 0 6px 16px rgba(5, 133, 38, 0.12);
  transform: translateY(-1px);
}

.doc-card.filled {
  border-color: var(--primary-color, #058526);
  background: linear-gradient(135deg, #f6fef9 0%, #ecfdf5 100%);
}

.doc-card-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  flex-shrink: 0;
  border-radius: 0.6rem;
  background: var(--bg-muted, #e8f5e8);
  color: var(--text-muted, #64748b);
}

.doc-card:hover .doc-card-status {
  color: var(--primary-color, #058526);
}

.doc-card.filled .doc-card-status {
  background: var(--primary-color, #058526);
  color: #fff;
}

.doc-card-status .material-symbols-outlined {
  font-size: 1.3rem;
}

.doc-card-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.doc-card-title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
}

.req {
  color: #dc2626;
  font-weight: 700;
}

.opt {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-muted, #64748b);
  background: var(--bg-muted, #eef2f1);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}

.doc-missing-hint,
.doc-complete-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 14px 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.5;
}

.doc-missing-hint {
  color: #b45309;
}

.doc-complete-hint {
  color: var(--primary-color, #058526);
}

.doc-missing-hint .material-symbols-outlined,
.doc-complete-hint .material-symbols-outlined {
  font-size: 1.1rem;
}

.doc-card-desc {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-secondary, #4a5568);
}

.doc-card-file {
  margin-top: 0.3rem;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--primary-color, #058526);
  word-break: break-word;
}

.doc-card:not(.filled) .doc-card-file {
  color: var(--text-muted, #64748b);
  font-weight: 500;
}

.credit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.subsection-hint {
  margin: 0;
  color: var(--text-muted, #64748b);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
}

.credibility-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
  gap: 0.75rem 1rem;
}

/* Grid cells own the spacing; the per-field margin would double it. */
.credibility-grid .form-group,
.credit-info-grid .form-group,
.credit-grid .form-group {
  margin-bottom: 0;
}

.credibility-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: #fff;
  font-size: 15px;
  color: var(--text-primary, #1a202c);
}

.credibility-select:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(5, 133, 38, 0.1));
}

/* UiInput ships a taller, heavier field (0.75rem padding, 2px border, drop
   shadow) than the native selects next to it, so a select and an input in the
   same row rendered at different heights. Normalise them inside this form. */
.form :deep(.enhanced-input) {
  gap: 4px;
}

.form :deep(.enhanced-input__field) {
  padding: 9px 12px;
  border-width: 1px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 400;
  box-shadow: none;
}

.form :deep(.enhanced-input__field:focus) {
  box-shadow: 0 0 0 3px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.credit-card {
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid rgba(5, 150, 105, 0.12);
  box-shadow: 0 4px 14px rgba(5, 133, 38, 0.1);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.credit-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0;
}

.credit-card-icon {
  font-size: 1.6rem;
  color: var(--primary-color, #058526);
}

.credit-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.credit-field {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.75rem;
}

.credit-field .prefix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.12);
  color: var(--primary-color, #058526);
  font-weight: 600;
}

.credit-field .ui-input {
  width: 100%;
}

.credit-field .field-hint {
  grid-column: 1 / -1;
}

.help-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(16, 185, 129, 0.12);
  color: #045c1a;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  font-size: 0.9rem;
  border: 1px solid rgba(5, 150, 105, 0.2);
}

.help-icon {
  font-size: 1.2rem;
  color: inherit;
}
</style>
