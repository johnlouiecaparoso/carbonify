<template>
  <div class="comment-thread">
    <h4 class="thread-title">
      <span class="material-symbols-outlined" aria-hidden="true">forum</span>
      Conversation
    </h4>

    <div v-if="loading" class="thread-state">Loading conversation…</div>
    <div v-else-if="loadError" class="thread-state thread-error">
      {{ loadError }}
      <button type="button" class="thread-retry" @click="load">Try again</button>
    </div>
    <div v-else-if="comments.length === 0" class="thread-state">
      No messages yet.{{ canPost ? ' Start the conversation below.' : '' }}
    </div>

    <ul v-else class="comment-list">
      <li
        v-for="c in comments"
        :key="c.id"
        class="comment"
        :class="{ internal: c.is_internal, mine: c.author_id === currentUserId }"
      >
        <div class="comment-head">
          <span class="comment-author">{{ c.author_name || 'User' }}</span>
          <span v-if="c.author_role" class="comment-role">{{ roleLabel(c.author_role) }}</span>
          <span v-if="c.is_internal" class="comment-internal-tag">Internal</span>
          <span class="comment-time">{{ formatTime(c.created_at) }}</span>
        </div>
        <p class="comment-body">{{ c.body }}</p>
      </li>
    </ul>

    <form v-if="canPost" class="comment-form" @submit.prevent="submit">
      <textarea
        v-model="draft"
        class="comment-input"
        rows="3"
        :placeholder="placeholder"
        :disabled="posting"
      ></textarea>
      <div class="comment-actions">
        <label v-if="allowInternal" class="internal-toggle">
          <input type="checkbox" v-model="postInternal" :disabled="posting" />
          Internal note (verifiers only)
        </label>
        <span v-else></span>
        <button type="submit" class="comment-submit" :disabled="posting || !draft.trim()">
          {{ posting ? 'Sending…' : 'Send' }}
        </button>
      </div>
      <p v-if="error" class="comment-error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useUserStore } from '@/store/userStore'
import { getRoleDisplayName } from '@/constants/roles'
import { listProjectComments, addProjectComment } from '@/services/projectCommentService'

const props = defineProps({
  projectId: { type: String, required: true },
  // Whether the current user may post at all.
  canPost: { type: Boolean, default: true },
  // Whether to show the "internal note" toggle (verifiers/admins only).
  allowInternal: { type: Boolean, default: false },
})

const store = useUserStore()
const comments = ref([])
const loading = ref(true)
const draft = ref('')
const postInternal = ref(false)
const posting = ref(false)
const error = ref('')
const loadError = ref('')

const currentUserId = computed(() => store.session?.user?.id || null)
const placeholder = computed(() =>
  props.allowInternal
    ? 'Reply to the developer, or leave an internal note…'
    : 'Reply to the verifier…',
)

function roleLabel(role) {
  return getRoleDisplayName(role)
}

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    comments.value = await listProjectComments(props.projectId)
  } catch (err) {
    // Two bugs in one line before this: a throw left `loading` true forever, so
    // the thread sat on "Loading conversation…"; and returning [] instead
    // rendered an empty thread, which reads as "the verifier has asked you
    // nothing" on the screen where revisions are requested.
    console.error('Failed to load project comments:', err)
    comments.value = []
    loadError.value = 'We could not load this conversation. Please try again.'
  } finally {
    loading.value = false
  }
}

async function submit() {
  error.value = ''
  if (!draft.value.trim()) return
  posting.value = true
  try {
    await addProjectComment(props.projectId, draft.value, {
      isInternal: props.allowInternal && postInternal.value,
      authorRole: store.role,
    })
    draft.value = ''
    postInternal.value = false
    await load()
  } catch (err) {
    error.value = err?.message || 'Could not post your message.'
  } finally {
    posting.value = false
  }
}

onMounted(load)
watch(() => props.projectId, load)

// Let parents trigger a refresh after a status change.
defineExpose({ refresh: load })
</script>

<style scoped>
.comment-thread {
  margin-top: 1rem;
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}
.thread-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
  margin: 0 0 0.75rem;
}
.thread-state {
  color: #9ca3af;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.comment-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.comment {
  background: #f9fafb;
  border: 1px solid #eef0f2;
  border-radius: 10px;
  padding: 0.6rem 0.8rem;
}
.comment.mine {
  background: #ecfdf5;
  border-color: #d1fae5;
}
.comment.internal {
  background: #fff7ed;
  border-color: #fed7aa;
}
.comment-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}
.comment-author {
  font-weight: 700;
  color: #111827;
}
.comment-role {
  color: #6b7280;
}
.comment-internal-tag {
  background: #f59e0b;
  color: #fff;
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  font-weight: 700;
  font-size: 0.65rem;
}
.comment-time {
  margin-left: auto;
  color: #9ca3af;
}
.comment-body {
  margin: 0;
  font-size: 0.875rem;
  color: #374151;
  white-space: pre-wrap;
}
.comment-input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.6rem;
  font: inherit;
  font-size: 0.875rem;
  resize: vertical;
}
.comment-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
}
.internal-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: #6b7280;
}
.comment-submit {
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: 8px;
  background: #058526;
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.comment-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.thread-error {
  color: #dc2626;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.thread-retry {
  background: #fff;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 0.25rem 0.7rem;
  font-weight: 600;
  font-size: 0.8rem;
  color: inherit;
  cursor: pointer;
}
.comment-error {
  color: #dc2626;
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
}
</style>
