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
  // Real Storage now, so it persists between tests unless cleared.
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    // Some environments seal Storage; a test that needs it will say so loudly.
  }
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

// localStorage is NOT mocked, deliberately. happy-dom already provides a real
// Storage, and the stub that used to sit here — { getItem: vi.fn(), … } —
// recorded calls and stored nothing, so `getItem` always returned undefined and
// any test that appeared to verify persistence verified nothing.
//
// The sharper half was the enumeration. Real Storage exposes its entries as own
// enumerable properties, so `Object.keys(localStorage)` lists the stored KEYS.
// On the stub it listed `['getItem','setItem','removeItem','clear']` — which is
// exactly what `userStore.clearLocalStorage()` iterates. It therefore matched
// nothing, removed nothing, and could not fail. Note that `sessionStorage` was
// never stubbed, so the two halves of that same loop behaved differently in
// tests for months.
//
// Storage is per-environment and shared across the tests in a file, so it is
// reset below rather than left to leak from one test into the next.

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








