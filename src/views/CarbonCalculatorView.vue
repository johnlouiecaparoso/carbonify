<template>
  <div class="carbon-calculator-page">
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-text">
            <h1 class="page-title">Carbon Credit Calculator</h1>
            <p class="page-description">
              Estimate emissions from electricity, fuel, and waste — then see how many credits to buy to offset them
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="calculator-content">
      <div class="container">
        <div class="calculator-grid">
          <!-- Inputs: Electricity, Fuel, Waste -->
          <section class="calculator-card inputs-card">
            <h2 class="card-title">
              <span class="material-symbols-outlined" aria-hidden="true">eco</span>
              Your activity (per year)
            </h2>
            <p class="card-hint">
              Enter consumption; we use Philippines grid and standard emission factors to get tonnes CO₂e.
            </p>

            <!-- Electricity -->
            <div class="form-group">
              <label for="electricity">Electricity consumption</label>
              <input
                id="electricity"
                v-model.number="inputs.electricityKwh"
                type="number"
                min="0"
                step="1"
                class="form-input"
                placeholder="0"
              />
              <span class="input-suffix">kWh/year</span>
              <span class="formula-hint">
                Emissions = kWh × {{ GRID_FACTOR }} (Philippines grid factor) ÷ 1,000 → tonnes CO₂e
              </span>
            </div>

            <!-- Fuel -->
            <div class="form-group">
              <label for="fuel-liters">Fuel consumption</label>
              <div class="fuel-row">
                <input
                  id="fuel-liters"
                  v-model.number="inputs.fuelLiters"
                  type="number"
                  min="0"
                  step="0.1"
                  class="form-input"
                  placeholder="0"
                />
                <select v-model="inputs.fuelType" class="form-select">
                  <option v-for="f in fuelOptions" :key="f.id" :value="f.id">{{ f.label }}</option>
                </select>
              </div>
              <span class="input-suffix">liters/year</span>
              <span class="formula-hint">
                Emissions = liters × {{ selectedFuelFactor }} (emission factor) ÷ 1,000 → tonnes CO₂e
              </span>
            </div>

            <!-- Waste -->
            <div class="form-group">
              <label for="waste">Waste generated</label>
              <input
                id="waste"
                v-model.number="inputs.wasteTonnes"
                type="number"
                min="0"
                step="0.1"
                class="form-input"
                placeholder="0"
              />
              <span class="input-suffix">tonnes/year</span>
              <span class="formula-hint">
                Emissions = waste × {{ WASTE_CH4_FACTOR }} (CH₄ factor) × {{ CH4_GWP }} (GWP of methane) → tonnes CO₂e
              </span>
            </div>

            <!-- Other (optional) -->
            <div class="form-group optional">
              <label for="other">Other emissions (optional)</label>
              <input
                id="other"
                v-model.number="inputs.otherCo2e"
                type="number"
                min="0"
                step="0.1"
                class="form-input"
                placeholder="0"
              />
              <span class="input-suffix">tonnes CO₂e/year (any other source)</span>
            </div>
          </section>

          <!-- Results -->
          <section class="calculator-card results-card">
            <h2 class="card-title">
              <span class="material-symbols-outlined" aria-hidden="true">calculate</span>
              Results
            </h2>

            <div class="result-breakdown">
              <div class="result-row">
                <span class="result-label">From electricity</span>
                <span class="result-value">{{ electricityCo2eFormatted }} t CO₂e</span>
              </div>
              <div class="result-row">
                <span class="result-label">From fuel</span>
                <span class="result-value">{{ fuelCo2eFormatted }} t CO₂e</span>
              </div>
              <div class="result-row">
                <span class="result-label">From waste</span>
                <span class="result-value">{{ wasteCo2eFormatted }} t CO₂e</span>
              </div>
              <div v-if="(inputs.otherCo2e || 0) > 0" class="result-row">
                <span class="result-label">Other</span>
                <span class="result-value">{{ otherCo2eFormatted }} t CO₂e</span>
              </div>
            </div>

            <div class="result-row total-emissions">
              <span class="result-label">Total emissions (CO₂e)</span>
              <span class="result-value">{{ totalEmissionsFormatted }} tonnes CO₂e/year</span>
            </div>

            <div class="result-row credits-needed">
              <span class="result-label">Credits to buy (1 credit ≈ 1 tonne CO₂e)</span>
              <span class="result-value highlight">{{ creditsToBuy }}</span>
            </div>

            <p v-if="creditsToBuy > 0" class="result-note">
              To offset your footprint, purchase at least
              <strong>{{ creditsToBuy }} carbon {{ creditNoun }}</strong> from the marketplace.
            </p>
            <p v-else class="result-note">
              Enter your activity above to see how many credits would offset it.
            </p>

            <div class="actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="creditsToBuy === 0"
                @click="goToMarketplace"
              >
                <span class="material-symbols-outlined" aria-hidden="true">shopping_cart</span>
                Buy {{ creditsToBuy }} {{ creditNoun }} in Marketplace
              </button>
              <button type="button" class="btn btn-outline" @click="reset">
                <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
                Reset
              </button>
            </div>
          </section>
        </div>

        <!-- Formulas reference -->
        <div class="info-block">
          <h3>Formulas used</h3>
          <ul>
            <li>
              <strong>Electricity:</strong> Total kWh × Philippines grid emission factor ({{ GRID_FACTOR }} kg CO₂/kWh) ÷ 1,000
              = tonnes CO₂e.
            </li>
            <li>
              <strong>Fuel:</strong> Liters used × emission factor for fuel type (e.g. diesel {{ FUEL_FACTORS.diesel }} kg CO₂/L, gasoline {{ FUEL_FACTORS.gasoline }} kg CO₂/L) ÷ 1,000
              = tonnes CO₂e.
            </li>
            <li>
              <strong>Waste:</strong> Total waste (tonnes) × methane emission factor ({{ WASTE_CH4_FACTOR }} t CH₄/t waste) × global warming potential of methane ({{ CH4_GWP }}) = tonnes CO₂e.
            </li>
            <li>
              One carbon credit ≈ one tonne CO₂e. Credits to buy = total tonnes CO₂e (rounded up).
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// Emission factors (Philippines / IPCC standards)
const GRID_FACTOR = 0.507 // kg CO2 per kWh (Philippines Luzon–Visayas grid, DOE)
const CH4_GWP = 28 // IPCC AR5 100-year GWP for methane
const WASTE_CH4_FACTOR = 0.052 // tonnes CH4 per tonne waste (IPCC default for managed solid waste)
const FUEL_FACTORS = {
  diesel: 2.68,
  gasoline: 2.31,
  lpg: 1.51,
}

const fuelOptions = [
  { id: 'diesel', label: 'Diesel' },
  { id: 'gasoline', label: 'Gasoline' },
  { id: 'lpg', label: 'LPG' },
]

const inputs = ref({
  electricityKwh: 0,
  fuelLiters: 0,
  fuelType: 'diesel',
  wasteTonnes: 0,
  otherCo2e: 0,
})

const selectedFuelFactor = computed(() => FUEL_FACTORS[inputs.value.fuelType] || FUEL_FACTORS.diesel)

// Each source is clamped to >= 0: the min="0" attribute doesn't stop a typed or
// pasted negative, and a negative in one field would otherwise cancel real
// emissions in another and understate the total.
function nonNeg(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Electricity: kWh × grid factor ÷ 1000 → tonnes CO2e
const electricityCo2e = computed(() => (nonNeg(inputs.value.electricityKwh) * GRID_FACTOR) / 1000)

// Fuel: liters × factor ÷ 1000 → tonnes CO2e
const fuelCo2e = computed(() => (nonNeg(inputs.value.fuelLiters) * selectedFuelFactor.value) / 1000)

// Waste: tonnes waste × CH4 factor × GWP → tonnes CO2e
const wasteCo2e = computed(() => nonNeg(inputs.value.wasteTonnes) * WASTE_CH4_FACTOR * CH4_GWP)

const otherCo2e = computed(() => nonNeg(inputs.value.otherCo2e))

const totalEmissions = computed(() => {
  return Math.max(
    0,
    electricityCo2e.value + fuelCo2e.value + wasteCo2e.value + otherCo2e.value,
  )
})

function fmt(n) {
  if (n === 0) return '0'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const electricityCo2eFormatted = computed(() => fmt(electricityCo2e.value))
const fuelCo2eFormatted = computed(() => fmt(fuelCo2e.value))
const wasteCo2eFormatted = computed(() => fmt(wasteCo2e.value))
const otherCo2eFormatted = computed(() => fmt(otherCo2e.value))

const totalEmissionsFormatted = computed(() => fmt(totalEmissions.value))

const creditsToBuy = computed(() => {
  const t = totalEmissions.value
  if (t <= 0) return 0
  return Math.ceil(t)
})

// "1 credit" not "1 credits".
const creditNoun = computed(() => (creditsToBuy.value === 1 ? 'credit' : 'credits'))

function goToMarketplace() {
  // Carry the computed tonnage across so the marketplace can pre-fill the
  // purchase quantity — otherwise the buyer has to remember the number and
  // retype it, which is the whole point of calculating it here.
  const credits = creditsToBuy.value
  router.push(credits > 0 ? { path: '/marketplace', query: { credits } } : '/marketplace')
}

function reset() {
  inputs.value = {
    electricityKwh: 0,
    fuelLiters: 0,
    fuelType: 'diesel',
    wasteTonnes: 0,
    otherCo2e: 0,
  }
}
</script>

<style scoped>
.carbon-calculator-page {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.page-header {
  background: linear-gradient(135deg, var(--primary-color, #069e2d) 0%, var(--primary-hover, #058e3f) 100%);
  color: white;
  padding: 2rem 0;
}

.header-content {
  text-align: center;
}

.page-title {
  margin: 0 0 0.5rem 0;
  font-size: 1.75rem;
  font-weight: 700;
}

.page-description {
  margin: 0;
  opacity: 0.95;
  font-size: 1rem;
}

.calculator-content {
  padding: 2rem 0;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1rem;
}

.calculator-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

@media (max-width: 768px) {
  .calculator-grid {
    grid-template-columns: 1fr;
  }
}

.calculator-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.5rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.card-title .material-symbols-outlined {
  font-size: 1.25rem;
  color: var(--primary-color, #069e2d);
}

.card-hint {
  margin: 0 0 1.25rem 0;
  font-size: 0.875rem;
  color: #6b7280;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group.optional .form-input::placeholder {
  color: #9ca3af;
}

.form-group label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color, #069e2d);
  box-shadow: 0 0 0 3px rgba(6, 158, 45, 0.15);
}

.fuel-row {
  display: flex;
  gap: 0.5rem;
}

.fuel-row .form-input {
  flex: 1;
}

.form-select {
  padding: 0.6rem 0.75rem;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  min-width: 120px;
}

.input-suffix {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.formula-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: #9ca3af;
  font-style: italic;
}

.result-breakdown {
  margin-bottom: 0.5rem;
}

.result-breakdown .result-row {
  border-bottom: none;
  padding: 0.4rem 0;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.75rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.result-row:last-of-type {
  border-bottom: none;
}

.result-row.total-emissions {
  border-top: 1px solid #e5e7eb;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  font-weight: 500;
}

.result-label {
  font-size: 0.9375rem;
  color: #4b5563;
}

.result-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.result-value.highlight {
  font-size: 1.5rem;
  color: var(--primary-color, #069e2d);
}

.result-note {
  margin: 1rem 0;
  padding: 1rem;
  background: var(--primary-light, #ecfdf5);
  border-radius: 8px;
  font-size: 0.9375rem;
  color: #065f46;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1.25rem;
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s, color 0.2s;
}

.btn .material-symbols-outlined {
  font-size: 1.125rem;
}

.btn-primary {
  background: var(--primary-color, #069e2d);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #058e3f);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-primary:disabled:hover {
  background: var(--primary-color, #069e2d);
}

.btn-outline {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-outline:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.info-block {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.info-block h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.info-block ul {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.9375rem;
  color: #4b5563;
  line-height: 1.6;
}

.info-block li {
  margin-bottom: 0.5rem;
}
</style>
