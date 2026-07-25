<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  id: { type: String, default: '' },
  size: { type: String, default: 'md' }, // sm | md | lg
  prefixIcon: { type: String, default: '' },
  suffixIcon: { type: String, default: '' },
  // Accessibility props
  ariaLabel: { type: String, default: '' },
  ariaDescribedby: { type: String, default: '' },
  ariaRequired: { type: Boolean, default: false },
  ariaInvalid: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // Lets password managers and mobile keyboards do their job. Without it, a
  // browser will not offer to save or fill credentials.
  autocomplete: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'input', 'blur', 'focus'])

const showPassword = ref(false)

const inputClasses = computed(() => [
  `enhanced-input--${props.size}`,
  props.error && 'enhanced-input--error',
  props.disabled && 'enhanced-input--disabled',
])

const inputFieldClasses = computed(() => [
  'enhanced-input__field',
  props.prefixIcon && 'enhanced-input__field--with-prefix',
  props.suffixIcon && 'enhanced-input__field--with-suffix',
  props.type === 'password' && 'enhanced-input__field--with-toggle',
])

function onInput(e) {
  emit('update:modelValue', e.target.value)
  emit('input', e)
}

function onBlur(e) {
  emit('blur', e)
}

function onFocus(e) {
  emit('focus', e)
}

function togglePasswordVisibility() {
  showPassword.value = !showPassword.value
}
</script>

<template>
  <div class="enhanced-input" :class="inputClasses">
    <label v-if="label" :for="id" class="enhanced-input__label">
      {{ label }}
      <span v-if="required" class="required-asterisk">*</span>
    </label>

    <div class="enhanced-input__wrapper">
      <span v-if="prefixIcon" class="enhanced-input__prefix-icon">{{ prefixIcon }}</span>

      <input
        :id="id"
        :type="type === 'password' ? (showPassword ? 'text' : 'password') : type"
        :autocomplete="autocomplete || undefined"
        :placeholder="placeholder"
        :value="modelValue"
        :aria-label="ariaLabel"
        :aria-describedby="ariaDescribedby"
        :aria-required="ariaRequired || required"
        :aria-invalid="ariaInvalid || !!error"
        :required="required"
        :disabled="disabled"
        :class="inputFieldClasses"
        @input="onInput"
        @blur="onBlur"
        @focus="onFocus"
      />

      <span v-if="suffixIcon" class="enhanced-input__suffix-icon">{{ suffixIcon }}</span>

      <button
        v-if="type === 'password'"
        type="button"
        class="enhanced-input__toggle-password"
        @click="togglePasswordVisibility"
        :aria-label="showPassword ? 'Hide password' : 'Show password'"
      >
        <svg
          v-if="!showPassword"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg
          v-else
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
          ></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      </button>
    </div>

    <div v-if="error || hint" class="enhanced-input__feedback">
      <small v-if="error" class="enhanced-input__error">{{ error }}</small>
      <small v-else-if="hint" class="enhanced-input__hint">{{ hint }}</small>
    </div>
  </div>
</template>

<style scoped>
/* Modern Enhanced Input Styles */
.enhanced-input {
  display: grid;
  gap: 0.75rem;
  position: relative;
}

.enhanced-input__label {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-primary, #1a202c);
  letter-spacing: 0.025em;
  margin-bottom: 0.5rem;
}

.required-asterisk {
  color: #ef4444;
  margin-left: 0.25rem;
}

.enhanced-input__wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.enhanced-input__field {
  width: 100%;
  max-width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 2px solid rgba(209, 231, 221, 0.6);
  background: rgba(255, 255, 255, 0.9);
  outline: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a202c);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.05),
    0 2px 6px rgba(5, 133, 38, 0.1);
  backdrop-filter: blur(10px);
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Removed hover transform to prevent layout issues */

.enhanced-input__field:focus {
  border-color: var(--primary-color, #058526);
  background: rgba(255, 255, 255, 1);
  box-shadow:
    0 0 0 4px rgba(5, 133, 38, 0.15),
    0 8px 25px rgba(0, 0, 0, 0.1),
    0 4px 15px rgba(5, 133, 38, 0.2);
}

.enhanced-input__field::placeholder {
  color: var(--text-muted, #9ca3af);
  font-weight: 400;
  font-style: normal;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 2rem);
  display: inline-block;
  padding-right: 0.5rem;
}

.enhanced-input__field:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: rgba(248, 250, 252, 0.8);
  border-color: rgba(209, 231, 221, 0.3);
}

/* Icon styling */
.enhanced-input__prefix-icon,
.enhanced-input__suffix-icon {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted, #6b7280);
  font-size: 18px;
  pointer-events: none;
}

.enhanced-input__prefix-icon {
  left: 1rem;
}

.enhanced-input__suffix-icon {
  right: 1rem;
}

/* Password toggle */
.enhanced-input__toggle-password {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #6b7280);
  padding: 0.25rem;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  z-index: 10;
}

.enhanced-input__toggle-password:hover {
  color: var(--primary-color, #058526);
  background: rgba(5, 133, 38, 0.1);
}

/* Removed hover effect to prevent layout issues */

/* Adjust padding for fields with icons */
.enhanced-input__field--with-prefix {
  padding-left: 2.5rem;
}

.enhanced-input__field--with-suffix {
  padding-right: 2.5rem;
}

.enhanced-input__field--with-toggle {
  padding-right: 3rem;
}

/* Ensure placeholder doesn't overlap with password toggle */
.enhanced-input__field--with-toggle::placeholder {
  max-width: calc(100% - 3.5rem);
  font-size: 11px;
  padding-right: 0.25rem;
}

/* Error state */
.enhanced-input--error .enhanced-input__field {
  border-color: #ef4444;
  background: rgba(254, 226, 226, 0.3);
}

.enhanced-input--error .enhanced-input__field:focus {
  border-color: #ef4444;
  box-shadow:
    0 0 0 4px rgba(239, 68, 68, 0.15),
    0 8px 25px rgba(0, 0, 0, 0.1),
    0 4px 15px rgba(239, 68, 68, 0.2);
}

.enhanced-input__feedback {
  margin-top: 0.5rem;
}

.enhanced-input__error {
  color: #ef4444;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.enhanced-input__hint {
  color: var(--text-muted, #6b7280);
  font-size: 14px;
  font-weight: 400;
}

/* Size variations */
.enhanced-input--sm .enhanced-input__field {
  padding: 0.75rem 1rem;
  font-size: 14px;
  border-radius: 12px;
}

.enhanced-input--lg .enhanced-input__field {
  padding: 1.25rem 1.5rem;
  font-size: 18px;
  border-radius: 20px;
}

/* Disabled state */
.enhanced-input--disabled .enhanced-input__field {
  opacity: 0.6;
  cursor: not-allowed;
  background: rgba(248, 250, 252, 0.8);
  border-color: rgba(209, 231, 221, 0.3);
  transform: none;
}

.enhanced-input--disabled .enhanced-input__field:hover,
.enhanced-input--disabled .enhanced-input__field:focus {
  transform: none;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.05),
    0 2px 6px rgba(5, 133, 38, 0.1);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .enhanced-input__field {
    padding: 0.625rem 0.75rem;
    font-size: 14px;
  }

  .enhanced-input--lg .enhanced-input__field {
    padding: 0.75rem 0.875rem;
    font-size: 15px;
  }

  .enhanced-input__field--with-prefix {
    padding-left: 2rem;
  }

  .enhanced-input__field--with-suffix {
    padding-right: 2rem;
  }

  .enhanced-input__field--with-toggle {
    padding-right: 2.5rem;
  }

  .enhanced-input__field::placeholder {
    font-size: 11px;
    max-width: calc(100% - 1.5rem);
    padding-right: 0.5rem;
  }

  .enhanced-input__field--with-toggle::placeholder {
    font-size: 10px;
    max-width: calc(100% - 2.5rem);
    padding-right: 0.25rem;
  }
}

/* Extra small screens */
@media (max-width: 480px) {
  .enhanced-input__field {
    padding: 0.5rem 0.625rem;
    font-size: 13px;
  }

  .enhanced-input__field--with-prefix {
    padding-left: 1.75rem;
  }

  .enhanced-input__field--with-suffix {
    padding-right: 1.75rem;
  }

  .enhanced-input__field--with-toggle {
    padding-right: 2.25rem;
  }

  .enhanced-input__field::placeholder {
    font-size: 10px;
    max-width: calc(100% - 1rem);
    padding-right: 0.25rem;
  }

  .enhanced-input__field--with-toggle::placeholder {
    font-size: 9px;
    max-width: calc(100% - 2rem);
    padding-right: 0.125rem;
  }
}

/* Legacy compatibility */
.ui-input {
  display: grid;
  gap: 8px;
}

.ui-input label {
  font-weight: 600;
  font-size: 14px;
}

.ui-input input {
  width: 100%;
  padding: 16px 24px;
  border-radius: var(--radius-xl, 1rem);
  border: 2px solid var(--primary-color, #058526);
  background: var(--bg-primary, #ffffff);
  outline: none;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary, #1a202c);
  transition: all 0.3s ease;
  box-shadow: var(--shadow-green, 0 4px 12px rgba(5, 133, 38, 0.15));
}

.ui-input input:focus {
  border-color: var(--primary-hover, #04701f);
  box-shadow:
    0 0 0 4px var(--primary-light, rgba(5, 133, 38, 0.2)),
    var(--shadow-green-lg, 0 8px 20px rgba(5, 133, 38, 0.3));
}

.ui-input input::placeholder {
  color: var(--text-muted, #64748b);
  font-weight: 400;
  font-style: italic;
}

.error {
  color: #b00020;
  font-weight: 600;
}
</style>
