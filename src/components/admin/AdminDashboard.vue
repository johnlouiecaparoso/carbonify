<template>
  <div class="admin-dashboard">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Admin Dashboard</h1>
        <p class="page-description">Oversee platform access, roles, and core settings</p>
      </div>
    </div>
    <div class="admin-stats">
      <div class="stat-card">
        <div class="stat-icon users" aria-hidden="true">
          <span class="material-symbols-outlined">group</span>
        </div>
        <div class="stat-body">
          <p class="stat-number">{{ loading ? '...' : statErrors.totalUsers ? '—' : stats.totalUsers }}</p>
          <h3>Total Users</h3>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon apps" aria-hidden="true">
          <span class="material-symbols-outlined">pending_actions</span>
        </div>
        <div class="stat-body">
          <p class="stat-number">{{ loading ? '...' : statErrors.pendingRoleApplications ? '—' : stats.pendingRoleApplications }}</p>
          <h3>Pending Role Applications</h3>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon admins" aria-hidden="true">
          <span class="material-symbols-outlined">shield_person</span>
        </div>
        <div class="stat-body">
          <p class="stat-number">{{ loading ? '...' : statErrors.totalAdmins ? '—' : stats.totalAdmins }}</p>
          <h3>Administrators</h3>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon verifiers" aria-hidden="true">
          <span class="material-symbols-outlined">how_to_reg</span>
        </div>
        <div class="stat-body">
          <p class="stat-number">{{ loading ? '...' : statErrors.pendingVerifierApplications ? '—' : stats.pendingVerifierApplications }}</p>
          <h3>Pending Verifier Applicants</h3>
        </div>
      </div>
    </div>

    <div class="admin-content">
      <!-- The hand-written "Admin Tools" grid that used to sit here listed five
           of the nine admin pages; the other four (KYB review, AML screening,
           privacy requests, refunds) were reachable only from a scrolling
           profile dropdown. All nine are now in the sidebar, under Operations
           and Compliance, so this dashboard shows work rather than links. -->
      <div class="admin-section">
        <div class="section-header">
          <div>
            <h2>Verifier Applicant Approval</h2>
            <p>Review and approve verifier applicants directly from the admin dashboard.</p>
          </div>
          <router-link to="/admin/role-applications" class="section-link">
            Open Full Role Applications
          </router-link>
        </div>

        <RoleApplications :embedded="true" :show-header="false" role-filter="verifier" />
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getSupabase, getSupabaseAsync } from '@/services/supabaseClient'
import { diagnoseAdminDashboard } from '@/utils/diagnoseAdminDashboard'
import { debugAdminQueries } from '@/utils/debugAdminQueries'
import RoleApplications from '@/components/admin/RoleApplications.vue'

const stats = ref({
  totalUsers: 0,
  pendingRoleApplications: 0,
  totalAdmins: 0,
  pendingVerifierApplications: 0,
})

// Which of the four counts could not be read. Distinct from a count of zero,
// which on this page is a statement that there is no work waiting.
const statErrors = ref({
  totalUsers: false,
  pendingRoleApplications: false,
  totalAdmins: false,
  pendingVerifierApplications: false,
})

const loading = ref(true)

onMounted(async () => {
  await loadStats()

  // If stats are all zero, run diagnostics
  if (stats.value.totalUsers === 0 && stats.value.pendingRoleApplications === 0) {
    console.warn('[WARN] All stats are zero, running diagnostics...')
    console.log(
      '💡 You can also run debugAdminQueries() or diagnoseAdminDashboard() in console manually',
    )
    setTimeout(async () => {
      try {
        // Run enhanced debug queries first
        const debugResult = await debugAdminQueries()
        console.log('[DEBUG] Debug result:', debugResult)

        // Also run full diagnostics
        const result = await diagnoseAdminDashboard()
        if (!result.success || stats.value.totalUsers === 0) {
          console.error('[ERROR] Diagnostics found issues. Check logs above for details.')
          console.log('💡 To debug queries: await debugAdminQueries()')
          console.log('💡 To full diagnose: await diagnoseAdminDashboard()')
        }
      } catch (err) {
        console.error('[ERROR] Diagnostic function error:', err)
      }
    }, 2000) // Wait 2 seconds to let stats finish loading
  }
})

async function loadStats() {
  try {
    loading.value = true

    // Ensure Supabase is initialized before proceeding
    let supabase = getSupabase()
    if (!supabase) {
      console.log('Supabase not ready, initializing...')
      supabase = await getSupabaseAsync()
    }

    if (!supabase) {
      console.error('Supabase client not initialized in AdminDashboard')
      stats.value = {
        totalUsers: 0,
        pendingRoleApplications: 0,
        totalAdmins: 0,
        pendingVerifierApplications: 0,
      }
      return
    }

    const [
      { count: totalUsersCount, error: totalUsersError },
      { count: adminCount, error: adminError },
      { count: pendingRoleApplicationsCount, error: pendingRoleApplicationsError },
      { count: pendingVerifierApplicationsCount, error: pendingVerifierApplicationsError },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
      supabase
        .from('role_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('role_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('role_requested', 'verifier'),
    ])

    // A count that failed is NOT zero. "0 pending role applications" on the
    // admin landing page reads as "nothing needs my attention", so an unread
    // count renders as an explicit unknown instead — otherwise applicants wait
    // on an admin who was told there was no queue.
    statErrors.value = {
      totalUsers: Boolean(totalUsersError),
      totalAdmins: Boolean(adminError),
      pendingRoleApplications: Boolean(pendingRoleApplicationsError),
      pendingVerifierApplications: Boolean(pendingVerifierApplicationsError),
    }

    for (const [what, err] of [
      ['users', totalUsersError],
      ['admin users', adminError],
      ['pending role applications', pendingRoleApplicationsError],
      ['pending verifier applications', pendingVerifierApplicationsError],
    ]) {
      if (err) console.error(`Error counting ${what}:`, err)
    }

    stats.value.totalUsers = totalUsersCount || 0
    stats.value.totalAdmins = adminCount || 0
    stats.value.pendingRoleApplications = pendingRoleApplicationsCount || 0
    stats.value.pendingVerifierApplications = pendingVerifierApplicationsCount || 0
  } catch (error) {
    console.error('Error loading admin stats:', error)
    // Nothing was read, so every tile is unknown rather than zero — see the
    // note on statErrors above.
    stats.value = {
      totalUsers: 0,
      pendingRoleApplications: 0,
      totalAdmins: 0,
      pendingVerifierApplications: 0,
    }
    statErrors.value = {
      totalUsers: true,
      pendingRoleApplications: true,
      totalAdmins: true,
      pendingVerifierApplications: true,
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.admin-dashboard {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Page Header */
.page-header {
  padding: 1.25rem 0 3.5rem;
  border-bottom: none;
  background: var(--primary-color, #058526);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 0.5rem;
}

.page-description {
  font-size: 0.95rem;
  /* Full white, not 0.9 alpha. Over --primary-color the translucent version
     composites to #e6f3e9 and measures 4.18:1 — under the 4.5:1 AA floor —
     while solid white on the same green is 4.78:1. The 10% was decoration and
     it cost the page its conformance. */
  color: var(--text-light);
}

.admin-dashboard .admin-stats,
.admin-dashboard .admin-content {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Stat cards float up over the header for a modern dashboard feel */
.admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
  margin-top: -2.5rem;
  margin-bottom: 2rem;
  position: relative;
  z-index: 1;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: white;
  padding: 1.4rem 1.5rem;
  border-radius: 1rem;
  border: 1px solid #eef2f1;
  box-shadow: 0 10px 24px rgba(5, 133, 38, 0.1), 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 32px rgba(5, 133, 38, 0.16);
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.85rem;
  flex-shrink: 0;
}

.stat-icon .material-symbols-outlined {
  font-size: 1.6rem;
}

.stat-icon.users {
  background: #e8f5e8;
  color: #058526;
}
.stat-icon.apps {
  background: #fef3c7;
  color: #b45309;
}
.stat-icon.admins {
  background: #fee2e2;
  color: #b91c1c;
}
.stat-icon.verifiers {
  background: #e0f2fe;
  color: #075985;
}

.stat-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-card h3 {
  margin: 0.1rem 0 0 0;
  color: #6b7280;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-number {
  font-size: 1.9rem;
  font-weight: 800;
  color: var(--text-primary, #1a1a1a);
  margin: 0;
  line-height: 1.1;
}

.admin-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  background: transparent;
}

.admin-section {
  background: white;
  padding: 1.75rem;
  border-radius: 1rem;
  border: 1px solid #eef2f1;
  box-shadow: 0 4px 16px rgba(5, 133, 38, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
}

.admin-section h2 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary, #1a1a1a);
  font-size: 1.4rem;
  font-weight: 700;
  padding-left: 0.7rem;
  border-left: 3px solid var(--primary-color, #058526);
  line-height: 1.2;
}

.admin-section > p {
  margin: 0 0 1.5rem 0;
  color: #6b7280;
  line-height: 1.5;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  /* Wrap, because `.section-link` below is `flex-shrink: 0`. A non-shrinking
     pill beside a text block on a 320px screen has nowhere to go: measured at
     right: 385px on a 320px viewport, i.e. 65px off the edge. Wrapping drops
     the link onto its own line instead of pushing the page sideways. */
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.section-header p {
  margin-bottom: 0;
}

.section-link {
  align-self: center;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  /* --primary-dark, not --primary-color. The token pair is tuned against
     white; on this pill's --bg-green-light background --primary-color drops to
     4.25:1, under the AA floor. --primary-dark measures 7.31:1 there. */
  color: var(--primary-dark, #045c1a);
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--border-green-light, #d4edda);
  border-radius: 999px;
  background: var(--bg-green-light, #e8f5e8);
  transition: all 0.18s ease;
}

.section-link:hover {
  background: var(--primary-color, #058526);
  color: #fff;
  border-color: var(--primary-color, #058526);
}

</style>
