(function () {
    const vscode = acquireVsCodeApi();

    // DOM Elements
    const providerDropdown = document.getElementById('provider-dropdown');
    const modelDropdown = document.getElementById('model-dropdown');
    const apiKeyInput = document.getElementById('ai-api-key');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    const testConfigBtn = document.getElementById('test-config-btn');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    // State
    let currentConfig = {
        provider: 'huggingface',
        model: 'openai/gpt-oss-120b',
        apiKey: ''
    };

    // Initialize
    function initialize() {
        setupDropdowns();
        setupEventListeners();
        loadCurrentConfig();

        // Ensure spinner is hidden on initialization
        const testBtn = document.getElementById('test-config-btn');
        const btnSpinner = testBtn?.querySelector('.btn-spinner');
        if (btnSpinner && !btnSpinner.classList.contains('hidden')) {
            btnSpinner.classList.add('hidden');
        }
    }

    // Setup dropdown functionality
    function setupDropdowns() {
        document.body.addEventListener('click', (e) => {
            const target = e.target;
            const activeDropdown = target.closest('.custom-dropdown');

            if (!activeDropdown) {
                // Close all dropdowns
                document.querySelectorAll('.custom-dropdown').forEach(d => {
                    d.classList.remove('open');
                    d.querySelector('.dropdown-menu')?.classList.add('hidden');
                });
                return;
            }

            if (target.closest('.dropdown-selected')) {
                const menu = activeDropdown.querySelector('.dropdown-menu');
                if (menu) {
                    const isHidden = menu.classList.contains('hidden');
                    document.querySelectorAll('.custom-dropdown').forEach(d => {
                        d.classList.remove('open');
                        d.querySelector('.dropdown-menu')?.classList.add('hidden');
                    });
                    if (isHidden) {
                        menu.classList.remove('hidden');
                        activeDropdown.classList.add('open');
                    }
                }
                return;
            }

            const li = target.closest('li[data-value]');
            if (li && !li.hasAttribute('disabled')) {
                const value = li.dataset.value;
                const selectedText = activeDropdown.querySelector('.selected-text, #selected-provider-text, #selected-model-text');

                if (selectedText) {
                    selectedText.textContent = li.textContent.replace('✓', '').trim();
                }

                activeDropdown.dataset.selectedValue = value;

                // Update current config
                if (activeDropdown.id === 'provider-dropdown') {
                    currentConfig.provider = value;
                    updateModelOptions(value);
                } else if (activeDropdown.id === 'model-dropdown') {
                    currentConfig.model = value;
                }

                // Update active state
                const menu = li.closest('.dropdown-menu');
                menu.querySelectorAll('li').forEach(item => item.classList.remove('active'));
                li.classList.add('active');

                activeDropdown.classList.remove('open');
                menu.classList.add('hidden');
            }
        });
    }

    // Update model options based on selected provider
    function updateModelOptions(provider) {
        const modelDropdown = document.getElementById('model-dropdown');
        const selectedModelText = document.getElementById('selected-model-text');
        const menu = modelDropdown.querySelector('.dropdown-menu');

        const modelOptions = {
            'huggingface': [
                { value: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b' }
            ]
        };

        const models = modelOptions[provider] || [];

        // Update selected model if current one is not available
        if (models.length > 0 && !models.find(m => m.value === currentConfig.model)) {
            currentConfig.model = models[0].value;
            selectedModelText.textContent = models[0].label;
            modelDropdown.dataset.selectedValue = models[0].value;
        }

        // Update menu
        menu.innerHTML = '';
        models.forEach(model => {
            const li = document.createElement('li');
            li.dataset.value = model.value;
            li.innerHTML = `<span class="dropdown-menu-checkmark">${model.value === currentConfig.model ? '✓' : ''}</span>${model.label}`;
            if (model.value === currentConfig.model) {
                li.classList.add('active');
            }
            menu.appendChild(li);
        });
    }

    // Setup event listeners
    function setupEventListeners() {
        // Toggle API key visibility
        if (toggleApiKeyBtn) {
            toggleApiKeyBtn.addEventListener('click', () => {
                const isPassword = apiKeyInput.type === 'password';
                apiKeyInput.type = isPassword ? 'text' : 'password';

                const icon = toggleApiKeyBtn.querySelector('svg path');
                if (icon) {
                    // Toggle eye/eye-off icon
                    if (isPassword) {
                        icon.setAttribute('d', 'M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5Z M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z');
                    } else {
                        icon.setAttribute('d', 'M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5Z M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z');
                    }
                }
            });
        }

        // Test configuration
        if (testConfigBtn) {
            testConfigBtn.addEventListener('click', () => {
                const config = {
                    provider: currentConfig.provider,
                    model: currentConfig.model,
                    apiKey: apiKeyInput.value.trim()
                };

                if (!config.apiKey) {
                    showTestResult('❌ Please enter your API key first', 'error');
                    return;
                }

                vscode.postMessage({
                    command: 'testConfig',
                    payload: config
                });
            });
        }

        // Save configuration
        if (saveConfigBtn) {
            saveConfigBtn.addEventListener('click', () => {
                const config = {
                    provider: currentConfig.provider,
                    model: currentConfig.model,
                    apiKey: apiKeyInput.value.trim()
                };

                if (!config.apiKey) {
                    vscode.window.showErrorMessage('Please enter your API key');
                    return;
                }

                vscode.postMessage({
                    command: 'saveConfig',
                    payload: config
                });
            });
        }

        // Cancel
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            });
        }

        // API key input changes
        if (apiKeyInput) {
            apiKeyInput.addEventListener('input', () => {
                currentConfig.apiKey = apiKeyInput.value.trim();
                hideTestResult();
            });
        }
    }

    // Load current configuration
    function loadCurrentConfig() {
        vscode.postMessage({
            command: 'getCurrentConfig'
        });
    }

    // Show test result
    function showTestResult(message, type) {
        const testResult = document.getElementById('test-result');
        if (testResult) {
            testResult.textContent = message;
            testResult.className = `test-result ${type}`;
            testResult.classList.remove('hidden');
        }
    }

    // Hide test result
    function hideTestResult() {
        const testResult = document.getElementById('test-result');
        if (testResult) {
            testResult.classList.add('hidden');
        }
    }

    // Handle messages from extension
    window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.command) {
            case 'loadConfig':
                const config = message.payload;
                if (config) {
                    currentConfig = { ...config };

                    // Update UI elements
                    if (config.provider) {
                        const providerText = document.getElementById('selected-provider-text');
                        if (providerText) providerText.textContent = config.provider === 'huggingface' ? 'Hugging Face' : config.provider;
                        providerDropdown.dataset.selectedValue = config.provider;
                    }

                    if (config.model) {
                        const modelText = document.getElementById('selected-model-text');
                        if (modelText) modelText.textContent = config.model;
                        modelDropdown.dataset.selectedValue = config.model;
                    }

                    if (config.apiKey && apiKeyInput) {
                        apiKeyInput.value = config.apiKey;
                    }

                    // Update model options
                    updateModelOptions(config.provider || 'huggingface');
                }
                break;
            case 'testConfigStart':
                // Show loading state - use specific button selectors
                const testBtn = document.getElementById('test-config-btn');
                const btnText = testBtn?.querySelector('.btn-text');
                const btnSpinner = testBtn?.querySelector('.btn-spinner');
                if (btnText && btnSpinner) {
                    btnText.classList.add('hidden');
                    btnSpinner.classList.remove('hidden');
                }
                hideTestResult();
                break;
            case 'testConfigResult':
                // Reset button state - use specific button selectors
                const testBtn2 = document.getElementById('test-config-btn');
                const btnText2 = testBtn2?.querySelector('.btn-text');
                const btnSpinner2 = testBtn2?.querySelector('.btn-spinner');
                if (btnText2 && btnSpinner2) {
                    btnText2.classList.remove('hidden');
                    btnSpinner2.classList.add('hidden');
                }

                // Show result
                if (message.payload) {
                    showTestResult(message.payload.message, message.payload.success ? 'success' : 'error');
                }
                break;
        }
    });

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();