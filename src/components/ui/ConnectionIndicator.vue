<template>
  <div class="connection-indicator" :class="overallStatus">
    <div class="indicator-dot"></div>
    <span class="indicator-text">{{ statusText }}</span>
    <button v-if="showDetails" @click="toggleDetails" class="details-btn">
      {{ showFullDetails ? '−' : '+' }}
    </button>
  </div>

  <div v-if="showFullDetails" class="connection-details">
    <div v-for="service in services" :key="service.name" class="service-status">
      <span :class="['status-dot', service.status]"></span>
      <span class="service-name">{{ service.name }}</span>
      <span class="service-message">{{ service.message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getSupabase } from '@/services/supabaseClient'
import { projectService } from '@/services/projectService'
import { getWalletBalance } from '@/services/walletService'
import { getMarketplaceListings } from '@/services/marketplaceService'
import { useUserStore } from '@/store/userStore'

defineProps({
  showDetails: { type: Boolean, default: false },
  position: { type: String, default: 'bottom-right' }, // bottom-right, top-right, etc.
})

const services = ref([])
const showFullDetails = ref(false)
const loading = ref(false)

const userStore = useUserStore()

const overallStatus = computed(() => {
  if (loading.value) return 'loading'

  const connectedCount = services.value.filter((s) => s.status === 'connected').length
  const errorCount = services.value.filter((s) => s.status === 'error').length
  const totalCount = services.value.length

  // If all services are connected, we're good
  if (connectedCount === totalCount) return 'connected'

  // If we have any errors, that's a real issue
  if (errorCount > 0) return 'disconnected'

  // If we only have warnings (like not logged in), that's partial
  if (connectedCount > 0) return 'partial'

  return 'disconnected'
})

const statusText = computed(() => {
  switch (overallStatus.value) {
    case 'connected':
      return 'All systems connected'
    case 'partial':
      return 'All systems working'
    case 'disconnected':
      return 'Connection issues detected'
    case 'loading':
      return 'Checking connections...'
    default:
      return 'Unknown status'
  }
})

async function testConnections() {
  loading.value = true

  try {
    const results = await Promise.allSettled([
      testSupabase(),
      testProjectService(),
      testWalletService(),
      testMarketplaceService(),
      testUserStore(),
    ])

    services.value = [
      { name: 'Database', ...(results[0].value || { status: 'error', message: 'Failed' }) },
      { name: 'Projects', ...(results[1].value || { status: 'error', message: 'Failed' }) },
      { name: 'Wallet', ...(results[2].value || { status: 'error', message: 'Failed' }) },
      { name: 'Marketplace', ...(results[3].value || { status: 'error', message: 'Failed' }) },
      { name: 'Auth', ...(results[4].value || { status: 'error', message: 'Failed' }) },
    ]
  } catch (error) {
    console.error('Connection test failed:', error)
  } finally {
    loading.value = false
  }
}

async function testSupabase() {
  try {
    const supabase = getSupabase()
    if (!supabase) return { status: 'error', message: 'Not initialized' }

    const { error } = await supabase.from('profiles').select('count').limit(1)
    if (error) return { status: 'error', message: error.message }

    return { status: 'connected', message: 'Connected' }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}

async function testProjectService() {
  try {
    const stats = await projectService.getProjectStats()
    return { status: 'connected', message: `${stats.total} projects` }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}

async function testWalletService() {
  try {
    const wallet = await getWalletBalance()
    return { status: 'connected', message: `$${wallet.current_balance}` }
  } catch (error) {
    // Don't treat "User not authenticated" as a real issue
    if (error.message.includes('User not authenticated')) {
      return { status: 'connected', message: 'Not logged in' }
    }
    return { status: 'warning', message: 'No wallet' }
  }
}

async function testMarketplaceService() {
  try {
    const listings = await getMarketplaceListings()
    return { status: 'connected', message: `${listings.length} listings` }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}

async function testUserStore() {
  try {
    return {
      status: userStore.isAuthenticated ? 'connected' : 'warning',
      message: userStore.isAuthenticated ? 'Logged in' : 'Not logged in',
    }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}

function toggleDetails() {
  showFullDetails.value = !showFullDetails.value
}

onMounted(() => {
  testConnections()

  // Refresh every 30 seconds
  setInterval(testConnections, 30000)
})
</script>

<style scoped>
.connection-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  font-size: 0.875rem;
  z-index: 1000;
  transition: all 0.3s ease;
}

.connection-indicator.connected {
  border-left: 4px solid var(--success-color, #058526);
}

.connection-indicator.partial {
  border-left: 4px solid #f59e0b;
}

.connection-indicator.disconnected {
  border-left: 4px solid #ef4444;
}

.connection-indicator.loading {
  border-left: 4px solid #6b7280;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  animation: pulse 2s infinite;
}

.connection-indicator.connected .indicator-dot {
  background: var(--success-color, #058526);
  animation: none;
}

.connection-indicator.partial .indicator-dot {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.connection-indicator.disconnected .indicator-dot {
  background: #ef4444;
  animation: pulse 0.5s infinite;
}

.indicator-text {
  color: #374151;
  font-weight: 500;
}

.details-btn {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.details-btn:hover {
  color: #374151;
}

.connection-details {
  position: fixed;
  bottom: 4rem;
  right: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 1rem;
  min-width: 250px;
  z-index: 999;
}

.service-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.875rem;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6b7280;
}

.status-dot.connected {
  background: var(--success-color, #058526);
}

.status-dot.warning {
  background: #f59e0b;
}

.status-dot.error {
  background: #ef4444;
}

.service-name {
  font-weight: 500;
  color: #374151;
  min-width: 80px;
}

.service-message {
  color: #6b7280;
  font-size: 0.75rem;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Position variants */
.connection-indicator.top-right {
  top: 1rem;
  bottom: auto;
}

.connection-indicator.top-left {
  top: 1rem;
  right: auto;
  left: 1rem;
}

.connection-indicator.bottom-left {
  bottom: 1rem;
  right: auto;
  left: 1rem;
}
</style>
