<script setup>
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { usePreferencesStore } from '@/store/preferencesStore'
import UiButton from '@/components/ui/Button.vue'

const preferencesStore = usePreferencesStore()

// Active tab
const activeTab = ref('theme')

// Material Symbols names, not emoji: emoji render differently on every
// platform, are read aloud by screen readers as their unicode name, and cannot
// inherit the active-tab colour.
const tabs = [
  { id: 'theme', label: 'Display', icon: 'palette' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'privacy', label: 'Privacy & Security', icon: 'lock' },
  { id: 'accessibility', label: 'Accessibility', icon: 'accessibility_new' },
  { id: 'language', label: 'Language & Region', icon: 'language' },
]

// Form data
// Only settings that actually take effect. `theme`, `currency`, `dateFormat`,
// `timeFormat`, `itemsPerPage`, `screenReader` and `keyboardNavigation` were
// removed from this form — see the comments at each removal site for why.
const formData = ref({
  language: preferencesStore.language,
  compactMode: preferencesStore.display.compactMode,
  animations: preferencesStore.display.animations,
  highContrast: preferencesStore.accessibility.highContrast,
  largeText: preferencesStore.accessibility.largeText,
  focusIndicators: preferencesStore.accessibility.focusIndicators,
  colorBlindSupport: preferencesStore.accessibility.colorBlindSupport,
})

/** Inline save confirmation — `alert()` blocks the page and cannot be styled. */
const saveMessage = ref('')
let saveTimer = null

// Notification settings
const notificationSettings = ref({
  email: { ...preferencesStore.notifications.email },
  push: { ...preferencesStore.notifications.push },
  inApp: { ...preferencesStore.notifications.inApp },
})

// Privacy settings
const privacySettings = ref({
  profileVisibility: preferencesStore.privacy.profileVisibility,
  showEmail: preferencesStore.privacy.showEmail,
  showPhone: preferencesStore.privacy.showPhone,
  allowAnalytics: preferencesStore.privacy.allowAnalytics,
  allowCookies: preferencesStore.privacy.allowCookies,
  dataSharing: preferencesStore.privacy.dataSharing,
})

onMounted(() => {
  preferencesStore.initialize()
})

function savePreferences() {
  // Update display settings
  preferencesStore.updateDisplaySettings({
    compactMode: formData.value.compactMode,
    animations: formData.value.animations,
  })

  // Update notification settings
  preferencesStore.updateNotificationSettings('email', notificationSettings.value.email)
  preferencesStore.updateNotificationSettings('push', notificationSettings.value.push)
  preferencesStore.updateNotificationSettings('inApp', notificationSettings.value.inApp)

  // Update privacy settings
  preferencesStore.updatePrivacySettings(privacySettings.value)

  // Update accessibility settings
  preferencesStore.updateAccessibilitySettings({
    highContrast: formData.value.highContrast,
    largeText: formData.value.largeText,
    focusIndicators: formData.value.focusIndicators,
    colorBlindSupport: formData.value.colorBlindSupport,
  })

  // The effect is visible immediately (the classes are already on <html>), so
  // this only confirms it was persisted.
  saveMessage.value = 'Preferences saved.'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveMessage.value = ''
  }, 4000)
}

function resetToDefaults() {
  if (
    confirm('Are you sure you want to reset all preferences to defaults? This cannot be undone.')
  ) {
    preferencesStore.resetToDefaults()
    // Reload the page to apply all changes
    window.location.reload()
  }
}

function exportPreferences() {
  const preferences = {
    theme: preferencesStore.theme,
    language: preferencesStore.language,
    notifications: preferencesStore.notifications,
    display: preferencesStore.display,
    privacy: preferencesStore.privacy,
    accessibility: preferencesStore.accessibility,
  }

  const blob = new Blob([JSON.stringify(preferences, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'carbonify-preferences.json'
  a.click()
  URL.revokeObjectURL(url)
}

function importPreferences(event) {
  const file = event.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const preferences = JSON.parse(e.target.result)
        // Apply imported preferences
        if (preferences.theme) preferencesStore.setTheme(preferences.theme)
        if (preferences.language) preferencesStore.setLanguage(preferences.language)
        if (preferences.notifications) {
          preferencesStore.updateNotificationSettings('email', preferences.notifications.email)
          preferencesStore.updateNotificationSettings('push', preferences.notifications.push)
          preferencesStore.updateNotificationSettings('inApp', preferences.notifications.inApp)
        }
        if (preferences.display) preferencesStore.updateDisplaySettings(preferences.display)
        if (preferences.privacy) preferencesStore.updatePrivacySettings(preferences.privacy)
        if (preferences.accessibility)
          preferencesStore.updateAccessibilitySettings(preferences.accessibility)

        alert('Preferences imported successfully!')
        window.location.reload()
      } catch {
        alert('Error importing preferences. Please check the file format.')
      }
    }
    reader.readAsText(file)
  }
}
</script>

<template>
  <div class="preferences-page">
    <PageHeader
      title="User Preferences"
      description="Customize your Carbonify experience"
    />

    <div class="page-body">

    <div class="preferences-container">
      <!-- Navigation Tabs -->
      <div class="preferences-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['nav-tab', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <span class="material-symbols-outlined tab-icon" aria-hidden="true">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="preferences-content">
        <!-- Theme & Display -->
        <div v-if="activeTab === 'theme'" class="tab-panel">
          <h2 class="panel-title">Theme & Display</h2>

          <div class="settings-grid">
            <div class="setting-group setting-wide">
              <label class="setting-checkbox">
                <input v-model="formData.compactMode" type="checkbox" />
                <span>
                  <strong>Compact mode</strong>
                  <small>Tighter spacing, so more rows fit on screen.</small>
                </span>
              </label>
            </div>

            <div class="setting-group setting-wide">
              <label class="setting-checkbox">
                <input v-model="formData.animations" type="checkbox" />
                <span>
                  <strong>Animations</strong>
                  <small>Turn off to remove motion and transitions across the app.</small>
                </span>
              </label>
            </div>
          </div>

          <!--
            Theme, Currency, Date format, Time format and Items per page were
            removed rather than left on screen doing nothing.

            Theme offered Light / Dark / System. `tokens.css` states plainly
            that the app is "NOT dark-mode aware, deliberately" — every view
            hard-codes its own white surfaces — so selecting Dark added a class
            no stylesheet answered.

            Currency is the one that could have caused real harm: it offered
            USD/EUR/GBP/JPY, and NOTHING CONVERTS. Carbonify is
            PHP-denominated end to end. Picking USD would not have changed a
            single figure, and if it ever had, it would have relabelled ₱1,000
            as $1,000 — a false statement about money.
          -->
          <p class="settings-note">
            <span class="material-symbols-outlined" aria-hidden="true">info</span>
            <span>
              Carbonify displays all amounts in Philippine pesos (₱) and dates in Philippine
              format. These are fixed — the platform settles in PHP, so a currency selector would
              only relabel figures without converting them.
            </span>
          </p>
        </div>

        <!-- Notifications -->
        <div v-if="activeTab === 'notifications'" class="tab-panel">
          <h2 class="panel-title">Notification Preferences</h2>

          <div class="notification-sections">
            <div class="notification-section">
              <h3 class="section-title">Email Notifications</h3>
              <div class="notification-options">
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.email.enabled" type="checkbox" />
                  <span>Enable email notifications</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.email.newProjects" type="checkbox" />
                  <span>New projects</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.email.priceAlerts" type="checkbox" />
                  <span>Price alerts</span>
                </label>
                <label class="notification-checkbox">
                  <input
                    v-model="notificationSettings.email.purchaseConfirmations"
                    type="checkbox"
                  />
                  <span>Purchase confirmations</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.email.newsletters" type="checkbox" />
                  <span>Newsletters</span>
                </label>
              </div>
            </div>

            <div class="notification-section">
              <h3 class="section-title">Push Notifications</h3>
              <div class="notification-options">
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.push.enabled" type="checkbox" />
                  <span>Enable push notifications</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.push.newProjects" type="checkbox" />
                  <span>New projects</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.push.priceAlerts" type="checkbox" />
                  <span>Price alerts</span>
                </label>
                <label class="notification-checkbox">
                  <input
                    v-model="notificationSettings.push.purchaseConfirmations"
                    type="checkbox"
                  />
                  <span>Purchase confirmations</span>
                </label>
              </div>
            </div>

            <div class="notification-section">
              <h3 class="section-title">In-App Notifications</h3>
              <div class="notification-options">
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.inApp.enabled" type="checkbox" />
                  <span>Enable in-app notifications</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.inApp.newProjects" type="checkbox" />
                  <span>New projects</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.inApp.priceAlerts" type="checkbox" />
                  <span>Price alerts</span>
                </label>
                <label class="notification-checkbox">
                  <input
                    v-model="notificationSettings.inApp.purchaseConfirmations"
                    type="checkbox"
                  />
                  <span>Purchase confirmations</span>
                </label>
                <label class="notification-checkbox">
                  <input v-model="notificationSettings.inApp.systemUpdates" type="checkbox" />
                  <span>System updates</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Privacy & Security -->
        <div v-if="activeTab === 'privacy'" class="tab-panel">
          <h2 class="panel-title">Privacy & Security</h2>

          <div class="settings-grid">
            <div class="setting-group">
              <label class="setting-label">Profile Visibility</label>
              <select v-model="privacySettings.profileVisibility" class="setting-select">
                <option value="public">Public</option>
                <option value="friends">Friends Only</option>
                <option value="private">Private</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="privacySettings.showEmail" type="checkbox" />
                <span>Show email address</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="privacySettings.showPhone" type="checkbox" />
                <span>Show phone number</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="privacySettings.allowAnalytics" type="checkbox" />
                <span>Allow analytics tracking</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="privacySettings.allowCookies" type="checkbox" />
                <span>Allow cookies</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="privacySettings.dataSharing" type="checkbox" />
                <span>Allow data sharing with partners</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Accessibility -->
        <div v-if="activeTab === 'accessibility'" class="tab-panel">
          <h2 class="panel-title">Accessibility</h2>

          <div class="settings-grid">
            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.highContrast" type="checkbox" />
                <span>
                  <strong>High contrast</strong>
                  <small>
                    Near-black text, solid borders, no soft shadows — for bright sunlight or a
                    low-quality screen.
                  </small>
                </span>
              </label>
            </div>

            <div class="setting-group setting-wide">
              <label class="setting-checkbox">
                <input v-model="formData.largeText" type="checkbox" />
                <span>
                  <strong>Larger text</strong>
                  <small>Scales text about 19% across the whole app.</small>
                </span>
              </label>
            </div>

            <div class="setting-group setting-wide">
              <label class="setting-checkbox">
                <input v-model="formData.focusIndicators" type="checkbox" />
                <span>
                  <strong>Strong focus outline</strong>
                  <small>A thick blue ring on whatever you have tabbed to.</small>
                </span>
              </label>
            </div>

            <div class="setting-group setting-wide">
              <label class="setting-checkbox">
                <input v-model="formData.colorBlindSupport" type="checkbox" />
                <span>
                  <strong>Don't rely on colour alone</strong>
                  <small>
                    Adds a symbol to every status badge, so approved / pending / rejected stay
                    distinguishable without red and green.
                  </small>
                </span>
              </label>
            </div>
          </div>

          <!--
            "Screen reader support" and "Enhanced keyboard navigation" were
            removed. Neither is a setting the app can meaningfully hold.

            Screen reader support is not a mode you switch on — it comes from
            semantic markup and ARIA, which is either present or is not, and no
            checkbox changes that. "Enhanced keyboard navigation" was worse:
            offered as a toggle, it implies keyboard access can be switched
            OFF, which would be an accessibility defect presented as a
            preference. Keyboard navigation is unconditional.
          -->
          <p class="settings-note">
            <span class="material-symbols-outlined" aria-hidden="true">info</span>
            <span>
              Keyboard navigation and screen-reader markup are always on — they are not
              preferences. Every dialog closes with <kbd>Esc</kbd> and traps focus while open.
            </span>
          </p>
        </div>

        <!-- Language & Region -->
        <div v-if="activeTab === 'language'" class="tab-panel">
          <h2 class="panel-title">Language &amp; Region</h2>

          <!-- Honest rather than hidden, matching how /assistant handles its own
               unbuilt backend. The selector stored a preference and called
               loadLanguagePack(), which is a console.log — no i18n library is
               installed and there are no translation files, so picking "Español"
               changed nothing at all. Disabled until that exists. -->
          <div class="notice-inline" role="status">
            <strong>Translations aren't available yet.</strong>
            The interface is English only for now. This setting is disabled rather than hidden so
            it's clear the option is coming, not silently ignored.
          </div>

          <div class="settings-grid">
            <div class="setting-group">
              <label class="setting-label" for="pref-language">Language</label>
              <select
                id="pref-language"
                v-model="formData.language"
                class="setting-select"
                disabled
                aria-describedby="pref-language-note"
              >
                <option
                  v-for="lang in preferencesStore.availableLanguages"
                  :key="lang.code"
                  :value="lang.code"
                >
                  {{ lang.name }}
                </option>
              </select>
              <p id="pref-language-note" class="setting-hint">
                When translations land, Filipino comes first — this is a Philippine platform and
                its farmers and cooperatives are the users least well served by English-only.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="saveMessage" class="save-message" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
      {{ saveMessage }}
    </p>

    <!-- Actions -->
    <div class="preferences-actions">
      <UiButton variant="primary" @click="savePreferences"> Save Preferences </UiButton>
      <UiButton variant="outline" @click="exportPreferences"> Export Settings </UiButton>
      <UiButton variant="outline" @click="() => document.getElementById('import-file').click()">
        Import Settings
      </UiButton>
      <UiButton variant="ghost" @click="resetToDefaults"> Reset to Defaults </UiButton>
    </div>

    <!-- Hidden file input for import -->
    <input
      id="import-file"
      type="file"
      accept=".json"
      @change="importPreferences"
      style="display: none"
    />
    </div>
  </div>
</template>

<style scoped>
.preferences-page {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.page-body {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.preferences-header {
  text-align: center;
  margin-bottom: 2rem;
}

.preferences-container {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

.preferences-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.nav-tab:hover {
  background: #f3f4f6;
}

.nav-tab.active {
  background: #3b82f6;
  color: white;
}

.tab-icon {
  font-size: 1.25rem;
}

.tab-label {
  font-weight: 500;
}

.preferences-content {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.panel-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 1.5rem 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notice-inline {
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 0.9rem;
  line-height: 1.5;
}
.setting-hint {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: #6b7280;
  line-height: 1.45;
}
.setting-select:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}
.setting-label {
  font-weight: 500;
  color: #374151;
  font-size: 0.875rem;
}

.setting-select,
.setting-input {
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  background: white;
}

.setting-select:focus,
.setting-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.setting-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  cursor: pointer;
}

.setting-checkbox input {
  margin: 0;
  margin-top: 2px;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  accent-color: var(--primary-color, #058526);
  cursor: pointer;
}

/* Each toggle now carries a one-line explanation of what it does. A setting
   whose effect you cannot predict is barely more useful than one that does
   nothing. */
.setting-checkbox > span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.setting-checkbox small {
  color: var(--text-muted, #6b7280);
  font-size: 0.79rem;
  line-height: 1.45;
}

/* A checkbox with a description needs the full row. */
.setting-wide {
  grid-column: 1 / -1;
}

.settings-note {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 1rem 0 0;
  padding: 0.7rem 0.85rem;
  border-radius: 0.6rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-color, #d1e7dd);
  color: #4b5563;
  font-size: 0.82rem;
  line-height: 1.55;
}
.settings-note .material-symbols-outlined {
  font-size: 19px;
  color: var(--primary-color, #058526);
  flex: 0 0 auto;
}
.settings-note kbd {
  font-family: inherit;
  font-size: 0.78rem;
  border: 1px solid #d1d5db;
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 4px;
  background: #fff;
}

.save-message {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 1rem 0 0;
  color: var(--primary-dark, #045c1a);
  font-weight: 600;
  font-size: 0.88rem;
}
.save-message .material-symbols-outlined {
  font-size: 20px;
}

.notification-sections {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.notification-section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 1rem 0;
}

.notification-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.notification-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.notification-checkbox input {
  margin: 0;
}

.preferences-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding-top: 2rem;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 768px) {
  .preferences-container {
    grid-template-columns: 1fr;
  }

  .preferences-nav {
    flex-direction: row;
    overflow-x: auto;
  }

  .nav-tab {
    white-space: nowrap;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .preferences-actions {
    flex-direction: column;
  }
}
</style>
