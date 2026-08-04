<template>
  <div class="homepage">
    <!-- Hero Section -->
    <section class="hero-section">
      <div class="container">
        <div class="hero-content">
          <h1 class="hero-title">Trade Carbon Credits with Confidence</h1>
          <p class="hero-description">
            Connect with verified carbon projects worldwide. Make a real impact on climate change
            through transparent, high-quality carbon credits.
          </p>
        </div>

        <!-- Auth Actions (only show when not logged in) -->
        <div v-if="!store.isAuthenticated" class="auth-actions">
          <button @click="$router.push('/login')" class="auth-button primary">Sign In</button>
          <button @click="$router.push('/register')" class="auth-button secondary">Sign Up</button>
        </div>

        <!-- Role Applications CTA -->
        <div v-if="!store.isAuthenticated" class="role-apply">
          <div class="role-apply__content">
            <h3 class="role-apply__title">Join Carbonify as a Specialist</h3>
            <p class="role-apply__description">
              Apply to become a project developer or verifier and help scale trusted climate solutions.
            </p>
          </div>
          <div class="role-apply__buttons">
            <button
              class="role-apply__button developer"
              @click="handleRoleApplication('project_developer')"
            >
              Apply as Project Developer
            </button>
            <button class="role-apply__button verifier" @click="handleRoleApplication('verifier')">
              Apply as Verifier
            </button>
          </div>
        </div>

        <!-- Stats -->
        <div class="stats-grid">
          <div v-for="(stat, index) in stats" :key="index" class="stat-card">
            <div class="stat-icon" aria-hidden="true">
              <span class="material-symbols-outlined">{{ stat.icon }}</span>
            </div>
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Role-aware onboarding guide (authenticated users) -->
    <OnboardingGuide />

    <!-- Featured Projects -->
    <section class="featured-section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">Featured Projects</h2>
          <p class="section-description">
            Discover high-impact carbon projects from around the world
          </p>
        </div>

        <!-- Featured Project Carousel -->
        <div class="featured-carousel">
          <div class="featured-card">
            <div class="featured-image">
              <div class="featured-content">
                <h3 class="featured-title">
                  {{ featuredProjects[currentFeatured].name }}
                </h3>
                <p class="featured-location">{{ featuredProjects[currentFeatured].location }}</p>
              </div>
            </div>
            <div class="featured-details">
              <p class="featured-description">
                {{ featuredProjects[currentFeatured].description }}
              </p>
              <div class="featured-footer">
                <span class="featured-price">${{ featuredProjects[currentFeatured].price }}</span>
                <button class="featured-button">Learn More</button>
              </div>
            </div>
          </div>

          <!-- Carousel Indicators -->
          <div class="carousel-indicators">
            <!--
              These were empty <button>s: no text, no aria-label, no title, so
              they had NO accessible name at all (axe `button-name`, critical).
              A screen reader announced three controls as "button, button,
              button" with no way to tell which slide each one goes to, or which
              is current — the visual `.active` class carried information that
              existed nowhere in the accessibility tree.
            -->
            <button
              v-for="(project, index) in featuredProjects"
              :key="index"
              type="button"
              @click="currentFeatured = index"
              :class="['indicator', { active: index === currentFeatured }]"
              :aria-label="`Show featured project ${index + 1} of ${featuredProjects.length}${project?.title ? `: ${project.title}` : ''}`"
              :aria-current="index === currentFeatured ? 'true' : undefined"
            />
          </div>
        </div>

        <div class="section-footer">
          <button @click="$router.push('/marketplace')" class="explore-button">
            Explore More Projects
            <svg class="button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              ></path>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="how-it-works-section">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">How Carbonify Works</h2>
          <p class="section-description">Simple steps to make a positive climate impact</p>
        </div>

        <div class="steps-grid">
          <div v-for="(step, index) in steps" :key="index" class="step-card">
            <div class="step-icon" :style="{ backgroundColor: step.color }">
              <span class="step-number">{{ index + 1 }}</span>
            </div>
            <h3 class="step-title">{{ step.title }}</h3>
            <p class="step-description">{{ step.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="cta-section">
      <div class="container">
        <h2 class="cta-title">Ready to Make an Impact?</h2>
        <p class="cta-description">
          Join thousands of businesses and individuals taking climate action through verified carbon
          credits.
        </p>
        <div class="cta-buttons">
          <!-- Show auth buttons when not logged in -->
          <template v-if="!store.isAuthenticated">
            <button @click="$router.push('/login')" class="cta-button primary">Get Started</button>
            <button @click="$router.push('/register')" class="cta-button secondary">
              Create Account
            </button>
          </template>

          <!-- Show action buttons when logged in -->
          <template v-else>
            <button @click="$router.push('/marketplace')" class="cta-button primary">
              Browse Marketplace
            </button>
            <button
              v-if="store.isProjectDeveloper"
              @click="$router.push('/submit-project')"
              class="cta-button secondary"
            >
              <span class="material-symbols-outlined" aria-hidden="true">note_add</span>
              <span>Submit Project</span>
            </button>
          </template>
        </div>

        <!-- Show social media icons -->
        <div class="social-links">
          <h3 class="social-title">Follow Us</h3>
          <div class="social-icons">
            <a
              href="https://facebook.com/carbonify"
              target="_blank"
              class="social-icon facebook"
              aria-label="Facebook"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                />
              </svg>
            </a>
            <a
              href="https://twitter.com/carbonify"
              target="_blank"
              class="social-icon twitter"
              aria-label="Twitter"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"
                />
              </svg>
            </a>
            <a
              href="https://linkedin.com/company/carbonify"
              target="_blank"
              class="social-icon linkedin"
              aria-label="LinkedIn"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                />
              </svg>
            </a>
            <a
              href="https://instagram.com/carbonify"
              target="_blank"
              class="social-icon instagram"
              aria-label="Instagram"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { useUserStore } from '@/store/userStore'
import OnboardingGuide from '@/components/OnboardingGuide.vue'
import { getMarketStats } from '@/services/registryService'

export default {
  name: 'HomepageView',
  components: { OnboardingGuide },
  setup() {
    const store = useUserStore()
    return { store }
  },
  data() {
    return {
      currentFeatured: 0,
      // Live platform figures — filled from public_market_stats() on mount.
      // `key` maps to the RPC field; `value` shows '—' until real data loads.
      statsLoading: true,
      stats: [
        { label: 'Carbon Credits Retired', value: '—', icon: 'compost', key: 'total_retired' },
        { label: 'Active Projects', value: '—', icon: 'track_changes', key: 'listed_projects' },
        { label: 'Credits Available', value: '—', icon: 'inventory_2', key: 'credits_available' },
        { label: 'CO2 Reduced (tonnes)', value: '—', icon: 'monitoring', key: 'total_issued' },
      ],
      featuredProjects: [
        {
          id: 1,
          name: 'Amazon Rainforest Protection',
          location: 'Brazil',
          description:
            'Protecting 10,000 hectares of pristine Amazon rainforest from deforestation.',
          price: 25,
        },
        {
          id: 2,
          name: 'Solar Farm Development',
          location: 'India',
          description: 'Building a 50MW solar farm to replace coal-fired power generation.',
          price: 18,
        },
        {
          id: 3,
          name: 'Mangrove Restoration',
          location: 'Indonesia',
          description: 'Restoring coastal mangroves to sequester carbon and protect communities.',
          price: 32,
        },
      ],
      steps: [
        {
          title: 'Browse Projects',
          description:
            'Explore verified carbon projects across forestry, renewable energy, and blue carbon initiatives.',
          color: '#058526',
        },
        {
          title: 'Purchase Credits',
          description:
            'Buy carbon credits from projects that align with your values and sustainability goals.',
          color: '#04701f',
        },
        {
          title: 'Retire & Impact',
          description:
            'Retire your credits to offset emissions and receive verified certificates of your climate action.',
          color: '#045c1a',
        },
      ],
    }
  },
  async mounted() {
    await this.loadStats()
  },
  methods: {
    async loadStats() {
      try {
        const s = await getMarketStats()
        this.stats = this.stats.map((stat) => ({
          ...stat,
          value: this.formatCompact(s?.[stat.key]),
        }))
      } catch (error) {
        console.warn('Failed to load platform stats:', error?.message)
        // Leave the '—' placeholders rather than showing fake numbers.
      } finally {
        this.statsLoading = false
      }
    },
    formatCompact(n) {
      const num = Number(n)
      if (!Number.isFinite(num)) return '—'
      if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`
      if (num >= 1_000) return `${(num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1)}K`
      return num.toLocaleString()
    },
    handleRoleApplication(role) {
      try {
        const roleParam = role === 'verifier' ? 'verifier' : 'project_developer'
        this.$router.push({ name: 'role-application', query: { role: roleParam } })
      } catch (error) {
        console.error('Failed to navigate to role application:', error)
      }
    },
  },
}
</script>

<style scoped>
.homepage {
  min-height: 100vh;
}

.container {
  max-width: 100%;
  margin: 0;
  padding: 0;
  width: 100%;
}

/* Hero Section */
.hero-section {
  position: relative;
  padding: 8rem 2rem;
  background: linear-gradient(
    135deg,
    var(--bg-secondary) 0%,
    var(--bg-primary) 30%,
    var(--bg-tertiary) 100%
  );
  box-shadow: var(--shadow-green);
  min-height: 80vh;
  display: flex;
  align-items: center;
}

.hero-content {
  max-width: 100%;
  margin: 0 auto 3rem auto;
  text-align: center;
  padding: 0 2rem;
}

.hero-title {
  font-size: var(--font-size-6xl);
  font-weight: 800;
  margin-bottom: 2rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1.1;
  text-shadow: 0 4px 8px rgba(5, 133, 38, 0.2);
}

.hero-description {
  font-size: var(--font-size-lg);
  color: var(--text-muted);
  margin-bottom: 2rem;
  line-height: 1.6;
}

/* Auth Actions */
.auth-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 3rem;
}

.auth-button {
  padding: 0.75rem 2rem;
  border-radius: var(--radius-lg);
  font-weight: 600;
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: var(--transition);
  border: none;
  min-width: 8rem;
  box-shadow: var(--shadow-sm);
}

.auth-button.primary {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  color: var(--text-light);
  box-shadow: var(--shadow-green);
}

.auth-button.primary:hover {
  background: linear-gradient(135deg, var(--primary-hover) 0%, var(--primary-dark) 100%);
  transform: translateY(-2px);
  box-shadow: var(--shadow-green-lg);
}

.auth-button.secondary {
  background: var(--bg-primary);
  color: var(--primary-color);
  border: 2px solid var(--primary-color);
  box-shadow: var(--shadow-sm);
}

.auth-button.secondary:hover {
  background: var(--primary-color);
  color: var(--text-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow-green);
}

/* Role Apply CTA */
.role-apply {
  margin: 0 auto 3rem auto;
  padding: 2rem;
  max-width: 60rem;
  background: var(--bg-primary);
  border-radius: var(--radius-xl);
  border: 2px solid var(--border-green-light);
  box-shadow: var(--shadow-green);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  text-align: center;
}

.role-apply__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.role-apply__title {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--primary-color);
  margin: 0;
}

.role-apply__description {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-base);
}

.role-apply__buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

.role-apply__button {
  width: 100%;
  max-width: 22rem;
  padding: 0.85rem 1.5rem;
  border-radius: var(--radius-lg);
  border: none;
  font-weight: 600;
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: var(--transition);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-green);
}

.role-apply__button.developer {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  color: var(--text-light);
}

.role-apply__button.developer:hover {
  background: linear-gradient(135deg, var(--primary-hover) 0%, var(--primary-dark) 100%);
  transform: translateY(-2px);
}

.role-apply__button.verifier {
  background: var(--bg-primary);
  color: var(--primary-color);
  border: 2px solid var(--primary-color);
}

.role-apply__button.verifier:hover {
  background: var(--primary-color);
  color: var(--text-light);
  transform: translateY(-2px);
}

/* Stats Grid
 *
 * MOBILE-FIRST, which it was not. The base rule declared `repeat(4, 1fr)` —
 * applying at EVERY width — so four cards with 2rem of internal padding and
 * 2rem gaps were forced onto a 390px phone. Measured: the row came out 697px
 * wide and pushed the whole landing page sideways, on the first screen a
 * visitor sees.
 *
 * The giveaway is the `@media (min-width: 768px)` block below, which sets
 * `repeat(4, 1fr)` *again*. A redundant override means the base was intended to
 * be the small-screen case and was never written that way. Two columns on a
 * phone, four from 768px up.
 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  max-width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
}

.stat-card {
  text-align: center;
  background: var(--bg-primary);
  border-radius: var(--radius-xl);
  padding: 1.25rem 0.75rem;
  box-shadow: var(--shadow-green);
  border: 2px solid var(--border-green-light);
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-green-lg);
}

.stat-icon {
  width: 4rem;
  height: 4rem;
  color: var(--primary-color);
  margin: 0 auto 1rem auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary-light) 0%, var(--bg-green-light) 100%);
  border-radius: 50%;
  border: 2px solid var(--border-green-light);
}

.stat-icon .material-symbols-outlined {
  font-size: 2.4rem;
}

.stat-value {
  font-size: var(--font-size-4xl);
  font-weight: 800;
  color: var(--primary-color);
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.stat-label {
  font-size: var(--font-size-lg);
  color: var(--text-muted);
  font-weight: 600;
}

/* Featured Section */
.featured-section {
  padding: 4rem 0;
}

.section-header {
  text-align: center;
  margin-bottom: 3rem;
}

.section-title {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.section-description {
  font-size: var(--font-size-lg);
  color: var(--text-muted);
}

.featured-carousel {
  max-width: 28rem;
  margin: 0 auto 2rem auto;
}

.featured-card {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.featured-image {
  height: 12rem;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.featured-content {
  text-align: center;
  color: white;
}

.featured-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.featured-location {
  font-size: var(--font-size-sm);
  opacity: 0.9;
}

.featured-details {
  padding: 1.5rem;
}

.featured-description {
  color: var(--text-muted);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.featured-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.featured-price {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--primary-color);
}

.featured-button {
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition);
}

.featured-button:hover {
  background: var(--primary-hover);
}

.carousel-indicators {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
  gap: 0.5rem;
}

.indicator {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: var(--transition);
  background: #d1d5db;
}

.indicator.active {
  background: var(--primary-color);
}

.section-footer {
  text-align: center;
}

.explore-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: 1px solid var(--primary-color);
  background: transparent;
  color: var(--primary-color);
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
}

.explore-button:hover {
  background: var(--primary-color);
  color: white;
}

.button-icon {
  width: 1rem;
  height: 1rem;
}

/* How It Works Section */
.how-it-works-section {
  padding: 4rem 0;
  background: var(--bg-secondary);
}

.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  max-width: 64rem;
  margin: 0 auto;
}

.step-card {
  text-align: center;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
}

.step-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem auto;
}

.step-number {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: white;
}

.step-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.step-description {
  color: var(--text-muted);
  line-height: 1.5;
}

/* CTA Section */
.cta-section {
  padding: 4rem 0;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: white;
  text-align: center;
}

.cta-title {
  font-size: var(--font-size-3xl);
  font-weight: 700;
  margin-bottom: 1rem;
}

.cta-description {
  font-size: var(--font-size-lg);
  margin-bottom: 2rem;
  opacity: 0.9;
  line-height: 1.6;
}

.cta-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  justify-content: center;
  align-items: center;
}

.cta-button {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 999px;
  padding: 0.85rem 1.75rem;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cta-button .material-symbols-outlined {
  font-size: 1.25rem;
}

.cta-button.primary {
  background: white;
  color: var(--primary-color);
}

.cta-button.primary:hover {
  background: #f3f4f6;
}

.cta-button.secondary {
  background: transparent;
  color: white;
  border: 1px solid white;
}

.cta-button.secondary:hover {
  background: white;
  color: var(--primary-color);
}

/* Social Media Icons */
.social-links {
  text-align: center;
}

.social-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: white;
  margin-bottom: 1.5rem;
}

.social-icons {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.social-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  text-decoration: none;
  transition: var(--transition);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.social-icon:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.social-icon svg {
  width: 1.5rem;
  height: 1.5rem;
}

.social-icon.facebook:hover {
  background: #1877f2;
}

.social-icon.twitter:hover {
  background: #1da1f2;
}

.social-icon.linkedin:hover {
  background: #0077b5;
}

.social-icon.instagram:hover {
  background: linear-gradient(
    45deg,
    #f09433 0%,
    #e6683c 25%,
    #dc2743 50%,
    #cc2366 75%,
    #bc1888 100%
  );
}

/* Responsive Design */
@media (min-width: 768px) {
  .hero-title {
    font-size: var(--font-size-6xl);
  }

  .role-apply__buttons {
    flex-direction: row;
    justify-content: center;
  }

  .role-apply__button {
    max-width: none;
    min-width: 16rem;
  }

  /* Now a real override rather than a restatement of the base. */
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 2rem;
    padding: 0 2rem;
  }

  .stat-card {
    padding: 3rem 2rem;
  }

  .cta-buttons {
    flex-direction: row;
  }

  .social-icons {
    gap: 1.5rem;
  }

  .social-icon {
    width: 3.5rem;
    height: 3.5rem;
  }

  .social-icon svg {
    width: 1.75rem;
    height: 1.75rem;
  }
}

@media (max-width: 768px) {
  .hero-section {
    padding: 3rem 0;
  }

  .hero-title {
    font-size: var(--font-size-3xl);
  }

  .auth-actions {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .auth-button {
    width: 100%;
    max-width: 16rem;
  }

  .steps-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .featured-section,
  .how-it-works-section,
  .cta-section {
    padding: 3rem 0;
  }
}
</style>
