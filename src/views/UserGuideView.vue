<script setup>
/**
 * The in-app user guide.
 *
 * Reachable from "User guide" in the account menu and the sidebar (directly
 * below "Take a tour"), and from the notice on the dashboard. The tour is a
 * one-shot modal; this is the page you come back to.
 *
 * Sections relevant to the signed-in user's role float to the top, but nothing
 * is hidden — "what does a verifier actually do?" is a fair question from a
 * buyer, and answering it is part of explaining why the credits are worth
 * anything.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useUserStore } from '@/store/userStore'
import { orderedSectionsForRole, BETA_NOTICES } from '@/constants/userGuide'
import { getRoleDisplayName } from '@/constants/roles'

const router = useRouter()
const userStore = useUserStore()

const role = computed(() => userStore.role || 'general_user')
const roleLabel = computed(() => getRoleDisplayName(role.value))
const sections = computed(() => orderedSectionsForRole(role.value))

/** Which section is expanded. The first one starts open so the page is not a wall of headers. */
const openId = ref(sections.value[0]?.id || null)

function toggle(id) {
  openId.value = openId.value === id ? null : id
}

function isRelevant(section) {
  return section.roles.includes(role.value)
}

function go(to) {
  if (to) router.push(to)
}

function openTour() {
  window.dispatchEvent(new Event('carbonify:open-tour'))
}
</script>

<template>
  <div class="guide-view">
    <PageHeader
      title="User guide"
      description="How Carbonify works, what your role can do, and what the other roles are for."
    >
      <template #actions>
        <button class="header-cta" @click="openTour">
          <span class="material-symbols-outlined" aria-hidden="true">tour</span>
          Take the tour
        </button>
      </template>
    </PageHeader>

    <div class="container">
      <p class="role-line">
        You are signed in as <strong>{{ roleLabel }}</strong
        >. The sections most relevant to you are first — everything else is below.
      </p>

      <!-- Beta limits. These are disclosed elsewhere too, but someone reading a
           guide to decide whether to trust the platform should not have to find
           them somewhere else. -->
      <section class="beta">
        <h2 class="beta-title">
          <span class="material-symbols-outlined" aria-hidden="true">science</span>
          What is still limited during the beta
        </h2>
        <ul class="beta-list">
          <li v-for="n in BETA_NOTICES" :key="n.title">
            <strong>{{ n.title }}.</strong> {{ n.body }}
          </li>
        </ul>
      </section>

      <section
        v-for="section in sections"
        :key="section.id"
        class="guide-section"
        :class="{ relevant: isRelevant(section) }"
      >
        <h2 class="section-head">
          <button
            type="button"
            class="section-toggle"
            :aria-expanded="openId === section.id"
            :aria-controls="`panel-${section.id}`"
            @click="toggle(section.id)"
          >
            <span class="material-symbols-outlined section-ico" aria-hidden="true">{{
              section.icon
            }}</span>
            <span class="section-titles">
              <span class="section-title">{{ section.title }}</span>
              <span class="section-intro">{{ section.intro }}</span>
            </span>
            <span v-if="isRelevant(section) && !section.roles.includes('*')" class="section-badge">
              Your role
            </span>
            <span class="material-symbols-outlined chevron" aria-hidden="true">
              {{ openId === section.id ? 'expand_less' : 'expand_more' }}
            </span>
          </button>
        </h2>

        <div v-if="openId === section.id" :id="`panel-${section.id}`" class="section-body">
          <article v-for="item in section.items" :key="item.q" class="qa">
            <h3 class="qa-q">{{ item.q }}</h3>
            <p class="qa-a">{{ item.a }}</p>
            <button v-if="item.to" type="button" class="qa-cta" @click="go(item.to)">
              {{ item.cta }}
              <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </button>
          </article>
        </div>
      </section>

      <p class="foot">
        Still stuck? Contact the Carbonify team — and if something in this guide does not match
        what the app does, tell us: that is a bug in one of the two.
      </p>
    </div>
  </div>
</template>

<style scoped>
.guide-view {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}
.container {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 16px 56px;
}
.header-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: #fff;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
  min-height: 42px;
}
.header-cta:hover {
  background: rgba(255, 255, 255, 0.26);
}
.role-line {
  margin: 0 0 16px;
  font-size: 0.9rem;
  color: #4b5563;
}
.beta {
  border: 1px solid #f59e0b;
  background: #fffbeb;
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 20px;
}
.beta-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 700;
  color: #78350f;
}
.beta-title .material-symbols-outlined {
  font-size: 20px;
}
.beta-list {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  color: #78350f;
  font-size: 0.86rem;
  line-height: 1.55;
}
.guide-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
}
.guide-section.relevant {
  border-color: var(--primary-color, #058526);
}
.section-head {
  margin: 0;
}
.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  padding: 16px 18px;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.section-toggle:hover {
  background: #f9fafb;
}
.section-ico {
  color: var(--primary-color, #058526);
  font-size: 24px;
  flex: 0 0 auto;
}
.section-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.section-title {
  font-size: 1rem;
  font-weight: 650;
  color: #111827;
}
.section-intro {
  font-size: 0.82rem;
  color: #6b7280;
}
.section-badge {
  flex: 0 0 auto;
  background: var(--primary-color, #058526);
  color: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.chevron {
  color: #6b7280;
  flex: 0 0 auto;
}
.section-body {
  padding: 0 18px 18px;
  display: grid;
  gap: 14px;
  border-top: 1px solid #f3f4f6;
  padding-top: 14px;
}
.qa-q {
  margin: 0 0 4px;
  font-size: 0.93rem;
  font-weight: 650;
  color: #111827;
}
.qa-a {
  margin: 0;
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.6;
}
.qa-cta {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
}
.qa-cta:hover {
  background: var(--primary-color, #058526);
  color: #fff;
}
.qa-cta .material-symbols-outlined {
  font-size: 17px;
}
.foot {
  margin: 22px 0 0;
  font-size: 0.84rem;
  color: #6b7280;
  text-align: center;
}

@media (max-width: 640px) {
  .section-toggle {
    padding: 14px;
    gap: 10px;
  }
  .section-badge {
    display: none;
  }
}
</style>
