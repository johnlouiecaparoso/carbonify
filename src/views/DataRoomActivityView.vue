<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { getSupabase } from '@/services/supabaseClient'
import { getMyDataRoomActivity, aggregateAccessLog } from '@/services/dataRoomService'

/**
 * Developer-facing view of the Investor Portal data room: which investors opened
 * which documents, and when.
 *
 * Viewer identities are deliberately NOT resolved to names. An investor doing
 * diligence has a reasonable expectation that their interest isn't broadcast as
 * a named lead list, and the developer's legitimate need — "is anyone reading my
 * PDD?" — is met by distinct-viewer counts. Self-views are never recorded.
 */

const loading = ref(true)
const loadError = ref('')
const rows = ref([])
const projects = ref([])

const summary = computed(() => aggregateAccessLog(rows.value))
const totalViews = computed(() => rows.value.length)
const totalViewers = computed(() => new Set(rows.value.map((r) => r.viewer_id)).size)

function projectTitle(id) {
  return projects.value.find((p) => p.id === id)?.title || 'Project'
}
function shortDateTime(d) {
  return d
    ? new Date(d).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const [{ data: projectRows }, log] = await Promise.all([
      supabase.from('projects').select('id, title').eq('user_id', user.id),
      getMyDataRoomActivity(),
    ])
    projects.value = projectRows || []
    rows.value = log
  } catch (err) {
    console.error('Failed to load data room activity:', err)
    loadError.value = err?.message || 'We could not load your data room activity right now.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="activity">
    <PageHeader
      title="Data Room Activity"
      description="Which investors opened your project documents in the Investor Portal. Your own views aren't counted."
    />

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="loadError" class="notice error">
      {{ loadError }}
      <div><button class="retry-btn" @click="load">Try again</button></div>
    </div>

    <template v-else>
      <section class="stats">
        <div class="stat">
          <span class="stat-label">Interested investors</span>
          <span class="stat-value">{{ totalViewers }}</span>
          <span class="stat-sub">distinct viewers</span>
        </div>
        <div class="stat">
          <span class="stat-label">Documents opened</span>
          <span class="stat-value">{{ totalViews }}</span>
          <span class="stat-sub">all time</span>
        </div>
        <div class="stat">
          <span class="stat-label">Projects viewed</span>
          <span class="stat-value">{{ summary.length }}</span>
          <span class="stat-sub">of {{ projects.length }}</span>
        </div>
      </section>

      <div v-if="!summary.length" class="empty">
        <span class="material-symbols-outlined empty-icon" aria-hidden="true">visibility</span>
        <p class="muted">
          No investor has opened your documents yet. Projects appear in the Investor Portal once
          they're validated — attach a PDD and feasibility study to give investors something to read.
        </p>
      </div>

      <div v-for="p in summary" :key="p.projectId" class="card">
        <div class="card-head">
          <div>
            <h3>{{ projectTitle(p.projectId) }}</h3>
            <div class="meta">
              {{ p.uniqueViewers }} investor(s) · {{ p.views }} document view(s) · last
              {{ shortDateTime(p.lastViewedAt) }}
            </div>
          </div>
        </div>
        <ul class="doc-list">
          <li v-for="doc in p.topDocuments" :key="doc.name">
            <span>{{ doc.name }}</span>
            <span class="muted small">{{ doc.count }} view(s)</span>
          </li>
        </ul>
      </div>

      <p v-if="summary.length" class="muted small foot">
        Investors are counted, not named. Someone reviewing your project has a reasonable expectation
        that their diligence isn't published as a lead list.
      </p>
    </template>
    </div>
  </div>
</template>

<style scoped>
.activity { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 820px; margin: 0 auto; padding: 24px 16px; }
.page-head h1 { margin: 0; font-size: 1.6rem; }
.page-head p { color: #6b7280; margin: 4px 0 20px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
.stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 0.78rem; color: #6b7280; font-weight: 600; }
.stat-value { font-size: 1.35rem; font-weight: 700; color: #065f46; }
.stat-sub { font-size: 0.75rem; color: #9ca3af; }

.notice { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
.notice.error { background: #fee2e2; color: #991b1b; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
.card-head h3 { margin: 0 0 4px; font-size: 1.05rem; }
.meta { color: #6b7280; font-size: 0.82rem; }
.doc-list { list-style: none; margin: 12px 0 0; padding: 0; }
.doc-list li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid #f3f4f6; font-size: 0.87rem; }
.doc-list li:first-child { border-top: none; }

.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 48px; color: #069e2d; }
.empty p { margin: 12px auto 0; max-width: 440px; }
.foot { margin-top: 16px; }

@media (max-width: 640px) {
  .stats { grid-template-columns: 1fr; }
}
</style>
