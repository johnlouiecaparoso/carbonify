<template>
  <div class="record-detail">
    <div v-if="mode === 'view'" class="view-mode">
      <div class="record-fields">
        <div v-for="field in visibleFields" :key="field.key" class="field-row">
          <label class="field-label">{{ field.label }}</label>
          <div class="field-value">
            <span v-if="field.type === 'date'">
              {{ formatDate(record[field.key]) }}
            </span>
            <span v-else-if="field.type === 'currency'">
              {{ formatCurrency(record[field.key]) }}
            </span>
            <span v-else-if="field.type === 'status'" :class="getStatusClass(record[field.key])">
              {{ record[field.key] }}
            </span>
            <span v-else-if="field.type === 'boolean'">
              {{ record[field.key] ? 'Yes' : 'No' }}
            </span>
            <span v-else-if="field.type === 'text' && field.key === 'description'">
              <div class="text-content">{{ record[field.key] }}</div>
            </span>
            <span v-else>
              {{ record[field.key] || '-' }}
            </span>
          </div>
        </div>
      </div>

      <div class="record-actions">
        <button @click="editMode" class="btn btn-primary">Edit Record</button>
      </div>
    </div>

    <div v-else class="edit-mode">
      <form @submit.prevent="saveRecord" class="edit-form">
        <div class="form-fields">
          <div v-for="field in editableFields" :key="field.key" class="field-row">
            <label class="field-label">{{ field.label }}</label>
            <div class="field-input">
              <input
                v-if="field.type === 'text' || field.type === 'email'"
                v-model="editData[field.key]"
                :type="field.type"
                class="input-field"
                :placeholder="field.placeholder"
              />
              <input
                v-else-if="field.type === 'number' || field.type === 'currency'"
                v-model.number="editData[field.key]"
                type="number"
                step="0.01"
                class="input-field"
                :placeholder="field.placeholder"
              />
              <select
                v-else-if="field.type === 'select'"
                v-model="editData[field.key]"
                class="input-field"
              >
                <option value="">{{ field.placeholder }}</option>
                <option v-for="option in field.options" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <textarea
                v-else-if="field.type === 'textarea'"
                v-model="editData[field.key]"
                class="input-field textarea-field"
                :placeholder="field.placeholder"
                rows="4"
              ></textarea>
              <input
                v-else
                v-model="editData[field.key]"
                type="text"
                class="input-field"
                :placeholder="field.placeholder"
              />
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" @click="cancelEdit" class="btn btn-secondary">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="loading-spinner"></span>
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from 'vue'

export default {
  name: 'RecordDetailView',
  props: {
    record: {
      type: Object,
      required: true,
    },
    table: {
      type: Object,
      required: true,
    },
    mode: {
      type: String,
      default: 'view',
      validator: (value) => ['view', 'edit'].includes(value),
    },
  },
  emits: ['save', 'cancel'],
  setup(props, { emit }) {
    const editData = ref({})
    const saving = ref(false)

    // Computed properties
    const visibleFields = computed(() => {
      return props.table.columns.filter((col) => col.key !== 'id')
    })

    const editableFields = computed(() => {
      return props.table.columns
        .filter((col) => {
          // Don't allow editing of ID and auto-generated fields
          const nonEditableFields = ['id', 'created_at', 'updated_at']
          return !nonEditableFields.includes(col.key)
        })
        .map((field) => ({
          ...field,
          options: getFieldOptions(field.key),
          placeholder: getFieldPlaceholder(field.key),
        }))
    })

    // Methods
    const getFieldOptions = (fieldKey) => {
      const optionMappings = {
        type: ['deposit', 'withdrawal', 'payment', 'refund'],
        status: props.table.statusOptions || ['pending', 'completed', 'failed', 'cancelled'],
        payment_method: ['gcash', 'maya', 'bpi', 'bdo'],
        currency: ['PHP', 'USD'],
        role: ['user', 'developer', 'verifier', 'admin'],
      }
      return optionMappings[fieldKey] || []
    }

    const getFieldPlaceholder = (fieldKey) => {
      const placeholderMappings = {
        user_id: 'Enter user ID',
        amount: 'Enter amount',
        description: 'Enter description',
        full_name: 'Enter full name',
        email: 'Enter email address',
        title: 'Enter title',
        location: 'Enter location',
        methodology: 'Enter methodology',
        price: 'Enter price',
        available_credits: 'Enter available credits',
        comments: 'Enter comments',
        verification_notes: 'Enter verification notes',
      }
      return placeholderMappings[fieldKey] || `Enter ${fieldKey}`
    }

    const editMode = () => {
      editData.value = { ...props.record }
      emit('edit')
    }

    const saveRecord = async () => {
      saving.value = true
      try {
        // Remove unchanged fields
        const changes = {}
        Object.keys(editData.value).forEach((key) => {
          if (editData.value[key] !== props.record[key]) {
            changes[key] = editData.value[key]
          }
        })

        if (Object.keys(changes).length > 0) {
          emit('save', { ...props.record, ...changes })
        } else {
          emit('cancel')
        }
      } catch (error) {
        console.error('Error saving record:', error)
      } finally {
        saving.value = false
      }
    }

    const cancelEdit = () => {
      editData.value = {}
      emit('cancel')
    }

    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString()
    }

    const formatCurrency = (amount) => {
      if (!amount) return '-'
      return `₱${parseFloat(amount).toLocaleString()}`
    }

    const getStatusClass = (status) => {
      const statusClasses = {
        pending: 'status-pending',
        completed: 'status-completed',
        failed: 'status-failed',
        cancelled: 'status-cancelled',
        active: 'status-active',
        approved: 'status-approved',
        rejected: 'status-rejected',
        paid: 'status-paid',
      }
      return statusClasses[status] || 'status-default'
    }

    // Watch for record changes
    watch(
      () => props.record,
      (newRecord) => {
        if (newRecord) {
          editData.value = { ...newRecord }
        }
      },
      { immediate: true },
    )

    return {
      editData,
      saving,
      visibleFields,
      editableFields,
      editMode,
      saveRecord,
      cancelEdit,
      formatDate,
      formatCurrency,
      getStatusClass,
    }
  },
}
</script>

<style scoped>
.record-detail {
  max-width: 100%;
}

.view-mode {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.record-fields {
  display: grid;
  gap: 1.5rem;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-weight: 600;
  color: #4a5568;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.field-value {
  padding: 0.75rem;
  background: #f7fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  min-height: 2.5rem;
  display: flex;
  align-items: center;
}

.text-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.edit-mode {
  display: flex;
  flex-direction: column;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form-fields {
  display: grid;
  gap: 1.5rem;
}

.field-input {
  display: flex;
  flex-direction: column;
}

.input-field {
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

.textarea-field {
  resize: vertical;
  min-height: 100px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.record-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.status-pending {
  color: #d69e2e;
  font-weight: 600;
}
.status-completed {
  color: #38a169;
  font-weight: 600;
}
.status-failed {
  color: #e53e3e;
  font-weight: 600;
}
.status-cancelled {
  color: #64748b;
  font-weight: 600;
}
.status-active {
  color: #3182ce;
  font-weight: 600;
}
.status-approved {
  color: #38a169;
  font-weight: 600;
}
.status-rejected {
  color: #e53e3e;
  font-weight: 600;
}
.status-paid {
  color: #38a169;
  font-weight: 600;
}
.status-default {
  color: #4a5568;
  font-weight: 600;
}

.loading-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3182ce;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2c5aa0;
}

.btn-secondary {
  background: #e2e8f0;
  color: #4a5568;
}

.btn-secondary:hover:not(:disabled) {
  background: #cbd5e0;
}

/* Responsive */
@media (max-width: 768px) {
  .form-actions,
  .record-actions {
    flex-direction: column;
  }

  .btn {
    justify-content: center;
  }
}
</style>
