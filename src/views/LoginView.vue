<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import LoginForm from '@/components/auth/LoginForm.vue'

const route = useRoute()

// Set by RegisterForm on a successful signup. Without it the user lands on a
// bare sign-in form with no confirmation their account was created.
const showRegisteredBanner = computed(() => route.query.registered === '1')

// Signup succeeded but the account is not usable until the emailed link is
// clicked. Telling this user to "sign in to continue" sends them straight into
// an "email not confirmed" error with no explanation of why.
const showConfirmBanner = computed(() => route.query.confirm === '1')
</script>

<template>
  <div class="auth-layout">
    <section class="auth-hero">
      <div class="hero-card">
        <div class="brand">
          <div class="brand-badge">
            <div class="auth-logo-container">
              <img src="/carbonify-logo.png" alt="Carbonify" class="auth-logo-image" />
            </div>
          </div>
          <div class="brand-text">
            <h1 class="brand-title">CARBONIFY</h1>
            <p class="brand-subtitle">Connecting projects, verifiers, and impact-driven capital.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="auth-panel">
      <div class="panel-card">
        <div v-if="showConfirmBanner" class="success-banner" role="status">
          Account created. Check your inbox and click the confirmation link, then sign in.
        </div>
        <div v-else-if="showRegisteredBanner" class="success-banner" role="status">
          Account created. Sign in to continue.
        </div>
        <LoginForm />
        <div class="panel-footer">
          <span class="panel-desc">New to Carbonify?</span>
          <router-link class="muted-link" to="/register">Create an account</router-link>
        </div>
        <div class="panel-footer farmer-hint">
          <span class="panel-desc">Are you a farmer?</span>
          <router-link class="muted-link" to="/register/farmer">Register as a farmer</router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Enhanced Auth Layout with Modern Styling */
.auth-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #ffffff;
  position: relative;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .auth-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
}

/* Enhanced Auth Hero Section */
.auth-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--primary-color, #058526);
  color: white;
  /* Sticky on desktop so the brand panel stays visible while the form side
     scrolls if content ever exceeds the viewport. */
  position: sticky;
  top: 0;
  align-self: start;
  overflow: hidden;
  z-index: 1;
  height: 100vh;
}

.hero-card {
  max-width: 32rem;
  position: relative;
  z-index: 2;
}

.brand {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.brand-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}

/* Enhanced Logo Styling */
.auth-logo-container {
  height: 5rem !important;
  width: 5rem !important;
  min-width: 5rem !important;
  max-width: 5rem !important;
  min-height: 5rem !important;
  max-height: 5rem !important;
  border-radius: 50% !important;
  border: 2px solid rgba(209, 250, 229, 0.9);
  padding: 0;
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

.auth-logo-image {
  height: 100% !important;
  width: 100% !important;
  object-fit: cover !important;
  display: block !important;
  border-radius: 50% !important;
}

.brand-title {
  font-size: 3rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
  color: #ffffff;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.brand-subtitle {
  font-size: 1rem;
  margin: 0;
  color: #ffffff;
  font-weight: 400;
  line-height: 1.5;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* Enhanced Auth Panel */
.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  background: #ffffff;
  min-height: 100vh;
  overflow: visible;
  position: relative;
  z-index: 1;
}

/* Enhanced Panel Card */
.panel-card {
  width: 100%;
  max-width: 480px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: visible;
  position: relative;
  padding: 2rem;
  display: flex;
  flex-direction: column;
}

/* Success Banner */
.success-banner {
  margin: 0 0 1.5rem 0;
  padding: 1rem 1.25rem;
  border: 1px solid var(--primary-color, #058526);
  border-radius: 16px;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  color: var(--primary-dark, #045c1a);
  font-weight: 600;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  animation: slideInDown 0.5s ease-out;
}

.success-banner::before {
  content: '✓';
  background: var(--primary-color, #058526);
  color: white;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Enhanced Footer */
.farmer-hint {
  padding-top: 0.25rem;
  margin-top: 0;
}

.panel-footer {
  padding: 1rem 0 0 0;
  text-align: center;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.panel-desc {
  color: #6b7280;
  font-size: 0.875rem;
  margin: 0;
  font-weight: 400;
  line-height: 1.5;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.muted-link {
  color: var(--primary-color, #058526);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  transition: color 0.2s ease;
  line-height: 1.5;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.muted-link:hover {
  color: var(--primary-hover, #04701f);
}

/* Mobile responsive adjustments */
@media (max-width: 768px) {
  .auth-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    min-height: 100vh;
  }

  .auth-hero {
    padding: 1.5rem 1rem;
    min-height: auto;
    height: auto;
    /* stack normally on mobile — no sticky */
    position: static;
    align-self: auto;
  }

  .auth-panel {
    padding: 1rem;
    min-height: 0;
    height: auto;
    overflow: visible;
  }

  .panel-card {
    max-width: 100%;
    border-radius: 16px;
    padding: 1.5rem;
    overflow: visible;
  }

  .brand {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
  }

  .brand-title {
    font-size: 2.5rem;
  }

  .brand-subtitle {
    font-size: 0.875rem;
  }

  .auth-logo-container {
    width: 5rem !important;
    height: 5rem !important;
    min-width: 5rem !important;
    min-height: 5rem !important;
    max-width: 5rem !important;
    max-height: 5rem !important;
  }

  .panel-footer {
    padding: 1rem 0 0 0;
    gap: 0.5rem;
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .auth-hero {
    padding: 1rem;
  }

  .auth-panel {
    padding: 0.75rem;
  }

  .panel-card {
    border-radius: 16px;
    padding: 1.25rem;
  }

  .brand-title {
    font-size: 2rem;
  }

  .auth-logo-container {
    width: 4.5rem !important;
    height: 4.5rem !important;
    min-width: 4.5rem !important;
    min-height: 4.5rem !important;
    max-width: 4.5rem !important;
    max-height: 4.5rem !important;
  }

  .panel-footer {
    padding: 0.75rem 0 0 0;
    gap: 0.5rem;
    flex-direction: column;
  }
}
</style>
