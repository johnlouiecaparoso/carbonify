<template>
  <div class="about-view">
    <!-- Hero -->
    <section class="about-hero">
      <div class="container">
        <h1 class="hero-title">About Carbonify</h1>
        <p class="hero-tagline">
          A carbon-credit marketplace connecting project developers, verifiers, buyers, and local
          governments — so verified climate impact can be funded, traded, and retired with trust.
        </p>
      </div>
    </section>

    <div class="container about-body">
      <!-- Mission -->
      <section class="about-section">
        <h2>Our Mission</h2>
        <p>
          Carbonify makes high-integrity carbon credits accessible. Real projects are submitted,
          independently validated, and only then issued as credits that buyers can purchase and
          retire — each backed by a verifiable certificate. We bring transparency to a market that
          badly needs it.
        </p>
      </section>

      <!-- How it works -->
      <section class="about-section">
        <h2>How It Works</h2>
        <div class="steps">
          <div v-for="(step, i) in steps" :key="step.title" class="step-card">
            <div class="step-num">{{ i + 1 }}</div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.body }}</p>
          </div>
        </div>
      </section>

      <!-- Roles -->
      <section class="about-section">
        <h2>Who It's For</h2>
        <div class="role-grid">
          <div v-for="role in roles" :key="role.name" class="role-card">
            <span class="material-symbols-outlined role-icon" aria-hidden="true">{{ role.icon }}</span>
            <h3>{{ role.name }}</h3>
            <p>{{ role.body }}</p>
          </div>
        </div>
      </section>

      <!-- Trust -->
      <section class="about-section">
        <h2>Built for Trust</h2>
        <ul class="trust-list">
          <li v-for="point in trust" :key="point">{{ point }}</li>
        </ul>
      </section>

      <!-- CTA -->
      <section class="about-cta">
        <h2>Ready to get started?</h2>
        <div class="cta-actions">
          <router-link to="/marketplace" class="cta-btn primary">Browse the Marketplace</router-link>
          <router-link to="/register" class="cta-btn">Create an account</router-link>
          <router-link to="/apply" class="cta-btn ghost">Apply as Developer / Verifier</router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
const steps = [
  { title: 'Submit', body: 'Project developers submit climate projects with documentation, baseline, and methodology.' },
  { title: 'Validate', body: 'Accredited verifiers review each project against a structured rubric and approve, reject, or request revisions.' },
  { title: 'Monitor & Issue', body: 'Verified emission reductions from monitoring reports mint carbon credits into the active pool.' },
  { title: 'Trade & Retire', body: 'Buyers purchase credits on the marketplace, then retire them for a verifiable, QR-checkable certificate.' },
]

const roles = [
  { name: 'Project Developers', icon: 'eco', body: 'List projects, track verification, and earn from issued credits.' },
  { name: 'Verifiers', icon: 'fact_check', body: 'Review submissions with a validation checklist and SLA-tracked queue.' },
  { name: 'Buyers & Investors', icon: 'shopping_cart', body: 'Discover, save, and purchase credits; build and retire a portfolio.' },
  { name: 'Local Governments', icon: 'map', body: 'Track municipal emissions, endorse community projects, and export ESG reports.' },
  { name: 'Administrators', icon: 'tune', body: 'Manage users, KYC tiers, fees, and emission factors across the platform.' },
]

const trust = [
  'Server-authoritative payments — amounts are computed on the server, never the client.',
  'Double-entry ledger and reconciliation behind every transaction.',
  'KYC/KYB verification with visible badges for verified members.',
  'QR + SHA-256 certificates with a public verification page.',
  'Role-based access control and row-level security throughout.',
]
</script>

<style scoped>
.about-view {
  padding-bottom: 4rem;
}
.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 1rem;
}
.about-hero {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  padding: 3.5rem 0;
  text-align: center;
  margin-bottom: 2.5rem;
}
.hero-title {
  font-size: 2.2rem;
  margin: 0 0 0.75rem;
  color: #fff;
}
.hero-tagline {
  max-width: 680px;
  margin: 0 auto;
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.05rem;
  line-height: 1.6;
}
.about-section {
  margin-bottom: 2.75rem;
}
.about-section h2 {
  font-size: 1.4rem;
  margin: 0 0 1rem;
}
.about-section p {
  color: #374151;
  line-height: 1.65;
}
.steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}
.step-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  background: #fff;
}
.step-num {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #058526;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  margin-bottom: 0.6rem;
}
.step-card h3 {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
}
.step-card p {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.role-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  background: #fff;
}
.role-icon {
  color: #058526;
  font-size: 1.8rem;
}
.role-card h3 {
  margin: 0.4rem 0 0.3rem;
  font-size: 1.05rem;
}
.role-card p {
  font-size: 0.85rem;
  color: #6b7280;
  margin: 0;
}
.trust-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
}
.trust-list li {
  position: relative;
  padding-left: 1.75rem;
  margin-bottom: 0.6rem;
  color: #374151;
  line-height: 1.5;
}
.trust-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #058526;
  font-weight: 700;
}
.about-cta {
  text-align: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 2.5rem 1.5rem;
}
.about-cta h2 {
  margin: 0 0 1.25rem;
}
.cta-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}
.cta-btn {
  padding: 0.7rem 1.3rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  border: 1px solid #d1d5db;
  color: #374151;
  background: #fff;
}
.cta-btn.primary {
  background: #058526;
  border-color: #058526;
  color: #fff;
}
.cta-btn.ghost {
  background: transparent;
}
</style>
