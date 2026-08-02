<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <header class="header">
    <!--
      ONE header row, not two.

      This used to be a `.mobile-header-layout` and a `.desktop-header-layout`
      side by side, each with its own copy of the brand group, and only the
      desktop one carrying the avatar dropdown. That is why a phone had no way
      to reach profile, preferences, KYC, wallet, the tour or the user guide
      except by scrolling to the bottom of the sidebar drawer — the account
      block down there existed purely to make up for the missing menu.

      With a single row the avatar sits beside the cart at every width, the
      dropdown it opens is the same one on both, and the sidebar's account
      block can go away. The handful of genuine per-width differences are CSS
      (see .desktop-nav / .menu-btn--guest), which is where they belong.
    -->
    <div class="header-container">
      <div class="header-row">
        <!-- Menu button + logo. The button replaced the sidebar's own collapse
             control, so there is one place to widen or narrow the sidebar and
             it sits where a menu button is expected. Guests have no sidebar to
             toggle on desktop, so it is hidden there — but they still need it
             on a phone, where it opens the guest overlay menu. -->
        <div class="brand-group">
          <button
            class="menu-btn"
            :class="{ 'menu-btn--guest': !userStore.isAuthenticated }"
            type="button"
            :aria-label="menuButtonLabel"
            :aria-expanded="menuExpanded"
            @click="onMenuButtonClick"
          >
            <svg class="hamburger-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              ></path>
            </svg>
          </button>

          <router-link to="/" class="logo desktop-logo">
            <img src="/carbonify-logo.png" alt="Carbonify" class="brand-wordmark" />
          </router-link>
        </div>

        <!-- Desktop Navigation — guests only; the sidebar is the signed-in nav. -->
        <nav v-if="!userStore.isAuthenticated" class="desktop-nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="['nav-link', { active: isActive(item.path) }]"
          >
            {{ item.label }}
          </router-link>
        </nav>

        <!-- Cart, notifications, avatar — at every width. -->
        <div class="header-actions">
          <!-- Cart lives next to the bell so buyers have an ambient reminder that
             they have items pending; it used to be text buried in the profile
             dropdown, which meant a filled cart was effectively invisible. -->
          <router-link
            v-if="userStore.isAuthenticated && showCartIcon"
            to="/cart"
            class="cart-button"
            :aria-label="cartStore.count > 0 ? `Cart, ${cartStore.count} credits` : 'Cart'"
          >
            <span class="material-symbols-outlined" aria-hidden="true">shopping_cart</span>
            <span v-if="cartStore.count > 0" class="cart-badge">
              {{ cartStore.count > 99 ? '99+' : cartStore.count }}
            </span>
          </router-link>

          <div v-if="userStore.isAuthenticated" class="notifications-menu">
            <button class="notifications-button" @click="toggleNotificationMenu" type="button">
              <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
              <span v-if="unreadNotificationCount > 0" class="notifications-badge">
                {{ unreadNotificationCount > 99 ? '99+' : unreadNotificationCount }}
              </span>
            </button>
            <div v-if="showNotificationMenu" class="notifications-dropdown">
              <div class="notifications-header-row">
                <strong>Notifications</strong>
                <button
                  class="mark-all-read-btn"
                  type="button"
                  @click="markAllAsRead"
                  :disabled="unreadNotificationCount === 0"
                >
                  Mark all read
                </button>
              </div>

              <div v-if="notificationItems.length === 0" class="notifications-empty">
                No notifications yet.
              </div>

              <button
                v-for="notification in notificationItems"
                :key="notification.id"
                type="button"
                class="notification-item"
                :class="{ unread: !notification.is_read }"
                @click="openNotification(notification)"
              >
                <span class="notification-title">{{ notification.title }}</span>
                <span class="notification-message">{{ notification.message }}</span>
                <span class="notification-time">{{
                  formatNotificationTime(notification.created_at)
                }}</span>
              </button>
            </div>
          </div>

          <div v-if="userStore.isAuthenticated" class="user-menu">
            <div
              class="user-avatar user-avatar-thumb"
              :class="{ 'has-image': showAvatarImage, 'is-stale': userStore.profileFetchFailed }"
              @click="showUserMenu = !showUserMenu"
            >
              <img
                v-if="showAvatarImage"
                :src="avatarUrl"
                alt="User avatar"
                class="avatar-img"
                @error.stop="onAvatarError"
              />
              <span v-else class="avatar-initials">{{ avatarInitials }}</span>
              <!-- Ambient marker that the profile (and therefore the role/name
                   shown) couldn't be loaded and is being retried, so a briefly
                   stale role isn't silently mistaken for the real one. -->
              <span
                v-if="userStore.profileFetchFailed"
                class="avatar-status-dot"
                role="status"
                aria-label="Couldn't load your profile — retrying"
                title="Couldn't load your profile — retrying"
              ></span>
            </div>
            <!-- User Dropdown Menu -->
            <div v-if="showUserMenu" class="user-dropdown">
              <!-- Identity header -->
              <div class="dropdown-header">
                <div class="dropdown-avatar" :class="{ 'has-image': showAvatarImage }">
                  <img
                    v-if="showAvatarImage"
                    :src="avatarUrl"
                    alt="User avatar"
                    class="avatar-img"
                    @error.stop="onAvatarError"
                  />
                  <span v-else class="avatar-initials">{{ avatarInitials }}</span>
                </div>
                <div class="dropdown-identity">
                  <span class="dropdown-name">
                    {{ userStore.profile?.full_name || 'User' }}
                    <VerifiedBadge v-if="isKycVerified" type="kyc" icon-only />
                  </span>
                  <span class="dropdown-role" :data-role="userStore.role">
                    {{ getRoleDisplayName(userStore.role) }}
                  </span>
                </div>
              </div>

              <!-- Surfaced only while a profile fetch is failing: the name and
                   role above may be stale or defaulted. Without this the app
                   would silently show "User" and general_user permissions with
                   no hint that anything went wrong. -->
              <div
                v-if="userStore.profileFetchFailed"
                class="dropdown-stale-notice"
                role="status"
                aria-live="polite"
              >
                <span class="material-symbols-outlined dropdown-ico" aria-hidden="true"
                  >sync_problem</span
                >
                <span>Couldn't load your profile. Retrying — your role may be out of date.</span>
              </div>

              <div class="dropdown-body">
                <!-- One way back to the workspace. Everything else the user
                     might be hunting for is grouped there, not here. -->
                <router-link
                  :to="workspaceHome.path"
                  class="dropdown-item dropdown-item--workspace"
                  @click="showUserMenu = false"
                >
                  <span class="material-symbols-outlined dropdown-ico" aria-hidden="true">
                    {{ workspaceHome.icon || 'space_dashboard' }}
                  </span>
                  <span>{{ workspaceHome.label }}</span>
                </router-link>

                <div class="dropdown-divider" role="separator"></div>

                <router-link
                  v-for="link in accountItems"
                  :key="link.path"
                  :to="link.path"
                  class="dropdown-item"
                  @click="showUserMenu = false"
                >
                  <span class="material-symbols-outlined dropdown-ico" aria-hidden="true">{{
                    link.icon
                  }}</span>
                  <span>{{ link.label }}</span>
                </router-link>

                <div class="dropdown-divider" role="separator"></div>

                <button type="button" class="dropdown-item" @click="startTour">
                  <span class="material-symbols-outlined dropdown-ico" aria-hidden="true">tour</span>
                  <span>Take a tour</span>
                </button>

                <!-- Directly below the tour on purpose: the tour is a one-shot
                     modal, and this is the page you come back to. -->
                <router-link to="/guide" class="dropdown-item" @click="showUserMenu = false">
                  <span class="material-symbols-outlined dropdown-ico" aria-hidden="true"
                    >menu_book</span
                  >
                  <span>User guide</span>
                </router-link>

                <router-link to="/about" class="dropdown-item" @click="showUserMenu = false">
                  <span class="material-symbols-outlined dropdown-ico" aria-hidden="true"
                    >info</span
                  >
                  <span>About</span>
                </router-link>

                <!-- The one entry point every role has to "something is wrong".
                     It lives here rather than on a page because the pages where
                     things break are exactly the ones you cannot navigate away
                     from to find a report button. -->
                <button type="button" class="dropdown-item" @click="startReport">
                  <span class="material-symbols-outlined dropdown-ico" aria-hidden="true"
                    >support_agent</span
                  >
                  <span>Report a problem</span>
                </button>
              </div>

              <button @click="handleLogout" class="dropdown-item logout">
                <span class="material-symbols-outlined dropdown-ico" aria-hidden="true"
                  >logout</span
                >
                <span>Logout</span>
              </button>
            </div>
          </div>
          <div v-else class="auth-buttons">
            <router-link to="/login" class="auth-link">Login</router-link>
            <router-link to="/register" class="auth-link primary">Sign Up</router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile Menu Overlay — guests only. A signed-in user's hamburger opens
         the sidebar instead, which already holds every feature plus their
         account links, so this menu would be a second copy of it. -->
    <div
      v-if="mobileMenuOpen && !userStore.isAuthenticated"
      class="mobile-overlay"
      @click="mobileMenuOpen = false"
    >
      <div class="mobile-menu" @click.stop>
        <div class="mobile-content">
          <!-- Header with Logo and Close -->
          <div class="m-menu-head">
            <img src="/carbonify-logo.png" alt="Carbonify" class="m-menu-logo" />
            <button class="m-menu-close" @click="mobileMenuOpen = false" aria-label="Close menu">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <nav class="m-nav">
            <div class="m-section-label">Navigate</div>
            <router-link
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              @click="mobileMenuOpen = false"
              class="m-nav-item"
              :class="{ active: isActive(item.path) }"
            >
              <span>{{ item.label }}</span>
            </router-link>
          </nav>

          <!-- Footer actions -->
          <div class="m-foot">
            <router-link to="/login" class="m-auth-btn" @click="mobileMenuOpen = false"
              >Login</router-link
            >
            <router-link to="/register" class="m-auth-btn primary" @click="mobileMenuOpen = false"
              >Sign Up</router-link
            >
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { useCartStore } from '@/store/cartStore'
import { getRoleDisplayName } from '@/constants/roles'
import { buildGuestNav, buildAccountMenu, homeDestination } from '@/constants/navigation'
import { openReportProblem } from '@/constants/support'
import { useSidebar } from '@/composables/useSidebar'
import { performLogout } from '@/utils/logout'
import { safeInternalPath } from '@/utils/safeInternalPath'
import { getUserInitials } from '@/services/profileService'
import VerifiedBadge from '@/components/ui/VerifiedBadge.vue'
import { getSupabase } from '@/services/supabaseClient'
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/services/notificationService'

const route = useRoute()
const userStore = useUserStore()
const cartStore = useCartStore()
const isKycVerified = computed(() => Number(userStore.profile?.kyc_level) >= 2)

// Roles that never buy don't need a cart icon taking up header space. The
// router blocks them from /cart too (FINANCE_RESTRICTED_ROLES) — for a while
// this comment claimed that was already true when only the icon was hidden and
// the route was wide open.
const showCartIcon = computed(
  () => !(userStore.isAdmin || userStore.isVerifier || userStore.isProjectDeveloper),
)

const mobileMenuOpen = ref(false)
const showUserMenu = ref(false)
const showNotificationMenu = ref(false)
const avatarError = ref(false)
const notificationItems = ref([])
const notificationPollTimer = ref(null)
const notificationChannel = ref(null)

const { drawerOpen, collapsed, toggleDrawer, toggleCollapsed } = useSidebar()

// The sidebar renders as a persistent rail at this width and an off-canvas
// drawer below it — the same breakpoint AppSidebar's own media query uses.
const DESKTOP_QUERY = '(min-width: 1024px)'
const isDesktop = ref(false)
let desktopMedia = null

function syncIsDesktop(event) {
  isDesktop.value = event.matches
}

/**
 * One button, three jobs, decided by who is looking and how wide the screen is:
 *   signed-in desktop → widen/narrow the sidebar (this replaced the sidebar's
 *                       own collapse button, so the control is in one place)
 *   signed-in mobile  → open/close the sidebar drawer
 *   guest mobile      → open the marketing menu; guests have no sidebar
 */
function onMenuButtonClick() {
  if (!userStore.isAuthenticated) {
    mobileMenuOpen.value = !mobileMenuOpen.value
    return
  }
  if (isDesktop.value) {
    toggleCollapsed()
    return
  }
  toggleDrawer()
}

const menuButtonLabel = computed(() => {
  if (!userStore.isAuthenticated) return mobileMenuOpen.value ? 'Close menu' : 'Open menu'
  if (isDesktop.value) return collapsed.value ? 'Expand sidebar' : 'Collapse sidebar'
  return drawerOpen.value ? 'Close navigation' : 'Open navigation'
})

// Only meaningful for the two states that show or hide a panel. Collapsing the
// desktop rail narrows it rather than closing it, so it reports nothing.
const menuExpanded = computed(() => {
  if (!userStore.isAuthenticated) return String(mobileMenuOpen.value)
  if (isDesktop.value) return undefined
  return String(drawerOpen.value)
})

// Signed-out visitors only. Signed-in users navigate from the sidebar — a
// header nav plus a sidebar is two menus competing to be the place you look.
const navItems = computed(() => buildGuestNav())

// Avatar dropdown — your account only. Product features that used to live here
// (17 links across 7 scrolling sections) are in the sidebar now. The rule a
// user can learn: under your face is about YOU; the product is in the sidebar.
const accountItems = computed(() => buildAccountMenu(userStore))

// The dashboard the avatar menu links back to, labelled per role.
const workspaceHome = computed(() => homeDestination(userStore))

function isActive(path) {
  return route.path === path
}

function handleLogout() {
  showUserMenu.value = false
  performLogout(userStore)
}

// WelcomeTour (mounted at the app root) listens for this on the window.
function startTour() {
  showUserMenu.value = false
  window.dispatchEvent(new Event('carbonify:open-tour'))
}

// ReportProblemModal (also at the app root) listens for this one.
function startReport() {
  showUserMenu.value = false
  openReportProblem()
}

const avatarUrl = computed(() => {
  const profileAvatar = userStore.profile?.avatar_url || userStore.profile?.avatarUrl
  const metadata = userStore.session?.user?.user_metadata || {}
  const metadataAvatar = metadata.avatar_url || metadata.avatarUrl || metadata.avatar

  return profileAvatar || metadataAvatar || null
})

const showAvatarImage = computed(() => Boolean(avatarUrl.value && !avatarError.value))

const avatarInitials = computed(() => {
  const metadata = userStore.session?.user?.user_metadata || {}
  const name =
    userStore.profile?.full_name ||
    userStore.profile?.fullName ||
    metadata.full_name ||
    metadata.fullName ||
    metadata.name ||
    ''
  const fallback = userStore.session?.user?.email || 'User'

  return getUserInitials(name || fallback)
})

watch(avatarUrl, () => {
  avatarError.value = false
})

function onAvatarError() {
  avatarError.value = true
}

const unreadNotificationCount = computed(
  () => notificationItems.value.filter((notification) => !notification.is_read).length,
)

async function loadNotifications() {
  const userId = userStore.session?.user?.id
  if (!userStore.isAuthenticated || !userId) {
    notificationItems.value = []
    return
  }

  try {
    notificationItems.value = await getUserNotifications(userId, 20)
  } catch (error) {
    console.error('Failed to load notifications:', error)
  }
}

function stopNotificationSubscription() {
  const supabase = getSupabase()

  if (supabase && notificationChannel.value) {
    supabase.removeChannel(notificationChannel.value)
  }

  notificationChannel.value = null
}

function startNotificationSubscription() {
  stopNotificationSubscription()

  const supabase = getSupabase()
  const userId = userStore.session?.user?.id

  if (!supabase || !userStore.isAuthenticated || !userId) {
    return
  }

  notificationChannel.value = supabase
    .channel(`system_notifications_${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'system_notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        loadNotifications()
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'system_notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => {
        loadNotifications()
      },
    )
    .subscribe()
}

async function markAllAsRead() {
  const userId = userStore.session?.user?.id
  if (!userId || unreadNotificationCount.value === 0) return

  try {
    await markAllNotificationsAsRead(userId)
    notificationItems.value = notificationItems.value.map((item) => ({
      ...item,
      is_read: true,
      read_at: item.read_at || new Date().toISOString(),
    }))
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error)
  }
}

function toggleNotificationMenu() {
  showNotificationMenu.value = !showNotificationMenu.value
  showUserMenu.value = false

  if (showNotificationMenu.value) {
    loadNotifications()
  }
}

async function openNotification(notification) {
  const userId = userStore.session?.user?.id
  if (!notification || !userId) return

  try {
    if (!notification.is_read) {
      await markNotificationAsRead(notification.id, userId)
      notificationItems.value = notificationItems.value.map((item) =>
        item.id === notification.id
          ? { ...item, is_read: true, read_at: new Date().toISOString() }
          : item,
      )
    }

    showNotificationMenu.value = false
    // `link` is stored data, and system_notifications' INSERT policy lets any
    // signed-in user write a row addressed to anyone else — so an absolute URL
    // here would be an in-product phishing link aimed at whoever opens the bell.
    // Constrain it to a path inside the app. See DEFERRED_BACKLOG #36 for the
    // RLS half, which is the actual fix.
    const targetPath = safeInternalPath(notification.link, '/')
    if (route.path !== targetPath) {
      window.location.assign(targetPath)
    }
  } catch (error) {
    console.error('Failed to open notification:', error)
  }
}

function formatNotificationTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function startNotificationPolling() {
  if (notificationPollTimer.value) {
    clearInterval(notificationPollTimer.value)
  }

  if (!userStore.isAuthenticated) {
    return
  }

  notificationPollTimer.value = setInterval(() => {
    loadNotifications()
  }, 15000)
}

onMounted(() => {
  loadNotifications()
  startNotificationPolling()
  startNotificationSubscription()

  // matchMedia rather than a resize listener: it fires only when the breakpoint
  // is actually crossed, not on every pixel of a drag.
  if (typeof window !== 'undefined' && window.matchMedia) {
    desktopMedia = window.matchMedia(DESKTOP_QUERY)
    isDesktop.value = desktopMedia.matches
    desktopMedia.addEventListener('change', syncIsDesktop)
  }
})

onUnmounted(() => {
  if (notificationPollTimer.value) {
    clearInterval(notificationPollTimer.value)
    notificationPollTimer.value = null
  }

  stopNotificationSubscription()
  desktopMedia?.removeEventListener('change', syncIsDesktop)
})

watch(
  () => userStore.isAuthenticated,
  (isAuthenticated) => {
    if (!isAuthenticated) {
      notificationItems.value = []
      showNotificationMenu.value = false
    } else {
      loadNotifications()
    }
    startNotificationPolling()
    startNotificationSubscription()
  },
)

watch(
  () => userStore.session?.user?.id,
  () => {
    loadNotifications()
    startNotificationSubscription()
  },
)

watch(
  () => route.path,
  () => {
    showNotificationMenu.value = false
    showUserMenu.value = false
    loadNotifications()
  },
)
</script>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  border-bottom: 2px solid var(--border-green-light);
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-green);
}

.header-container {
  max-width: 100%;
  margin: 0;
  display: flex;
  height: 5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  position: relative;
  width: 100%;
}

/* Menu button + logo, one row.
   align-items:center on the row and equal box heights on both children is what
   keeps the three lines and the wordmark on a shared centre line — the two used
   to live in separate, independently padded sections at opposite ends. */
.brand-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
  padding: 0.5rem 1rem;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Matches .brand-wordmark's 2.25rem box, so neither child sets the row
     height and the two stay optically level whatever the logo does. */
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: var(--transition);
}

.menu-btn:hover {
  background: var(--bg-accent);
  color: var(--primary-color);
}

.menu-btn:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* Logo */
.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--text-primary);
}

/* Carbonify wordmark logo */
.brand-wordmark {
  height: 2.25rem;
  width: 2.25rem;
  display: block;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-green-light, rgba(209, 250, 229, 0.9));
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

/* The mobile size now comes from a media query on .brand-wordmark itself — the
   header no longer has a separate mobile logo element to hang a modifier on. */

.logo-container {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0.5rem 1rem;
  width: auto;
}

.logo-image-container {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  border: 3px solid var(--primary-color, #058526);
  padding: 0.35rem;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
  transition: all 0.3s ease;
  margin: 0;
}

.logo-image-container:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.3);
}

.logo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
}

.logo-name {
  font-weight: 800;
  font-size: 1.25rem;
  color: var(--primary-color, #058526);
  letter-spacing: 0.05em;
  text-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
}

.logo-buildings {
  position: absolute;
  bottom: 0.2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 0.15rem;
}

.building {
  background: #006400;
  border-radius: 0.1rem 0.1rem 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.1rem 0.05rem 0.05rem 0.05rem;
  gap: 0.05rem;
}

.building-left {
  width: 0.4rem;
  height: 0.8rem;
}

.building-right {
  width: 0.3rem;
  height: 0.6rem;
}

.window {
  width: 0.08rem;
  height: 0.08rem;
  background: #90ee90;
  border-radius: 0.02rem;
}

.logo-leaf {
  position: absolute;
  bottom: -0.1rem;
  left: 0.1rem;
  width: 0.3rem;
  height: 0.4rem;
  background: linear-gradient(45deg, #90ee90 0%, #228b22 100%);
  border-radius: 0 100% 0 100%;
  transform: rotate(-45deg);
}

.logo-leaf::before {
  content: '';
  position: absolute;
  top: 0.25rem;
  left: 0.1rem;
  width: 0.05rem;
  height: 0.15rem;
  background: #228b22;
  border-radius: 0.025rem;
}

.sparkles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.sparkle {
  position: absolute;
  background: #90ee90;
  border-radius: 50%;
  animation: sparkle 2s ease-in-out infinite;
}

.sparkle-1 {
  width: 0.08rem;
  height: 0.08rem;
  top: 0.2rem;
  right: 0.3rem;
  animation-delay: 0s;
}

.sparkle-2 {
  width: 0.06rem;
  height: 0.06rem;
  top: 0.4rem;
  left: 0.2rem;
  animation-delay: 0.5s;
}

.sparkle-3 {
  width: 0.05rem;
  height: 0.05rem;
  top: 0.1rem;
  left: 0.4rem;
  animation-delay: 1s;
}

.sparkle-4 {
  width: 0.07rem;
  height: 0.07rem;
  top: 0.5rem;
  right: 0.1rem;
  animation-delay: 1.5s;
}

@keyframes sparkle {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* Desktop Navigation */
.desktop-nav {
  display: none;
  align-items: center;
  gap: 0.5rem;
}

.nav-link {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-lg);
  position: relative;
}

/* Animated underline accent that grows on hover */
.nav-link::after {
  content: '';
  position: absolute;
  left: 0.9rem;
  right: 0.9rem;
  bottom: 0.3rem;
  height: 2px;
  border-radius: 2px;
  background: var(--primary-color);
  transform: scaleX(0);
  transform-origin: center;
  transition: transform 0.22s ease;
}

.nav-link:hover:not(.active) {
  color: var(--primary-dark);
  background: var(--bg-green-light);
  transform: translateY(-1px);
}

.nav-link:hover:not(.active)::after {
  transform: scaleX(1);
}

.nav-link.active {
  color: var(--text-light);
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  font-weight: 600;
  box-shadow: var(--shadow-green);
}

.nav-link.active:hover {
  background: linear-gradient(135deg, var(--primary-hover) 0%, var(--primary-dark) 100%);
  color: var(--text-light);
  transform: translateY(-1px);
}

/* Admin navigation items removed - admin features accessible via profile dropdown */

/* Desktop Actions */
/* Shown at every width — this is the row that carries the avatar menu, and a
   phone needs it more than a desktop does (there is no second copy of these
   links anywhere else on mobile any more). */
.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0;
  padding: 0.5rem 1rem;
  width: auto;
}

.notifications-menu {
  position: relative;
}

.cart-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  position: relative;
  text-decoration: none;
}

.cart-button .material-symbols-outlined {
  font-size: 1.2rem;
}

.cart-badge {
  position: absolute;
  top: -0.25rem;
  right: -0.35rem;
  min-width: 1rem;
  height: 1rem;
  border-radius: 999px;
  background: #058526;
  color: #fff;
  font-size: 0.6rem;
  line-height: 1rem;
  padding: 0 0.2rem;
  font-weight: 700;
}

.notifications-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  position: relative;
}

.notifications-button .material-symbols-outlined {
  font-size: 1.2rem;
}

.notifications-badge {
  position: absolute;
  top: -0.25rem;
  right: -0.35rem;
  min-width: 1rem;
  height: 1rem;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 0.6rem;
  line-height: 1rem;
  padding: 0 0.2rem;
  font-weight: 700;
}

.notifications-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: min(340px, calc(100vw - 1rem));
  max-height: 380px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
}

.notifications-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem;
  border-bottom: 1px solid var(--border-light);
}

.mark-all-read-btn {
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 0.75rem;
  cursor: pointer;
}

.mark-all-read-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.notifications-empty {
  padding: 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.notification-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0.75rem 0.85rem;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-item.unread {
  background: rgba(16, 185, 129, 0.08);
}

.notification-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notification-message {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.notification-time {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.user-menu {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.user-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
}

.user-role {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: capitalize;
}

.user-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition);
}

.user-avatar-thumb {
  overflow: hidden;
  position: relative;
  color: var(--text-light);
  font-weight: 600;
}

.user-avatar-thumb.has-image {
  background: transparent;
}

.user-avatar-thumb .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 50%;
}

.user-avatar-thumb .avatar-initials {
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 0.03em;
}

/* Stale-profile marker: overflow is hidden on the thumb, so the dot sits just
   outside it. The ring keeps it legible over either the initials background or
   a photo. */
.user-avatar-thumb.is-stale {
  overflow: visible;
}

.avatar-status-dot {
  position: absolute;
  top: -0.15rem;
  right: -0.15rem;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: #f59e0b;
  border: 2px solid var(--bg-primary);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
  animation: avatarStalePulse 1.6s ease-in-out infinite;
}

@keyframes avatarStalePulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-status-dot {
    animation: none;
  }
}

.user-avatar:hover {
  background: var(--bg-accent);
}

.avatar-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-muted);
}

.user-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.6rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-green-light);
  border-radius: var(--radius-xl);
  box-shadow:
    0 16px 40px rgba(5, 133, 38, 0.18),
    0 4px 12px rgba(0, 0, 0, 0.06);
  z-index: 1000;
  min-width: 16rem;
  max-width: 19rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: dropdownIn 0.16s ease;
}

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Identity header */
.dropdown-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.95rem 1rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: #fff;
  flex-shrink: 0;
}

.dropdown-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.45);
  color: #fff;
  font-weight: 700;
  overflow: hidden;
}

.dropdown-avatar .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.dropdown-avatar .avatar-initials {
  text-transform: uppercase;
  font-size: 0.95rem;
  letter-spacing: 0.03em;
}

.dropdown-identity {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dropdown-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-role {
  margin-top: 0.25rem;
  align-self: flex-start;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

/* Stale-profile notice, between the identity header and the account links. */
.dropdown-stale-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #92400e;
  background: #fffbeb;
  border-bottom: 1px solid var(--border-light);
}

.dropdown-stale-notice .dropdown-ico {
  color: #f59e0b;
  font-size: 1.05rem;
}

/* Account links between the identity header and logout. No scroll region and
   no section labels any more: the menu is short enough to read at a glance. */
.dropdown-body {
  flex: 1;
  padding: 0.35rem 0;
}

.m-nav::-webkit-scrollbar {
  width: 6px;
}

.m-nav::-webkit-scrollbar-thumb {
  background: var(--border-green-light);
  border-radius: 999px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.6rem 1rem;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    padding-left 0.15s ease;
  box-sizing: border-box;
  position: relative;
}

.dropdown-ico {
  font-size: 1.15rem;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.dropdown-item:hover {
  background: var(--bg-green-light);
  color: var(--primary-dark);
  padding-left: 1.25rem;
}

.dropdown-item:hover .dropdown-ico {
  color: var(--primary-color);
}

/* The one product link left in this menu — the way back to the workspace where
   the rest of the app is grouped. Weighted so it reads as the primary action. */
.dropdown-item--workspace {
  font-weight: 600;
}

.dropdown-item--workspace .dropdown-ico {
  color: var(--primary-color);
}

/* Logout pinned at the bottom, divided from the list */
.dropdown-item.logout {
  color: var(--text-secondary);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.dropdown-item.logout .dropdown-ico {
  color: #ef4444;
}

.dropdown-item.logout:hover {
  color: #dc2626;
  background: #fef2f2;
}

.dropdown-item.logout:hover .dropdown-ico {
  color: #dc2626;
}

/* Role-tinted pill colours in the dropdown header */
.dropdown-role[data-role='admin'] {
  background: rgba(255, 255, 255, 0.28);
}
.dropdown-role[data-role='verifier'] {
  background: rgba(255, 255, 255, 0.24);
}

/* Admin Dropdown Items */
.dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 0.5rem 0;
}

.dropdown-section-title {
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
}

.dropdown-item.admin-item {
  background: #f9fafb;
  color: #4b5563;
  border-left: 3px solid #9ca3af;
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-item.admin-item:hover {
  background: #e5e7eb;
  color: #374151;
  border-left-color: #6b7280;
}

.auth-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.auth-link {
  padding: 0.5rem 0.75rem;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: var(--transition);
}

.auth-link:hover {
  background: var(--bg-accent);
}

.auth-link.primary {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.auth-link.primary:hover {
  background: var(--primary-hover);
}

/* Mobile Header Layout */
/* The single header row. Replaces the old .mobile-header-layout /
   .desktop-header-layout pair — see the comment above the template. */
.header-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
}

.hamburger-icon {
  width: 1.4rem;
  height: 1.4rem;
  /* currentColor, so the icon picks up .menu-btn's hover colour. */
  color: currentColor;
}

.mobile-home-btn {
  background: var(--primary-color);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-lg);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
  transition: var(--transition);
  white-space: nowrap;
}

.mobile-home-btn:hover {
  background: var(--primary-hover);
  color: white;
}

/* Extra small screens */
@media (max-width: 480px) {
  .header-row {
    gap: 0.25rem;
  }

  .brand-group {
    gap: 0.4rem;
    padding-inline: 0.75rem;
  }

  .mobile-home-btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }

  .mobile-nav-item {
    font-size: 0.75rem;
    padding: 0.2rem 0.4rem;
  }

  .mobile-user-name {
    font-size: 0.7rem;
  }

  .mobile-user-role {
    font-size: 0.65rem;
  }

  .mobile-user-avatar {
    width: 1.5rem;
    height: 1.5rem;
  }

  .mobile-avatar-icon {
    width: 0.75rem;
    height: 0.75rem;
  }

  .mobile-auth-link {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .notifications-dropdown {
    right: -0.25rem;
    width: min(320px, calc(100vw - 0.75rem));
    max-height: min(70vh, 380px);
  }
}

/* Clean Mobile Menu Styles */
.mobile-menu-header-clean {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: #e8f5e8;
  border-radius: 8px;
  margin-bottom: 1rem;
  border-bottom: 2px solid #4caf50;
}

.mobile-menu-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.mobile-menu-title h3 {
  margin: 0;
  color: #2d5a2d;
  font-size: 1.1rem;
  font-weight: 600;
}

.mobile-menu-logo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.mobile-close-btn {
  background: none;
  border: none;
  color: #2d5a2d;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.mobile-close-btn:hover {
  background: rgba(45, 90, 45, 0.1);
}

.mobile-user-section-clean {
  margin-bottom: 1.5rem;
}

.user-info-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #e8f5e8;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.user-avatar {
  width: 40px;
  height: 40px;
  background: #4caf50;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-text {
  color: white;
  font-weight: bold;
  font-size: 1.1rem;
}

.user-details {
  flex: 1;
}

.user-name {
  font-weight: 600;
  color: #2d5a2d;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.user-role {
  font-size: 0.8rem;
  color: #666;
}

.nav-section-title {
  color: #2d5a2d;
  font-size: 0.9rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-links-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mobile-nav-link-clean {
  display: flex !important;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  text-decoration: none;
  color: #333;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.mobile-nav-link-clean:hover {
  background: #e8f5e8;
  border-color: #4caf50;
  color: #2d5a2d;
  transform: translateX(4px);
}

.nav-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.section-divider {
  height: 1px;
  background: #e9ecef;
  margin: 1rem 0;
}

.mobile-auth-section-clean {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid #e9ecef;
}

.logout-btn-clean {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn-clean:hover {
  background: #fecaca;
  transform: translateX(4px);
}

.login-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.login-link {
  background: #e8f5e8 !important;
  border-color: #e9ecef !important;
}

.signup-link {
  background: #4caf50 !important;
  border-color: #4caf50 !important;
  color: white !important;
}

.signup-link:hover {
  background: #45a049 !important;
  color: white !important;
}

/* Very small screens adjustments */
@media (max-width: 360px) {
  .brand-group,
  .header-actions {
    padding: 0.5rem 0.5rem;
  }

  .mobile-menu {
    width: 260px;
  }

  .mobile-menu-header-clean {
    padding: 0.75rem;
  }

  .mobile-search-clean {
    padding: 0.75rem;
  }

  .user-info-header {
    padding: 0.75rem;
  }

  .mobile-nav-link-clean {
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
  }

  .mobile-profile-header {
    padding: 0.5rem 0.75rem;
  }

  .mobile-profile-name {
    font-size: 1rem;
  }

  .mobile-nav-link {
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
  }
}

/* Mobile Menu Button */
.mobile-menu-button {
  display: none;
}

@media (max-width: 1024px) {
  .mobile-menu-button {
    display: block;
  }
}

/* Mobile Home Button */
.mobile-home-button {
  display: none;
}

@media (max-width: 1024px) {
  .mobile-home-button {
    display: block;
  }
}

.menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: var(--transition);
  border-radius: var(--radius-md);
}

.menu-toggle:hover {
  background: var(--bg-accent);
  color: var(--primary-color);
}

.menu-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-primary);
}

.home-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: var(--transition);
  border-radius: var(--radius-md);
  text-decoration: none;
}

.home-button:hover {
  background: var(--bg-accent);
  color: var(--primary-color);
}

.home-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-primary);
}

/* Mobile Menu Overlay */
.mobile-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  z-index: 9999 !important;
  background: rgba(0, 0, 0, 0.5) !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
}

.mobile-menu {
  position: relative !important;
  width: 300px !important;
  max-width: 90vw !important;
  height: 100vh !important;
  background: white !important;
  border-right: 2px solid #4caf50 !important;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) !important;
  z-index: 10000 !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
}

.mobile-content {
  display: flex !important;
  flex-direction: column;
  background: white !important;
  flex: 1;
  overflow-y: auto;
  width: 100%;
  height: 100%;
}

.mobile-header {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 2px solid #4caf50;
  margin-bottom: 1rem;
  background: #e8f5e8 !important;
  border-radius: 8px;
}

.mobile-title-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.mobile-title {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--primary-color);
  margin: 0;
}

.mobile-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition);
}

.mobile-close:hover {
  background: var(--bg-green-light);
  color: var(--primary-color);
}

.close-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.mobile-nav {
  display: flex !important;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0;
  flex: 1;
  overflow-y: auto;
  background: #f9f9f9 !important;
  border-radius: 8px;
  margin: 0.5rem 0;
}

.mobile-nav-link {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #333;
  text-decoration: none;
  transition: all 0.2s ease;
  font-weight: 500;
  font-size: 0.9rem;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  margin: 0.25rem 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 2.5rem;
}

.mobile-nav-link:hover {
  background: #e8f5e8;
  color: #2d5a2d;
  border-color: #4caf50;
  transform: translateX(4px);
}

.mobile-nav-link.active {
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.2);
}

/* Mobile User Profile Section */
.mobile-user-profile {
  margin-bottom: 0.5rem;
}

.mobile-profile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--primary-light);
  border-radius: var(--radius-md);
  margin: 0 0.5rem 0.5rem 0.5rem;
}

.mobile-profile-avatar {
  width: 3rem;
  height: 3rem;
  background: var(--primary-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.profile-avatar-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: white;
}

.mobile-profile-info {
  flex: 1;
}

.mobile-profile-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.mobile-profile-role {
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.mobile-profile-links {
  margin-bottom: 0.5rem;
}

.mobile-nav-link.profile-link {
  background: var(--bg-muted);
  border-color: var(--border-light);
  margin: 0.125rem 0.5rem;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  min-height: 2rem;
}

.mobile-nav-link.profile-link:hover {
  background: var(--primary-lighter);
  border-color: var(--primary-color);
}

.mobile-profile-divider {
  height: 1px;
  background: var(--border-color);
  margin: 0.5rem 1rem;
}

/* Mobile Auth Section */
.mobile-auth-section {
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-color);
}

.mobile-nav-link.logout-link {
  background: #fee2e2;
  border-color: #fecaca;
  color: #dc2626;
  margin: 0.25rem 0.5rem;
}

.mobile-nav-link.logout-link:hover {
  background: #fecaca;
  border-color: #dc2626;
}

.mobile-nav-link.auth-link {
  margin: 0.25rem 0.5rem;
}

.mobile-nav-link.auth-link.primary {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.mobile-nav-link.auth-link.primary:hover {
  background: var(--primary-hover);
}

/* Responsive Design */
@media (min-width: 768px) {
  .desktop-nav {
    display: flex;
  }

  .mobile-menu-button {
    display: none;
  }
}

/* Mobile Styles */
@media (max-width: 1024px) {
  .mobile-menu-button {
    display: block;
  }

  /* Guest links; a phone gets them from the overlay menu instead. */
  .desktop-nav {
    display: none;
  }

  /* Tighter on a phone: three icons plus the brand have to share ~360px. */
  .header-actions {
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
  }

  .brand-wordmark {
    height: 1.9rem;
    width: 1.9rem;
  }
}

/* A signed-out desktop visitor has no sidebar, so the hamburger would toggle
   nothing. On a phone the same button opens the guest overlay menu, so it is
   hidden by width rather than by `v-if`. */
@media (min-width: 1025px) {
  .menu-btn--guest {
    display: none;
  }
}

/* ============================================================
   Refreshed mobile drawer (grouped, icon-led, brand-consistent)
   ============================================================ */
.m-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.1rem;
  background: linear-gradient(135deg, var(--bg-green-light) 0%, var(--bg-secondary) 100%);
  border-bottom: 2px solid var(--border-green-light);
  flex-shrink: 0;
}

.m-menu-logo {
  height: 1.9rem;
  width: 1.9rem;
  display: block;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-green-light, rgba(209, 250, 229, 0.9));
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
}

.m-menu-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.18s ease;
}

.m-menu-close:hover {
  background: var(--error-light);
  color: var(--error-color);
  border-color: var(--error-color);
}

.m-menu-close .material-symbols-outlined {
  font-size: 1.2rem;
}

/* Identity card */
.m-user-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.9rem;
  padding: 0.85rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: #fff;
  flex-shrink: 0;
}

.m-user-avatar {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.45);
  font-weight: 700;
  overflow: hidden;
}

.m-user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.m-user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.m-user-name {
  font-size: 0.95rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.m-user-role {
  margin-top: 0.25rem;
  align-self: flex-start;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}

/* Grouped nav */
.m-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.6rem 0.5rem;
  display: flex;
  flex-direction: column;
}

.m-section-label {
  padding: 0.7rem 0.5rem 0.3rem;
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.m-nav-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.75rem;
  margin: 0.12rem 0;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  transition: all 0.18s ease;
}

.m-nav-item:hover {
  background: var(--bg-green-light);
  border-color: var(--border-green-light);
  color: var(--primary-dark);
  transform: translateX(3px);
}

.m-nav-item.active {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: #fff;
  border-color: var(--primary-color);
  font-weight: 600;
}

.m-nav-ico {
  font-size: 1.15rem;
  flex-shrink: 0;
  color: var(--text-muted);
}

.m-nav-item:hover .m-nav-ico {
  color: var(--primary-color);
}

/* Footer */
.m-foot {
  flex-shrink: 0;
  padding: 0.75rem 0.9rem 1rem;
  border-top: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.m-logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: var(--radius-md);
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.18s ease;
}

.m-logout:hover {
  background: #fecaca;
}

.m-logout .m-nav-ico {
  color: #dc2626;
}

.m-auth-btn {
  display: block;
  text-align: center;
  padding: 0.7rem 1rem;
  border-radius: var(--radius-md);
  background: var(--bg-green-light);
  border: 1px solid var(--border-green-light);
  color: var(--primary-dark);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  transition: all 0.18s ease;
}

.m-auth-btn.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.m-auth-btn.primary:hover {
  background: var(--primary-hover);
}
</style>
