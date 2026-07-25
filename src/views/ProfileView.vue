<template>
  <div class="profile-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">My Profile</h1>
        <p class="page-description">Manage your account settings</p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="profile-content">
      <div class="container">
        <div class="content-layout">
          <!-- Left Column - Profile Overview -->
          <div class="profile-sidebar">
            <!-- Profile Overview Card -->
            <div class="profile-card">
              <div class="profile-avatar">
                <div class="avatar-circle" :class="{ 'has-image': userProfile.avatarUrl }">
                  <img
                    v-if="userProfile.avatarUrl"
                    :src="userProfile.avatarUrl"
                    :alt="userProfile.fullName"
                    class="avatar-image"
                  />
                  <span v-else class="avatar-initials">{{ userProfile.initials }}</span>
                </div>
                <div class="avatar-upload-section">
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    @change="handleFileSelect"
                    class="avatar-file-input"
                    :disabled="uploadingPhoto"
                  />
                  <button
                    type="button"
                    @click="triggerFileInput"
                    class="upload-photo-button"
                    :disabled="uploadingPhoto"
                  >
                    <span v-if="uploadingPhoto">Uploading...</span>
                    <span v-else>{{ userProfile.avatarUrl ? 'Change Photo' : 'Upload Photo' }}</span>
                  </button>
                  <button
                    v-if="userProfile.avatarUrl"
                    type="button"
                    @click="removeProfilePhoto"
                    class="remove-photo-button"
                    :disabled="uploadingPhoto"
                  >
                    Remove
                  </button>
                </div>
                <div v-if="photoError" class="photo-error">{{ photoError }}</div>
              </div>
              <div class="profile-info">
                <h2 class="profile-name">{{ userProfile.fullName }}</h2>

                <!-- Role + verification status. The KYC pill is ALWAYS shown so
                     its state is clear whether or not the user is verified — a
                     badge that only appears when verified left everyone else
                     with no signal at all. KYB shows only where it's relevant. -->
                <div class="profile-badges">
                  <span class="profile-role-pill" :data-role="store.role">
                    <span class="material-symbols-outlined" aria-hidden="true">{{ roleIcon }}</span>
                    <span>{{ roleAccess.name }}</span>
                  </span>
                  <span class="status-pill" :class="kycState.cls" :title="kycState.title">
                    <span class="material-symbols-outlined" aria-hidden="true">{{
                      kycState.icon
                    }}</span>
                    <span>{{ kycState.label }}</span>
                  </span>
                  <span
                    v-if="showKyb"
                    class="status-pill"
                    :class="kybState.cls"
                    :title="kybState.title"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">{{
                      kybState.icon
                    }}</span>
                    <span>{{ kybState.label }}</span>
                  </span>
                </div>

                <p class="profile-email">{{ userProfile.email }}</p>

                <!-- Contact / org details (only rendered when present) -->
                <div class="profile-meta">
                  <div v-if="userProfile.company" class="profile-detail">
                    <span class="material-symbols-outlined" aria-hidden="true">business</span>
                    <span>{{ userProfile.company }}</span>
                  </div>
                  <div v-if="userProfile.location" class="profile-detail">
                    <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                    <span>{{ userProfile.location }}</span>
                  </div>
                  <div v-if="userProfile.phone" class="profile-detail">
                    <span class="material-symbols-outlined" aria-hidden="true">call</span>
                    <span>{{ userProfile.phone }}</span>
                  </div>
                  <div v-if="userProfile.website" class="profile-detail">
                    <span class="material-symbols-outlined" aria-hidden="true">language</span>
                    <span>{{ userProfile.website }}</span>
                  </div>
                  <p v-if="profileHasNoDetails" class="profile-empty-hint">
                    Add your company, location and contact details with Edit Profile.
                  </p>
                </div>

                <button class="edit-profile-button" @click="editProfile">
                  <span class="material-symbols-outlined" aria-hidden="true">edit</span>
                  <span>Edit Profile</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Right Column - Account Settings -->
          <div class="account-settings">
            <div class="settings-card">
              <!-- Settings Tabs -->
              <div class="settings-tabs">
                <button
                  v-for="tab in settingsTabs"
                  :key="tab.id"
                  :class="['tab-button', { active: activeTab === tab.id }]"
                  @click="activeTab = tab.id"
                >
                  {{ tab.label }}
                </button>
              </div>

              <!-- Tab Content -->
              <div class="tab-content">
                <!-- Account Tab -->
                <div v-if="activeTab === 'account'" class="tab-panel">
                  <!-- Personal Information -->
                  <div class="settings-section">
                    <h3 class="section-title">Personal Information</h3>
                    <div class="form-grid">
                      <!-- Loading State -->
                      <div v-if="loading" class="loading-state">
                        <div class="loading-spinner"></div>
                        <p>Loading profile...</p>
                      </div>

                      <!-- Error Messages -->
                      <div v-if="errors.general" class="error-message">
                        {{ errors.general }}
                      </div>

                      <!-- Success Message -->
                      <div v-if="successMessage" class="success-message">
                        {{ successMessage }}
                      </div>

                      <!-- Form Fields -->
                      <template v-if="!loading">
                        <div class="form-group">
                          <label class="form-label">Full Name *</label>
                          <input
                            v-model="editForm.full_name"
                            type="text"
                            class="form-input"
                            :class="{ error: errors.full_name }"
                            :disabled="!isEditing"
                            placeholder="Enter your full name"
                          />
                          <span v-if="errors.full_name" class="field-error">{{
                            errors.full_name
                          }}</span>
                        </div>
                        <div class="form-group">
                          <label class="form-label">Email Address</label>
                          <input
                            v-model="editForm.email"
                            type="email"
                            class="form-input"
                            :class="{ error: errors.email }"
                            :disabled="!isEditing"
                            placeholder="Enter your email"
                          />
                          <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
                        </div>
                        <div class="form-group">
                          <label class="form-label">Company</label>
                          <input
                            v-model="editForm.company"
                            type="text"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="Enter your company"
                          />
                        </div>
                        <div class="form-group">
                          <label class="form-label">Location</label>
                          <input
                            v-model="editForm.location"
                            type="text"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="Enter your location"
                          />
                        </div>
                        <div class="form-group">
                          <label class="form-label">Phone</label>
                          <input
                            v-model="editForm.phone"
                            type="tel"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="Enter your phone number"
                          />
                        </div>
                        <div class="form-group">
                          <label class="form-label">Website</label>
                          <input
                            v-model="editForm.website"
                            type="url"
                            class="form-input"
                            :class="{ error: errors.website }"
                            :disabled="!isEditing"
                            placeholder="https://example.com"
                          />
                          <span v-if="errors.website" class="field-error">{{ errors.website }}</span>
                        </div>
                        <div class="form-group">
                          <label class="form-label">Organization Name</label>
                          <input
                            v-model="editForm.organization_name"
                            type="text"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="e.g., Cabanatuan City Government"
                          />
                        </div>
                        <div class="form-group">
                          <label class="form-label">Organization Type</label>
                          <select
                            v-model="editForm.organization_type"
                            class="form-input"
                            :disabled="!isEditing"
                          >
                            <option value="">Not specified</option>
                            <option v-for="t in organizationTypes" :key="t" :value="t">{{ t }}</option>
                          </select>
                        </div>
                        <div class="form-group">
                          <label class="form-label">Organization Address</label>
                          <input
                            v-model="editForm.organization_address"
                            type="text"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="Office address"
                          />
                        </div>
                        <!-- Jurisdiction. For an LGU this is not decoration: it
                             scopes which projects they see and may endorse. -->
                        <div class="form-group">
                          <label class="form-label">Municipality / City</label>
                          <input
                            v-model="editForm.municipality"
                            type="text"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="e.g., Cabanatuan City"
                          />
                          <small class="field-hint">
                            LGU accounts: this is your jurisdiction. It determines which projects
                            appear in your dashboard and which you are allowed to endorse.
                          </small>
                        </div>
                        <div class="form-group">
                          <label class="form-label">Province</label>
                          <input
                            v-model="editForm.province"
                            type="text"
                            class="form-input"
                            :disabled="!isEditing"
                            placeholder="e.g., Nueva Ecija"
                          />
                        </div>
                      </template>
                    </div>

                    <!-- Action Buttons -->
                    <div v-if="isEditing && !loading" class="form-actions">
                      <button class="save-button" @click="saveChanges" :disabled="saving">
                        <span v-if="saving">Saving...</span>
                        <span v-else>Save Changes</span>
                      </button>
                      <button class="cancel-button" @click="cancelEdit" :disabled="saving">
                        Cancel
                      </button>
                    </div>
                  </div>

                  <!-- Account Status -->
                  <div class="settings-section">
                    <h3 class="section-title">Account Status</h3>
                    <div class="status-list">
                      <div
                        v-for="status in accountStatusItems"
                        :key="status.key"
                        class="status-item"
                      >
                        <div class="status-info">
                          <span class="status-label">{{ status.label }}</span>
                          <span class="status-description">{{ status.description }}</span>
                        </div>
                        <div class="status-badge" :class="status.badgeClass">
                          {{ status.badgeLabel }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Role & Access -->
                  <div class="settings-section">
                    <h3 class="section-title">Role &amp; Access</h3>
                    <div class="role-access">
                      <div class="role-access-head">
                        <span class="role-name" :data-role="store.role">
                          <span class="material-symbols-outlined" aria-hidden="true">{{ roleIcon }}</span>
                          {{ roleAccess.name }}
                        </span>
                        <p class="role-desc">{{ roleAccess.description }}</p>
                      </div>
                      <div class="role-links">
                        <router-link :to="roleAccess.workspace.path" class="role-link">
                          <span class="material-symbols-outlined" aria-hidden="true">
                            {{ roleAccess.workspace.icon || 'space_dashboard' }}
                          </span>
                          <span>Go to {{ roleAccess.workspace.label }}</span>
                        </router-link>
                      </div>
                      <p v-if="roleAccess.showApply" class="role-apply-hint">
                        Want to develop projects or become a verifier?
                        <router-link to="/apply">Apply for an advanced role →</router-link>
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Notifications Tab -->
                <div v-if="activeTab === 'notifications'" class="tab-panel">
                  <div class="settings-section">
                    <h3 class="section-title">Notification Preferences</h3>
                    <div class="notification-settings">
                      <div
                        v-for="(setting, key) in notificationSettings"
                        :key="key"
                        class="notification-item"
                      >
                        <div class="notification-info">
                          <span class="notification-label">{{ setting.label }}</span>
                          <span class="notification-description">{{ setting.description }}</span>
                        </div>
                        <label class="toggle-switch">
                          <input
                            v-model="setting.enabled"
                            type="checkbox"
                            class="toggle-input"
                            @change="saveNotificationSettings"
                            :disabled="savingNotifications"
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Security Tab -->
                <div v-if="activeTab === 'security'" class="tab-panel">
                  <div class="settings-section">
                    <h3 class="section-title">Security Settings</h3>
                    <div class="security-settings">
                      <ChangePasswordPanel />
                      <MfaSetupPanel />
                    </div>
                  </div>
                </div>

                <!-- Privacy & Data Tab -->
                <div v-if="activeTab === 'privacy'" class="tab-panel">
                  <div class="settings-section">
                    <h3 class="section-title">Privacy &amp; Your Data</h3>
                    <p class="section-subtitle">
                      Exercise your data-privacy rights: download a copy of your data or
                      request that your account be deleted.
                    </p>
                    <PrivacyDataPanel />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useUserStore } from '@/store/userStore'
import {
  getProfile,
  updateProfile,
  getUserInitials,
  validateProfileData,
  uploadAndUpdateProfilePhoto,
} from '@/services/profileService'
import { resizeImage } from '@/services/storageService'
import {
  ROLE_APPLICATION_ROLES,
  getLatestRoleApplicationForUser,
} from '@/services/roleApplicationService'
import { ROLES, getRoleDisplayName } from '@/constants/roles'
import { homeDestination } from '@/constants/navigation'
import { getRoleDescription } from '@/services/roleService'
import ChangePasswordPanel from '@/components/auth/ChangePasswordPanel.vue'
import MfaSetupPanel from '@/components/auth/MfaSetupPanel.vue'
import PrivacyDataPanel from '@/components/account/PrivacyDataPanel.vue'

export default {
  name: 'ProfileView',
  components: { ChangePasswordPanel, MfaSetupPanel, PrivacyDataPanel },
  setup() {
    const store = useUserStore()
    return { store }
  },
  data() {
    return {
      activeTab: 'account',
      isEditing: false,
      loading: false,
      saving: false,
      errors: {},
      successMessage: '',
      settingsTabs: [
        { id: 'account', label: 'Account' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'security', label: 'Security' },
        { id: 'privacy', label: 'Privacy & Data' },
      ],
      userProfile: {
        initials: 'U',
        fullName: '',
        email: '',
        company: '',
        location: '',
        phone: '',
        website: '',
        avatarUrl: null,
      },
      editForm: {
        full_name: '',
        email: '',
        company: '',
        location: '',
        phone: '',
        website: '',
        organization_name: '',
        organization_type: '',
        organization_address: '',
        // LGU jurisdiction — scopes which projects they see and may endorse.
        municipality: '',
        province: '',
      },
      organizationTypes: [
        'Municipal LGU',
        'City Government',
        'Provincial LGU',
        'Barangay',
        'Cooperative',
        'NGO / Civil Society',
        'Private Company',
        'Other',
      ],
      notificationSettings: {
        emailNotifications: {
          label: 'Email Notifications',
          description: 'Receive updates via email',
          enabled: true,
        },
        projectUpdates: {
          label: 'Project Updates',
          description: 'Get notified about project milestones',
          enabled: true,
        },
        marketAlerts: {
          label: 'Market Alerts',
          description: 'Price alerts and market updates',
          enabled: false,
        },
        newsletter: {
          label: 'Newsletter',
          description: 'Weekly sustainability newsletter',
          enabled: true,
        },
      },
      savingNotifications: false,
      uploadingPhoto: false,
      photoError: '',
      latestProfile: null,
    }
  },
  computed: {
    // Identity verified (KYC) once an admin sets kyc_level >= 2.
    isKycVerified() {
      const profile = this.store.profile || this.latestProfile || {}
      return Number(profile?.kyc_level) >= 2
    },
    // Business verified (KYB) — relevant for sellers / project developers.
    isKybVerified() {
      const profile = this.store.profile || this.latestProfile || {}
      return profile?.kyb_verified === true
    },
    // Compact, ALWAYS-present KYC status for the header. Levels: >=2 verified,
    // 1 submitted/in-review, else not verified. A badge that only rendered when
    // verified left every unverified user with no KYC signal at all.
    kycState() {
      const profile = this.store.profile || this.latestProfile || {}
      const lvl = Number(profile?.kyc_level)
      if (lvl >= 2)
        return {
          label: 'KYC Verified',
          cls: 'ok',
          icon: 'verified_user',
          title: 'Identity verified by Carbonify (KYC)',
        }
      if (lvl === 1)
        return {
          label: 'KYC Pending',
          cls: 'pending',
          icon: 'hourglass_top',
          title: 'KYC submitted — under review',
        }
      return {
        label: 'KYC Not Verified',
        cls: 'off',
        icon: 'gpp_maybe',
        title: 'Identity not yet verified — required to buy or trade',
      }
    },
    // KYB matters only for sellers (project developers) and anyone already
    // business-verified; hidden for buyers/general users to keep the header lean.
    showKyb() {
      const profile = this.store.profile || this.latestProfile || {}
      return this.store.role === ROLES.PROJECT_DEVELOPER || profile?.kyb_verified === true
    },
    kybState() {
      const profile = this.store.profile || this.latestProfile || {}
      return profile?.kyb_verified === true
        ? {
            label: 'Business Verified',
            cls: 'ok',
            icon: 'verified',
            title: 'Business verified by Carbonify (KYB)',
          }
        : {
            label: 'KYB Required',
            cls: 'off',
            icon: 'domain_verification',
            title: 'Business verification required for seller payouts',
          }
    },
    // Material Symbols icon shown in the sidebar role pill, per role.
    roleIcon() {
      const role = this.store.role || ROLES.GENERAL_USER
      const iconsByRole = {
        [ROLES.ADMIN]: 'shield_person',
        [ROLES.VERIFIER]: 'verified',
        [ROLES.PROJECT_DEVELOPER]: 'eco',
        [ROLES.LGU_USER]: 'apartment',
        [ROLES.BUYER_INVESTOR]: 'account_balance_wallet',
        [ROLES.GENERAL_USER]: 'person',
      }
      return iconsByRole[role] || 'person'
    },
    // True when no optional contact/org details are filled in yet.
    profileHasNoDetails() {
      const p = this.userProfile || {}
      return !p.company && !p.location && !p.phone && !p.website
    },
    // Role-aware access panel: name, description, and the way back to work.
    //
    // This used to hold its own hand-written link list per role — a fourth
    // navigation surface with a fourth set of names ("My Portfolio", "Saved",
    // "Browse Marketplace"), and one link (/monitoring, labelled "Monitoring
    // (MRV)") that no other surface used. It now points at the role's
    // workspace, which is where every one of those pages is grouped.
    roleAccess() {
      const role = this.store.role || ROLES.GENERAL_USER
      return {
        name: getRoleDisplayName(role),
        description: getRoleDescription(role),
        workspace: homeDestination(this.store),
        showApply: role === ROLES.GENERAL_USER,
      }
    },
    accountStatusItems() {
      const user = this.store.session?.user || null
      const profile = this.store.profile || this.latestProfile || {}

      const emailIndicators = [
        user?.email_confirmed_at,
        user?.confirmed_at,
        user?.user_metadata?.email_confirmed_at,
        user?.user_metadata?.email_verified,
        user?.user_metadata?.email_confirmed,
        user?.user_metadata?.verified,
      ]

      const identityVerified =
        Array.isArray(user?.identities) &&
        user.identities.some((identity) => {
          const data = identity?.identity_data
          if (!data) return false

          const indicators = [
            data.email_verified,
            data.email_confirmed,
            data.email_confirmed_at,
          ]

          return indicators.some((value) => {
            if (value === null || value === undefined) return false
            if (typeof value === 'boolean') return value
            if (typeof value === 'string') {
              const normalized = value.trim().toLowerCase()
              if (!normalized || normalized === 'false' || normalized === '0') {
                return false
              }
              return true
            }
            return true
          })
        })

      const emailVerified =
        emailIndicators.some((value) => {
          if (value === null || value === undefined) return false
          if (typeof value === 'boolean') return value
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (!normalized || normalized === 'false' || normalized === '0') {
              return false
            }
            return true
          }
          return true
        }) || identityVerified

      const accountStatus = emailVerified
        ? {
            key: 'account-verification',
            label: 'Account Verification',
            description: 'Your email address has been verified.',
            badgeLabel: 'VERIFIED',
            badgeClass: 'verified',
          }
        : {
            key: 'account-verification',
            label: 'Account Verification',
            description: 'Verify your email address to unlock all account features.',
            badgeLabel: 'PENDING',
            badgeClass: 'pending',
          }

      const normalizeKycLevel = (raw) => {
        if (raw === null || raw === undefined) {
          return 0
        }

        if (typeof raw === 'number') {
          return Number.isNaN(raw) ? 0 : raw
        }

        if (typeof raw === 'string') {
          const numericValue = Number(raw)
          if (!Number.isNaN(numericValue)) {
            return numericValue
          }

          const normalized = raw.trim().toLowerCase()

          if (['verified', 'complete', 'approved', 'level2', 'level_2'].includes(normalized)) {
            return 2
          }

          if (['full', 'level3', 'level_3', 'admin'].includes(normalized)) {
            return 3
          }

          if (
            [
              'submitted',
              'in_review',
              'in-review',
              'pending',
              'processing',
              'level1',
              'level_1',
            ].includes(normalized)
          ) {
            return 1
          }

          if (['rejected', 'denied', 'failed'].includes(normalized)) {
            return -1
          }

          return 0
        }

        return 0
      }

      const rawKycLevel =
        profile?.kyc_level ??
        profile?.kycLevel ??
        profile?.kyc_status ??
        profile?.kycStatus ??
        0

      let kycLevel = normalizeKycLevel(rawKycLevel)
      if (kycLevel > 3) {
        kycLevel = 3
      } else if (kycLevel < -1) {
        kycLevel = -1
      }

      const kycMap = {
        [-1]: {
          description:
            'Your verification was rejected. Update your documents and contact support to resubmit.',
          badgeLabel: 'REJECTED',
          badgeClass: 'failed',
        },
        0: {
          description: 'Submit your verification details to unlock more features.',
          badgeLabel: 'PENDING',
          badgeClass: 'pending',
        },
        1: {
          description:
            'We are reviewing your documents. You will be notified once approval is complete.',
          badgeLabel: 'LEVEL 1',
          badgeClass: 'in-progress',
        },
        2: {
          description:
            'Enhanced verification complete. You now have access to advanced platform features.',
          badgeLabel: 'LEVEL 2',
          badgeClass: 'verified',
        },
        3: {
          description: 'Full verification complete. Administrative privileges are enabled.',
          badgeLabel: 'LEVEL 3',
          badgeClass: 'verified',
        },
      }

      const kycConfig = kycMap[kycLevel] || kycMap[0]

      const kycStatus = {
        key: 'kyc-status',
        label: 'KYC Status',
        description: kycConfig.description,
        badgeLabel: kycConfig.badgeLabel,
        badgeClass: kycConfig.badgeClass,
      }

      return [accountStatus, kycStatus]
    },
  },
  watch: {
    'store.profile'(newProfile) {
      this.latestProfile = newProfile || null
    },
  },
  async mounted() {
    // Ensure store has latest profile data from Supabase
    if (this.store.isAuthenticated && this.store.session?.user?.id) {
      await this.store.fetchUserProfile()
    }
    if (this.store.profile) {
      this.latestProfile = this.store.profile
    }
    // Load profile data (which always uses Supabase)
    await this.loadProfile()
  },
  methods: {
    buildProfileFromRoleApplication(application) {
      if (!application) return null

      const requestedRole = String(application.role_requested || '').toLowerCase().trim()
      const additional = application.metadata?.additional || {}

      if (requestedRole === ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER) {
        const projectDeveloperProfile = additional.project_developer_profile || {}
        const contactPerson = projectDeveloperProfile.contact_person || {}

        return {
          full_name: application.applicant_full_name || '',
          email: application.email || '',
          company: application.company || projectDeveloperProfile.company_name || '',
          location: projectDeveloperProfile.country || projectDeveloperProfile.address || '',
          phone: contactPerson.phone || '',
          website: application.website || '',
        }
      }

      if (requestedRole === ROLE_APPLICATION_ROLES.VERIFIER) {
        const verifierProfile = additional.verifier_profile || {}

        return {
          full_name: application.applicant_full_name || '',
          email: application.email || '',
          company: verifierProfile.organization || application.company || '',
          location: verifierProfile.accreditation_body || '',
          phone: verifierProfile.contact_phone || '',
          website: application.website || '',
        }
      }

      return null
    },

    mergeProfileWithApplication(profile, applicationProfile) {
      if (!applicationProfile) {
        return profile
      }

      if (!profile) {
        return { ...applicationProfile }
      }

      return {
        ...profile,
        full_name: profile.full_name || applicationProfile.full_name,
        email: profile.email || applicationProfile.email,
        company: profile.company || applicationProfile.company,
        location: profile.location || applicationProfile.location,
        phone: profile.phone || applicationProfile.phone,
        website: profile.website || applicationProfile.website,
      }
    },

    async getSpecialistApplicationProfile() {
      const userId = this.store.session?.user?.id
      const email = this.store.session?.user?.email
      const normalizedRole = String(this.store.role || this.store.profile?.role || '')
        .toLowerCase()
        .trim()

      if (
        normalizedRole !== ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER &&
        normalizedRole !== ROLE_APPLICATION_ROLES.VERIFIER
      ) {
        return null
      }

      try {
        const latestApplication = await getLatestRoleApplicationForUser({
          userId,
          email,
          roleRequested: normalizedRole,
        })

        return this.buildProfileFromRoleApplication(latestApplication)
      } catch (error) {
        console.warn('Unable to load specialist application profile fallback:', error)
        return null
      }
    },

    async loadProfile() {
      if (!this.store.isAuthenticated) {
        this.$router.push('/login')
        return
      }

      this.loading = true
      try {
        const userId = this.store.session?.user?.id
        if (!userId) {
          throw new Error('User ID not found')
        }

        const [profile, specialistApplicationProfile] = await Promise.all([
          getProfile(userId),
          this.getSpecialistApplicationProfile(),
        ])
        const mergedProfile = this.mergeProfileWithApplication(profile, specialistApplicationProfile)
        this.latestProfile = mergedProfile || null

        // Handle null profile (when RLS blocks creation)
        if (!mergedProfile) {
          console.warn('Profile is null - likely blocked by RLS policy. Using defaults from auth session.')
          
          // Get user info from auth session as fallback
          const authUser = this.store.session?.user
          const userEmail = authUser?.email || ''
          const userName = authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'User'
          const fallbackProfile = specialistApplicationProfile || {}

          // Update user profile display with defaults
          this.userProfile = {
            initials: getUserInitials(fallbackProfile.full_name || userName),
            fullName: fallbackProfile.full_name || userName,
            email: fallbackProfile.email || userEmail,
            company: fallbackProfile.company || '',
            location: fallbackProfile.location || '',
            phone: fallbackProfile.phone || '',
            website: fallbackProfile.website || '',
            avatarUrl: null,
          }

          // Update edit form with defaults
          this.editForm = {
            full_name: fallbackProfile.full_name || userName,
            email: fallbackProfile.email || userEmail,
            company: fallbackProfile.company || '',
            location: fallbackProfile.location || '',
            phone: fallbackProfile.phone || '',
            website: fallbackProfile.website || '',
          }

          // Use default notification settings
          this.notificationSettings = {
            emailNotifications: {
              label: 'Email Notifications',
              description: 'Receive updates via email',
              enabled: true,
            },
            projectUpdates: {
              label: 'Project Updates',
              description: 'Get notified about project milestones',
              enabled: true,
            },
            marketAlerts: {
              label: 'Market Alerts',
              description: 'Price alerts and market updates',
              enabled: false,
            },
            newsletter: {
              label: 'Newsletter',
              description: 'Weekly sustainability newsletter',
              enabled: true,
            },
          }

          // Show warning message to user
          this.errors.general = 'Profile could not be loaded due to database security settings. Some features may be limited. Please contact support if this persists.'
          
          return
        }

        // Profile exists - proceed normally
        this.store.profile = mergedProfile
        // Update user profile display
        this.userProfile = {
          initials: getUserInitials(mergedProfile.full_name),
          fullName: mergedProfile.full_name || '',
          email: mergedProfile.email || '',
          company: mergedProfile.company || '',
          location: mergedProfile.location || '',
          phone: mergedProfile.phone || '',
          website: mergedProfile.website || '',
          avatarUrl: mergedProfile.avatar_url || null,
        }

        // Update edit form
        this.editForm = {
          full_name: mergedProfile.full_name || '',
          email: mergedProfile.email || '',
          company: mergedProfile.company || '',
          location: mergedProfile.location || '',
          phone: mergedProfile.phone || '',
          website: mergedProfile.website || '',
        }

        // Load notification settings from Supabase
        if (mergedProfile.notification_preferences) {
          const prefs = mergedProfile.notification_preferences
          this.notificationSettings = {
            emailNotifications: {
              label: 'Email Notifications',
              description: 'Receive updates via email',
              enabled: prefs.emailNotifications?.enabled ?? true,
            },
            projectUpdates: {
              label: 'Project Updates',
              description: 'Get notified about project milestones',
              enabled: prefs.projectUpdates?.enabled ?? true,
            },
            marketAlerts: {
              label: 'Market Alerts',
              description: 'Price alerts and market updates',
              enabled: prefs.marketAlerts?.enabled ?? false,
            },
            newsletter: {
              label: 'Newsletter',
              description: 'Weekly sustainability newsletter',
              enabled: prefs.newsletter?.enabled ?? true,
            },
          }
        }

        console.log('Profile loaded successfully:', mergedProfile)
      } catch (error) {
        console.error('Error loading profile:', error)
        this.errors.general = 'Failed to load profile. Please try again.'
      } finally {
        this.loading = false
      }
    },

    editProfile() {
      this.isEditing = true
      this.errors = {}
      this.successMessage = ''

      // Copy current values to edit form
      const profile = this.store.profile || this.latestProfile || {}
      this.editForm = {
        full_name: this.userProfile.fullName,
        email: this.userProfile.email,
        company: this.userProfile.company,
        location: this.userProfile.location,
        phone: this.userProfile.phone || '',
        website: this.userProfile.website || '',
        organization_name: profile.organization_name || '',
        organization_type: profile.organization_type || '',
        organization_address: profile.organization_address || '',
        municipality: profile.municipality || '',
        province: profile.province || '',
      }
    },

    async saveChanges() {
      if (!this.store.isAuthenticated) {
        this.$router.push('/login')
        return
      }

      // Validate form data
      const validation = validateProfileData(this.editForm)
      if (!validation.isValid) {
        this.errors = validation.errors
        return
      }

      this.saving = true
      this.errors = {}

      try {
        const userId = this.store.session?.user?.id
        if (!userId) {
          throw new Error('User ID not found')
        }

        // Check if profile exists before trying to update
        // If profile is null (RLS blocked), try to create it first
        if (!this.store.profile) {
          // Profile doesn't exist - try to create it with the form data
          try {
            const { createProfile } = await import('@/services/profileService')
            const authUser = this.store.session?.user
            const newProfile = await createProfile({
              id: userId,
              full_name: this.editForm.full_name,
              email: this.editForm.email || authUser?.email || '',
              company: this.editForm.company || '',
              location: this.editForm.location || '',
              phone: this.editForm.phone || '',
              website: this.editForm.website || '',
              role: 'general_user',
              kyc_level: 0,
            })
            
            // Use the newly created profile
            const updatedProfile = newProfile
            
            // Update local state
            this.userProfile = {
              initials: getUserInitials(updatedProfile.full_name),
              fullName: updatedProfile.full_name || '',
              email: updatedProfile.email || '',
              company: updatedProfile.company || '',
              location: updatedProfile.location || '',
              phone: updatedProfile.phone || '',
              website: updatedProfile.website || '',
              avatarUrl: updatedProfile.avatar_url || null,
            }

            // Update store profile and refresh from Supabase
            this.store.profile = updatedProfile
            this.latestProfile = updatedProfile
            await this.store.fetchUserProfile()

            this.isEditing = false
            this.successMessage = 'Profile created successfully!'
            return
          } catch (createError) {
            // If RLS still blocks creation, show helpful error
            if (createError.code === 'RLS_VIOLATION' || createError.message?.includes('row-level security')) {
              this.errors.general = 'Cannot save profile: Database security settings are preventing profile creation. Please contact support.'
              return
            }
            throw createError
          }
        }

        // Profile exists - update it normally
        const updatedProfile = await updateProfile(userId, this.editForm)

        // Update local state
        this.userProfile = {
          initials: getUserInitials(updatedProfile.full_name),
          fullName: updatedProfile.full_name || '',
          email: updatedProfile.email || '',
          company: updatedProfile.company || '',
          location: updatedProfile.location || '',
          phone: updatedProfile.phone || '',
          website: updatedProfile.website || '',
          avatarUrl: updatedProfile.avatar_url || null,
        }

        // Update store profile and refresh from Supabase
        this.store.profile = updatedProfile
        this.latestProfile = updatedProfile
        // Refresh profile from Supabase to ensure we have latest data
        await this.store.fetchUserProfile()

        this.isEditing = false
        this.successMessage = 'Profile updated successfully!'

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage = ''
        }, 3000)

        console.log('Profile saved successfully:', updatedProfile)
      } catch (error) {
        console.error('Error saving profile:', error)
        this.errors.general = error.message || 'Failed to save profile. Please try again.'
      } finally {
        this.saving = false
      }
    },

    cancelEdit() {
      this.isEditing = false
      this.errors = {}
      this.successMessage = ''

      // Reset edit form to current values
      this.editForm = {
        full_name: this.userProfile.fullName,
        email: this.userProfile.email,
        company: this.userProfile.company,
        location: this.userProfile.location,
        phone: this.userProfile.phone || '',
        website: this.userProfile.website || '',
      }
    },

    clearMessages() {
      this.errors = {}
      this.successMessage = ''
    },

    async saveNotificationSettings() {
      if (!this.store.isAuthenticated) {
        return
      }

      this.savingNotifications = true
      try {
        const userId = this.store.session?.user?.id
        if (!userId) {
          throw new Error('User ID not found')
        }

        // Prepare notification preferences for saving
        const notificationPreferences = {
          emailNotifications: { enabled: this.notificationSettings.emailNotifications.enabled },
          projectUpdates: { enabled: this.notificationSettings.projectUpdates.enabled },
          marketAlerts: { enabled: this.notificationSettings.marketAlerts.enabled },
          newsletter: { enabled: this.notificationSettings.newsletter.enabled },
        }

        // Save to Supabase
        await updateProfile(userId, { notification_preferences: notificationPreferences })

        // Update store profile
        if (this.store.profile) {
          this.store.profile.notification_preferences = notificationPreferences
          this.latestProfile = this.store.profile
        }

        console.log('Notification settings saved to Supabase')
      } catch (error) {
        console.error('Error saving notification settings:', error)
        // Revert the change on error
        await this.loadProfile()
      } finally {
        this.savingNotifications = false
      }
    },

    triggerFileInput() {
      this.$refs.fileInput?.click()
    },

    async handleFileSelect(event) {
      const file = event.target.files?.[0]
      if (!file) return

      this.photoError = ''
      this.uploadingPhoto = true

      try {
        const userId = this.store.session?.user?.id
        if (!userId) {
          throw new Error('User ID not found')
        }

        // Resize image before upload (max 800x800, quality 0.8)
        const resizedFile = await resizeImage(file, 800, 800, 0.8)

        // Upload and update profile photo
        const avatarUrl = await uploadAndUpdateProfilePhoto(userId, resizedFile)

        // Update local state
        this.userProfile.avatarUrl = avatarUrl

        // Update store profile
        if (this.store.profile) {
          this.store.profile.avatar_url = avatarUrl
        }

        // Refresh profile from Supabase to ensure we have latest data
        await this.store.fetchUserProfile()

        this.successMessage = 'Profile photo updated successfully!'
        setTimeout(() => {
          this.successMessage = ''
        }, 3000)

        console.log('Profile photo uploaded successfully')
      } catch (error) {
        console.error('Error uploading profile photo:', error)
        this.photoError = error.message || 'Failed to upload profile photo. Please try again.'
      } finally {
        this.uploadingPhoto = false
        // Reset file input
        if (this.$refs.fileInput) {
          this.$refs.fileInput.value = ''
        }
      }
    },

    async removeProfilePhoto() {
      if (!this.userProfile.avatarUrl) return

      if (!confirm('Are you sure you want to remove your profile photo?')) {
        return
      }

      this.photoError = ''
      this.uploadingPhoto = true

      try {
        const userId = this.store.session?.user?.id
        if (!userId) {
          throw new Error('User ID not found')
        }

        // Update profile to remove avatar URL
        await updateProfile(userId, { avatar_url: null })

        // Update local state
        this.userProfile.avatarUrl = null

        // Update store profile
        if (this.store.profile) {
          this.store.profile.avatar_url = null
        }

        // Refresh profile from Supabase
        await this.store.fetchUserProfile()

        this.successMessage = 'Profile photo removed successfully!'
        setTimeout(() => {
          this.successMessage = ''
        }, 3000)

        console.log('Profile photo removed successfully')
      } catch (error) {
        console.error('Error removing profile photo:', error)
        this.photoError = error.message || 'Failed to remove profile photo. Please try again.'
      } finally {
        this.uploadingPhoto = false
      }
    },
  },
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--bg-primary);
  overflow-x: hidden;
  overflow-y: auto;
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

/* Page Header */
.page-header {
  padding: 1.25rem 0;
  border-bottom: none;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  margin-bottom: 2rem;
}

.page-title {
  font-size: var(--font-size-4xl, 2rem);
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
  text-align: center;
}

.page-description {
  font-size: var(--font-size-lg, 1.1rem);
  color: #fff;
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

/* Main Content */
.profile-content {
  padding: 3rem 0;
  min-height: 80vh;
  overflow: visible;
}

.content-layout {
  display: grid;
  grid-template-columns: 1fr 2.5fr;
  gap: 3rem;
  max-width: 1400px;
  margin: 0 auto;
  overflow: visible;
}

/* Profile Sidebar */
.profile-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Profile Card */
.profile-card {
  background: var(--bg-primary);
  border: 2px solid var(--border-green-light);
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-green);
  transition: all 0.3s ease;
}

.profile-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-green-lg);
}

.profile-avatar {
  text-align: center;
  margin-bottom: 1rem;
}

.avatar-circle {
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  box-shadow: var(--shadow-green);
  border: 4px solid var(--bg-primary);
  transition: all 0.3s ease;
  overflow: hidden;
  position: relative;
}

.avatar-circle.has-image {
  background: transparent;
  border-color: var(--border-green-light);
}

.avatar-circle:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-green-lg);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.avatar-initials {
  font-size: var(--font-size-2xl);
  font-weight: 800;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.avatar-upload-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.avatar-file-input {
  display: none;
}

.upload-photo-button,
.remove-photo-button {
  padding: 0.5rem 1rem;
  font-size: var(--font-size-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition);
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: white;
}

.upload-photo-button:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.upload-photo-button:disabled,
.remove-photo-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.remove-photo-button {
  background: transparent;
  color: var(--text-muted);
  border-color: var(--border-color);
}

.remove-photo-button:hover:not(:disabled) {
  background: #fee2e2;
  border-color: #fecaca;
  color: #dc2626;
}

.photo-error {
  color: #dc2626;
  font-size: var(--font-size-xs);
  text-align: center;
  margin-top: 0.5rem;
}

.profile-name {
  font-size: var(--font-size-2xl);
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 0.6rem;
  text-align: center;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.profile-email {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: 0.85rem;
  text-align: center;
  word-break: break-word;
}

/* Role + verification pills, wrapped and centred under the name. */
.profile-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

/* Role pill — colour-tinted per role via [data-role] */
.profile-role-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: var(--primary-light);
  color: var(--primary-dark);
  border: 1px solid var(--border-green-light);
  text-align: center;
}

/* Verification status pill — always shown so KYC state is never a mystery.
   .ok = verified (green), .pending = under review (amber), .off = not yet (grey). */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}

.status-pill .material-symbols-outlined {
  font-size: 0.95rem;
}

.status-pill.ok {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}

.status-pill.pending {
  background: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}

.status-pill.off {
  background: #f1f5f9;
  color: #475569;
  border-color: #e2e8f0;
}

.profile-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.profile-role-pill .material-symbols-outlined {
  font-size: 0.95rem;
}

.profile-role-pill[data-role='admin'] {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}

.profile-role-pill[data-role='verifier'] {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}

.profile-role-pill[data-role='lgu_user'] {
  background: #f0fdfa;
  color: #0f766e;
  border-color: #99f6e4;
}

.profile-role-pill[data-role='buyer_investor'] {
  background: #faf5ff;
  color: #7e22ce;
  border-color: #e9d5ff;
}

/* Contact / org detail rows */
.profile-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-bottom: 1rem;
}

.profile-detail {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  word-break: break-word;
}

.profile-detail .material-symbols-outlined {
  font-size: 1.15rem;
  color: var(--primary-color);
  flex-shrink: 0;
}

.profile-empty-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.5;
}

.edit-profile-button {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.75rem;
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.edit-profile-button .material-symbols-outlined {
  font-size: 1.15rem;
}

.edit-profile-button:hover {
  background: var(--primary-color);
  color: white;
  box-shadow: var(--shadow-green);
}

/* Account Settings */
.account-settings {
  min-height: 500px;
}

.settings-card {
  background: var(--bg-primary);
  border: 2px solid var(--border-green-light);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-green);
  overflow: hidden;
  transition: all 0.3s ease;
}

.settings-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-green-lg);
}

.settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
}

.tab-button {
  flex: 1;
  padding: 1rem 1.5rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-size-base);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  border-bottom: 2px solid transparent;
}

.tab-button:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-button.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  background: var(--bg-secondary);
}

.tab-content {
  padding: 1.5rem;
}

.settings-section {
  margin-bottom: 1.5rem;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.section-subtitle {
  font-size: 0.9375rem;
  color: var(--text-secondary, #6b7280);
  margin: -0.75rem 0 1.5rem;
  line-height: 1.5;
}

.form-grid {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem 1.25rem;
  margin-bottom: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.3rem;
}

.form-input,
.form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  background: var(--bg-primary);
  line-height: 1.5;
  outline: none;
  transition: var(--transition);
}

.form-input:focus,
.form-textarea:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(6, 158, 45, 0.1);
}

.form-input:disabled,
.form-textarea:disabled {
  background: var(--bg-muted);
  color: var(--text-muted);
  cursor: not-allowed;
}

.save-button {
  padding: 0.75rem 1.5rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.save-button:hover {
  background: var(--primary-hover);
}

.save-button:disabled {
  background: var(--bg-muted);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* Form Actions */
.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.cancel-button {
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.cancel-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.cancel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  grid-column: 1 / -1;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--bg-secondary);
  border-top: 3px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Messages */
.error-message {
  grid-column: 1 / -1;
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  color: #dc2626;
  font-size: var(--font-size-sm);
  margin-bottom: 1rem;
}

.success-message {
  grid-column: 1 / -1;
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-md);
  color: #16a34a;
  font-size: var(--font-size-sm);
  margin-bottom: 1rem;
}

/* Field Errors */
.form-input.error,
.form-textarea.error {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.field-error {
  display: block;
  color: #dc2626;
  font-size: var(--font-size-xs);
  margin-top: 0.25rem;
}

.char-count {
  display: block;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  margin-top: 0.25rem;
  text-align: right;
}

/* Status List */
.status-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.status-label {
  font-weight: 500;
  color: var(--text-primary);
}

.status-description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 50px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-badge.verified {
  background: var(--primary-light);
  color: var(--primary-color);
}

/* These deliberately do NOT use the --warning/--info/--error tokens. Those are
   solid signal colours (--warning-color is #ffc107); as badge text on a pale
   background they measure ~1.5:1. The literals below are tuned light-bg/dark-text
   pairs at 4.5:1+. They previously read from --color-* names that no stylesheet
   ever defined, so the fallbacks were doing all the work — now made explicit. */
.status-badge.pending {
  background: #fef3c7;
  color: #b45309;
}

.status-badge.in-progress {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge.failed {
  background: #fee2e2;
  color: #b91c1c;
}

/* Notification Settings */
.notification-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.notification-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.notification-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.notification-label {
  font-weight: 500;
  color: var(--text-primary);
}

.notification-description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 3rem;
  height: 1.5rem;
}

.toggle-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-muted);
  transition: var(--transition);
  border-radius: 1.5rem;
}

.toggle-slider:before {
  position: absolute;
  content: '';
  height: 1.25rem;
  width: 1.25rem;
  left: 0.125rem;
  bottom: 0.125rem;
  background-color: white;
  transition: var(--transition);
  border-radius: 50%;
}

.toggle-input:checked + .toggle-slider {
  background-color: var(--primary-color);
}

.toggle-input:checked + .toggle-slider:before {
  transform: translateX(1.5rem);
}

/* Security Settings */
.security-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.security-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.security-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.security-label {
  font-weight: 500;
  color: var(--text-primary);
}

.security-description {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.security-button {
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.security-button:hover {
  background: var(--primary-hover);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .content-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .profile-content {
    padding: 1.5rem 0;
  }

  .page-title {
    font-size: var(--font-size-3xl);
  }

  /* Keep the identity card compact on phones. */
  .profile-card {
    padding: 1.25rem;
  }

  .profile-name {
    font-size: var(--font-size-xl);
  }

  .avatar-circle {
    width: 4.5rem;
    height: 4.5rem;
  }

  .settings-tabs {
    flex-direction: column;
  }

  .tab-button {
    text-align: left;
    border-bottom: none;
    border-left: 2px solid transparent;
  }

  .tab-button.active {
    border-bottom-color: transparent;
    border-left-color: var(--primary-color);
  }

  .tab-content {
    padding: 1.5rem;
  }

}

/* Role & Access section — tinted card + per-role pill */
.role-access {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--primary-lighter) 100%);
  border: 1px solid var(--border-green-light);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
}
.role-access-head {
  margin-bottom: 1.25rem;
}
.role-name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--primary-dark);
  background: var(--primary-light);
  border: 1px solid var(--border-green-light);
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
}
.role-name .material-symbols-outlined {
  font-size: 1.1rem;
}
.role-name[data-role='admin'] {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}
.role-name[data-role='verifier'] {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}
.role-name[data-role='lgu_user'] {
  background: #f0fdfa;
  color: #0f766e;
  border-color: #99f6e4;
}
.role-name[data-role='buyer_investor'] {
  background: #faf5ff;
  color: #7e22ce;
  border-color: #e9d5ff;
}
.role-desc {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0.6rem 0 0;
  line-height: 1.55;
}
.role-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.6rem;
}
.role-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.875rem;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease,
    box-shadow 0.15s ease;
}
.role-link:hover {
  border-color: var(--primary-color);
  background: var(--primary-lighter);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.role-link .material-symbols-outlined {
  color: var(--primary-color);
  font-size: 1.2rem;
}
.role-apply-hint {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.role-apply-hint a {
  color: var(--primary-color);
  font-weight: 600;
  text-decoration: none;
}
.role-apply-hint a:hover {
  text-decoration: underline;
}
</style>
