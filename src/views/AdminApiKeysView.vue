<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { shortDate } from '@/utils/format'
import {
  listTenants,
  listApiKeys,
  saveTenant,
  issueApiKey,
  revokeApiKey,
  keyState,
  validateTenantInput,
  API_SCOPES,
} from '@/services/apiKeyService'

/**
 * White-label API administration.
 *
 * A partner is a tenant; a tenant holds keys; a key holds scopes and a rate
 * limit. The rate limit is a price tier, which is why it is set per key rather
 * than hardcoded.
 *
 * The freshly-issued key is shown in a banner that says plainly it will not be
 * shown again — because it will not be. It is stored as a SHA-256 digest and
 * nothing here, or anywhere else, can recover it.
 */

const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const tenants = ref([])
const keys = ref([])
const busy = ref(false)

const showTenantForm = ref(false)
const tenantForm = ref(emptyTenant())
const tenantErrors = ref([])

const keyForm = ref({
  tenantId: '',
  label: '',
  scopes: ['registry:read'],
  ratePerMin: 60,
  expiresAt: '',
})
const issuedKey = ref(null)

function emptyTenant() {
  return {
    slug: '',
    name: '',
    display_name: '',
    logo_url: '',
    primary_color: '',
    support_email: '',
    active: true,
  }
}

const tenantsById = computed(() =>
  Object.fromEntries(tenants.value.map((t) => [t.id, t])),
)

function tenantName(id) {
  const tenant = tenantsById.value[id]
  return tenant ? tenant.display_name || tenant.name : 'Unknown tenant'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    tenants.value = await listTenants()
    keys.value = await listApiKeys()
  } catch (err) {
    // No empty-state fallback: "no partners" and "the read failed" are different
    // facts, and only one of them means there is nothing to bill for.
    loadError.value = err?.message || 'Failed to load API tenants and keys.'
  } finally {
    loading.value = false
  }
}

async function onSaveTenant() {
  tenantErrors.value = validateTenantInput(tenantForm.value)
  if (tenantErrors.value.length) return

  busy.value = true
  actionError.value = ''
  try {
    await saveTenant(tenantForm.value)
    tenantForm.value = emptyTenant()
    showTenantForm.value = false
    await load()
  } catch (err) {
    actionError.value = err?.message || 'Failed to save the tenant.'
  } finally {
    busy.value = false
  }
}

async function onIssueKey() {
  actionError.value = ''
  issuedKey.value = null
  if (!keyForm.value.tenantId) {
    actionError.value = 'Choose a partner first.'
    return
  }

  busy.value = true
  try {
    issuedKey.value = await issueApiKey({
      tenantId: keyForm.value.tenantId,
      label: keyForm.value.label,
      scopes: keyForm.value.scopes,
      ratePerMin: keyForm.value.ratePerMin,
      expiresAt: keyForm.value.expiresAt || null,
    })
    keyForm.value.label = ''
    await load()
  } catch (err) {
    actionError.value = err?.message || 'Failed to issue the key.'
  } finally {
    busy.value = false
  }
}

async function onRevoke(key) {
  if (!window.confirm(`Revoke ${key.key_prefix}…? Calls using it stop working immediately.`)) {
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    await revokeApiKey(key.id)
    await load()
  } catch (err) {
    actionError.value = err?.message || 'Failed to revoke the key.'
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="api-page">
    <PageHeader
      title="White-label API"
      subtitle="Partner tenants, keys, scopes and rate limits"
    />

    <div class="api-body">
      <div v-if="loading" class="state">Loading…</div>

      <div v-else-if="loadError" class="banner banner-error">
        <strong>Could not load the API console.</strong>
        <p>{{ loadError }}</p>
        <button class="btn" type="button" @click="load">Try again</button>
      </div>

      <template v-else>
        <div v-if="actionError" class="banner banner-error">{{ actionError }}</div>

        <!-- The one-time key reveal. -->
        <div v-if="issuedKey" class="banner banner-key">
          <strong>Copy this key now — it will not be shown again.</strong>
          <code class="key-value">{{ issuedKey.api_key }}</code>
          <p>
            Only a SHA-256 digest is stored, so this value cannot be recovered from the database. If
            it is lost, revoke this key and issue another.
          </p>
          <button class="btn" type="button" @click="issuedKey = null">Dismiss</button>
        </div>

        <!-- Tenants -->
        <section class="panel">
          <div class="panel-head">
            <h2>Partners</h2>
            <button class="btn" type="button" @click="showTenantForm = !showTenantForm">
              {{ showTenantForm ? 'Cancel' : 'Add partner' }}
            </button>
          </div>

          <form v-if="showTenantForm" class="form" @submit.prevent="onSaveTenant">
            <ul v-if="tenantErrors.length" class="form-errors">
              <li v-for="err in tenantErrors" :key="err">{{ err }}</li>
            </ul>
            <div class="grid">
              <label>
                <span>Slug</span>
                <input v-model="tenantForm.slug" type="text" placeholder="acme-energy" required />
              </label>
              <label>
                <span>Partner name</span>
                <input v-model="tenantForm.name" type="text" placeholder="Acme Energy" required />
              </label>
              <label>
                <span>Display name (branding)</span>
                <input v-model="tenantForm.display_name" type="text" placeholder="Acme Registry" />
              </label>
              <label>
                <span>Logo URL</span>
                <input v-model="tenantForm.logo_url" type="url" placeholder="https://…" />
              </label>
              <label>
                <span>Primary colour</span>
                <input v-model="tenantForm.primary_color" type="text" placeholder="#0f766e" />
              </label>
              <label>
                <span>Support email</span>
                <input v-model="tenantForm.support_email" type="email" />
              </label>
            </div>
            <button class="btn btn-primary" type="submit" :disabled="busy">Save partner</button>
          </form>

          <p v-if="!tenants.length" class="state">No partners yet.</p>
          <table v-else class="table">
            <thead>
              <tr>
                <th scope="col">Partner</th>
                <th scope="col">Slug</th>
                <th scope="col">Branded as</th>
                <th scope="col">Active</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenant in tenants" :key="tenant.id">
                <td>{{ tenant.name }}</td>
                <td><code>{{ tenant.slug }}</code></td>
                <td>{{ tenant.display_name || '—' }}</td>
                <td>{{ tenant.active ? 'Yes' : 'No' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Issue a key -->
        <section v-if="tenants.length" class="panel">
          <div class="panel-head"><h2>Issue a key</h2></div>
          <form class="form" @submit.prevent="onIssueKey">
            <div class="grid">
              <label>
                <span>Partner</span>
                <select v-model="keyForm.tenantId" required>
                  <option value="">Choose…</option>
                  <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
                    {{ tenant.name }}
                  </option>
                </select>
              </label>
              <label>
                <span>Label</span>
                <input v-model="keyForm.label" type="text" placeholder="Production" />
              </label>
              <label>
                <span>Requests per minute</span>
                <input v-model.number="keyForm.ratePerMin" type="number" min="1" />
              </label>
              <label>
                <span>Expires (optional)</span>
                <input v-model="keyForm.expiresAt" type="date" />
              </label>
            </div>
            <fieldset class="scopes">
              <legend>Scopes</legend>
              <label v-for="scope in API_SCOPES" :key="scope.value" class="scope">
                <input v-model="keyForm.scopes" type="checkbox" :value="scope.value" />
                <span>{{ scope.label }}</span>
              </label>
            </fieldset>
            <button class="btn btn-primary" type="submit" :disabled="busy">Issue key</button>
          </form>
        </section>

        <!-- Keys -->
        <section class="panel">
          <div class="panel-head"><h2>Keys</h2></div>
          <p v-if="!keys.length" class="state">No keys issued yet.</p>
          <table v-else class="table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Partner</th>
                <th scope="col">Scopes</th>
                <th scope="col">Rate</th>
                <th scope="col">Last used</th>
                <th scope="col">State</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="key in keys" :key="key.id">
                <td>
                  <code>{{ key.key_prefix }}…</code>
                  <div v-if="key.label" class="muted">{{ key.label }}</div>
                </td>
                <td>{{ tenantName(key.tenant_id) }}</td>
                <td class="muted">{{ (key.scopes || []).join(', ') }}</td>
                <td>{{ key.rate_limit_per_min }}/min</td>
                <td>{{ key.last_used_at ? shortDate(key.last_used_at) : 'Never' }}</td>
                <td>
                  <span class="state-chip" :class="keyState(key)">{{ keyState(key) }}</span>
                </td>
                <td>
                  <button
                    v-if="keyState(key) === 'active'"
                    class="btn-link"
                    type="button"
                    :disabled="busy"
                    @click="onRevoke(key)"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.api-page {
  min-height: 100vh;
  background: var(--bg-primary, #f8fafc);
}
.api-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}
.panel {
  background: #fff;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.form {
  margin-bottom: 1.25rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.85rem;
  margin-bottom: 0.85rem;
}
.grid label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.grid input,
.grid select {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  font: inherit;
}
.scopes {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.85rem;
}
.scopes legend {
  font-size: 0.8rem;
  padding: 0 0.4rem;
}
.scope {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  margin-bottom: 0.3rem;
}
.form-errors {
  margin: 0 0 0.85rem;
  padding-left: 1.1rem;
  color: #991b1b;
  font-size: 0.85rem;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.table th,
.table td {
  padding: 0.55rem 0.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  text-align: left;
  vertical-align: top;
}
.table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}
.muted {
  color: #6b7280;
  font-size: 0.8rem;
}
.state-chip {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
  background: #f3f4f6;
  color: #374151;
}
.state-chip.active {
  background: #dcfce7;
  color: #166534;
}
.state-chip.revoked {
  background: #fee2e2;
  color: #991b1b;
}
.state-chip.expired {
  background: #fef3c7;
  color: #92400e;
}
.btn {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  background: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-primary {
  background: var(--color-primary, #16a34a);
  border-color: var(--color-primary, #16a34a);
  color: #fff;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-link {
  border: none;
  background: none;
  padding: 0;
  color: #b91c1c;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.banner {
  padding: 0.9rem 1rem;
  border-radius: 10px;
  margin-bottom: 1.25rem;
  font-size: 0.9rem;
}
.banner-error {
  background: #fef2f2;
  color: #991b1b;
}
.banner-key {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #6ee7b7;
}
.key-value {
  display: block;
  margin: 0.6rem 0;
  padding: 0.6rem 0.75rem;
  background: #fff;
  border-radius: 6px;
  word-break: break-all;
  font-size: 0.85rem;
}
.state {
  color: #6b7280;
  padding: 0.75rem 0;
}
</style>
