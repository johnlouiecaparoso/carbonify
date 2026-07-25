<script setup>
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { usePreferencesStore } from '@/store/preferencesStore'
import UiButton from '@/components/ui/Button.vue'

const preferencesStore = usePreferencesStore()

// Active tab
const activeTab = ref('theme')

const tabs = [
  { id: 'theme', label: 'Theme & Display', icon: '🎨' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'privacy', label: 'Privacy & Security', icon: '🔒' },
  { id: 'accessibility', label: 'Accessibility', icon: '♿' },
  { id: 'language', label: 'Language & Region', icon: '🌍' },
]

// Form data
const formData = ref({
  theme: preferencesStore.theme,
  language: preferencesStore.language,
  currency: preferencesStore.display.currency,
  dateFormat: preferencesStore.display.dateFormat,
  timeFormat: preferencesStore.display.timeFormat,
  itemsPerPage: preferencesStore.display.itemsPerPage,
  compactMode: preferencesStore.display.compactMode,
  animations: preferencesStore.display.animations,
  highContrast: preferencesStore.accessibility.highContrast,
  largeText: preferencesStore.accessibility.largeText,
  screenReader: preferencesStore.accessibility.screenReader,
  keyboardNavigation: preferencesStore.accessibility.keyboardNavigation,
  focusIndicators: preferencesStore.accessibility.focusIndicators,
  colorBlindSupport: preferencesStore.accessibility.colorBlindSupport,
})

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
  // Update theme
  preferencesStore.setTheme(formData.value.theme)

  // Update language
  preferencesStore.setLanguage(formData.value.language)

  // Update display settings
  preferencesStore.updateDisplaySettings({
    currency: formData.value.currency,
    dateFormat: formData.value.dateFormat,
    timeFormat: formData.value.timeFormat,
    itemsPerPage: formData.value.itemsPerPage,
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
    screenReader: formData.value.screenReader,
    keyboardNavigation: formData.value.keyboardNavigation,
    focusIndicators: formData.value.focusIndicators,
    colorBlindSupport: formData.value.colorBlindSupport,
  })

  // Show success message
  alert('Preferences saved successfully!')
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
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="preferences-content">
        <!-- Theme & Display -->
        <div v-if="activeTab === 'theme'" class="tab-panel">
          <h2 class="panel-title">Theme & Display</h2>

          <div class="settings-grid">
            <div class="setting-group">
              <label class="setting-label">Theme</label>
              <select v-model="formData.theme" class="setting-select">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Currency</label>
              <select v-model="formData.currency" class="setting-select">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Date Format</label>
              <select v-model="formData.dateFormat" class="setting-select">
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Time Format</label>
              <select v-model="formData.timeFormat" class="setting-select">
                <option value="12h">12-hour (AM/PM)</option>
                <option value="24h">24-hour</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Items per Page</label>
              <input
                v-model.number="formData.itemsPerPage"
                type="number"
                min="6"
                max="50"
                class="setting-input"
              />
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.compactMode" type="checkbox" />
                <span>Compact Mode</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.animations" type="checkbox" />
                <span>Enable Animations</span>
              </label>
            </div>
          </div>
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
                <span>High contrast mode</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.largeText" type="checkbox" />
                <span>Large text</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.screenReader" type="checkbox" />
                <span>Screen reader support</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.keyboardNavigation" type="checkbox" />
                <span>Enhanced keyboard navigation</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.focusIndicators" type="checkbox" />
                <span>Focus indicators</span>
              </label>
            </div>

            <div class="setting-group">
              <label class="setting-checkbox">
                <input v-model="formData.colorBlindSupport" type="checkbox" />
                <span>Color blind support</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Language & Region -->
        <div v-if="activeTab === 'language'" class="tab-panel">
          <h2 class="panel-title">Language & Region</h2>

          <div class="settings-grid">
            <div class="setting-group">
              <label class="setting-label">Language</label>
              <select v-model="formData.language" class="setting-select">
                <option
                  v-for="lang in preferencesStore.availableLanguages"
                  :key="lang.code"
                  :value="lang.code"
                >
                  {{ lang.flag }} {{ lang.name }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

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
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.setting-checkbox input {
  margin: 0;
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
