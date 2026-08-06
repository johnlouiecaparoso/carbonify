<script setup>
/**
 * A native password input with a show/hide toggle.
 *
 * WHY THIS EXISTS SEPARATELY FROM UiInput
 * UiInput already has this toggle, so /login and /register have always had one.
 * But three password fields are plain `<input type="password">` on pages that do
 * NOT use UiInput, and each carries its own input class from its own stylesheet
 * (`form__input`, `form-input`, `sec-input`). Rewriting them onto UiInput would
 * restyle three forms to fix a missing button.
 *
 * So this takes the class it should render with and adds only the toggle. The
 * gap it closes is the one that matters most: RoleApplicationView is where a
 * Project Developer, Verifier or Farmer sets their account password, i.e. the
 * "register" page for every specialist role, and it was the one form where you
 * could not see what you had typed.
 */
import { ref } from 'vue'

defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: '' },
  name: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  // Password managers will not offer to save or fill without this.
  autocomplete: { type: String, default: 'current-password' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** The host page's own input class, passed straight through. */
  inputClass: { type: [String, Array, Object], default: '' },
  ariaDescribedby: { type: String, default: '' },
  ariaInvalid: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'input', 'blur', 'focus'])

const visible = ref(false)

function onInput(event) {
  emit('update:modelValue', event.target.value)
  emit('input', event)
}
</script>

<template>
  <div class="password-field">
    <input
      :id="id"
      :name="name"
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete || undefined"
      :required="required"
      :disabled="disabled"
      :aria-describedby="ariaDescribedby || undefined"
      :aria-invalid="ariaInvalid || undefined"
      :class="['password-field__input', inputClass]"
      @input="onInput"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    />

    <button
      type="button"
      class="password-field__toggle"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :aria-pressed="visible"
      :disabled="disabled"
      @click="visible = !visible"
    >
      <svg
        v-if="!visible"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
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
        aria-hidden="true"
      >
        <path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        ></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.password-field {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

/*
 * Two classes on purpose. The host page's own single-class rule (.form__input,
 * .form-input, .sec-input) usually sets `padding` as a shorthand; this has to
 * win on specificity rather than on stylesheet order, or a long password runs
 * underneath the button.
 */
.password-field .password-field__input {
  width: 100%;
  padding-right: 3.25rem;
}

.password-field__toggle {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted, #6b7280);
  padding: 0.25rem;
  border-radius: 4px;
  transition: color 0.2s ease, background 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 40px is the TAP TARGET, not the icon — the SVG stays 18px. Same floor as
     UiInput's toggle; see the note there for why it is set on this class alone
     rather than by a blanket min-height on every control. */
  width: 40px;
  height: 40px;
  z-index: 2;
}

.password-field__toggle:hover:not(:disabled) {
  color: var(--primary-color, #058526);
  background: rgba(5, 133, 38, 0.1);
}

.password-field__toggle:focus-visible {
  outline: 2px solid var(--primary-color, #058526);
  outline-offset: 2px;
}

.password-field__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
