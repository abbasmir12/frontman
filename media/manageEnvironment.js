(function () {
  const vscode = acquireVsCodeApi();

  // State
  let environments = [];
  let currentEnvironment = null;
  let filteredVariables = [];

  // DOM elements
  let envTitle, envStatus, filterInput, variablesTbody;

  // Initialize
  function init() {
    console.log('Manage Environment Panel initializing...');
    
    // Get DOM elements
    envTitle = document.getElementById('env-title');
    envStatus = document.getElementById('env-status');
    filterInput = document.getElementById('filter-input');
    variablesTbody = document.getElementById('variables-tbody');

    // Event listeners
    setupEventListeners();

    // Request initial data
    vscode.postMessage({ command: 'getEnvironments' });
  }

  function setupEventListeners() {
    // Header buttons
    document.getElementById('refresh-btn').addEventListener('click', () => {
      console.log('Refresh clicked');
      vscode.postMessage({ command: 'getEnvironments' });
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      console.log('Export clicked');
      if (currentEnvironment) {
        vscode.postMessage({
          command: 'exportEnvironment',
          payload: { id: currentEnvironment.id, name: currentEnvironment.name }
        });
      }
    });

    document.getElementById('delete-btn').addEventListener('click', () => {
      console.log('Delete clicked');
      if (currentEnvironment) {
        // Use a simple approach - just delete without confirmation for now
        console.log('Deleting environment:', currentEnvironment.name, 'ID:', currentEnvironment.id);
        vscode.postMessage({
          command: 'deleteEnvironment',
          payload: { id: currentEnvironment.id }
        });
      } else {
        console.log('No current environment to delete');
      }
    });

    // Environment title rename
    if (envTitle) {
      envTitle.addEventListener('blur', (e) => {
        const newName = e.target.value.trim();
        if (newName && currentEnvironment && newName !== currentEnvironment.name) {
          vscode.postMessage({
            command: 'renameEnvironment',
            payload: { id: currentEnvironment.id, newName }
          });
        }
      });
    }

    // Filter input
    if (filterInput) {
      filterInput.addEventListener('input', handleFilter);
    }

    // Bulk action buttons
    document.getElementById('enable-all-btn').addEventListener('click', enableAllVariables);
    document.getElementById('disable-all-btn').addEventListener('click', disableAllVariables);
    document.getElementById('clear-values-btn').addEventListener('click', clearAllValues);
    document.getElementById('reset-values-btn').addEventListener('click', resetAllValues);

    // Select all checkbox
    document.getElementById('select-all-checkbox').addEventListener('change', toggleSelectAll);
  }

  // Message handler
  window.addEventListener('message', (event) => {
    console.log('Message received:', event.data);
    const message = event.data;

    switch (message.command) {
      case 'environmentsData':
        console.log('Processing environments data:', message.payload);
        environments = message.payload.environments || [];
        currentEnvironment = message.payload.selectedEnvironment;
        
        console.log('Environment data processed:', {
          environmentsCount: environments.length,
          currentEnvironment: currentEnvironment ? currentEnvironment.name : 'none'
        });
        
        renderEnvironmentContent();
        break;
        
      case 'setCurrentEnvironment':
        const envId = message.payload.environmentId;
        currentEnvironment = environments.find(e => e.id === envId);
        renderEnvironmentContent();
        break;
        
      case 'showError':
        console.error('Error from extension:', message.payload.message);
        alert('Error: ' + message.payload.message);
        break;
        
      case 'exportedEnvironment':
        downloadJson(message.payload.json, message.payload.filename);
        break;
    }
  });

  function renderEnvironmentContent() {
    console.log('Rendering environment content for:', currentEnvironment?.name);
    
    if (!currentEnvironment) {
      renderEmptyContent();
      return;
    }

    updateTitle(currentEnvironment.name);
    updateStatus(true);
    filteredVariables = [...(currentEnvironment.variables || [])];
    renderVariablesTable();
  }

  function renderEmptyContent() {
    console.log('Rendering empty content');
    updateTitle('');
    updateStatus(false);
    
    if (variablesTbody) {
      variablesTbody.innerHTML = `
        <tr class="empty-state">
          <td colspan="6">
            <div class="empty-content">
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div class="empty-title">No environment selected</div>
              <div class="empty-subtitle">Select an environment from the sidebar to manage its variables</div>
            </div>
          </td>
        </tr>
      `;
    }
  }

  function updateTitle(name) {
    console.log('Updating title to:', name);
    if (envTitle) {
      if (name) {
        envTitle.value = name;
        envTitle.readOnly = false;
        envTitle.placeholder = name;
      } else {
        envTitle.value = '';
        envTitle.readOnly = true;
        envTitle.placeholder = 'No environment selected';
      }
    }
  }

  function updateStatus(isActive) {
    if (envStatus) {
      if (isActive) {
        envStatus.className = 'env-status';
        envStatus.innerHTML = '<div class="status-dot"></div><span>Active</span>';
      } else {
        envStatus.className = 'env-status inactive';
        envStatus.innerHTML = '<div class="status-dot"></div><span>Inactive</span>';
      }
    }
  }

  function handleFilter(e) {
    const query = e.target.value.toLowerCase();
    if (currentEnvironment) {
      filteredVariables = (currentEnvironment.variables || []).filter(variable =>
        variable.key.toLowerCase().includes(query) ||
        (variable.initialValue || '').toLowerCase().includes(query) ||
        (variable.currentValue || '').toLowerCase().includes(query)
      );
      renderVariablesTable();
    }
  }

  function renderVariablesTable() {
    if (!currentEnvironment || !variablesTbody) {
      renderEmptyContent();
      return;
    }

    let html = '';

    // Render existing variables
    filteredVariables.forEach(variable => {
      const rowClass = !variable.enabled ? 'disabled' : '';
      const checkedAttr = variable.enabled ? 'checked' : '';
      const inputClass = variable.type === 'secret' ? 'env-input secret' : 'env-input';
      const isValid = isVariableValid(variable);
      const invalidClass = !isValid ? 'invalid' : '';
      const checkboxDisabled = !isValid ? 'disabled' : '';
      const checkboxTitle = !isValid ? 'Variable must have a name and at least one value to be enabled' : '';

      // Determine if we need fallback for secret variables
      const secretClass = variable.type === 'secret' ? 'secret' : '';
      const secretFallback = variable.type === 'secret' ? 'fallback' : '';

      html += `
        <tr class="${rowClass} ${invalidClass}" data-var-id="${variable.id}">
          <td>
            <input type="checkbox" class="env-checkbox variable-enabled-checkbox" ${checkedAttr} ${checkboxDisabled} data-var-id="${variable.id}" title="${checkboxTitle}" />
          </td>
          <td>
            <input type="text" class="env-input variable-key-input ${!variable.key || variable.key.trim() === '' ? 'invalid' : ''}" value="${escapeHtml(variable.key)}" data-var-id="${variable.id}" data-field="key" placeholder="Variable name" />
          </td>
          <td>
            <select class="env-select variable-type-select" data-var-id="${variable.id}" data-field="type">
              <option value="default"${variable.type === 'default' ? ' selected' : ''}>default</option>
              <option value="secret"${variable.type === 'secret' ? ' selected' : ''}>secret</option>
            </select>
          </td>
          <td>
            <input type="text" class="${inputClass} variable-initial-input ${secretClass} ${secretFallback} ${!variable.initialValue || variable.initialValue.trim() === '' ? 'invalid' : ''}" value="${escapeHtml(variable.initialValue || '')}" data-var-id="${variable.id}" data-field="initialValue" placeholder="Initial value" />
          </td>
          <td>
            <input type="text" class="${inputClass} variable-current-input ${secretClass} ${secretFallback} ${!variable.currentValue || variable.currentValue.trim() === '' ? 'invalid' : ''}" value="${escapeHtml(variable.currentValue || '')}" data-var-id="${variable.id}" data-field="currentValue" placeholder="Current value" />
          </td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="action-btn duplicate variable-duplicate-btn" data-var-id="${variable.id}" title="Duplicate variable">
                <i class="codicon codicon-copy"></i>
              </button>
              <button class="action-btn delete variable-delete-btn" data-var-id="${variable.id}" title="Delete variable">
                <i class="codicon codicon-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    // Add "Add new variable" row
    html += `
      <tr class="add-row">
        <td colspan="6">
          <button class="add-variable-btn" id="add-variable-btn">
            <i class="codicon codicon-add"></i>
            Add new variable
          </button>
        </td>
      </tr>
    `;

    variablesTbody.innerHTML = html;

    // Re-attach event listeners after updating innerHTML
    attachVariableEventListeners();

    // Update select all checkbox state
    updateSelectAllCheckboxState();
  }

  function attachVariableEventListeners() {
    // Variable enabled checkboxes
    document.querySelectorAll('.variable-enabled-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const varId = e.target.getAttribute('data-var-id');
        toggleVariableEnabled(varId);
      });
    });

    // Variable input fields
    document.querySelectorAll('.variable-key-input, .variable-initial-input, .variable-current-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const varId = e.target.getAttribute('data-var-id');
        const field = e.target.getAttribute('data-field');
        updateVariableField(varId, field, e.target.value);
      });
    });

    // Variable type selects
    document.querySelectorAll('.variable-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const varId = e.target.getAttribute('data-var-id');
        const field = e.target.getAttribute('data-field');
        updateVariableField(varId, field, e.target.value);
      });
    });

    // Variable action buttons
    document.querySelectorAll('.variable-duplicate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const varId = e.currentTarget.getAttribute('data-var-id');
        duplicateVariable(varId);
      });
    });

    document.querySelectorAll('.variable-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const varId = e.currentTarget.getAttribute('data-var-id');
        deleteVariable(varId);
      });
    });

    // Add variable button
    const addBtn = document.getElementById('add-variable-btn');
    if (addBtn) {
      addBtn.addEventListener('click', handleAddVariable);
    }
  }

  // Variable management functions
  function handleAddVariable() {
    if (!currentEnvironment) return;

    const newVariable = {
      id: generateId(),
      key: '',
      initialValue: '',
      currentValue: '',
      type: 'default',
      enabled: true
    };

    vscode.postMessage({
      command: 'addVariable',
      payload: { envId: currentEnvironment.id, variable: newVariable }
    });
  }

  function updateVariableField(varId, field, value) {
    if (!currentEnvironment) return;
    const variable = currentEnvironment.variables.find(v => v.id === varId);
    if (variable) {
      variable[field] = value;
      updateVariable(varId, variable);
    }
  }

  function updateVariable(varId, variable) {
    if (!currentEnvironment) return;
    vscode.postMessage({
      command: 'updateVariable',
      payload: { envId: currentEnvironment.id, varId, variable }
    });
  }

  function isVariableValid(variable) {
    // Variable must have a name and at least one value (initial or current)
    return variable.key && variable.key.trim() !== '' &&
           (variable.initialValue && variable.initialValue.trim() !== '' ||
            variable.currentValue && variable.currentValue.trim() !== '');
  }

  function toggleVariableEnabled(varId) {
    if (!currentEnvironment) return;
    const variable = currentEnvironment.variables.find(v => v.id === varId);
    if (variable) {
      // Only allow enabling if the variable is valid
      if (!variable.enabled && !isVariableValid(variable)) {
        console.log('Cannot enable variable - missing name or values:', variable.key);
        // Show visual feedback - briefly highlight the checkbox in red
        const checkbox = document.querySelector(`.variable-enabled-checkbox[data-var-id="${varId}"]`);
        if (checkbox) {
          checkbox.style.border = '2px solid #ff6b6b';
          setTimeout(() => {
            checkbox.style.border = '';
          }, 2000);
        }
        return;
      }

      variable.enabled = !variable.enabled;
      updateVariable(varId, variable);

      // Update select all checkbox state
      setTimeout(() => {
        updateSelectAllCheckboxState();
      }, 100);
    }
  }

  function duplicateVariable(varId) {
    if (!currentEnvironment) return;
    const variable = currentEnvironment.variables.find(v => v.id === varId);
    if (variable) {
      const newVariable = {
        ...variable,
        id: generateId(),
        key: variable.key + '_copy'
      };
      vscode.postMessage({
        command: 'addVariable',
        payload: { envId: currentEnvironment.id, variable: newVariable }
      });
    }
  }

  function deleteVariable(varId) {
    if (!currentEnvironment) return;
    const variable = currentEnvironment.variables.find(v => v.id === varId);
    if (variable) {
      console.log('Deleting variable:', variable.key);
      vscode.postMessage({
        command: 'deleteVariable',
        payload: { envId: currentEnvironment.id, varId }
      });
    }
  }

  // Bulk operations
  function enableAllVariables() {
    if (!currentEnvironment) return;
    let enabledCount = 0;
    let skippedCount = 0;

    currentEnvironment.variables.forEach(variable => {
      if (isVariableValid(variable)) {
        variable.enabled = true;
        enabledCount++;
      } else {
        // Ensure invalid variables remain disabled
        variable.enabled = false;
        skippedCount++;
      }
    });

    vscode.postMessage({
      command: 'updateEnvironment',
      payload: { id: currentEnvironment.id, variables: currentEnvironment.variables }
    });

    // Show feedback about how many variables were enabled
    console.log(`Enabled ${enabledCount} variables, skipped ${skippedCount} invalid variables`);

    // Re-render the table to reflect the changes
    setTimeout(() => {
      renderVariablesTable();
      updateSelectAllCheckboxState();
    }, 100);
  }


  function disableAllVariables() {
    if (!currentEnvironment) return;
    currentEnvironment.variables.forEach(variable => {
      variable.enabled = false;
    });
    vscode.postMessage({
      command: 'updateEnvironment',
      payload: { id: currentEnvironment.id, variables: currentEnvironment.variables }
    });
  }

  function clearAllValues() {
    if (!currentEnvironment) return;
    if (confirm('Are you sure you want to clear all current values?')) {
      currentEnvironment.variables.forEach(variable => {
        variable.currentValue = '';
      });
      vscode.postMessage({
        command: 'updateEnvironment',
        payload: { id: currentEnvironment.id, variables: currentEnvironment.variables }
      });
    }
  }

  function resetAllValues() {
    if (!currentEnvironment) return;
    if (confirm('Are you sure you want to reset all current values to initial values?')) {
      currentEnvironment.variables.forEach(variable => {
        variable.currentValue = variable.initialValue;
      });
      vscode.postMessage({
        command: 'updateEnvironment',
        payload: { id: currentEnvironment.id, variables: currentEnvironment.variables }
      });
    }
  }

  function toggleSelectAll() {
    const selectAll = document.getElementById('select-all-checkbox');
    const checkboxes = document.querySelectorAll('.variables-table tbody .env-checkbox:not(:disabled)');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAll.checked;
    });

    // Also update the select all checkbox state based on valid variables
    updateSelectAllCheckboxState();
  }

  function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const validCheckboxes = document.querySelectorAll('.variables-table tbody .env-checkbox:not(:disabled)');

    if (validCheckboxes.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const checkedValidCheckboxes = document.querySelectorAll('.variables-table tbody .env-checkbox:not(:disabled):checked');
    const allValidChecked = checkedValidCheckboxes.length === validCheckboxes.length;
    const someValidChecked = checkedValidCheckboxes.length > 0;

    selectAllCheckbox.checked = allValidChecked;
    selectAllCheckbox.indeterminate = !allValidChecked && someValidChecked;
  }

  // Utility functions
  function generateId() {
    return 'var_' + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function downloadJson(data, filename) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Make functions globally available for inline event handlers
  window.toggleVariableEnabled = toggleVariableEnabled;
  window.updateVariableField = updateVariableField;
  window.duplicateVariable = duplicateVariable;
  window.deleteVariable = deleteVariable;
  window.handleAddVariable = handleAddVariable;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();