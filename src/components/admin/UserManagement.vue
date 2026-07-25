<template>
  <div class="user-management">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">User Management</h1>
        <p class="page-description">Manage user accounts, roles, and permissions</p>
      </div>
    </div>

    <div class="user-content">
      <div class="container">
        <!-- Search and Filters -->
        <div class="toolbar">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search users by name or email..."
            class="search-input"
          />
          <select v-model="roleFilter" class="filter-select">
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="verifier">Verifier</option>
            <option value="project_developer">Project Developer</option>
            <option value="farmer">Farmer</option>
            <option value="general_user">General User</option>
          </select>
        </div>

        <!-- Users Table -->
        <div v-if="loading" class="loading-state">Loading users...</div>
        <div v-else-if="error" class="error-state">{{ error }}</div>
        <div v-else class="users-table">
          <!-- .table-scroll gives a horizontal scroller so the Actions column is
               never clipped on narrow/medium screens; data-label drives the
               under-640px card layout (see styles/responsive-table.css). -->
          <div class="table-scroll">
            <table class="data-table stack-on-mobile">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>KYC Level</th>
                  <th>Business (KYB)</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in filteredUsers" :key="user.id">
                  <td data-label="Name">{{ user.full_name || 'N/A' }}</td>
                  <td data-label="Email">{{ user.email || 'N/A' }}</td>
                  <td data-label="Role">
                    <span class="role-badge" :class="`role-${user.role}`">
                      {{ formatRole(user.role) }}
                    </span>
                  </td>
                  <td data-label="KYC Level">{{ user.kyc_level || 0 }} · {{ kycLevelLabel(user.kyc_level) }}</td>
                  <td data-label="Business (KYB)">
                    <span class="kyb-badge" :class="user.kyb_verified ? 'kyb-verified' : 'kyb-none'">
                      {{ user.kyb_verified ? 'Verified' : '—' }}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span
                      class="status-badge"
                      :class="isSuspendedProfile(user) ? 'suspended' : 'active'"
                      :title="user.suspension_reason || ''"
                    >
                      {{ isSuspendedProfile(user) ? 'Suspended' : 'Active' }}
                    </span>
                    <div v-if="user.suspension_reason" class="suspend-reason">
                      {{ user.suspension_reason }}
                    </div>
                  </td>
                  <td data-label="Created">{{ formatDate(user.created_at) }}</td>
                  <td data-label="Actions" class="actions-cell">
                    <button
                      @click="openEditModal(user)"
                      class="action-btn edit-btn"
                      title="Edit User"
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">edit</span>
                    </button>
                    <!-- Suspension blocks transacting only; the user keeps access
                         to their receipts, certificates and data export. -->
                    <button
                      class="action-btn"
                      :class="isSuspendedProfile(user) ? 'reactivate-btn' : 'suspend-btn'"
                      :disabled="busyUserId === user.id"
                      :title="isSuspendedProfile(user) ? 'Reactivate account' : 'Suspend account'"
                      @click="openSuspendModal(user)"
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">
                        {{ isSuspendedProfile(user) ? 'lock_open' : 'block' }}
                      </span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Edit User Modal -->
        <div v-if="showEditModal" class="modal-overlay" @click="closeEditModal">
          <div class="modal-content" @click.stop>
            <h3>Edit User</h3>
            <p v-if="editingSelf" class="self-edit-note">
              This is your own account. You can change your name, but not your own role,
              KYC level or business verification — KYB gates seller payouts, so those
              need a different administrator.
            </p>
            <div v-if="selectedUser" class="form-group">
              <label for="um-full-name">Full Name</label>
              <input id="um-full-name" v-model="selectedUser.full_name" type="text" />
            </div>
            <div v-if="selectedUser" class="form-group">
              <label for="um-role">Role</label>
              <select id="um-role" v-model="selectedUser.role" :disabled="editingSelf">
                <option value="general_user">General User</option>
                <option value="buyer_investor">Buyer/Investor</option>
                <option value="project_developer">Project Developer</option>
                <option value="farmer">Farmer</option>
                <option value="verifier">Verifier</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div v-if="selectedUser" class="form-group">
              <label for="um-kyc">KYC Level</label>
              <select id="um-kyc" v-model.number="selectedUser.kyc_level" :disabled="editingSelf">
                <option v-for="t in KYC_LEVELS" :key="t.level" :value="t.level">
                  {{ t.level }} — {{ t.label }}
                </option>
              </select>
              <small class="hint">
                Manual override for testing. Users normally earn KYC via the
                verification flow (Profile → KYC).
              </small>
            </div>
            <div v-if="selectedUser" class="form-group">
              <span class="field-caption">Business Verification (KYB)</span>
              <label class="kyb-toggle">
                <input
                  v-model="selectedUser.kyb_verified"
                  type="checkbox"
                  class="kyb-switch-input"
                  :disabled="editingSelf && !selectedUser.kyb_verified"
                />
                <span class="kyb-switch" aria-hidden="true"></span>
                <span class="kyb-toggle-text">
                  {{ selectedUser.kyb_verified ? 'Verified' : 'Not verified' }}
                </span>
              </label>
              <small class="hint">
                Clears the "Business verification required" gate (e.g. Sell
                Feedstock, seller payouts). Overrides the KYB application flow.
              </small>
            </div>
            <div class="modal-actions">
              <button @click="saveUser" class="btn-primary">Save</button>
              <button @click="closeEditModal" class="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ModernPrompt
      :is-open="promptState.isOpen"
      :type="promptState.type"
      :title="promptState.title"
      :message="promptState.message"
      :confirm-text="promptState.confirmText"
      :cancel-text="promptState.cancelText"
      :show-cancel="promptState.showCancel"
      @confirm="handleConfirm"
      @cancel="handleCancel"
      @close="handleClose"
    />

    <!-- Suspend / reactivate -->
    <div v-if="showSuspendModal" class="modal-overlay" @click.self="closeSuspendModal">
      <div class="modal">
        <h3>{{ suspendTarget && isSuspendedProfile(suspendTarget) ? 'Reactivate account' : 'Suspend account' }}</h3>
        <p class="modal-sub">{{ suspendTarget?.full_name || suspendTarget?.email }}</p>

        <template v-if="suspendTarget && !isSuspendedProfile(suspendTarget)">
          <p class="modal-note">
            They will be blocked from buying, selling, retiring credits and submitting
            projects. They keep access to their receipts, certificates and data export —
            a retirement certificate is ESG evidence and must not disappear because of a
            platform sanction.
          </p>
          <label class="modal-label" for="suspend-reason">Reason (required)</label>
          <textarea
            id="suspend-reason"
            v-model="suspendReason"
            class="modal-input"
            rows="3"
            placeholder="Why is this account being suspended?"
          ></textarea>
        </template>
        <p v-else class="modal-note">
          This restores their ability to transact. The suspension reason on record is cleared.
        </p>

        <p v-if="suspendError" class="modal-error">{{ suspendError }}</p>

        <div class="modal-actions">
          <button class="btn-ghost" :disabled="busyUserId" @click="closeSuspendModal">Cancel</button>
          <button
            class="btn-danger"
            :disabled="busyUserId"
            @click="confirmSuspend"
          >
            {{ suspendTarget && isSuspendedProfile(suspendTarget) ? 'Reactivate' : 'Suspend' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getSupabase } from '@/services/supabaseClient'
import { KYC_LEVELS, kycLevelLabel, adminSetUserProfile } from '@/services/kycService'
import { adminSetKybVerified } from '@/services/kybService'
import { setUserSuspended, isSuspendedProfile } from '@/services/roleService'
import { useUserStore } from '@/store/userStore'
import { useModernPrompt } from '@/composables/useModernPrompt'
import ModernPrompt from '@/components/ui/ModernPrompt.vue'

const {
  promptState,
  success: showSuccess,
  error: showError,
  handleConfirm,
  handleCancel,
  handleClose,
} = useModernPrompt()

const users = ref([])
const loading = ref(true)
const error = ref('')
const searchQuery = ref('')
const roleFilter = ref('')
const showEditModal = ref(false)
const selectedUser = ref(null)

const filteredUsers = computed(() => {
  let filtered = users.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      (user) =>
        user.full_name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query),
    )
  }

  // Filter by role
  if (roleFilter.value) {
    filtered = filtered.filter((user) => user.role === roleFilter.value)
  }

  return filtered
})

const userStore = useUserStore()
const currentUserId = computed(() => userStore.session?.user?.id || userStore.profile?.id || null)
/**
 * True when the row being edited is the signed-in admin.
 *
 * Segregation of duties (20260722000900): an admin may not grant themselves
 * privilege. The database refuses it; disabling the fields here means they see
 * why before trying rather than after.
 */
const editingSelf = computed(
  () => !!selectedUser.value && selectedUser.value.id === currentUserId.value,
)

const showSuspendModal = ref(false)
const suspendTarget = ref(null)
const suspendReason = ref('')
const suspendError = ref('')
const busyUserId = ref(null)

function openSuspendModal(user) {
  suspendTarget.value = user
  suspendReason.value = ''
  suspendError.value = ''
  showSuspendModal.value = true
}

function closeSuspendModal() {
  if (busyUserId.value) return
  showSuspendModal.value = false
  suspendTarget.value = null
}

async function confirmSuspend() {
  if (!suspendTarget.value) return
  const target = suspendTarget.value
  const suspending = !isSuspendedProfile(target)

  busyUserId.value = target.id
  suspendError.value = ''
  try {
    await setUserSuspended(target.id, suspending, suspendReason.value)
    showSuspendModal.value = false
    suspendTarget.value = null
    await loadUsers()
  } catch (err) {
    // The RPC refuses self-suspension and a suspension with no reason — show
    // those verbatim rather than a generic failure.
    suspendError.value = err.message || 'Could not update the account status.'
  } finally {
    busyUserId.value = null
  }
}

async function loadUsers() {
  try {
    loading.value = true
    error.value = ''
    const supabase = getSupabase()

    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError
    users.value = data || []
  } catch (err) {
    console.error('Error loading users:', err)
    error.value = 'Failed to load users. Please try again.'
  } finally {
    loading.value = false
  }
}

function formatRole(role) {
  const roleMap = {
    admin: 'Admin',
    verifier: 'Verifier',
    project_developer: 'Project Developer',
    farmer: 'Farmer',
    buyer_investor: 'Buyer/Investor',
    lgu_user: 'LGU User',
    general_user: 'General User',
  }
  return roleMap[role] || role
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function openEditModal(user) {
  selectedUser.value = { ...user }
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  selectedUser.value = null
}

async function saveUser() {
  if (!selectedUser.value) return

  try {
    // Admin-gated RPC: bypasses profile RLS (admin editing another user) and only
    // touches columns that exist — the old raw UPDATE 400'd on updated_at + RLS.
    const updated = await adminSetUserProfile({
      userId: selectedUser.value.id,
      kycLevel: Number(selectedUser.value.kyc_level) || 0,
      role: selectedUser.value.role,
      fullName: selectedUser.value.full_name,
    })

    // KYB verification is a separate admin-gated RPC; only call it when changed.
    const original = users.value.find((u) => u.id === selectedUser.value.id)
    let kybProfile = null
    if (!!original?.kyb_verified !== !!selectedUser.value.kyb_verified) {
      kybProfile = await adminSetKybVerified({
        userId: selectedUser.value.id,
        verified: !!selectedUser.value.kyb_verified,
      })
    }

    // Reflect the server's saved values locally.
    const index = users.value.findIndex((u) => u.id === selectedUser.value.id)
    if (index !== -1) {
      users.value[index] = {
        ...users.value[index],
        ...(updated || selectedUser.value),
        kyb_verified: (kybProfile || updated || selectedUser.value).kyb_verified,
      }
    }

    closeEditModal()
    await showSuccess({ title: 'User updated', message: 'The account was updated successfully.' })
  } catch (err) {
    console.error('Error updating user:', err)
    await showError({
      title: 'Update failed',
      message: err.message || 'Failed to update user. Please try again.',
    })
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.user-management {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  padding: 1.25rem 0;
  border-bottom: none;
  background: var(--primary-color, #10b981);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
}

.page-description {
  font-size: 0.95rem;
  color: #fff;
}

.user-content {
  padding: 2rem 0;
}

.toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.search-input,
.filter-select {
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
}

.search-input {
  flex: 1;
}

.filter-select {
  min-width: 150px;
}

.users-table {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Horizontal scroller: the 8-column table stays intact and the Actions column
   scrolls into view instead of being clipped on narrow/medium screens. */
.table-scroll {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #f8f9fa;
}

th,
td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

/* Keep the two row actions side by side and never let them wrap out of view. */
.actions-cell {
  display: flex;
  gap: 0.25rem;
  white-space: nowrap;
}

th {
  font-weight: 600;
  color: #333;
}

.role-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
}

.kyb-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}
.kyb-verified {
  background: #d1fae5;
  color: #065f46;
}
.kyb-none {
  background: #f3f4f6;
  color: #9ca3af;
}
/* KYB toggle switch. Selectors are scoped under .form-group so they beat the
   global `.form-group input { width: 100% }` / `label { display: block }`. */
.form-group .kyb-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0 0;
  cursor: pointer;
  font-weight: 500;
}
.form-group .kyb-toggle .kyb-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.kyb-switch {
  position: relative;
  width: 42px;
  height: 24px;
  background: #d1d5db;
  border-radius: 999px;
  transition: background 0.2s ease;
  flex-shrink: 0;
}
.kyb-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}
.kyb-switch-input:checked + .kyb-switch {
  background: #069e2d;
}
.kyb-switch-input:checked + .kyb-switch::after {
  transform: translateX(18px);
}
.kyb-switch-input:focus-visible + .kyb-switch {
  outline: 2px solid #069e2d;
  outline-offset: 2px;
}
.kyb-toggle-text {
  font-size: 0.9rem;
  color: #374151;
}

.role-admin {
  background: #fee2e2;
  color: #dc2626;
}

.role-verifier {
  background: #dbeafe;
  color: #2563eb;
}

.role-project_developer {
  background: #dcfce7;
  color: #16a34a;
}

.role-general_user {
  background: #f3f4f6;
  color: #6b7280;
}

.action-btn {
  padding: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  transition: transform 0.2s;
}

.action-btn:hover {
  transform: scale(1.2);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal-content h3 {
  margin: 0 0 1.5rem 0;
}

.form-group {
  margin-bottom: 1rem;
}

/* Caption above the KYB toggle. Not a <label>: the toggle wraps its own. */
.form-group .field-caption,
.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.form-group .hint {
  display: block;
  margin-top: 6px;
  color: #6b7280;
  font-size: 0.78rem;
  line-height: 1.3;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: var(--primary-color, #10b981);
  color: white;
}

.btn-secondary {
  background: #f3f4f6;
  color: #333;
}

.loading-state,
.error-state {
  text-align: center;
  padding: 2rem;
}

/* Suspension ------------------------------------------------------------- */
.status-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}
.status-badge.active {
  background: #dcfce7;
  color: #166534;
}
.status-badge.suspended {
  background: #fee2e2;
  color: #991b1b;
}
.suspend-reason {
  margin-top: 0.2rem;
  font-size: 0.72rem;
  color: #64748b;
  max-width: 22ch;
  white-space: normal;
}
.action-btn.suspend-btn {
  color: #b91c1c;
}
.action-btn.reactivate-btn {
  color: #166534;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
}
.modal {
  background: #fff;
  border-radius: 14px;
  padding: 1.25rem;
  width: 100%;
  max-width: 460px;
}
.modal h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
}
.modal-sub {
  margin: 0.2rem 0 0.75rem;
  color: #64748b;
  font-size: 0.88rem;
}
.modal-note {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  font-size: 0.82rem;
  color: #334155;
  line-height: 1.5;
}
.modal-label {
  display: block;
  margin: 0.75rem 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}
.modal-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  font-size: 0.88rem;
  font-family: inherit;
}
.modal-error {
  margin: 0.6rem 0 0;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  font-size: 0.83rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
.btn-ghost {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-danger {
  border: 1px solid #dc2626;
  background: #dc2626;
  color: #fff;
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-ghost:disabled,
.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.self-edit-note {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.75rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
}

/* Tighter chrome on phones/tablets so the header and toolbar stop eating the
   viewport before the actual user list. The table itself card-stacks under
   640px via the global stack-on-mobile rules. */
@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }

  .page-header {
    padding: 1.25rem 0;
  }

  .page-title {
    font-size: 1.5rem;
  }

  .page-description {
    font-size: 0.95rem;
  }

  .user-content {
    padding: 1.25rem 0;
  }

  .toolbar {
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .filter-select {
    min-width: 0;
    width: 100%;
  }
}

/* Under 640px the global rules turn each row into its own card, so the outer
   card wrapper would just be a box around boxes — drop its chrome. */
@media (max-width: 640px) {
  .users-table {
    background: transparent;
    box-shadow: none;
    border-radius: 0;
  }
}
</style>
