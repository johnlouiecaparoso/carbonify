import { vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock Supabase client.
// Every export the real module has, or a service that switches to one of them
// fails with "is not a function" across every suite at once.
vi.mock('@/services/supabaseClient', () => {
  const client = () => ({
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    })),
    functions: {
      invoke: vi.fn(),
    },
  })
  return {
    getSupabase: vi.fn(client),
    getSupabaseAsync: vi.fn(async () => client()),
    initSupabase: vi.fn(async () => client()),
    resetSupabase: vi.fn(),
  }
})

// Mock environment variables
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key) => {
    const env = {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-key',
    }
    return env[key] || 'test-value'
  }),
}))

// Setup Pinia for testing
beforeEach(() => {
  setActivePinia(createPinia())
})

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:5173',
    href: 'http://localhost:5173',
    pathname: '/',
    search: '',
    hash: '',
  },
  writable: true,
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock fetch
global.fetch = vi.fn()

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))








