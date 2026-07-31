<script setup>
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useUserStore } from '@/store/userStore'

/**
 * AI Project Assistant — interface preview (expansion feature #7).
 *
 * The Claude-backed edge function is NOT built yet. This view exists so the
 * assistant is discoverable and its scope is legible, so nothing here fabricates
 * an answer: the composer is disabled and every capability is labelled as
 * planned. When the backend lands, replace `messages` with real turns and drop
 * the `preview` banner — the layout is already the one a live chat wants.
 */

const userStore = useUserStore()

const displayName = computed(() => {
  const full = userStore.profile?.full_name || ''
  return full.split(' ')[0] || 'there'
})

// Role-aware examples of what the assistant will be able to answer. These are
// illustrative prompts, not live suggestions — clicking them does nothing yet.
const examplePrompts = computed(() => {
  if (userStore.isProjectDeveloper) {
    return [
      'Summarise the monitoring reports for my rice-husk project',
      'Draft the additionality section of my PDD',
      'Which of my projects are overdue for MRV reporting?',
      'How many credits have I issued but not yet sold?',
    ]
  }
  if (userStore.isVerifier) {
    return [
      'What changed since this project was last resubmitted?',
      'Summarise the evidence attached to this monitoring report',
      'Which projects in my queue are closest to their SLA?',
    ]
  }
  if (userStore.isFarmer) {
    return [
      'What did I deliver last month, and what is still unpaid?',
      'Which of my parcels has the highest expected yield?',
      'How do I price rice husk competitively right now?',
    ]
  }
  if (userStore.isBuyerInvestor) {
    return [
      'Which validated projects have the shortest payback?',
      'Compare the IRR of the two biochar projects in my pipeline',
      'Summarise the co-benefits of the projects I own credits in',
    ]
  }
  return [
    'What is a carbon credit, and how does retirement work?',
    'Which projects on the marketplace are closest to me?',
    'Explain what MRV means in plain language',
  ]
})

const capabilities = [
  {
    icon: 'database',
    title: 'Grounded in your data',
    body: 'Answers drawn from the projects, credits, and MRV records you already have access to — never from a generic web answer. Row-level security still applies, so it can only read what you can.',
  },
  {
    icon: 'edit_document',
    title: 'Drafting help',
    body: 'First drafts of PDD sections, monitoring narratives, and project proposals, using your own project data as the source material.',
  },
  {
    icon: 'query_stats',
    title: 'Ask across the portfolio',
    body: 'Plain-language questions over things that are tedious to click through today — reporting gaps, unsold inventory, overdue deliveries.',
  },
]

// Held in the composer purely so the disabled state feels real; never sent.
const draft = ref('')
</script>

<template>
  <div class="assistant">
    <PageHeader
      icon="smart_toy"
      title="AI Project Assistant"
      description="Ask questions about your projects, credits, and monitoring data in plain language."
    >
      <template #actions>
        <span class="pill">Preview</span>
      </template>
    </PageHeader>

    <div class="page-body">

    <div class="notice info" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">construction</span>
      <div>
        <strong>The assistant isn't connected yet.</strong>
        This is a preview of the interface so you can see what's coming. Nothing you type here is
        sent anywhere, and no answers are generated.
      </div>
    </div>

    <div class="layout">
      <!-- Chat surface -->
      <section class="chat" aria-label="Assistant conversation preview">
        <div class="messages">
          <div class="msg assistant-msg">
            <span class="material-symbols-outlined avatar" aria-hidden="true">smart_toy</span>
            <div class="bubble">
              <p>Hi {{ displayName }} — once I'm switched on, you'll be able to ask me things like the examples below.</p>
              <p class="muted small">
                I'll be able to read the same records you can, so I can answer about your own
                projects rather than in generalities.
              </p>
            </div>
          </div>
        </div>

        <div class="examples">
          <p class="examples-label">Example questions</p>
          <ul class="chips">
            <li v-for="prompt in examplePrompts" :key="prompt">
              <span class="chip" aria-disabled="true">{{ prompt }}</span>
            </li>
          </ul>
        </div>

        <div class="composer">
          <label class="sr-only" for="assistant-input">Message the assistant</label>
          <textarea
            id="assistant-input"
            v-model="draft"
            rows="2"
            disabled
            placeholder="The assistant isn't available yet…"
          ></textarea>
          <button class="btn-primary" type="button" disabled title="Not available yet">
            <span class="material-symbols-outlined" aria-hidden="true">send</span>
            <span class="sr-only">Send</span>
          </button>
        </div>
        <p class="composer-note muted small">Disabled until the assistant is connected.</p>
      </section>

      <!-- What it will do -->
      <aside class="capabilities" aria-label="Planned capabilities">
        <h2>What it will do</h2>
        <div v-for="cap in capabilities" :key="cap.title" class="cap">
          <span class="material-symbols-outlined cap-icon" aria-hidden="true">{{ cap.icon }}</span>
          <div>
            <h3>{{ cap.title }}</h3>
            <p>{{ cap.body }}</p>
          </div>
        </div>
        <p class="muted small foot">
          Built on the Claude API. Availability and any usage limits will be announced before it
          goes live.
        </p>
      </aside>
    </div>
    </div>
  </div>
</template>

<style scoped>
.assistant { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 1000px; margin: 0 auto; padding: 24px 16px; }
.head-row { display: flex; gap: 12px; align-items: flex-start; }
.head-icon { font-size: 36px; color: #058526; }
.pill { background: #fef3c7; color: #92400e; border-radius: 999px; padding: 4px 12px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }

.notice { display: flex; gap: 12px; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; align-items: flex-start; }
.notice.info { background: #eff6ff; color: #1e40af; }

.layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; align-items: start; }

.chat { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.messages { min-height: 120px; }
.msg { display: flex; gap: 10px; }
.avatar { font-size: 26px; color: #058526; background: #f0fdf4; border-radius: 50%; padding: 6px; }
.bubble { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; }
.bubble p { margin: 0; }
.bubble p + p { margin-top: 8px; }

.examples { margin-top: 20px; }
.examples-label { font-size: 0.78rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 10px; }
.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-block; background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; border-radius: 999px; padding: 7px 13px; font-size: 0.83rem; cursor: not-allowed; opacity: 0.85; }

.composer { display: flex; gap: 8px; margin-top: 20px; align-items: flex-end; }
.composer textarea { flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 0.9rem; font-family: inherit; resize: none; background: #f9fafb; color: #9ca3af; cursor: not-allowed; }
.composer-note { margin: 6px 0 0; }
.btn-primary { background: #058526; color: #fff; border: none; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

.capabilities { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.capabilities h2 { margin: 0 0 14px; font-size: 1.05rem; }
.cap { display: flex; gap: 12px; margin-bottom: 16px; }
.cap-icon { font-size: 22px; color: #058526; }
.cap h3 { margin: 0 0 3px; font-size: 0.9rem; }
.cap p { margin: 0; font-size: 0.83rem; color: #6b7280; line-height: 1.45; }
.foot { border-top: 1px solid #e5e7eb; padding-top: 12px; margin: 0; }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
