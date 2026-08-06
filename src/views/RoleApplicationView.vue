<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSupabaseAsync } from '@/services/supabaseClient'
import {
  ROLE_APPLICATION_ERRORS,
  ROLE_APPLICATION_ROLES,
  normalizeRequestedRole,
  submitRoleApplication,
} from '@/services/roleApplicationService'
import { useUserStore } from '@/store/userStore'
import PasswordField from '@/components/ui/PasswordField.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const ROLE_DETAILS = {
  [ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER]: {
    title: 'Project Developer',
    summary:
      'Launch, manage, and list high-quality climate projects. Share project documentation and coordinate verification with Carbonify.',
    highlights: [
      'Create and manage carbon credit projects',
      'Access developer tools and analytics',
      'Collaborate with verifiers and buyers',
    ],
  },
  [ROLE_APPLICATION_ROLES.VERIFIER]: {
    title: 'Verifier',
    summary:
      'Review project documentation, validate carbon claims, and help ensure project integrity across the Carbonify marketplace.',
    highlights: [
      'Review project submissions and supporting evidence',
      'Provide verification feedback and recommendations',
      'Help maintain marketplace quality and trust',
    ],
  },
  [ROLE_APPLICATION_ROLES.FARMER]: {
    title: 'Farmer',
    summary:
      'Supply biomass feedstock from your farm. Register your plantation parcels, list feedstock on the marketplace, and track deliveries and payments.',
    highlights: [
      'Register plantation parcels and track expected yield',
      'List feedstock and receive quote requests from buyers',
      'Log deliveries with proof photos and follow payment status',
    ],
  },
}

const defaultRole =
  normalizeRequestedRole(route.query.role) || ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER
const selectedRole = ref(defaultRole)
const isProjectDeveloperApplication = computed(
  () => selectedRole.value === ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER,
)
const isVerifierApplication = computed(() => selectedRole.value === ROLE_APPLICATION_ROLES.VERIFIER)

const form = reactive({
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  company: '',
  website: '',
  businessRegistrationNumber: '',
  country: '',
  address: '',
  contactPersonName: '',
  contactPersonEmail: '',
  contactPersonPhone: '',
  certificateRegistration: '',
  articlesOrBusinessPermit: '',
  tin: '',
  proofOfLegalExistence: '',
  companyBackground: '',
  yearsOfOperation: '',
  pastEnvironmentalProjects: '',
  portfolio: '',
  verifierOrganization: '',
  verifierAccreditationBody: '',
  verifierAccreditationNumber: '',
  verifierYearsExperience: '',
  verifierSpecializations: '',
  verifierPastProjects: '',
  verifierContactPhone: '',
  supportingDocuments: '',
})

const verifierDocuments = ref([])
const verifierDocumentError = ref('')

const errors = reactive({
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  company: '',
  businessRegistrationNumber: '',
  country: '',
  address: '',
  contactPersonName: '',
  contactPersonEmail: '',
  contactPersonPhone: '',
  website: '',
  certificateRegistration: '',
  articlesOrBusinessPermit: '',
  tin: '',
  proofOfLegalExistence: '',
  companyBackground: '',
  yearsOfOperation: '',
  pastEnvironmentalProjects: '',
  portfolio: '',
  verifierOrganization: '',
  verifierAccreditationBody: '',
  verifierAccreditationNumber: '',
  verifierYearsExperience: '',
  verifierSpecializations: '',
  verifierPastProjects: '',
  verifierContactPhone: '',
  supportingDocuments: '',
  verifierDocuments: '',
})

const loading = ref(false)
const submissionSuccess = ref(false)
const duplicatePending = ref(false)
const supabaseUnavailable = ref(false)
const errorMessage = ref('')
const submittedApplication = ref(null)

const selectedRoleDetails = computed(() => ROLE_DETAILS[selectedRole.value])

function canonicalizeRoleQuery(role) {
  if (role === ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER) {
    return 'project-developer'
  }
  return role
}

function setSelectedRole(role) {
  const normalized = normalizeRequestedRole(role)
  if (!normalized || normalized === selectedRole.value) return
  selectedRole.value = normalized
}

function updateRoleQueryParam(role) {
  const canonical = canonicalizeRoleQuery(role)
  if (route.query.role === canonical) return
  router.replace({
    query: {
      ...route.query,
      role: canonical,
    },
  })
}

watch(
  () => route.query.role,
  (roleFromRoute) => {
    const normalized = normalizeRequestedRole(roleFromRoute)
    if (normalized && normalized !== selectedRole.value) {
      selectedRole.value = normalized
    }
  },
)

watch(selectedRole, (role) => {
  updateRoleQueryParam(role)
})

function prefillFromProfile() {
  const profile = userStore.profile
  const session = userStore.session

  if (profile) {
    if (!form.fullName) form.fullName = profile.full_name || ''
    if (!form.email) form.email = profile.email || session?.user?.email || ''
    if (!form.company) form.company = profile.company || ''
    if (!form.website) form.website = profile.website || ''
    if (!form.contactPersonName) form.contactPersonName = profile.full_name || ''
    if (!form.contactPersonEmail) form.contactPersonEmail = profile.email || session?.user?.email || ''
    if (!form.contactPersonPhone) form.contactPersonPhone = profile.phone || ''
    if (!form.verifierContactPhone) form.verifierContactPhone = profile.phone || ''
    if (!form.verifierOrganization) form.verifierOrganization = profile.company || ''
  } else if (session?.user?.email && !form.email) {
    form.email = session.user.email
    if (!form.contactPersonEmail) form.contactPersonEmail = session.user.email
  }
}

watch(
  () => [userStore.profile, userStore.session],
  () => {
    prefillFromProfile()
  },
  { immediate: true },
)

function clearErrors() {
  Object.keys(errors).forEach((key) => {
    errors[key] = ''
  })
  verifierDocumentError.value = ''
  errorMessage.value = ''
  duplicatePending.value = false
  supabaseUnavailable.value = false
}

function sanitizeNumericField(fieldName) {
  form[fieldName] = String(form[fieldName] || '').replace(/\D+/g, '')
}

/**
 * Strip non-digits AND clear the field's validation error, as one handler.
 *
 * Seven `@input` bindings used to do this inline as two statements separated by
 * a semicolon. That is what blocked DEFERRED_BACKLOG #5: `npm run format`
 * reformats a multi-statement inline handler across lines and drops the `;`,
 * which the Vue template compiler then rejects — so Prettier could not be run
 * on this repo at all, over seven attribute values.
 */
function onNumericInput(fieldName) {
  sanitizeNumericField(fieldName)
  errors[fieldName] = ''
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function parseLinks(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function handleVerifierDocumentSelect(event) {
  const files = Array.from(event.target.files || [])
  verifierDocuments.value = files
  verifierDocumentError.value = ''
}

async function uploadVerifierDocuments() {
  if (!verifierDocuments.value.length) return []

  const supabase = await getSupabaseAsync()
  if (!supabase) {
    throw new Error('Supabase is not available for uploading verifier documents.')
  }

  const uploaded = []
  for (const file of verifierDocuments.value) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `role-applications/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: false })

    if (uploadError) {
      throw new Error(uploadError.message || `Failed to upload ${file.name}`)
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
    uploaded.push({
      name: file.name,
      url: data?.publicUrl || '',
      size: file.size,
      type: file.type,
    })
  }

  return uploaded
}

function validate() {
  clearErrors()
  let isValid = true

  if (!form.fullName || form.fullName.trim().length < 2) {
    errors.fullName = 'Please provide your full name.'
    isValid = false
  }

  if (!form.email) {
    errors.email = 'Contact email is required.'
    isValid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Please enter a valid email address.'
    isValid = false
  }

  if (!userStore.isAuthenticated) {
    if (!form.password || form.password.length < 8) {
      errors.password = 'Password is required and must be at least 8 characters.'
      isValid = false
    }
    if (!form.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.'
      isValid = false
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.'
      isValid = false
    }
  }

  if (form.website && !isValidHttpUrl(form.website.trim())) {
    errors.website = 'Please provide a valid website URL (http:// or https://).'
    isValid = false
  }

  if (isVerifierApplication.value) {
    if (!form.verifierOrganization || form.verifierOrganization.trim().length < 2) {
      errors.verifierOrganization = 'Organization / firm is required for verifier applications.'
      isValid = false
    }

    if (!form.verifierAccreditationBody || form.verifierAccreditationBody.trim().length < 2) {
      errors.verifierAccreditationBody = 'Accreditation / certifying body is required.'
      isValid = false
    }

    if (!form.verifierAccreditationNumber || form.verifierAccreditationNumber.trim().length < 2) {
      errors.verifierAccreditationNumber = 'Accreditation or license number is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.verifierAccreditationNumber.trim())) {
      errors.verifierAccreditationNumber = 'Accreditation or license number must contain digits only.'
      isValid = false
    }

    if (!form.verifierYearsExperience || form.verifierYearsExperience.trim().length < 1) {
      errors.verifierYearsExperience = 'Years of verification experience is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.verifierYearsExperience.trim())) {
      errors.verifierYearsExperience = 'Years of verification experience must contain digits only.'
      isValid = false
    }

    if (!form.verifierSpecializations || form.verifierSpecializations.trim().length < 10) {
      errors.verifierSpecializations = 'Please list your verification specializations.'
      isValid = false
    }

    if (!form.verifierPastProjects || form.verifierPastProjects.trim().length < 20) {
      errors.verifierPastProjects =
        'Please provide past or ongoing verification projects (at least 20 characters).'
      isValid = false
    }

    if (!form.verifierContactPhone || form.verifierContactPhone.trim().length < 7) {
      errors.verifierContactPhone = 'Contact phone is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.verifierContactPhone.trim())) {
      errors.verifierContactPhone = 'Contact phone must contain digits only.'
      isValid = false
    }

    const links = parseLinks(form.supportingDocuments)
    if (links.some((link) => !isValidHttpUrl(link))) {
      errors.supportingDocuments = 'Supporting links must be valid URLs (http:// or https://).'
      isValid = false
    }

    if (!links.length && verifierDocuments.value.length === 0) {
      errors.verifierDocuments =
        'Attach at least one supporting document or provide at least one supporting link.'
      isValid = false
    }
  }

  if (isProjectDeveloperApplication.value) {
    if (!form.company || form.company.trim().length < 2) {
      errors.company = 'Company name is required for project developer applications.'
      isValid = false
    }

    if (!form.businessRegistrationNumber || form.businessRegistrationNumber.trim().length < 3) {
      errors.businessRegistrationNumber = 'Business registration number is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.businessRegistrationNumber.trim())) {
      errors.businessRegistrationNumber = 'Business registration number must contain digits only.'
      isValid = false
    }

    if (!form.country || form.country.trim().length < 2) {
      errors.country = 'Country is required.'
      isValid = false
    }

    if (!form.address || form.address.trim().length < 5) {
      errors.address = 'Business address is required.'
      isValid = false
    }

    if (!form.contactPersonName || form.contactPersonName.trim().length < 2) {
      errors.contactPersonName = 'Contact person name is required.'
      isValid = false
    }

    if (!form.contactPersonEmail) {
      errors.contactPersonEmail = 'Contact person email is required.'
      isValid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactPersonEmail)) {
      errors.contactPersonEmail = 'Please enter a valid contact person email.'
      isValid = false
    }

    if (!form.contactPersonPhone || form.contactPersonPhone.trim().length < 7) {
      errors.contactPersonPhone = 'Contact person phone is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.contactPersonPhone.trim())) {
      errors.contactPersonPhone = 'Contact person phone must contain digits only.'
      isValid = false
    }

    if (!form.certificateRegistration || form.certificateRegistration.trim().length < 3) {
      errors.certificateRegistration = 'Certificate of Registration details are required.'
      isValid = false
    }

    if (!form.articlesOrBusinessPermit || form.articlesOrBusinessPermit.trim().length < 3) {
      errors.articlesOrBusinessPermit = 'Articles of Incorporation / Business Permit details are required.'
      isValid = false
    }

    if (!form.tin || form.tin.trim().length < 3) {
      errors.tin = 'Tax Identification Number (TIN) is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.tin.trim())) {
      errors.tin = 'TIN must contain digits only.'
      isValid = false
    }

    if (!form.proofOfLegalExistence || form.proofOfLegalExistence.trim().length < 3) {
      errors.proofOfLegalExistence = 'Proof of legal existence is required.'
      isValid = false
    }

    if (!form.companyBackground || form.companyBackground.trim().length < 20) {
      errors.companyBackground = 'Company background / overview is required (at least 20 characters).'
      isValid = false
    }

    if (!form.yearsOfOperation || form.yearsOfOperation.trim().length < 1) {
      errors.yearsOfOperation = 'Years of operation is required.'
      isValid = false
    } else if (!/^\d+$/.test(form.yearsOfOperation.trim())) {
      errors.yearsOfOperation = 'Years of operation must contain digits only.'
      isValid = false
    }

    if (!form.pastEnvironmentalProjects || form.pastEnvironmentalProjects.trim().length < 20) {
      errors.pastEnvironmentalProjects =
        'Past or ongoing environmental projects are required (at least 20 characters).'
      isValid = false
    }

    if (!form.portfolio || form.portfolio.trim().length < 5) {
      errors.portfolio = 'Portfolio information is required.'
      isValid = false
    }
  }

  return isValid
}

function resetForm() {
  form.password = ''
  form.confirmPassword = ''
  form.company = ''
  form.website = ''
  form.businessRegistrationNumber = ''
  form.country = ''
  form.address = ''
  form.contactPersonName = ''
  form.contactPersonEmail = ''
  form.contactPersonPhone = ''
  form.certificateRegistration = ''
  form.articlesOrBusinessPermit = ''
  form.tin = ''
  form.proofOfLegalExistence = ''
  form.companyBackground = ''
  form.yearsOfOperation = ''
  form.pastEnvironmentalProjects = ''
  form.portfolio = ''
  form.verifierOrganization = ''
  form.verifierAccreditationBody = ''
  form.verifierAccreditationNumber = ''
  form.verifierYearsExperience = ''
  form.verifierSpecializations = ''
  form.verifierPastProjects = ''
  form.verifierContactPhone = ''
  form.supportingDocuments = ''
  verifierDocuments.value = []
}

async function handleSubmit() {
  if (!validate()) return

  loading.value = true
  errorMessage.value = ''
  duplicatePending.value = false
  supabaseUnavailable.value = false

  try {
    const uploadedVerifierDocuments = isVerifierApplication.value
      ? await uploadVerifierDocuments()
      : []

    const projectDeveloperProfile = isProjectDeveloperApplication.value
      ? {
          company_name: form.company,
          business_registration_number: form.businessRegistrationNumber,
          country: form.country,
          address: form.address,
          contact_person: {
            name: form.contactPersonName,
            email: form.contactPersonEmail,
            phone: form.contactPersonPhone,
          },
          legal_documents: {
            certificate_of_registration: form.certificateRegistration,
            articles_of_incorporation_or_business_permit: form.articlesOrBusinessPermit,
            tin: form.tin,
            proof_of_legal_existence: form.proofOfLegalExistence,
          },
          business_profile: {
            company_background: form.companyBackground,
            years_of_operation: form.yearsOfOperation,
            past_or_ongoing_environmental_projects: form.pastEnvironmentalProjects,
            portfolio: form.portfolio,
          },
        }
      : null

    const verifierProfile = isVerifierApplication.value
      ? {
          organization: form.verifierOrganization,
          accreditation_body: form.verifierAccreditationBody,
          accreditation_number: form.verifierAccreditationNumber,
          years_of_verification_experience: form.verifierYearsExperience,
          verification_specializations: form.verifierSpecializations,
          past_or_ongoing_verification_projects: form.verifierPastProjects,
          contact_phone: form.verifierContactPhone,
          supporting_documents: uploadedVerifierDocuments,
        }
      : null

    const experienceSummary = isProjectDeveloperApplication.value
      ? [
          `Company background: ${form.companyBackground}`,
          `Years of operation: ${form.yearsOfOperation}`,
          `Past or ongoing projects: ${form.pastEnvironmentalProjects}`,
          `Portfolio: ${form.portfolio}`,
        ].join('\n')
      : [
          `Organization: ${form.verifierOrganization}`,
          `Accreditation body: ${form.verifierAccreditationBody}`,
          `Accreditation number: ${form.verifierAccreditationNumber}`,
          `Years of verification experience: ${form.verifierYearsExperience}`,
          `Specializations: ${form.verifierSpecializations}`,
          `Past/Ongoing verification projects: ${form.verifierPastProjects}`,
        ].join('\n')

    const motivationSummary = isProjectDeveloperApplication.value
      ? 'Project developer application submitted with complete company and legal information.'
      : 'Verifier application submitted with accreditation and experience details.'

    const supportingLinks = isVerifierApplication.value ? parseLinks(form.supportingDocuments) : []
    const attachedDocumentsSummary = uploadedVerifierDocuments
      .map((document) => `${document.name}: ${document.url}`)
      .join('\n')

    const supportingDocumentsSummary = isProjectDeveloperApplication.value
      ? [
          `Certificate of Registration: ${form.certificateRegistration}`,
          `Articles / Business Permit: ${form.articlesOrBusinessPermit}`,
          `TIN: ${form.tin}`,
          `Proof of legal existence: ${form.proofOfLegalExistence}`,
        ].join('\n')
      : [
          `Contact phone: ${form.verifierContactPhone}`,
          `Supporting links: ${supportingLinks.length ? supportingLinks.join(', ') : 'None provided'}`,
          `Attached documents:\n${attachedDocumentsSummary || 'None uploaded'}`,
        ].join('\n')

    const metadata = {
      source: 'web_form',
      submitted_from_path: route.fullPath,
      additional: {
        is_authenticated: userStore.isAuthenticated,
        ...(projectDeveloperProfile
          ? {
              project_developer_profile: projectDeveloperProfile,
            }
          : {}),
        ...(verifierProfile
          ? {
              verifier_profile: verifierProfile,
            }
          : {}),
      },
    }

    const application = await submitRoleApplication({
      role: selectedRole.value,
      fullName: form.fullName,
      email: form.email,
      password: form.password,
      company: form.company,
      website: form.website,
      experience: experienceSummary,
      motivation: motivationSummary,
      supportingDocuments: supportingDocumentsSummary,
      userId: userStore.session?.user?.id,
      metadata,
    })

    submissionSuccess.value = true
    submittedApplication.value = application
    resetForm()
  } catch (error) {
    console.error('Role application submission failed:', error)
    if (/upload/i.test(String(error?.message || ''))) {
      verifierDocumentError.value = error.message || 'Failed to upload verifier document(s).'
    }
    if (error.code === ROLE_APPLICATION_ERRORS.SUPABASE_NOT_INITIALIZED) {
      supabaseUnavailable.value = true
      errorMessage.value =
        'Our database is not available right now. Please try again after the team connects Carbonify to Supabase.'
    } else if (error.code === ROLE_APPLICATION_ERRORS.DUPLICATE_PENDING) {
      duplicatePending.value = true
      errorMessage.value =
        'You already have an application under review. Our admins will notify you once it is processed.'
    } else {
      errorMessage.value = error.message || 'Unable to submit your application right now.'
    }
  } finally {
    loading.value = false
  }
}

function goBackHome() {
  router.push('/home')
}
</script>

<template>
  <div class="role-application">
    <section class="role-application__hero">
      <div class="hero__container">
        <h1 class="hero__title">Apply to become an Carbonify specialist</h1>
        <p class="hero__subtitle">
          Help us build a trusted carbon marketplace. Submit your credentials to join as a project
          developer or verifier. Our admin team reviews every request.
        </p>
      </div>
    </section>

    <section class="role-application__content">
      <div class="content__wrap">
        <div class="role-selector">
          <h2 class="role-selector__title">Choose your role focus</h2>
          <div class="role-selector__cards">
            <button
              v-for="(details, role) in ROLE_DETAILS"
              :key="role"
              type="button"
              class="role-card"
              :class="{ 'role-card--active': role === selectedRole }"
              @click="setSelectedRole(role)"
            >
              <div class="role-card__header">
                <h3 class="role-card__title">{{ details.title }}</h3>
                <span v-if="role === selectedRole" class="role-card__badge">Selected</span>
              </div>
              <p class="role-card__summary">{{ details.summary }}</p>
              <ul class="role-card__highlights">
                <li v-for="item in details.highlights" :key="item">{{ item }}</li>
              </ul>
            </button>
          </div>
        </div>

        <div class="application-form">
          <header class="application-form__header">
            <h2 class="application-form__title">
              {{ selectedRoleDetails?.title }} application
            </h2>
            <p class="application-form__subtitle">
              Provide enough detail for the Carbonify admin team to verify your experience. We will
              follow up by email with next steps.
            </p>
            <p v-if="!userStore.isAuthenticated" class="application-form__notice">
              You can submit an application before creating an Carbonify account. Signing up later will
              help us match your request automatically.
            </p>
          </header>

          <div v-if="submissionSuccess" class="application-success">
            <div class="application-success__icon">✅</div>
            <h3 class="application-success__title">Application received</h3>
            <p class="application-success__message">
              Thank you for applying to become an Carbonify {{ selectedRoleDetails?.title.toLowerCase()
              }}. Our admin team will review your submission and reach out at
              <strong>{{ submittedApplication?.email }}</strong>.
            </p>
            <p class="application-success__hint">
              You can close this page and wait for the admin review update via email.
            </p>
            <div class="application-success__actions">
              <button class="btn btn--primary" type="button" @click="goBackHome">
                Return to homepage
              </button>
            </div>
          </div>

          <form v-else class="form" @submit.prevent="handleSubmit" novalidate>
            <div class="form__grid">
              <div class="form__field">
                <label for="fullName" class="form__label">Full name</label>
                <input
                  id="fullName"
                  v-model="form.fullName"
                  type="text"
                  name="fullName"
                  class="form__input"
                  autocomplete="name"
                  required
                  @input="errors.fullName = ''"
                />
                <p v-if="errors.fullName" class="form__error">{{ errors.fullName }}</p>
              </div>

              <div class="form__field">
                <label for="email" class="form__label">Contact email</label>
                <input
                  id="email"
                  v-model="form.email"
                  type="email"
                  name="email"
                  class="form__input"
                  autocomplete="email"
                  required
                  @input="errors.email = ''"
                />
                <p v-if="errors.email" class="form__error">{{ errors.email }}</p>
              </div>

              <div class="form__field" v-if="!userStore.isAuthenticated">
                <label for="password" class="form__label">Account password</label>
                <PasswordField
                  id="password"
                  v-model="form.password"
                  name="password"
                  input-class="form__input"
                  autocomplete="new-password"
                  required
                  :aria-invalid="!!errors.password"
                  @input="errors.password = ''"
                />
                <p v-if="errors.password" class="form__error">{{ errors.password }}</p>
              </div>

              <div class="form__field" v-if="!userStore.isAuthenticated">
                <label for="confirmPassword" class="form__label">Confirm password</label>
                <PasswordField
                  id="confirmPassword"
                  v-model="form.confirmPassword"
                  name="confirmPassword"
                  input-class="form__input"
                  autocomplete="new-password"
                  required
                  :aria-invalid="!!errors.confirmPassword"
                  @input="errors.confirmPassword = ''"
                />
                <p v-if="errors.confirmPassword" class="form__error">{{ errors.confirmPassword }}</p>
              </div>

              <template v-if="isProjectDeveloperApplication">
                <div class="form__field">
                  <label for="company" class="form__label">Company name</label>
                  <input
                    id="company"
                    v-model="form.company"
                    type="text"
                    name="company"
                    class="form__input"
                    autocomplete="organization"
                    required
                    @input="errors.company = ''"
                  />
                  <p v-if="errors.company" class="form__error">{{ errors.company }}</p>
                </div>

                <div class="form__field">
                  <label for="businessRegistrationNumber" class="form__label">Business registration number</label>
                  <input
                    id="businessRegistrationNumber"
                    v-model="form.businessRegistrationNumber"
                    type="text"
                    name="businessRegistrationNumber"
                    class="form__input"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    required
                    @input="onNumericInput('businessRegistrationNumber')"
                  />
                  <p v-if="errors.businessRegistrationNumber" class="form__error">{{ errors.businessRegistrationNumber }}</p>
                </div>

                <div class="form__field">
                  <label for="country" class="form__label">Country</label>
                  <input
                    id="country"
                    v-model="form.country"
                    type="text"
                    name="country"
                    class="form__input"
                    required
                    @input="errors.country = ''"
                  />
                  <p v-if="errors.country" class="form__error">{{ errors.country }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="address" class="form__label">Business address</label>
                  <textarea
                    id="address"
                    v-model="form.address"
                    name="address"
                    class="form__textarea"
                    rows="3"
                    required
                    @input="errors.address = ''"
                  />
                  <p v-if="errors.address" class="form__error">{{ errors.address }}</p>
                </div>

                <div class="form__field">
                  <label for="contactPersonName" class="form__label">Contact person name</label>
                  <input
                    id="contactPersonName"
                    v-model="form.contactPersonName"
                    type="text"
                    name="contactPersonName"
                    class="form__input"
                    required
                    @input="errors.contactPersonName = ''"
                  />
                  <p v-if="errors.contactPersonName" class="form__error">{{ errors.contactPersonName }}</p>
                </div>

                <div class="form__field">
                  <label for="contactPersonEmail" class="form__label">Contact person email</label>
                  <input
                    id="contactPersonEmail"
                    v-model="form.contactPersonEmail"
                    type="email"
                    name="contactPersonEmail"
                    class="form__input"
                    required
                    @input="errors.contactPersonEmail = ''"
                  />
                  <p v-if="errors.contactPersonEmail" class="form__error">{{ errors.contactPersonEmail }}</p>
                </div>

                <div class="form__field">
                  <label for="contactPersonPhone" class="form__label">Contact person phone</label>
                  <input
                    id="contactPersonPhone"
                    v-model="form.contactPersonPhone"
                    type="text"
                    name="contactPersonPhone"
                    class="form__input"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    required
                    @input="onNumericInput('contactPersonPhone')"
                  />
                  <p v-if="errors.contactPersonPhone" class="form__error">{{ errors.contactPersonPhone }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="certificateRegistration" class="form__label">Certificate of Registration (SEC/DTI, etc.)</label>
                  <textarea
                    id="certificateRegistration"
                    v-model="form.certificateRegistration"
                    name="certificateRegistration"
                    class="form__textarea"
                    rows="3"
                    required
                    @input="errors.certificateRegistration = ''"
                  />
                  <p v-if="errors.certificateRegistration" class="form__error">{{ errors.certificateRegistration }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="articlesOrBusinessPermit" class="form__label">Articles of Incorporation / Business Permit</label>
                  <textarea
                    id="articlesOrBusinessPermit"
                    v-model="form.articlesOrBusinessPermit"
                    name="articlesOrBusinessPermit"
                    class="form__textarea"
                    rows="3"
                    required
                    @input="errors.articlesOrBusinessPermit = ''"
                  />
                  <p v-if="errors.articlesOrBusinessPermit" class="form__error">{{ errors.articlesOrBusinessPermit }}</p>
                </div>

                <div class="form__field">
                  <label for="tin" class="form__label">Tax Identification Number (TIN)</label>
                  <input
                    id="tin"
                    v-model="form.tin"
                    type="text"
                    name="tin"
                    class="form__input"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    required
                    @input="onNumericInput('tin')"
                  />
                  <p v-if="errors.tin" class="form__error">{{ errors.tin }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="proofOfLegalExistence" class="form__label">Proof of legal existence</label>
                  <textarea
                    id="proofOfLegalExistence"
                    v-model="form.proofOfLegalExistence"
                    name="proofOfLegalExistence"
                    class="form__textarea"
                    rows="3"
                    required
                    @input="errors.proofOfLegalExistence = ''"
                  />
                  <p v-if="errors.proofOfLegalExistence" class="form__error">{{ errors.proofOfLegalExistence }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="companyBackground" class="form__label">Company background / overview</label>
                  <textarea
                    id="companyBackground"
                    v-model="form.companyBackground"
                    name="companyBackground"
                    class="form__textarea"
                    rows="5"
                    required
                    @input="errors.companyBackground = ''"
                  />
                  <p v-if="errors.companyBackground" class="form__error">{{ errors.companyBackground }}</p>
                </div>

                <div class="form__field">
                  <label for="yearsOfOperation" class="form__label">Years of operation</label>
                  <input
                    id="yearsOfOperation"
                    v-model="form.yearsOfOperation"
                    type="text"
                    name="yearsOfOperation"
                    class="form__input"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    required
                    @input="onNumericInput('yearsOfOperation')"
                  />
                  <p v-if="errors.yearsOfOperation" class="form__error">{{ errors.yearsOfOperation }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="pastEnvironmentalProjects" class="form__label">Past or ongoing environmental projects</label>
                  <textarea
                    id="pastEnvironmentalProjects"
                    v-model="form.pastEnvironmentalProjects"
                    name="pastEnvironmentalProjects"
                    class="form__textarea"
                    rows="5"
                    required
                    @input="errors.pastEnvironmentalProjects = ''"
                  />
                  <p v-if="errors.pastEnvironmentalProjects" class="form__error">{{ errors.pastEnvironmentalProjects }}</p>
                </div>

                <div class="form__field form__field--textarea">
                  <label for="portfolio" class="form__label">Portfolio (e.g., renewable energy, forestry, waste management)</label>
                  <textarea
                    id="portfolio"
                    v-model="form.portfolio"
                    name="portfolio"
                    class="form__textarea"
                    rows="4"
                    required
                    @input="errors.portfolio = ''"
                  />
                  <p v-if="errors.portfolio" class="form__error">{{ errors.portfolio }}</p>
                </div>
              </template>

              <template v-else>
                <div class="form__field">
                  <label for="company" class="form__label"
                    >Organization / Company
                    <span class="form__label-optional">(optional)</span>
                  </label>
                  <input
                    id="company"
                    v-model="form.company"
                    type="text"
                    name="company"
                    class="form__input"
                    autocomplete="organization"
                  />
                </div>

                <div class="form__field">
                  <label for="website" class="form__label"
                    >Website or portfolio
                    <span class="form__label-optional">(optional)</span>
                  </label>
                  <input
                    id="website"
                    v-model="form.website"
                    type="url"
                    name="website"
                    class="form__input"
                    placeholder="https://"
                    @input="errors.website = ''"
                  />
                  <p v-if="errors.website" class="form__error">{{ errors.website }}</p>
                </div>

                <template v-if="isVerifierApplication">
                  <div class="form__field">
                    <label for="verifierOrganization" class="form__label">Verifier organization / firm</label>
                    <input
                      id="verifierOrganization"
                      v-model="form.verifierOrganization"
                      type="text"
                      name="verifierOrganization"
                      class="form__input"
                      required
                      @input="errors.verifierOrganization = ''"
                    />
                    <p v-if="errors.verifierOrganization" class="form__error">{{ errors.verifierOrganization }}</p>
                  </div>

                  <div class="form__field">
                    <label for="verifierAccreditationBody" class="form__label">Accreditation / certifying body</label>
                    <input
                      id="verifierAccreditationBody"
                      v-model="form.verifierAccreditationBody"
                      type="text"
                      name="verifierAccreditationBody"
                      class="form__input"
                      required
                      @input="errors.verifierAccreditationBody = ''"
                    />
                    <p v-if="errors.verifierAccreditationBody" class="form__error">{{ errors.verifierAccreditationBody }}</p>
                  </div>

                  <div class="form__field">
                    <label for="verifierAccreditationNumber" class="form__label">Accreditation / license number</label>
                    <input
                      id="verifierAccreditationNumber"
                      v-model="form.verifierAccreditationNumber"
                      type="text"
                      name="verifierAccreditationNumber"
                      class="form__input"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      required
                      @input="onNumericInput('verifierAccreditationNumber')"
                    />
                    <p v-if="errors.verifierAccreditationNumber" class="form__error">{{ errors.verifierAccreditationNumber }}</p>
                  </div>

                  <div class="form__field">
                    <label for="verifierYearsExperience" class="form__label">Years of verification experience</label>
                    <input
                      id="verifierYearsExperience"
                      v-model="form.verifierYearsExperience"
                      type="text"
                      name="verifierYearsExperience"
                      class="form__input"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      required
                      @input="onNumericInput('verifierYearsExperience')"
                    />
                    <p v-if="errors.verifierYearsExperience" class="form__error">{{ errors.verifierYearsExperience }}</p>
                  </div>

                  <div class="form__field">
                    <label for="verifierContactPhone" class="form__label">Verifier contact phone</label>
                    <input
                      id="verifierContactPhone"
                      v-model="form.verifierContactPhone"
                      type="text"
                      name="verifierContactPhone"
                      class="form__input"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      required
                      @input="onNumericInput('verifierContactPhone')"
                    />
                    <p v-if="errors.verifierContactPhone" class="form__error">{{ errors.verifierContactPhone }}</p>
                  </div>

                  <div class="form__field form__field--textarea">
                    <label for="verifierSpecializations" class="form__label">Verification specializations</label>
                    <textarea
                      id="verifierSpecializations"
                      v-model="form.verifierSpecializations"
                      name="verifierSpecializations"
                      class="form__textarea"
                      rows="4"
                      required
                      @input="errors.verifierSpecializations = ''"
                    />
                    <p v-if="errors.verifierSpecializations" class="form__error">{{ errors.verifierSpecializations }}</p>
                  </div>

                  <div class="form__field form__field--textarea">
                    <label for="verifierPastProjects" class="form__label">Past or ongoing verification projects</label>
                    <textarea
                      id="verifierPastProjects"
                      v-model="form.verifierPastProjects"
                      name="verifierPastProjects"
                      class="form__textarea"
                      rows="5"
                      required
                      @input="errors.verifierPastProjects = ''"
                    />
                    <p v-if="errors.verifierPastProjects" class="form__error">{{ errors.verifierPastProjects }}</p>
                  </div>
                </template>

                <div class="form__field form__field--textarea">
                  <label for="supportingDocuments" class="form__label"
                    >Supporting links
                    <span class="form__label-optional">(optional)</span>
                  </label>
                  <textarea
                    id="supportingDocuments"
                    v-model="form.supportingDocuments"
                    name="supportingDocuments"
                    class="form__textarea"
                    rows="3"
                    placeholder="Share relevant documents, registry IDs, or reference URLs."
                    @input="errors.supportingDocuments = ''"
                  />
                  <p v-if="errors.supportingDocuments" class="form__error">{{ errors.supportingDocuments }}</p>
                </div>

                <div v-if="isVerifierApplication" class="form__field">
                  <label for="verifierDocuments" class="form__label">Attach supporting documents</label>
                  <input
                    id="verifierDocuments"
                    type="file"
                    name="verifierDocuments"
                    class="form__input"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    multiple
                    @change="handleVerifierDocumentSelect"
                  />
                  <p v-if="verifierDocuments.length" class="form__hint">
                    {{ verifierDocuments.length }} file(s) selected.
                  </p>
                  <p v-if="errors.verifierDocuments || verifierDocumentError" class="form__error">
                    {{ errors.verifierDocuments || verifierDocumentError }}
                  </p>
                </div>
              </template>
            </div>

            <div v-if="errorMessage" class="form__alert" :class="{ 'form__alert--warn': duplicatePending }">
              {{ errorMessage }}
            </div>

            <div v-if="supabaseUnavailable" class="form__alert form__alert--info">
              Connect Supabase credentials in the environment configuration and try again. Your form
              entries are not saved yet.
            </div>

            <footer class="form__actions">
              <button class="btn btn--primary" type="submit" :disabled="loading">
                <span v-if="loading" class="btn__spinner" aria-hidden="true"></span>
                <span>{{ loading ? 'Submitting application...' : 'Submit application' }}</span>
              </button>
              <router-link to="/home" class="btn btn--ghost">Cancel</router-link>
            </footer>
          </form>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.role-application {
  min-height: 100vh;
  background: var(--bg-secondary, #f5fbf7);
  padding-bottom: 2rem;
}

.role-application__hero {
  background: linear-gradient(135deg, var(--primary-color, #058526) 0%, #0f9d58 100%);
  padding: 2rem 1.5rem;
  color: #ffffff;
  text-align: left;
}

.hero__container {
  max-width: 760px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hero__title {
  font-size: clamp(1.5rem, 3vw, 1.9rem);
  font-weight: 800;
  margin: 0;
}

.hero__subtitle {
  font-size: clamp(0.9rem, 1.6vw, 1rem);
  margin: 0;
  line-height: 1.5;
  opacity: 0.95;
}

.role-application__content {
  padding: 1.5rem 1.5rem;
}

.content__wrap {
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  gap: 1.25rem;
}

.role-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.role-selector__title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #102616);
}

.role-selector__cards {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.role-card {
  text-align: left;
  padding: 0.9rem 1rem;
  background: #ffffff;
  border-radius: 12px;
  border: 2px solid rgba(15, 157, 88, 0.1);
  box-shadow: 0 2px 6px rgba(5, 133, 38, 0.06);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.role-card--active {
  border-color: var(--primary-color, #058526);
  box-shadow: 0 16px 32px rgba(5, 133, 38, 0.16);
  transform: translateY(-4px);
}

.role-card:focus-visible {
  outline: 4px solid rgba(5, 133, 38, 0.4);
  outline-offset: 3px;
}

.role-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.role-card__title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #102616);
}

.role-card__badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary-color, #058526);
  background: rgba(5, 133, 38, 0.15);
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
}

.role-card__summary {
  margin: 0;
  color: var(--text-muted, #4b5d52);
  font-size: 0.85rem;
  line-height: 1.45;
}

.role-card__highlights {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.82rem;
  color: var(--text-primary, #102616);
}

.role-card__highlights li {
  line-height: 1.4;
}

.application-form {
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid rgba(15, 157, 88, 0.15);
  box-shadow: 0 4px 12px rgba(5, 133, 38, 0.08);
  padding: 1.25rem 1.5rem;
}

.application-form__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.application-form__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary, #102616);
}

.application-form__subtitle,
.application-form__notice {
  margin: 0;
  color: var(--text-muted, #4b5d52);
  font-size: 0.85rem;
  line-height: 1.5;
}

.application-form__notice {
  font-size: 0.82rem;
  background: rgba(5, 133, 38, 0.1);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  color: var(--primary-color, #058526);
  border: 1px solid rgba(5, 133, 38, 0.18);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.form__grid {
  display: grid;
  column-gap: 1rem;
  row-gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
}

.form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0;
}

.form__field--textarea {
  grid-column: 1 / -1;
}

.form__label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary, #102616);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.form__label-optional {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted, #4b5d52);
}

.form__input,
.form__textarea {
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(15, 157, 88, 0.2);
  background: #f9fffb;
  padding: 0.5rem 0.7rem;
  /* 15px, with a 16px mobile override below — under 16px iOS zooms the page
     on focus, which on a long form throws the user off their place. */
  font-size: 0.94rem;
  line-height: 1.4;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  color: var(--text-primary, #102616);
}

.form__textarea {
  resize: vertical;
  min-height: 74px;
}

.form__input:focus,
.form__textarea:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.15);
}

.form__error {
  margin: 0;
  color: #b42318;
  font-size: 0.78rem;
  font-weight: 600;
}

.form__alert {
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  font-size: 0.85rem;
  background: rgba(180, 35, 24, 0.08);
  border: 1px solid rgba(180, 35, 24, 0.2);
  color: #7a1b10;
  font-weight: 600;
}

.form__alert--warn {
  background: rgba(255, 193, 7, 0.12);
  border-color: rgba(255, 193, 7, 0.35);
  color: #8a5b00;
}

.form__alert--info {
  background: rgba(25, 118, 210, 0.12);
  border-color: rgba(25, 118, 210, 0.35);
  color: #0d47a1;
}

.form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.25rem;
  justify-content: flex-start;
  align-items: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 999px;
  padding: 0.55rem 1.25rem;
  font-size: 0.88rem;
  font-weight: 600;
  min-height: 40px;
  border: none;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  text-decoration: none;
}

.btn--primary {
  background: linear-gradient(135deg, var(--primary-color, #058526) 0%, #04701f 100%);
  color: #ffffff;
  box-shadow: 0 3px 8px rgba(5, 133, 38, 0.18);
}

.btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 5px 12px rgba(5, 133, 38, 0.24);
}

.btn--primary:disabled {
  cursor: wait;
  opacity: 0.85;
}

.btn--secondary {
  background: rgba(5, 133, 38, 0.12);
  color: var(--primary-color, #058526);
}

.btn--secondary:hover {
  background: rgba(5, 133, 38, 0.18);
  transform: translateY(-1px);
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(15, 157, 88, 0.25);
  color: var(--primary-color, #058526);
}

.btn--ghost:hover {
  background: rgba(5, 133, 38, 0.08);
}

.btn__spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-top-color: rgba(255, 255, 255, 1);
  animation: spin 0.8s linear infinite;
}

.application-success {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: center;
  align-items: center;
}

.application-success__icon {
  font-size: 2.5rem;
}

.application-success__title {
  font-size: 1.75rem;
  margin: 0;
  font-weight: 700;
}

.application-success__message,
.application-success__hint {
  margin: 0;
  color: var(--text-muted, #4b5d52);
  line-height: 1.6;
  max-width: 560px;
}

.application-success__hint {
  font-size: 0.95rem;
}

.application-success__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 1024px) {
  .content__wrap {
    grid-template-columns: 1fr;
  }

  .role-selector {
    flex-direction: column;
  }
}

/*
  These blocks previously held the PRE-SHRINK values — hero 3rem, content 2rem,
  form card 1.75rem, title 1.75rem — every one of them now LARGER than the
  desktop rule above. Because they win at small widths, the form would have
  been more spacious on a phone than on a laptop, which is the exact trap the
  2026-07-26 header pass hit and had to come back for: a density pass that
  edits the desktop rule and leaves the @media blocks behind.

  Mobile now only tightens further, and only overrides what genuinely differs.
*/
@media (max-width: 768px) {
  .role-application__hero {
    padding: 1.5rem 1rem;
  }

  .role-application__content {
    padding: 1rem;
  }

  .application-form {
    padding: 1rem;
  }

  .form__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .btn {
    width: 100%;
  }

  /* 16px so iOS does not zoom the page when a field takes focus. */
  .form__input,
  .form__textarea {
    font-size: 16px;
  }
}

@media (max-width: 540px) {
  .role-card {
    padding: 0.8rem 0.9rem;
  }

  .form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
