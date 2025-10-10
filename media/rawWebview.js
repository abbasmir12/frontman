(function () {
    console.log('[Webview] Script starting...');
    const vscode = acquireVsCodeApi();

    // Place this at the top-level, before setupAuthorizationTab
    const updateAuthUI = (authType) => {
        const authDropdown = document.getElementById('auth-type-dropdown');
        const selectedText = document.getElementById('selected-auth-type-text');
        const descriptionPanel = document.getElementById('auth-description-panel');
        const menu = authDropdown.querySelector('.dropdown-menu');
        const jwtExtra = document.getElementById('auth-sidebar-extra-jwt');
        const digestExtra = document.getElementById('auth-sidebar-extra-digest');
        const oauth1Extra = document.getElementById('auth-sidebar-extra-oauth1');
        const oauth2Extra = document.getElementById('auth-sidebar-extra-oauth2');
        const descriptions = { 'no-auth': 'This request does not use any authorization.', 'basic': 'The authorization header will be automatically generated. Uses Basic HTTP Authentication.', 'bearer': 'The authorization header will be automatically generated. Uses a bearer token.', 'apikey': 'The authorization details will be added to the request headers or query parameters.', 'jwt': 'A JSON Web Token will be generated and sent. Configure headers and payload below.', 'digest': 'Credentials for Digest authentication. By default, Postman will extract values from the response and retry.', 'oauth1': 'Credentials will be used to generate an OAuth 1.0 signature. (Note: Signing is not yet implemented).', 'oauth2': 'An OAuth 2.0 access token will be sent as a bearer token.', 'ntlm': 'Credentials will be sent for NTLM authentication. This is a challenge-response mechanism.', 'awsv4': 'The request will be signed using AWS Signature v4. (Note: Signing is not yet implemented).', 'hawk': 'Credentials for Hawk authentication. The header will be automatically generated.' };
        const targetLi = menu.querySelector(`li[data-value="${authType}"]`); if (!targetLi) return;
        selectedText.textContent = targetLi.textContent.replace('✓', '').trim();
        authDropdown.dataset.selectedValue = authType; descriptionPanel.innerHTML = descriptions[authType] || "This auth type is not yet implemented.";
        document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
        const panelToShow = document.getElementById(`auth-panel-${authType}`);
        if (panelToShow) { panelToShow.classList.add('active'); if (authType === 'jwt') { setTimeout(() => jwtPayloadEditor.refresh(), 10); } }
        menu.querySelectorAll('li').forEach(item => item.classList.remove('active')); targetLi.classList.add('active');
        jwtExtra.classList.toggle('visible', authType === 'jwt'); digestExtra.classList.toggle('visible', authType === 'digest');
        oauth1Extra.classList.toggle('visible', authType === 'oauth1'); oauth2Extra.classList.toggle('visible', authType === 'oauth2');
    };

    // --- DOM Element References ---
    const sendBtn = document.getElementById('send-request');
    const rawUrlInput = document.getElementById('raw-url');
    const spinnerOverlay = document.querySelector('.spinner-overlay');
    const formatBodyBtn = document.getElementById('format-body');
    const requestHeadersCountEl = document.getElementById('request-headers-count');
    const statusBadgeEl = document.getElementById('response-status-badge');
    const formatSelectorDropdown = document.getElementById('format-selector-dropdown');

    const wrapBtn = document.getElementById('response-wrap-btn');
    const copyBtn = document.getElementById('response-copy-btn');
    const saveBtn = document.getElementById('response-save-btn');
    const searchBtn = document.getElementById('response-search-btn');

    const searchWidget = document.getElementById('response-search-widget');
    const searchWidgetInput = document.getElementById('search-widget-input');
    const searchWidgetMatches = document.getElementById('search-widget-matches');
    const searchWidgetPrev = document.getElementById('search-widget-prev');
    const searchWidgetNext = document.getElementById('search-widget-next');
    const searchWidgetClose = document.getElementById('search-widget-close');


    // --- State ---
    let rawBodyEditor, responseBodyEditor, responseHeadersEditorRaw, graphqlQueryEditor, graphqlVariablesEditor, jwtPayloadEditor, jwtHeadersEditor;
    let currentResponseData = { text: '', raw: new Uint8Array() };
    let isLineWrapping = false;
    let searchState = {
        query: null,
        marked: [],
        activeMark: null
    };
    let requestName = 'Untitled Request';

    // --- Helper function to format numbers ---
    const formatNum = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // --- Variable resolution function ---
    function resolveVariables(input, environment) {
        if (!environment || !environment.variables) return input;
        const varMap = {};
        environment.variables.forEach(v => {
            // Only include variables that are enabled
            if (v.enabled) {
                varMap[v.key] = v.currentValue || v.initialValue;
            }
        });
        return input.replace(/{{\s*([\w.]+)\s*}}/g, (match, varName) => {
            const value = varMap[varName];
            return value !== undefined ? String(value) : match;
        });
    }

    // Function to check if a variable exists in the selected environment
    function variableExists(varName) {
        if (!selectedEnvironment || !selectedEnvironment.variables) {
            console.log('[DEBUG] No selected environment or no variables');
            return false;
        }

        console.log('[DEBUG] Checking if variable exists:', varName);
        console.log('[DEBUG] Available variables:', selectedEnvironment.variables.map(v => ({ key: v.key, enabled: v.enabled })));

        const exists = selectedEnvironment.variables.some(v =>
            v.enabled && v.key === varName
        );

        console.log('[DEBUG] Variable exists result:', exists);
        return exists;
    }

    // Function to highlight variables in the URL input
    function highlightVariables(urlInput) {
        const value = urlInput.value;

        // Find all variable patterns {{variableName}}
        const variablePattern = /\{\{([^}]+)\}\}/g;
        let match;
        let hasVariables = false;

        console.log('[DEBUG] Highlighting variables in URL:', value);
        console.log('[DEBUG] Selected environment:', selectedEnvironment);

        // Process each variable match
        while ((match = variablePattern.exec(value)) !== null) {
            hasVariables = true;
            console.log('[DEBUG] Found variable:', match[1]);
        }

        // Add or remove highlight class based on whether there are variables
        if (hasVariables) {
            urlInput.classList.add('has-valid-variables');
            console.log('[DEBUG] Added highlight class');
        } else {
            urlInput.classList.remove('has-valid-variables');
            console.log('[DEBUG] Removed highlight class');
        }
    }

    // Enhanced text highlighting with colored variables
    function highlightVariablesInText(urlInput) {
        const value = urlInput.value;
        if (!value) {
            urlInput.style.color = '';
            return;
        }

        // Find all variable patterns
        const variablePattern = /\{\{([^}]+)\}\}/g;
        let match;
        let hasValidVariables = false;

        while ((match = variablePattern.exec(value)) !== null) {
            const varName = match[1];
            // Check if variable exists in selected environment
            const isValidVariable = variableExists(varName);
            if (isValidVariable) {
                hasValidVariables = true;
                break;
            }
        }

        // Add or remove highlight class based on whether there are valid variables
        if (hasValidVariables) {
            urlInput.classList.add('has-valid-variables');
        } else {
            urlInput.classList.remove('has-valid-variables');
        }
    }

    // Contenteditable div approach for proper cursor positioning
    function highlightVariablesInInput(inputElement) {
        const value = inputElement.value;
        if (!value) {
            console.log('[DEBUG] No value in input, returning early');
            return;
        }

        console.log('[DEBUG] Highlighting variables in input, value:', value);
        console.log('[DEBUG] Selected environment:', selectedEnvironment);

        // Find all variable patterns and their positions
        const variablePattern = /\{\{([^}]+)\}\}/g;
        let match;
        let highlightedText = '';
        let lastIndex = 0;
        let hasValidVariables = false;

        while ((match = variablePattern.exec(value)) !== null) {
            const varName = match[1];
            const isValidVariable = variableExists(varName);

            console.log('[DEBUG] Found variable:', varName, 'Is valid:', isValidVariable);

            if (isValidVariable) {
                hasValidVariables = true;
            }

            // Add text before variable
            highlightedText += value.slice(lastIndex, match.index);

            // Add variable with appropriate color
            if (isValidVariable) {
                highlightedText += `<span class="variable-highlight" data-variable="{{${varName}}}">{{${varName}}}</span>`;
            } else {
                highlightedText += `{{${varName}}}`;
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        highlightedText += value.slice(lastIndex);

        console.log('[DEBUG] Has valid variables:', hasValidVariables);
        console.log('[DEBUG] Highlighted text:', highlightedText);

        // Create or update contenteditable div
        const inputWrapper = inputElement.parentElement;
        if (inputWrapper) {
            inputWrapper.style.position = 'relative';

            // Remove existing contenteditable div
            const existingEditable = inputWrapper.querySelector('.url-input-editable');
            if (existingEditable) {
                existingEditable.remove();
            }

            if (hasValidVariables) {
                console.log('[DEBUG] Creating contenteditable div');
                // Create contenteditable div
                const editableDiv = document.createElement('div');
                editableDiv.innerHTML = highlightedText;
                editableDiv.className = 'url-input-editable';
                editableDiv.contentEditable = true;
                editableDiv.spellcheck = false;
                editableDiv.autocomplete = 'off';
                editableDiv.autocorrect = 'off';
                editableDiv.autocapitalize = 'off';

                // Style the contenteditable div to look like an input
                const inputStyles = window.getComputedStyle(inputElement);
                editableDiv.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    font-family: "Segoe WPC", "Segoe UI", sans-serif;
                    font-size: var(--vscode-font-size);
                    font-weight: 600;
                    line-height: 1;
                    color: var(--vscode-input-foreground);
                    background: var(--input-background);
                    border: 1px solid var(--input-border);
                    border-radius: 4px;
                    padding: 9px 10px;
                    box-sizing: border-box;
                    outline: none;
                    white-space: pre;
                    overflow: hidden;
                    z-index: 2;
                    caret-color: var(--vscode-input-foreground);
                `;

                // Hide the original input
                inputElement.style.display = 'none';

                // Add the contenteditable div
                inputWrapper.appendChild(editableDiv);

                console.log('[DEBUG] Contenteditable div created and added to DOM');

                // Handle input events
                editableDiv.addEventListener('input', (e) => {
                    const newValue = e.target.textContent || '';
                    console.log('[DEBUG] Contenteditable input event, new value:', newValue);
                    inputElement.value = newValue;
                    // Trigger the original input event
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                });

                // Handle focus events to maintain cursor position
                editableDiv.addEventListener('focus', (e) => {
                    console.log('[DEBUG] Contenteditable focus event');
                    // Store that we're in contenteditable mode
                    inputElement.dataset.contenteditableActive = 'true';
                    inputElement.dispatchEvent(new Event('focus', { bubbles: true }));
                });

                // Handle focus events
                editableDiv.addEventListener('focus', () => {
                    console.log('[DEBUG] Contenteditable focus event');
                    inputElement.dispatchEvent(new Event('focus', { bubbles: true }));
                });

                editableDiv.addEventListener('blur', () => {
                    console.log('[DEBUG] Contenteditable blur event');
                    inputElement.dispatchEvent(new Event('blur', { bubbles: true }));
                });

                // Handle keyboard events
                editableDiv.addEventListener('keydown', (e) => {
                    console.log('[DEBUG] Contenteditable keydown event:', e.key);
                    inputElement.dispatchEvent(new KeyboardEvent('keydown', e));
                });

                // Sync cursor position
                setTimeout(() => {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(editableDiv);
                    range.collapse(false);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }, 0);
            } else {
                // No valid variables, show original input
                console.log('[DEBUG] No valid variables, showing original input');
                inputElement.style.display = 'block';

                // Maintain focus on the original input with better timing
                const activeElement = document.activeElement;
                const wasContenteditableActive = inputElement.dataset.contenteditableActive === 'true';

                if (activeElement && activeElement.classList.contains('url-input-editable') || wasContenteditableActive) {
                    // Use setTimeout to ensure DOM updates are complete before focusing
                    setTimeout(() => {
                        inputElement.focus();
                        // Clear the flag
                        delete inputElement.dataset.contenteditableActive;
                        console.log('[DEBUG] Restored focus to original input');
                    }, 0);
                }
            }

            // Fallback: Ensure basic highlighting is always applied
            setTimeout(() => {
                console.log('[DEBUG] Applying fallback highlighting');
                highlightVariables(inputElement);
                highlightVariablesInText(inputElement);
            }, 10);
        } else {
            console.log('[DEBUG] No input wrapper found');
        }
    }

    // --- Dynamic Status Message Helper ---
    function getStatusMessage(status) {
        if (status >= 200 && status < 300) {
            const messages = { 200: 'The request was successful.', 201: 'The resource was created successfully.', 202: 'The request has been accepted for processing.', 204: 'The server successfully processed the request but is not returning any content.' };
            return messages[status] || 'Request successful. The server has responded as required.';
        }
        if (status >= 300 && status < 400) return 'The server is redirecting you to a different endpoint.';
        if (status >= 400 && status < 500) {
            const messages = { 400: 'The server could not understand the request due to invalid syntax.', 401: 'Authentication is required and has failed or has not yet been provided.', 403: 'You do not have permission to access this resource.', 404: 'The server could not find the requested resource.' };
            return messages[status] || 'The request could not be completed. (Client Error)';
        }
        if (status >= 500) return 'The server failed to fulfill an apparently valid request. (Server Error)';
        return 'An unknown response status was received.';
    }

    // --- Row Creation Functions ---
    function createParamRow() {
        const row = document.createElement('div'); row.className = 'kv-row';
        row.innerHTML = `<div class="kv-cell"><input type="text" class="kv-input kv-key" placeholder="Key"></div><div class="kv-cell"><input type="text" class="kv-input kv-value" placeholder="Value"></div><div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row">×</button></div>`;
        return row;
    }
    function createFormRow() {
        const row = document.createElement('div'); row.className = 'kv-row';
        row.innerHTML = `<div class="kv-cell"><input type="text" class="kv-input kv-key" placeholder="Key"></div><div class="kv-cell"><input type="text" class="kv-input kv-value" placeholder="Value"></div><div class="kv-cell"><input type="text" class="kv-input kv-desc" placeholder="Description"></div><div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row">×</button></div>`;
        return row;
    }
    function createHeaderRow() {
        const row = document.createElement('div'); row.className = 'kv-row';
        row.innerHTML = `<div class="kv-cell-check"><input type="checkbox" class="kv-check" checked></div><div class="kv-cell"><input type="text" class="kv-input kv-key" placeholder="Key"></div><div class="kv-cell"><input type="text" class="kv-input kv-value" placeholder="Value"></div><div class="kv-cell"><input type="text" class="kv-input kv-desc" placeholder="Description"></div><div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row">×</button></div>`;
        return row;
    }
    function updateRequestHeaderCount() {
        if (!requestHeadersCountEl) return;
        const checkedCount = document.querySelectorAll('#headers-kv-body .kv-check:checked').length;
        requestHeadersCountEl.textContent = `(${checkedCount})`;
    }

    // --- Popup Handling ---
    function clearPopups() {
        document.getElementById('popup-status-text').textContent = ''; document.getElementById('popup-status-desc').textContent = '';
        document.getElementById('time-breakdown-container').innerHTML = '';
        ['res-headers', 'res-body', 'res-uncompressed', 'req-headers', 'req-body'].forEach(id => { const el = document.getElementById(`popup-size-${id}`); if (el) el.textContent = 'N/A'; });
        ['http', 'local', 'remote', 'tls', 'cipher', 'cert-cn', 'cert-issuer', 'cert-expiry'].forEach(id => { const el = document.getElementById(`popup-net-${id}`); if (el) el.textContent = 'N/A'; });
    }

    function updateResponsePopups(details) {
        if (!details) return;
        const { size, time, network } = details;
        if (size) {
            document.getElementById('popup-size-res-headers').textContent = formatBytes(size.responseHeaders); document.getElementById('popup-size-res-body').textContent = formatBytes(size.responseBody);
            document.getElementById('popup-size-res-uncompressed').textContent = formatBytes(size.responseUncompressed); document.getElementById('popup-size-req-headers').textContent = formatBytes(size.requestHeaders);
            document.getElementById('popup-size-req-body').textContent = formatBytes(size.requestBody);
        }
        if (time) {
            const container = document.getElementById('time-breakdown-container'); container.innerHTML = '';
            const total = Object.values(time).reduce((a, b) => a + b, 0);
            const createRow = (label, value) => {
                const colors = { Prepare: '#a8a8a8', Socket: '#facc15', DNS: '#fb923c', TCP: '#60a5fa', SSL: '#ef4444', Waiting: '#f87171', Download: '#4ade80' };
                const barWidth = total > 0 ? (value / total) * 100 : 0;
                const row = document.createElement('div'); row.className = 'time-breakdown-row';
                row.innerHTML = `<span>${label}</span><div class="time-bar-container"><div class="time-bar" style="width: ${barWidth}%; background-color: ${colors[label] || '#888'}"></div></div><span class="time-label">${formatNum(value)} ms</span>`;
                container.appendChild(row);
            };
            createRow('Prepare', time.prepare || 0); createRow('Socket', time.socket || 0); createRow('DNS', time.dns || 0);
            createRow('TCP', time.tcp || 0); createRow('SSL', time.ssl || 0); createRow('Waiting', time.wait || 0); createRow('Download', time.download || 0);
        }
        if (network) {
            document.getElementById('popup-net-http').textContent = network.httpVersion; document.getElementById('popup-net-local').textContent = network.localAddress; document.getElementById('popup-net-remote').textContent = network.remoteAddress;
            document.getElementById('popup-net-tls').textContent = network.tlsProtocol; document.getElementById('popup-net-cipher').textContent = network.cipherName; document.getElementById('popup-net-cert-cn').textContent = network.certSubject;
            document.getElementById('popup-net-cert-issuer').textContent = network.certIssuer; document.getElementById('popup-net-cert-expiry').textContent = network.certExpiry;
        }
    }

    // --- Setup Functions ---
    function setupKeyValueEditors() {
        const editorConfigs = { 'params-kv-body': createParamRow, 'headers-kv-body': createHeaderRow, 'urlencoded-kv-body': createFormRow };
        document.querySelectorAll('.add-row-btn').forEach(addBtn => {
            const targetId = addBtn.dataset.editorTarget; const body = document.getElementById(targetId); const createRowFunc = editorConfigs[targetId];
            if (body && createRowFunc) { addBtn.addEventListener('click', () => { const newRow = createRowFunc(); body.appendChild(newRow); newRow.querySelector('.kv-key').focus(); if (targetId === 'headers-kv-body') updateRequestHeaderCount(); }); }
        });
        document.querySelectorAll('.kv-editor-body').forEach(body => {
            body.addEventListener('click', (e) => { if (e.target && e.target.classList.contains('delete-row-btn')) { e.target.closest('.kv-row').remove(); if (body.id === 'headers-kv-body') updateRequestHeaderCount(); } });
            if (body.id === 'headers-kv-body') { body.addEventListener('change', (e) => { if (e.target.matches('.kv-check')) { e.target.closest('.kv-row').classList.toggle('disabled', !e.target.checked); updateRequestHeaderCount(); } }); }
        });
        document.getElementById('params-kv-body').appendChild(createParamRow());
        document.getElementById('urlencoded-kv-body').appendChild(createFormRow());
    }

    function setupTabs() {
        document.querySelectorAll('.tabs-container').forEach(container => {
            const tabs = container.querySelector('.tabs'); const contents = container.querySelector('.tab-content-container');
            if (!tabs || !contents) return;
            tabs.addEventListener('click', e => {
                const tab = e.target.closest('.tab');
                if (tab) {
                    const targetId = tab.dataset.tabTarget; const targetContent = contents.querySelector(targetId); if (!targetContent) return;
                    tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); contents.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active'); targetContent.classList.add('active');
                    setTimeout(() => {
                        if (targetId === '#tab-body') {
                            const activeBodyPanel = document.querySelector('.body-panel.active');
                            if (activeBodyPanel && activeBodyPanel.id === 'body-panel-raw') rawBodyEditor.refresh();
                            if (activeBodyPanel && activeBodyPanel.id === 'body-panel-graphql') { graphqlQueryEditor.refresh(); graphqlVariablesEditor.refresh(); }
                        }
                        if (targetId === '#tab-authorization') { if(jwtPayloadEditor) jwtPayloadEditor.refresh(); if(jwtHeadersEditor) jwtHeadersEditor.refresh(); }
                        if (targetId === '#tab-response-body') responseBodyEditor.refresh();
                    }, 10);
                }
            });
        });
        document.querySelector('#request-tabs-container .tab').click();
    }

    function setupCodeMirror() {
        const cmConfig = (mode, readOnly = false, lineWrapping = false) => ({
            lineNumbers: true, theme: 'monokai', mode, readOnly, autoCloseBrackets: true,
            foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"], lineWrapping,
            highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true }
        });
        rawBodyEditor = CodeMirror.fromTextArea(document.getElementById('raw-body-content'), cmConfig('application/json'));
        responseBodyEditor = CodeMirror.fromTextArea(document.getElementById('response-body-display'), cmConfig('application/json', true, isLineWrapping));
        responseHeadersEditorRaw = CodeMirror.fromTextArea(document.getElementById('response-headers-display-raw'), cmConfig('text/plain', true, true));
        graphqlQueryEditor = CodeMirror.fromTextArea(document.getElementById('graphql-query-content'), cmConfig('graphql'));
        graphqlVariablesEditor = CodeMirror.fromTextArea(document.getElementById('graphql-variables-content'), cmConfig('application/json'));
        jwtPayloadEditor = CodeMirror.fromTextArea(document.getElementById('jwt-payload'), cmConfig('application/json'));
        jwtHeadersEditor = CodeMirror.fromTextArea(document.getElementById('jwt-headers'), cmConfig('application/json'));

        document.getElementById('raw-body-type-select').addEventListener('change', e => {
            const modeMap = { json: 'application/json', text: 'text/plain', html: 'text/html', xml: 'application/xml', javascript: 'application/javascript' };
            rawBodyEditor.setOption('mode', modeMap[e.target.value] || 'application/json');
            formatBodyBtn.style.display = e.target.value === 'json' ? 'block' : 'none';
        });
    }

    function setupBodyTypeSelector() {
        document.querySelectorAll('input[name="body-type"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.disabled) return;
                const selectedValue = document.querySelector('input[name="body-type"]:checked').value;
                document.querySelectorAll('.body-panel').forEach(panel => panel.classList.remove('active'));
                const targetPanel = document.getElementById(`body-panel-${selectedValue}`);
                if (targetPanel) targetPanel.classList.add('active');
                
                if (selectedValue === 'raw') rawBodyEditor.refresh();
                if (selectedValue === 'graphql') { graphqlQueryEditor.refresh(); graphqlVariablesEditor.refresh(); }
            });
        });
    }

    function setupAuthorizationTab() {
        const authDropdown = document.getElementById('auth-type-dropdown');
        authDropdown.addEventListener('click', (e) => { const li = e.target.closest('li[data-value]'); if (li && !li.hasAttribute('disabled')) { updateAuthUI(li.dataset.value); } });
        updateAuthUI('no-auth');
        const oauth2Btn = document.getElementById('oauth2-get-token-btn');
        if (oauth2Btn) { oauth2Btn.addEventListener('click', () => { vscode.postMessage({ command: 'showWarning', payload: 'The full OAuth 2.0 Authorization Code Grant flow is not yet implemented. This would typically open a browser for you to sign in. For now, please paste your Access Token manually.' }); }); }
        const jwtAdvancedPanel = document.getElementById('jwt-advanced-details');
        if (jwtAdvancedPanel) { jwtAdvancedPanel.addEventListener('toggle', () => { if (jwtAdvancedPanel.open) { if (jwtHeadersEditor) jwtHeadersEditor.refresh(); } }); }
    }

    function setupDropdowns() {
        document.body.addEventListener('click', (e) => {
            const target = e.target; const activeDropdown = target.closest('.custom-dropdown');
            if (!activeDropdown) { document.querySelectorAll('.custom-dropdown').forEach(d => { d.classList.remove('open'); d.querySelector('.dropdown-menu')?.classList.add('hidden'); }); return; }
            if (target.closest('.dropdown-selected')) {
                const menu = activeDropdown.querySelector('.dropdown-menu');
                if (menu) {
                    const isHidden = menu.classList.contains('hidden');
                    document.querySelectorAll('.custom-dropdown').forEach(d => { d.classList.remove('open'); d.querySelector('.dropdown-menu')?.classList.add('hidden'); });
                    if (isHidden) { menu.classList.remove('hidden'); activeDropdown.classList.add('open'); }
                } return;
            }
            const li = target.closest('li[data-value]');
            if (li && !li.hasAttribute('disabled')) {
                const value = li.dataset.value; activeDropdown.dataset.selectedValue = value;
                const simpleTextEl = activeDropdown.querySelector('.selected-text');
                if (simpleTextEl) { simpleTextEl.textContent = li.textContent; }
                else if (activeDropdown.id === 'method-dropdown') { const selectedText = activeDropdown.querySelector('#selected-method-text'); selectedText.textContent = value; selectedText.className = `method-text`; li.classList.forEach(c => { if(c.startsWith('method-')) selectedText.classList.add(c); }); }
                else if (activeDropdown.id === 'format-selector-dropdown') { activeDropdown.querySelector('#selected-format-text').textContent = li.querySelector('span:last-child').textContent; activeDropdown.querySelector('#selected-format-icon').textContent = li.dataset.icon; renderResponseBody(value); }
                const menu = li.closest('.dropdown-menu'); menu.querySelectorAll('li').forEach(item => item.classList.remove('active'));
                li.classList.add('active'); activeDropdown.classList.remove('open'); menu.classList.add('hidden');
            }
        });
        document.getElementById('custom-method-input')?.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const dropdown = e.target.closest('.custom-dropdown'); const value = e.target.value.trim().toUpperCase();
                if (value && dropdown) { const selectedText = dropdown.querySelector('#selected-method-text'); selectedText.textContent = value; selectedText.className = 'method-text'; dropdown.dataset.selectedValue = value; dropdown.classList.remove('open'); dropdown.querySelector('.dropdown-menu')?.classList.add('hidden'); e.target.value = ''; }
            }
        });
    }

    function setupToggles() {
        document.getElementById('headers-view-toggle')?.addEventListener('click', (e) => {
            const headersRawView = document.getElementById('headers-raw-view'); const headersTableView = document.getElementById('headers-table-view');
            const isRawViewActive = headersRawView.classList.contains('active');
            headersRawView.classList.toggle('active', !isRawViewActive); headersTableView.classList.toggle('active', isRawViewActive);
            e.target.textContent = isRawViewActive ? 'Raw' : 'Table';
            if (!isRawViewActive) setTimeout(() => responseHeadersEditorRaw.refresh(), 10);
        });
    }

    async function handleSendRequest() {
        spinnerOverlay.classList.remove('hidden'); sendBtn.disabled = true;
        let urlString = rawUrlInput.value.trim();
        if (!urlString) { vscode.postMessage({ command: 'showError', payload: { message: 'Request URL cannot be empty.' } }); spinnerOverlay.classList.add('hidden'); sendBtn.disabled = false; return; }
        
        // Resolve environment variables in URL
        if (selectedEnvironment && selectedEnvironment.variables) {
            urlString = resolveVariables(urlString, selectedEnvironment);
        }
        // Parse the URL and extract query params
        let urlObject;
        try {
            urlObject = new URL(urlString.startsWith('http') ? urlString : 'http://' + urlString);
        } catch (e) {
            vscode.postMessage({ command: 'showError', payload: { message: 'Invalid URL.' } }); spinnerOverlay.classList.add('hidden'); sendBtn.disabled = false; return;
        }
        // Extract params from URL
        let urlParams = {};
        urlObject.searchParams.forEach((value, key) => { urlParams[key] = value; });
        // Get params from fields
        const params = getKeyValueData('params-kv-body');
        // Merge params (fields take precedence)
        const mergedParams = { ...urlParams, ...params };
        // --- DEBUG LOGGING ---
        console.log('[DEBUG] Params from UI:', params);
        console.log('[DEBUG] Merged params:', mergedParams);
        // Remove all params from URL
        urlObject.search = '';
        // Add merged params to URL for sending
        Object.entries(mergedParams).forEach(([key, value]) => urlObject.searchParams.append(key, value));
        console.log('[DEBUG] Final URL:', urlObject.toString());
        const headers = getKeyValueData('headers-kv-body', true);
        let authPayload = { type: document.getElementById('auth-type-dropdown').dataset.selectedValue };
        switch (authPayload.type) {
            case 'basic': authPayload.username = document.getElementById('basic-username').value; authPayload.password = document.getElementById('basic-password').value; break;
            case 'bearer': authPayload.token = document.getElementById('bearer-token').value.trim(); break;
            case 'apikey': authPayload.key = document.getElementById('apikey-key').value.trim(); authPayload.value = document.getElementById('apikey-value').value.trim(); authPayload.addTo = document.getElementById('apikey-add-to').value; if (authPayload.addTo === 'query' && authPayload.key && authPayload.value) { urlObject.searchParams.append(authPayload.key, authPayload.value); } break;
            case 'jwt': authPayload.addTo = document.getElementById('jwt-add-to-dropdown').dataset.selectedValue; authPayload.headerPrefix = document.getElementById('jwt-header-prefix').value.trim(); authPayload.secret = document.getElementById('jwt-secret').value; try { authPayload.payload = JSON.parse(jwtPayloadEditor.getValue() || '{}'); authPayload.headers = JSON.parse(jwtHeadersEditor.getValue() || '{}'); } catch(e) { vscode.postMessage({ command: 'showError', payload: { message: 'JWT Headers or Payload must be valid JSON.' } }); spinnerOverlay.classList.add('hidden'); sendBtn.disabled = false; return; } break;
            case 'digest': authPayload.username = document.getElementById('digest-username').value; authPayload.password = document.getElementById('digest-password').value; authPayload.disableRetry = document.getElementById('digest-disable-retry').checked; authPayload.realm = document.getElementById('digest-realm').value; authPayload.nonce = document.getElementById('digest-nonce').value; authPayload.algorithm = document.getElementById('digest-algorithm').value; authPayload.qop = document.getElementById('digest-qop').value; authPayload.nonceCount = document.getElementById('digest-nc').value; authPayload.clientNonce = document.getElementById('digest-cnonce').value; authPayload.opaque = document.getElementById('digest-opaque').value; break;
            case 'oauth1': authPayload.addTo = document.getElementById('oauth1-add-to-dropdown').dataset.selectedValue; authPayload.signatureMethod = document.getElementById('oauth1-signature-method').value; authPayload.consumerKey = document.getElementById('oauth1-consumer-key').value; authPayload.consumerSecret = document.getElementById('oauth1-consumer-secret').value; authPayload.accessToken = document.getElementById('oauth1-token').value; authPayload.tokenSecret = document.getElementById('oauth1-token-secret').value; authPayload.callbackURL = document.getElementById('oauth1-callback-url').value; authPayload.verifier = document.getElementById('oauth1-verifier').value; authPayload.timestamp = document.getElementById('oauth1-timestamp').value; authPayload.nonce = document.getElementById('oauth1-nonce').value; authPayload.version = document.getElementById('oauth1-version').value; authPayload.realm = document.getElementById('oauth1-realm').value; break;
            case 'oauth2': authPayload.addTo = document.getElementById('oauth2-add-to-dropdown').dataset.selectedValue; authPayload.accessToken = document.getElementById('oauth2-token').value.trim(); authPayload.headerPrefix = document.getElementById('oauth2-header-prefix').value.trim() || 'Bearer'; authPayload.config = { tokenName: document.getElementById('oauth2-token-name').value, grantType: document.getElementById('oauth2-grant-type').value, callbackURL: document.getElementById('oauth2-callback-url').value, authURL: document.getElementById('oauth2-auth-url').value, accessTokenURL: document.getElementById('oauth2-token-url').value, clientID: document.getElementById('oauth2-client-id').value, clientSecret: document.getElementById('oauth2-client-secret').value, scope: document.getElementById('oauth2-scope').value, state: document.getElementById('oauth2-state').value, clientAuthentication: document.getElementById('oauth2-client-auth').value }; break;
            case 'ntlm': authPayload.username = document.getElementById('ntlm-username').value; authPayload.password = document.getElementById('ntlm-password').value; authPayload.domain = document.getElementById('ntlm-domain').value; break;
            case 'awsv4': authPayload.accessKeyId = document.getElementById('aws-access-key').value; authPayload.secretAccessKey = document.getElementById('aws-secret-key').value; authPayload.region = document.getElementById('aws-region').value; authPayload.service = document.getElementById('aws-service-name').value; authPayload.sessionToken = document.getElementById('aws-session-token').value; break;
            case 'hawk': authPayload.authId = document.getElementById('hawk-id').value; authPayload.authKey = document.getElementById('hawk-key').value; authPayload.algorithm = document.getElementById('hawk-algorithm').value; authPayload.user = document.getElementById('hawk-user').value; authPayload.nonce = document.getElementById('hawk-nonce').value; authPayload.ext = document.getElementById('hawk-ext').value; authPayload.app = document.getElementById('hawk-app').value; authPayload.dlg = document.getElementById('hawk-dlg').value; break;
        }
        let body = null;
        const bodyType = document.querySelector('input[name="body-type"]:checked').value;
        let rawBody = '', formBody = {}, graphqlQuery = '', graphqlVariables = {}, paramsData = {};
        switch (bodyType) {
            case 'x-www-form-urlencoded':
                formBody = getKeyValueData('urlencoded-kv-body');
                body = new URLSearchParams(formBody).toString();
                if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
                break;
            case 'raw':
                rawBody = rawBodyEditor.getValue();
                body = rawBody;
                const rawType = document.getElementById('raw-body-type-select').value;
                const mimeMap = { json: 'application/json', text: 'text/plain', html: 'text/html', xml: 'application/xml', javascript: 'application/javascript' };
                if (!headers['Content-Type']) { headers['Content-Type'] = mimeMap[rawType] || 'application/json'; }
                break;
            case 'graphql':
                graphqlQuery = graphqlQueryEditor.getValue();
                try { graphqlVariables = JSON.parse(graphqlVariablesEditor.getValue() || '{}'); } catch (e) { vscode.postMessage({ command: 'showError', payload: { message: 'GraphQL variables must be valid JSON.' } }); spinnerOverlay.classList.add('hidden'); sendBtn.disabled = false; return; }
                body = JSON.stringify({ query: graphqlQuery, variables: graphqlVariables });
                if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
                break;
        }
        // Save only the base URL (no params) and merged params
        vscode.postMessage({
            command: 'runRequest',
            payload: {
                method: document.getElementById('method-dropdown').dataset.selectedValue,
                url: urlObject.origin + urlObject.pathname,
                headers,
                body,
                auth: authPayload,
                bodyType,
                rawBody,
                formBody,
                graphqlQuery,
                graphqlVariables,
                params: mergedParams
            }
        });
    }

    function getCurrentResponseContent() {
        const activeView = document.querySelector('#tab-response-body .response-body-viewport > div:not(.hidden)');
        if (!activeView) return '';

        switch (activeView.id) {
            case 'codemirror-view-wrapper': return responseBodyEditor.getValue();
            case 'hex-view-wrapper': return activeView.innerText;
            case 'raw-text-view-wrapper': return document.getElementById('raw-text-pre').textContent;
            case 'json-tree-view-wrapper':
                try { return JSON.stringify(JSON.parse(currentResponseData.text), null, 2); }
                catch (e) { return currentResponseData.text; }
            default: return '';
        }
    }
    
    function setupResponseBodyActions() {
        wrapBtn.addEventListener('click', () => {
            isLineWrapping = !isLineWrapping;
            responseBodyEditor.setOption('lineWrapping', isLineWrapping);
            wrapBtn.classList.toggle('active', isLineWrapping);
            responseBodyEditor.refresh();
        });
        copyBtn.addEventListener('click', () => {
            const content = getCurrentResponseContent();
            if (content) {
                navigator.clipboard.writeText(content).then(() => {
                    const originalIcon = copyBtn.innerHTML;
                    copyBtn.innerHTML = '✓'; copyBtn.title = 'Copied!'; copyBtn.disabled = true;
                    setTimeout(() => { copyBtn.innerHTML = originalIcon; copyBtn.title = 'Copy to Clipboard'; copyBtn.disabled = false; }, 1500);
                });
            }
        });
        saveBtn.addEventListener('click', () => {
            const content = getCurrentResponseContent();
            const format = formatSelectorDropdown.dataset.selectedValue || 'JSON';
            if (content) { vscode.postMessage({ command: 'saveResponse', payload: { content, format } }); }
        });
    }

    function setupSearch() {
    const clearSearch = () => {
        responseBodyEditor.operation(() => {
            if (searchState.activeMark) {
                searchState.activeMark.clear();
                searchState.activeMark = null;
            }
            searchState.marked.forEach(mark => mark.clear());
            searchState.marked = [];
        });
    };

    const doSearch = () => {
        clearSearch();
        const query = searchWidgetInput.value;
        if (!query) {
            searchWidgetMatches.textContent = '';
            return;
        }

        responseBodyEditor.operation(() => {
            // Use CodeMirror's search cursor for finding matches
            const cursor = responseBodyEditor.getSearchCursor(query, { line: 0, ch: 0 }, { caseFold: true });
            while (cursor.findNext()) {
                // Store a marker for each found match
                searchState.marked.push(responseBodyEditor.markText(cursor.from(), cursor.to(), { className: 'cm-matchhighlight' }));
            }
        });
        
        if (searchState.marked.length > 0) {
            jumpTo(0); // Highlight the first match
        } else {
            searchWidgetMatches.textContent = 'No results';
        }
    };

    const jumpTo = (index) => {
        // Clear previous active highlight
        if (searchState.activeMark) {
            searchState.activeMark.clear();
        }

        const mark = searchState.marked[index];
        // Ensure the mark still exists before using it
        const pos = mark ? mark.find() : null;
        if (pos) {
            // Create a new active highlight
            searchState.activeMark = responseBodyEditor.markText(pos.from, pos.to, { className: 'cm-matchhighlight-active' });
            responseBodyEditor.scrollIntoView(pos.from, 50); // Center the match
            searchWidgetMatches.textContent = `${index + 1} of ${searchState.marked.length}`;
        }
    };
    
    const move = (dir) => {
        // If no search has been performed yet, do one now
        if (searchState.marked.length === 0) {
            doSearch();
            return;
        }

        let currentIndex = -1;
        if (searchState.activeMark) {
            const activePos = searchState.activeMark.find();
            if (activePos) {
                // Find the index of the currently active highlighted match
                for (let i = 0; i < searchState.marked.length; i++) {
                    const markedPos = searchState.marked[i].find();
                    if (markedPos && markedPos.from.line === activePos.from.line && markedPos.from.ch === activePos.from.ch) {
                        currentIndex = i;
                        break;
                    }
                }
            }
        }
        
        const total = searchState.marked.length;
        // Calculate next index with wrap-around
        const nextIndex = (currentIndex + dir + total) % total;
        jumpTo(nextIndex);
    };

    const openSearchWidget = () => {
        searchWidget.classList.add('visible');
        searchWidgetInput.focus();
        searchWidgetInput.select();
    };

    const closeSearchWidget = () => {
        searchWidget.classList.remove('visible');
        clearSearch();
        responseBodyEditor.focus();
    };
    
    // --- Event Listeners ---
    searchBtn.addEventListener('click', openSearchWidget);
    searchWidgetClose.addEventListener('click', closeSearchWidget);
    searchWidgetNext.addEventListener('click', () => move(1));
    searchWidgetPrev.addEventListener('click', () => move(-1));
    
    let searchTimeout;
    searchWidgetInput.addEventListener('input', () => {
        // Debounce the search to avoid running it on every single keystroke
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(doSearch, 150);
    });

    searchWidgetInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            move(e.shiftKey ? -1 : 1); // Shift+Enter for previous
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSearchWidget();
        }
    });

    // Global keydown for Ctrl/Cmd + F
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            openSearchWidget();
        }
    });
}

    function updateHttpSvgTextAndColor() {
        const methodDropdown = document.getElementById('method-dropdown');
        const selectedMethod = methodDropdown?.dataset.selectedValue || 'GET';
        const svg = document.querySelector('.http-icon svg');
        const textEl = svg?.querySelector('text');
        const rectEl = svg?.querySelector('rect');
        if (textEl && rectEl && svg) {
            // Set text content to method (no braces)
            textEl.textContent = selectedMethod;
            // Remove previous color
            textEl.removeAttribute('fill');
            // Find the color from the dropdown
            const methodClass = `method-${selectedMethod.toLowerCase()}`;
            const temp = document.createElement('span');
            temp.className = methodClass;
            document.body.appendChild(temp);
            const color = getComputedStyle(temp).color;
            document.body.removeChild(temp);
            textEl.setAttribute('fill', color);
            // Dynamically adjust rect width/x to fit text
            // Create a temporary SVG text element to measure width
            const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tempText.setAttribute('font-family', textEl.getAttribute('font-family'));
            tempText.setAttribute('font-size', textEl.getAttribute('font-size'));
            tempText.textContent = selectedMethod;
            tempSvg.appendChild(tempText);
            document.body.appendChild(tempSvg);
            let textWidth = tempText.getBBox().width;
            document.body.removeChild(tempSvg);
            // Add padding to left/right
            const padding = 24;
            let rectWidth = Math.max(70, textWidth + padding);
            let rectX = 60 - rectWidth / 2;
            rectEl.setAttribute('width', rectWidth);
            rectEl.setAttribute('x', rectX);
            // Keep text centered
            textEl.setAttribute('x', '60');
        }
    }

    function initialize() {
        console.log('[DEBUG] Starting initialization...');

        // Wait for DOM to be fully loaded before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initializeWhenReady();
            });
        } else {
            initializeWhenReady();
        }
    }

    function initializeWhenReady() {
        console.log('[DEBUG] DOM ready, initializing components...');

        // Core setup functions
        setupCodeMirror();
        setupTabs();
        setupKeyValueEditors();
        setupDropdowns();
        setupToggles();
        setupAuthorizationTab();
        setupBodyTypeSelector();
        setupResponseBodyActions();
        setupSearch();
        setupEnvironmentSelector();
        setupVariableSuggestions();

        // Dialog setup functions with retry logic
        setTimeout(() => {
            setupImportDialog();
            setupExportDialog();
            setupAIChatWidget();
            setupFloatingWidget();
        }, 100);

        // Button setup functions
        setTimeout(() => {
            setupClearButton();
            setupCookieActions();
        }, 100);

        // Event listeners
        if (sendBtn) {
            sendBtn.addEventListener('click', handleSendRequest);
        }

        if (formatBodyBtn) {
            formatBodyBtn.addEventListener('click', () => {
                try {
                    const f = JSON.stringify(JSON.parse(rawBodyEditor.getValue()), null, 2);
                    rawBodyEditor.setValue(f);
                } catch (e) {
                    vscode.postMessage({ command: 'showWarning', payload: 'Invalid JSON.' });
                }
            });
        }

        window.addEventListener('message', handleExtensionMessages);
        updateRequestHeaderCount();

        // Set initial format selector state
        setTimeout(() => {
            const jsonFormatOption = document.querySelector('#format-selector-dropdown li[data-value="JSON"]');
            if (jsonFormatOption) {
                jsonFormatOption.classList.add('active');
            }
        }, 100);

        console.log('[Webview] Initialization complete.');

        // Focus on URL input
        if (rawUrlInput) {
            rawUrlInput.focus();
        }

        // Request name input logic
        const requestNameInput = document.getElementById('request-name-input');
        if (requestNameInput) {
            requestNameInput.value = requestName;
            requestNameInput.addEventListener('input', (e) => {
                requestName = e.target.value || 'Untitled Request';
            });
        }

        updateHttpSvgTextAndColor();
        const methodDropdown = document.getElementById('method-dropdown');
        if (methodDropdown) {
            methodDropdown.addEventListener('click', (e) => {
                setTimeout(updateHttpSvgTextAndColor, 0);
            });
        }

        // Request initial environment data
        vscode.postMessage({ command: 'getEnvironments' });

        // Apply initial variable highlighting
        setTimeout(() => {
            const urlInput = document.getElementById('raw-url');
            if (urlInput) {
                highlightVariables(urlInput);
                highlightVariablesInText(urlInput);
                highlightVariablesInInput(urlInput);
            }
        }, 100);
    }

    function setupCookieActions() {
        const copyAllBtn = document.getElementById('cookies-copy-btn');
        const clearAllBtn = document.getElementById('cookies-clear-btn');

        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', copyAllCookies);
        }

        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAllCookies);
        }
    }

    function setupAIChatWidget() {
        console.log('[DEBUG] Setting up AI chat widget...');

        // Wait for elements to be available
        const checkElements = () => {
            const aiGenerateBtn = document.getElementById('widget-ai-generate');
            const aiChatWidget = document.getElementById('ai-chat-widget');

            if (!aiGenerateBtn || !aiChatWidget) {
                console.log('[DEBUG] AI chat widget elements not found, retrying...');
                setTimeout(checkElements, 100);
                return;
            }

            setupAIChatWidgetElements();
        };

        const setupAIChatWidgetElements = () => {
            const aiGenerateBtn = document.getElementById('widget-ai-generate');
            const aiChatWidget = document.getElementById('ai-chat-widget');
            const aiInputMode = document.getElementById('ai-input-mode');
            const aiChatMode = document.getElementById('ai-chat-mode');
            const aiCompactInput = document.getElementById('ai-compact-input');
            const aiSendCompactBtn = document.getElementById('ai-send-compact-btn');
            const aiPlusBtn = document.getElementById('ai-plus-btn');
            const aiChatClose = document.getElementById('ai-chat-close');
            const aiChatMenuBtn = document.getElementById('ai-chat-menu-btn');
            const aiChatMenuDropdown = document.getElementById('ai-chat-menu-dropdown');
            const aiChatInput = document.getElementById('ai-chat-input');
            const aiChatSendBtn = document.getElementById('ai-chat-send-btn');
            const configureAiChatSettings = document.getElementById('configure-ai-chat-settings');
            const clearChatConversation = document.getElementById('clear-chat-conversation');

            console.log('[DEBUG] AI chat widget elements found, setting up...');

            // Show AI chat widget
            aiGenerateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] AI Generate button clicked');
                aiChatWidget.classList.remove('hidden');
                if (aiCompactInput) {
                    setTimeout(() => aiCompactInput.focus(), 100);
                }
            });

            // Compact input handling
            if (aiCompactInput) {
                aiCompactInput.addEventListener('input', (e) => {
                    const hasText = e.target.value.trim().length > 0;
                    if (aiSendCompactBtn) {
                        aiSendCompactBtn.disabled = !hasText;
                    }
                });

                aiCompactInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (aiSendCompactBtn && !aiSendCompactBtn.disabled) {
                            aiSendCompactBtn.click();
                        }
                    }
                });
            }

            // Compact send button
            if (aiSendCompactBtn) {
                aiSendCompactBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Compact send button clicked');
                    const prompt = aiCompactInput?.value?.trim();
                    if (!prompt) return;

                    // Expand to chat mode
                    expandToChatMode();

                    // Add user message and send to AI
                    addChatMessage('user', prompt);
                    sendToAI(prompt);

                    // Clear compact input
                    if (aiCompactInput) {
                        aiCompactInput.value = '';
                        aiSendCompactBtn.disabled = true;
                    }
                });
            }

            // Plus button (for future image/context features)
            if (aiPlusBtn) {
                aiPlusBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Plus button clicked');
                    // Future: Add image or context menu
                });
            }

            // Chat input handling
            if (aiChatInput) {
                aiChatInput.addEventListener('input', (e) => {
                    const hasText = e.target.value.trim().length > 0;
                    if (aiChatSendBtn) {
                        aiChatSendBtn.disabled = !hasText;
                    }
                    // Auto-resize textarea
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
                });

                aiChatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (aiChatSendBtn && !aiChatSendBtn.disabled) {
                            aiChatSendBtn.click();
                        }
                    }
                });
            }

            // Chat send button
            if (aiChatSendBtn) {
                aiChatSendBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Chat send button clicked');
                    const prompt = aiChatInput?.value?.trim();
                    if (!prompt) return;

                    // Add user message and send to AI
                    addChatMessage('user', prompt);
                    sendToAI(prompt);

                    // Clear input
                    if (aiChatInput) {
                        aiChatInput.value = '';
                        aiChatInput.style.height = 'auto';
                        aiChatSendBtn.disabled = true;
                    }
                });
            }

            // Close chat widget
            const closeChatWidget = () => {
                console.log('[DEBUG] Closing AI chat widget');
                aiChatWidget.classList.add('hidden');
                collapseToInputMode();
            };

            if (aiChatClose) {
                aiChatClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeChatWidget();
                });
            }

            // Chat menu button
            if (aiChatMenuBtn) {
                aiChatMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Chat menu button clicked');
                    const isHidden = aiChatMenuDropdown.classList.contains('hidden');
                    if (isHidden) {
                        aiChatMenuDropdown.classList.remove('hidden');
                    } else {
                        aiChatMenuDropdown.classList.add('hidden');
                    }
                });
            }

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!aiChatMenuBtn?.contains(e.target) && !aiChatMenuDropdown?.contains(e.target)) {
                    aiChatMenuDropdown?.classList.add('hidden');
                }
            });

            // Configure AI settings
            if (configureAiChatSettings) {
                configureAiChatSettings.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Configure AI chat settings clicked');
                    aiChatMenuDropdown.classList.add('hidden');
                    vscode.postMessage({
                        command: 'openAIConfigPanel',
                        payload: {}
                    });
                });
            }

            // Clear conversation
            if (clearChatConversation) {
                clearChatConversation.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Clear chat conversation clicked');
                    aiChatMenuDropdown.classList.add('hidden');
                    clearChatMessages();
                });
            }

            // New chat
            const newChatConversation = document.getElementById('new-chat-conversation');
            if (newChatConversation) {
                newChatConversation.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] New chat conversation clicked');
                    aiChatMenuDropdown.classList.add('hidden');
                    startNewChat();
                });
            }

            // Handle keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !aiChatWidget.classList.contains('hidden')) {
                    closeChatWidget();
                }
            });

            console.log('[DEBUG] AI chat widget setup complete');
        };

        checkElements();
    }

    // Chat widget state management
    let currentAIResponse = null;
    let isChatMode = false;
    let conversationHistory = [];

    function expandToChatMode() {
        const inputMode = document.getElementById('ai-input-mode');
        const chatMode = document.getElementById('ai-chat-mode');

        if (inputMode && chatMode) {
            inputMode.classList.add('hidden');
            chatMode.classList.remove('hidden');
            isChatMode = true;

            // Focus on chat input
            setTimeout(() => {
                const chatInput = document.getElementById('ai-chat-input');
                if (chatInput) {
                    chatInput.focus();
                }
            }, 100);
        }
    }

    function collapseToInputMode() {
        const inputMode = document.getElementById('ai-input-mode');
        const chatMode = document.getElementById('ai-chat-mode');

        if (inputMode && chatMode) {
            chatMode.classList.add('hidden');
            inputMode.classList.remove('hidden');
            isChatMode = false;
            clearChatMessages();
        }
    }

    function addChatMessage(type, content) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

        // Hide empty state when first message is added
        const emptyState = document.getElementById('ai-empty-state');
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ai-${type}-message`;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = `ai-message-avatar ai-${type}-avatar`;

        if (type === 'user') {
            avatarDiv.innerHTML = `<svg width="80px" height="80px" viewBox="0 0 20 20" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#000000" stroke="#000000">

<g id="SVGRepo_bgCarrier" stroke-width="0"/>

<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/>

<g id="SVGRepo_iconCarrier"> <g id="layer1"> <path d="M 10 0 C 4.4830748 0 0 4.4830748 0 10 C 0 15.516925 4.4830748 20 10 20 C 15.516925 20 20 15.516925 20 10 C 20 4.4830748 15.516925 0 10 0 z M 10 1 C 14.976485 1 19 5.0235149 19 10 C 19 12.349397 18.095422 14.478558 16.625 16.080078 L 15.998047 15.878906 L 15.15625 15.646484 L 14.306641 15.449219 L 13.447266 15.287109 L 13.322266 15.25 L 13.212891 15.181641 L 13.125 15.087891 L 13.0625 14.974609 L 13.033203 14.847656 L 13.035156 14.720703 L 13.070312 14.595703 L 13.136719 14.484375 L 13.347656 14.193359 L 13.529297 13.884766 L 13.833984 13.275391 L 14.103516 12.652344 L 14.339844 12.013672 L 14.541016 11.361328 L 14.705078 10.703125 L 14.833984 10.035156 L 14.925781 9.359375 L 14.982422 8.6816406 L 15 8.0019531 L 14.982422 7.5664062 L 14.923828 7.1328125 L 14.830078 6.7070312 L 14.697266 6.2910156 L 14.53125 5.8886719 L 14.330078 5.5 L 14.097656 5.1328125 L 13.830078 4.7871094 L 13.537109 4.4648438 L 13.212891 4.171875 L 12.869141 3.90625 L 12.5 3.6699219 L 12.113281 3.46875 L 11.710938 3.3027344 L 11.294922 3.1699219 L 10.867188 3.0761719 L 10.435547 3.0195312 L 10 3 L 9.5644531 3.0195312 L 9.1328125 3.0761719 L 8.7050781 3.1699219 L 8.2890625 3.3027344 L 7.8867188 3.46875 L 7.5 3.6699219 L 7.1328125 3.90625 L 6.7871094 4.171875 L 6.4628906 4.4648438 L 6.1699219 4.7871094 L 5.9042969 5.1328125 L 5.6699219 5.5 L 5.46875 5.8886719 L 5.3027344 6.2910156 L 5.1699219 6.7070312 L 5.0761719 7.1328125 L 5.0195312 7.5664062 L 5 8.0019531 L 5.0175781 8.6816406 L 5.0742188 9.359375 L 5.1660156 10.035156 L 5.2949219 10.703125 L 5.4589844 11.361328 L 5.6601562 12.013672 L 5.8984375 12.652344 L 6.1660156 13.275391 L 6.4707031 13.884766 L 6.6523438 14.193359 L 6.8632812 14.484375 L 6.9296875 14.595703 L 6.9648438 14.720703 L 6.96875 14.847656 L 6.9375 14.974609 L 6.875 15.087891 L 6.7871094 15.181641 L 6.6777344 15.25 L 6.5527344 15.287109 L 5.6953125 15.449219 L 4.84375 15.646484 L 4.0019531 15.878906 L 3.375 16.080078 C 1.9045777 14.478558 1 12.349397 1 10 C 1 5.0235149 5.0235149 1 10 1 z M 10 4 L 10.392578 4.0195312 L 10.78125 4.078125 L 11.160156 4.1738281 L 11.529297 4.3046875 L 11.886719 4.4746094 L 12.222656 4.6738281 L 12.537109 4.9082031 L 12.830078 5.171875 L 13.091797 5.4628906 L 13.326172 5.7792969 L 13.527344 6.1152344 L 13.695312 6.4707031 L 13.828125 6.8398438 L 13.923828 7.2207031 L 13.982422 7.609375 L 14 8.0019531 L 13.984375 8.6289062 L 13.931641 9.2519531 L 13.845703 9.8710938 L 13.728516 10.486328 L 13.576172 11.09375 L 13.390625 11.693359 L 13.173828 12.279297 L 12.925781 12.855469 L 12.646484 13.416016 L 12.509766 13.644531 L 12.351562 13.865234 L 12.220703 14.0625 L 12.121094 14.279297 L 12.056641 14.509766 L 12.029297 14.748047 L 12.042969 14.986328 L 12.091797 15.220703 L 12.177734 15.443359 L 12.298828 15.652344 L 12.451172 15.835938 L 12.628906 15.996094 L 12.830078 16.123047 L 13.052734 16.216797 L 13.283203 16.273438 L 14.099609 16.427734 L 14.912109 16.615234 L 15.712891 16.835938 L 15.8125 16.867188 C 14.244524 18.195439 12.219491 19 10 19 C 7.7805094 19 5.7554759 18.195439 4.1875 16.867188 L 4.2871094 16.835938 L 5.0878906 16.615234 L 5.9003906 16.427734 L 6.7167969 16.273438 L 6.9472656 16.216797 L 7.1699219 16.123047 L 7.3710938 15.996094 L 7.5507812 15.835938 L 7.7011719 15.652344 L 7.8222656 15.443359 L 7.9101562 15.220703 L 7.9570312 14.986328 L 7.9707031 14.748047 L 7.9433594 14.509766 L 7.8789062 14.279297 L 7.7792969 14.0625 L 7.6484375 13.865234 L 7.4902344 13.644531 L 7.3535156 13.416016 L 7.0742188 12.855469 L 6.8261719 12.279297 L 6.609375 11.693359 L 6.4238281 11.09375 L 6.2734375 10.486328 L 6.1542969 9.8710938 L 6.0683594 9.2519531 L 6.015625 8.6289062 L 6 8.0019531 L 6.0195312 7.609375 L 6.078125 7.2207031 L 6.171875 6.8398438 L 6.3046875 6.4707031 L 6.4726562 6.1152344 L 6.6738281 5.7792969 L 6.9082031 5.4628906 L 7.1699219 5.171875 L 7.4628906 4.9082031 L 7.7773438 4.6738281 L 8.1152344 4.4746094 L 8.4707031 4.3046875 L 8.8398438 4.1738281 L 9.21875 4.078125 L 9.6074219 4.0195312 L 10 4 z " style="fill:#0084ff; fill-opacity:1; stroke:none; stroke-width:0px;"/> </g> </g>

</svg>`; // User avatar shows first letter
        } else {
            avatarDiv.innerHTML = `<svg fill="#d6b912ff" height="80px" width="80px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
	 viewBox="0 0 512 512" xml:space="preserve">
<g>
	<g>
		<path d="M98.218,331.592v16.696H83.404c-6.552-15.653-22.026-26.68-40.028-26.68C19.458,321.608,0,341.067,0,364.984
			c0,23.917,19.457,43.375,43.375,43.375c18.003,0,33.476-11.027,40.028-26.68h48.206v-50.087H98.218z"/>
	</g>
</g>
<g>
	<g>
		<path d="M468.625,321.608c-18.003,0-33.476,11.027-40.028,26.68h-14.815v-16.696H380.39v50.087h48.206
			c6.552,15.653,22.026,26.68,40.028,26.68c23.917,0,43.375-19.458,43.375-43.375C512,341.067,492.543,321.608,468.625,321.608z"/>
	</g>
</g>
<g>
	<g>
		<path d="M225.667,427.087v-18.729h-33.391v18.729c-15.653,6.554-26.68,22.026-26.68,40.028c0,23.917,19.457,43.375,43.375,43.375
			c23.918,0,43.375-19.458,43.375-43.375C252.347,449.113,241.32,433.641,225.667,427.087z"/>
	</g>
</g>
<g>
	<g>
		<path d="M319.724,427.087v-18.729h-33.391v18.729c-15.653,6.554-26.68,22.026-26.68,40.028c0,23.917,19.457,43.375,43.375,43.375
			c23.918,0,43.375-19.458,43.375-43.375C346.404,449.113,335.377,433.641,319.724,427.087z"/>
	</g>
</g>
<g>
	<g>
		<path d="M445.058,123.568c-12.596-12.22-28.417-20.261-45.608-23.364c-3.867-24.924-15.987-47.865-34.975-65.742
			c-22.573-21.25-52.366-32.953-83.892-32.953c-37.307,0-71.873,16.42-94.583,44.429c-4.188-0.578-8.428-0.868-12.686-0.868
			c-21.31,0-41.95,7.38-58.114,20.779c-13.722,11.376-23.517,26.458-28.178,43.154c-27.944,14.675-45.551,42.928-45.551,74.212
			c0,36.19,23.639,67.125,56.751,79.123l11.637-0.011c0.834-8.351,0.938-9.599,3.336-17.609c-2.396-8.004-3.635-16.355-3.635-24.731
			c0-28.124,13.63-53.978,35.877-69.982c10.515-33.516,41.924-57.663,78.448-57.663c11.125,0,22.037,2.262,32.118,6.551
			c10.081-4.29,20.993-6.551,32.118-6.551c36.526,0,67.933,24.148,78.448,57.663c22.246,16.003,35.877,41.857,35.877,69.982
			c0,8.376-1.239,16.727-3.635,24.731c2.396,8.011,2.502,9.258,3.336,17.609l11.637,0.011
			c33.111-11.996,56.751-42.932,56.754-79.123C470.536,160.692,461.488,139.509,445.058,123.568z"/>
	</g>
</g>
<g>
	<g>
		<path d="M223.882,125.735c-25.836,0-47.036,20.178-48.698,45.601c-18.982,8.106-32.236,27.018-32.236,48.652
			c0,8.929,2.234,17.342,6.158,24.725c-4.013,7.555-6.158,16.019-6.158,24.76c0,21.835,13.308,40.617,32.237,48.669
			c0.89,13.561,7.344,25.626,17.091,33.932v22.892h33.391v-11.281c4.75-0.173,9.325-1.036,13.637-2.478V128.237
			C234.456,126.615,229.27,125.735,223.882,125.735z"/>
	</g>
</g>
<g>
	<g>
		<path d="M362.893,244.714c3.924-7.383,6.158-15.796,6.158-24.725c0-21.634-13.254-40.546-32.236-48.652
			c-1.662-25.423-22.862-45.601-48.698-45.601c-5.388,0-10.574,0.88-15.422,2.502v232.971c4.312,1.441,8.887,2.305,13.637,2.478
			v11.281h33.391v-22.892c9.747-8.307,16.2-20.372,17.091-33.932c18.93-8.052,32.237-26.834,32.237-48.669
			C369.052,260.733,366.906,252.269,362.893,244.714z"/>
	</g>
</g>
</svg>`; // AI avatar shows star
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'ai-message-content';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'ai-message-bubble';

        if (type === 'user') {
            const userContent = document.createElement('p');
            userContent.textContent = content;
            userContent.style.margin = '0';
            bubbleDiv.appendChild(userContent);
        } else {
            // AI response - clean the content first
            let cleanContent = content;

            // If content contains curl, clean it by removing prefix text
            if (content.includes('curl')) {
                // Remove common AI prefixes that might appear before the curl command
                cleanContent = content
                    .replace(/^(Generated Curl Command|Here's the cURL command|Here is the cURL command|Curl Command|Generated cURL|cURL Command)[\s:]*\s*/i, '')
                    .replace(/^(Sure,?\s*)?Here['']?s?\s+(the\s+)?c?URL\s+command[\s:]*\s*/i, '')
                    .replace(/^(I['']?ve\s+)?[Gg]enerated\s+(the\s+)?c?URL\s+command[\s:]*\s*/i, '')
                    .replace(/^[A-Z][a-z]+[\s:]*\s*/g, '') // Remove sentences starting with capital letters
                    .trim();

                // Ensure it starts with curl
                if (!cleanContent.toLowerCase().startsWith('curl')) {
                    // If it doesn't start with curl after cleaning, it might be wrapped in other text
                    // Try to extract just the curl part
                    const curlMatch = cleanContent.match(/curl\s+[^\n\r]*/i);
                    if (curlMatch) {
                        cleanContent = curlMatch[0];
                    }
                }
            }

            const aiContent = document.createElement('p');
            aiContent.textContent = content.includes('curl') ?
                'Here\'s the cURL command for your request:' :
                content;
            aiContent.style.margin = '0 0 12px 0';
            bubbleDiv.appendChild(aiContent);

            // Add cURL preview if it's a cURL response
            if (content.includes('curl')) {
                const curlPreview = document.createElement('div');
                curlPreview.className = 'ai-curl-preview';

                const curlTextarea = document.createElement('div');
                curlTextarea.className = 'ai-curl-textarea';
                curlTextarea.innerText = cleanContent;
                curlTextarea.readOnly = true;

                const copyBtn = document.createElement('button');
                copyBtn.className = 'ai-copy-btn';
                copyBtn.textContent = 'Copy';
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(cleanContent).then(() => {
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                        }, 1500);
                    });
                });

                const acceptBtn = document.createElement('button');
                acceptBtn.className = 'ai-accept-btn';
                acceptBtn.textContent = 'Accept';
                acceptBtn.addEventListener('click', () => {
                    try {
                        // Clear all fields first
                        clearAllFields();

                        // Parse the cURL command and populate fields (use cleaned content)
                        const parsedData = parseCurlCommand(cleanContent);
                        if (parsedData) {
                            populateRequestFields(parsedData);

                            // Show success feedback
                            const originalText = acceptBtn.textContent;
                            acceptBtn.textContent = 'Accepted!';
                            acceptBtn.style.backgroundColor = '#4CAF50';
                            setTimeout(() => {
                                acceptBtn.textContent = originalText;
                                acceptBtn.style.backgroundColor = '';
                            }, 1500);

                            vscode.postMessage({
                                command: 'showInfo',
                                payload: 'Request fields populated successfully!'
                            });
                        } else {
                            vscode.postMessage({
                                command: 'showError',
                                payload: { message: 'Failed to parse the cURL command. Please check the format.' }
                            });
                        }
                    } catch (error) {
                        vscode.postMessage({
                            command: 'showError',
                            payload: { message: `Failed to accept cURL command: ${error.message}` }
                        });
                    }
                });

                curlPreview.appendChild(curlTextarea);
                curlPreview.appendChild(copyBtn);
                curlPreview.appendChild(acceptBtn);
                bubbleDiv.appendChild(curlPreview);

                // Store the response for accept buttons (if we add them later)
                currentAIResponse = cleanContent;
            }
        }

        const timeDiv = document.createElement('div');
        timeDiv.className = 'ai-message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubbleDiv.appendChild(timeDiv);
        contentDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);

        messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function sendToAI(prompt) {
        // Show loading state
        addChatMessage('ai', 'Generating cURL command...');

        // Add user message to conversation history
        conversationHistory.push({
            role: 'user',
            content: prompt
        });

        // Send to AI service with conversation history
        vscode.postMessage({
            command: 'generateCurlFromAI',
            payload: {
                prompt,
                conversationHistory: conversationHistory
            }
        });
    }

    function clearChatMessages() {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (messagesContainer) {
            // Keep only the first message if it exists, or clear all
            const messages = messagesContainer.querySelectorAll('.ai-message');
            for (let i = messages.length - 1; i >= 0; i--) {
                messages[i].remove();
            }
        }

        // Show empty state again when all messages are cleared
        const emptyState = document.getElementById('ai-empty-state');
        if (emptyState) {
            emptyState.style.display = 'flex';
        }

        currentAIResponse = null;
        conversationHistory = [];
    }

    function manageConversationHistory() {
        // Keep only the last 20 message pairs (40 total messages) to prevent memory issues
        const maxPairs = 20;
        const maxMessages = maxPairs * 2;

        if (conversationHistory.length > maxMessages) {
            // Remove oldest messages, keeping the most recent ones
            conversationHistory = conversationHistory.slice(-maxMessages);
            console.log('[AI] Conversation history trimmed to last', maxMessages, 'messages');
        }
    }

    function startNewChat() {
        // Clear all messages and history
        clearChatMessages();

        // Show confirmation
        vscode.postMessage({
            command: 'showInfo',
            payload: 'Started new chat conversation!'
        });
    }

    function setupFloatingWidget() {
        const widgetTrigger = document.getElementById('widget-trigger');
        const widgetMenu = document.getElementById('widget-menu');
        const widgetAI = document.getElementById('widget-ai-generate');
        const widgetImport = document.getElementById('widget-import');
        const widgetExport = document.getElementById('widget-export');
        const widgetClear = document.getElementById('widget-clear');

        if (!widgetTrigger || !widgetMenu) {
            console.log('[DEBUG] Widget elements not found, retrying...');
            setTimeout(setupFloatingWidget, 500);
            return;
        }

        let isExpanded = false;

        // Toggle widget expansion
        widgetTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;
            widgetTrigger.classList.toggle('expanded', isExpanded);
            widgetMenu.classList.toggle('expanded', isExpanded);
            console.log('[DEBUG] Widget toggled:', isExpanded);
        });

        // Widget item click handlers
        if (widgetAI) {
            widgetAI.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] AI Generate clicked');
                // Trigger AI generate dialog
                const aiDialogOverlay = document.getElementById('ai-dialog-overlay');
                if (aiDialogOverlay) {
                    aiDialogOverlay.classList.remove('hidden');
                    const aiPromptInput = document.getElementById('ai-prompt-input');
                    if (aiPromptInput) {
                        setTimeout(() => aiPromptInput.focus(), 100);
                    }
                }
                isExpanded = false;
                widgetTrigger.classList.remove('expanded');
                widgetMenu.classList.remove('expanded');
            });
        }

        if (widgetImport) {
            widgetImport.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] Import clicked');
                // Trigger import dialog
                const importDialogOverlay = document.getElementById('import-dialog-overlay');
                if (importDialogOverlay) {
                    importDialogOverlay.classList.remove('hidden');
                    const curlInput = document.getElementById('curl-input');
                    if (curlInput) {
                        setTimeout(() => curlInput.focus(), 100);
                    }
                }
                isExpanded = false;
                widgetTrigger.classList.remove('expanded');
                widgetMenu.classList.remove('expanded');
            });
        }

        if (widgetExport) {
            widgetExport.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] Export clicked');
                // Trigger export dialog
                const exportDialogOverlay = document.getElementById('export-dialog-overlay');
                if (exportDialogOverlay) {
                    const curlCommand = generateCurlCommand();
                    const curlOutput = document.getElementById('curl-output');
                    if (curlOutput) {
                        curlOutput.value = curlCommand;
                    }
                    exportDialogOverlay.classList.remove('hidden');
                }
                isExpanded = false;
                widgetTrigger.classList.remove('expanded');
                widgetMenu.classList.remove('expanded');
            });
        }

        if (widgetClear) {
            widgetClear.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] Clear clicked');
                // Trigger clear all fields
                clearAllFields();
                isExpanded = false;
                widgetTrigger.classList.remove('expanded');
                widgetMenu.classList.remove('expanded');
            });
        }

        // Close widget when clicking outside
        document.addEventListener('click', (e) => {
            if (!widgetTrigger.contains(e.target) && !widgetMenu.contains(e.target)) {
                isExpanded = false;
                widgetTrigger.classList.remove('expanded');
                widgetMenu.classList.remove('expanded');
            }
        });

        console.log('[DEBUG] Floating widget setup complete');
    }

    // Environment functionality
    let environments = [];
    let selectedEnvironment = null;

    function setupEnvironmentSelector() {
        const environmentBtn = document.getElementById('environment-btn');
        const environmentDropdown = document.getElementById('environment-dropdown');
        const selectedEnvironmentText = document.getElementById('selected-environment-text');

        if (environmentBtn) {
            environmentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = environmentDropdown.classList.contains('hidden');
                
                // Close all other dropdowns
                document.querySelectorAll('.custom-dropdown').forEach(d => {
                    d.classList.remove('open');
                    d.querySelector('.dropdown-menu')?.classList.add('hidden');
                });

                if (isHidden) {
                    environmentDropdown.classList.remove('hidden');
                    // Request environment data
                    vscode.postMessage({ command: 'getEnvironments' });
                } else {
                    environmentDropdown.classList.add('hidden');
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.environment-selector')) {
                environmentDropdown?.classList.add('hidden');
            }
        });
    }

    function renderEnvironmentDropdown() {
        const environmentList = document.getElementById('environment-list');
        if (!environmentList) return;

        let html = `
            <div class="environment-item" data-env-id="">
                <div class="env-name">No Environment</div>
                <div class="env-description">No variables available</div>
            </div>
        `;

        environments.forEach(env => {
            const isSelected = selectedEnvironment && selectedEnvironment.id === env.id;
            html += `
                <div class="environment-item ${isSelected ? 'selected' : ''}" data-env-id="${env.id}">
                    <div class="env-name">${env.name}</div>
                    <div class="env-description">${env.variables?.length || 0} variables</div>
                </div>
            `;
        });

        environmentList.innerHTML = html;

        // Add click handlers
        environmentList.querySelectorAll('.environment-item').forEach(item => {
            item.addEventListener('click', () => {
                const envId = item.getAttribute('data-env-id');
                selectEnvironment(envId);
            });
        });
    }

    function selectEnvironment(environmentId) {
        const selectedEnvironmentText = document.getElementById('selected-environment-text');
        const environmentDropdown = document.getElementById('environment-dropdown');

        if (!environmentId) {
            selectedEnvironment = null;
            selectedEnvironmentText.textContent = 'No Environment';
        } else {
            selectedEnvironment = environments.find(env => env.id === environmentId);
            selectedEnvironmentText.textContent = selectedEnvironment ? selectedEnvironment.name : 'No Environment';
            
            // Send selection to extension
            vscode.postMessage({
                command: 'setSelectedEnvironment',
                payload: { environmentId }
            });
        }

        environmentDropdown.classList.add('hidden');
    }


    function setupImportDialog() {
        console.log('[DEBUG] Setting up import dialog...');

        // Wait for elements to be available
        const checkElements = () => {
            const importBtn = document.getElementById('widget-import');
            const importDialogOverlay = document.getElementById('import-dialog-overlay');

            if (!importBtn || !importDialogOverlay) {
                console.log('[DEBUG] Import dialog elements not found, retrying...');
                setTimeout(checkElements, 100);
                return;
            }

            setupImportDialogElements();
        };

        const setupImportDialogElements = () => {
            const importBtn = document.getElementById('widget-import');
            const importDialogOverlay = document.getElementById('import-dialog-overlay');
            const importDialogClose = document.getElementById('import-dialog-close');
            const importDialogCancel = document.getElementById('import-dialog-cancel');
            const importDialogImport = document.getElementById('import-dialog-import');
            const importTabs = document.querySelectorAll('.import-tab');
            const importTabContents = document.querySelectorAll('.import-tab-content');

            console.log('[DEBUG] Import dialog elements found, setting up...');

            // Show import dialog
            importBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] Import button clicked');
                importDialogOverlay.classList.remove('hidden');
                // Focus on cURL input by default
                const curlInput = document.getElementById('curl-input');
                if (curlInput) {
                    setTimeout(() => curlInput.focus(), 100);
                }
            });

            // Close dialog handlers
            const closeDialog = () => {
                console.log('[DEBUG] Closing import dialog');
                importDialogOverlay.classList.add('hidden');
                // Clear all inputs
                const curlInput = document.getElementById('curl-input');
                const postmanInput = document.getElementById('postman-input');
                const harInput = document.getElementById('har-input');
                if (curlInput) curlInput.value = '';
                if (postmanInput) postmanInput.value = '';
                if (harInput) harInput.value = '';
            };

            if (importDialogClose) {
                importDialogClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeDialog();
                });
            }

            if (importDialogCancel) {
                importDialogCancel.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeDialog();
                });
            }

            // Close on overlay click
            importDialogOverlay.addEventListener('click', (e) => {
                if (e.target === importDialogOverlay) {
                    closeDialog();
                }
            });

            // Tab switching
            importTabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tabName = tab.getAttribute('data-tab');
                    console.log('[DEBUG] Import tab clicked:', tabName);

                    // Update active tab
                    importTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    // Update active content
                    importTabContents.forEach(content => content.classList.remove('active'));
                    const targetContent = document.getElementById(`${tabName}-tab`);
                    if (targetContent) {
                        targetContent.classList.add('active');
                    }

                    // Focus on the appropriate input
                    const input = document.getElementById(`${tabName}-input`);
                    if (input) {
                        setTimeout(() => input.focus(), 100);
                    }
                });
            });

            // Import button handler
            if (importDialogImport) {
                importDialogImport.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Import dialog import button clicked');
                    const activeTab = document.querySelector('.import-tab.active')?.getAttribute('data-tab');
                    const input = document.getElementById(`${activeTab}-input`);
                    const content = input?.value?.trim();

                    if (!content) {
                        vscode.postMessage({
                            command: 'showError',
                            payload: { message: 'Please enter a cURL command or data to import.' }
                        });
                        return;
                    }

                    try {
                        let parsedData;

                        switch (activeTab) {
                            case 'curl':
                                parsedData = parseCurlCommand(content);
                                break;
                            case 'postman':
                                parsedData = parsePostmanData(content);
                                break;
                            case 'har':
                                parsedData = parseHarData(content);
                                break;
                        }

                        if (parsedData) {
                            // Clear all fields first
                            clearAllFields();

                            populateRequestFields(parsedData);
                            closeDialog();
                            vscode.postMessage({
                                command: 'showInfo',
                                payload: 'Request imported successfully!'
                            });
                        } else {
                            vscode.postMessage({
                                command: 'showError',
                                payload: { message: 'Failed to parse the provided data. Please check the format.' }
                            });
                        }
                    } catch (error) {
                        vscode.postMessage({
                            command: 'showError',
                            payload: { message: `Import failed: ${error.message}` }
                        });
                    }
                });
            }

            // Handle keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !importDialogOverlay.classList.contains('hidden')) {
                    closeDialog();
                }
            });

            console.log('[DEBUG] Import dialog setup complete');
        };

        checkElements();
    }

    function setupClearButton() {
        // Add a small delay to ensure DOM is fully loaded
        setTimeout(() => {
            const clearBtn = document.getElementById('widget-clear');

            console.log('[DEBUG] Setting up Clear button, found element:', !!clearBtn);

            if (!clearBtn) {
                console.log('[DEBUG] Clear button not found, trying again in 500ms');
                setTimeout(setupClearButton, 500);
                return;
            }

            clearBtn.addEventListener('click', () => {
                console.log('[DEBUG] Clear button clicked');
                console.log('[DEBUG] Clearing all fields immediately');
                clearAllFields();
            });

            console.log('[DEBUG] Clear button setup complete');
        }, 100);
    }

    function clearAllFields() {
        console.log('[DEBUG] Starting to clear all fields');

        // Clear request name
        const requestNameInput = document.getElementById('request-name-input');
        if (requestNameInput) {
            requestNameInput.value = 'Untitled Request';
            requestName = 'Untitled Request';
            console.log('[DEBUG] Cleared request name');
        } else {
            console.log('[DEBUG] Request name input not found');
        }

        // Reset method to GET
        const methodDropdown = document.getElementById('method-dropdown');
        if (methodDropdown) {
            methodDropdown.dataset.selectedValue = 'GET';
            const selectedText = methodDropdown.querySelector('#selected-method-text');
            if (selectedText) {
                selectedText.textContent = 'GET';
                selectedText.className = 'method-text method-get';
            }
        }

        // Clear URL
        const urlInput = document.getElementById('raw-url');
        if (urlInput) {
            urlInput.value = '';
            // Remove variable highlighting
            urlInput.classList.remove('has-valid-variables');
        }

        // Clear headers - keep default headers, remove custom ones
        const headersBody = document.getElementById('headers-kv-body');
        if (headersBody) {
            const defaultRows = headersBody.querySelectorAll('.kv-row[data-is-default="true"]');
            const customRows = headersBody.querySelectorAll('.kv-row:not([data-is-default="true"])');
            customRows.forEach(row => row.remove());

            // Reset default headers to original values
            const defaultHeaders = [
                { key: 'User-Agent', value: 'vscode-universal-api-client/1.0' },
                { key: 'Accept', value: '*/*' },
                { key: 'Accept-Encoding', value: 'gzip, deflate, br' },
                { key: 'Connection', value: 'keep-alive' }
            ];

            defaultRows.forEach((row, index) => {
                if (defaultHeaders[index]) {
                    const keyInput = row.querySelector('.kv-key');
                    const valueInput = row.querySelector('.kv-value');
                    const checkInput = row.querySelector('.kv-check');

                    if (keyInput) keyInput.value = defaultHeaders[index].key;
                    if (valueInput) valueInput.value = defaultHeaders[index].value;
                    if (checkInput) checkInput.checked = true;
                }
            });

            updateRequestHeaderCount();
        }

        // Clear params - remove all rows and add one empty row
        const paramsBody = document.getElementById('params-kv-body');
        if (paramsBody) {
            paramsBody.innerHTML = '';
            paramsBody.appendChild(createParamRow());
        }

        // Clear form data (urlencoded) - remove all rows and add one empty row
        const formBody = document.getElementById('urlencoded-kv-body');
        if (formBody) {
            formBody.innerHTML = '';
            formBody.appendChild(createFormRow());
        }

        // Reset body type to none
        const noneBodyRadio = document.querySelector('input[name="body-type"][value="none"]');
        if (noneBodyRadio) {
            noneBodyRadio.checked = true;
            document.querySelectorAll('.body-panel').forEach(panel => panel.classList.remove('active'));
            const nonePanel = document.getElementById('body-panel-none');
            if (nonePanel) nonePanel.classList.add('active');
        }

        // Clear raw body editor
        if (typeof rawBodyEditor !== 'undefined') {
            rawBodyEditor.setValue('');
        }

        // Clear GraphQL editors
        if (typeof graphqlQueryEditor !== 'undefined') {
            graphqlQueryEditor.setValue('');
        }
        if (typeof graphqlVariablesEditor !== 'undefined') {
            graphqlVariablesEditor.setValue('');
        }

        // Reset raw body type to JSON
        const rawBodyTypeSelect = document.getElementById('raw-body-type-select');
        if (rawBodyTypeSelect) {
            rawBodyTypeSelect.value = 'json';
        }

        // Clear ALL authentication fields
        // Reset auth type to no-auth
        const authDropdown = document.getElementById('auth-type-dropdown');
        if (authDropdown) {
            authDropdown.dataset.selectedValue = 'no-auth';
            const menu = authDropdown.querySelector('.dropdown-menu');
            if (menu) {
                menu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                const noAuthLi = menu.querySelector('li[data-value="no-auth"]');
                if (noAuthLi) noAuthLi.classList.add('active');
            }
            const selectedText = document.getElementById('selected-auth-type-text');
            if (selectedText) selectedText.textContent = 'No Auth';
        }

        // Hide all auth panels
        document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
        const noAuthPanel = document.getElementById('auth-panel-no-auth');
        if (noAuthPanel) noAuthPanel.classList.add('active');

        // Clear all auth input fields
        const authFields = [
            // Basic auth
            'basic-username', 'basic-password',
            // Bearer token
            'bearer-token',
            // API Key
            'apikey-key', 'apikey-value', 'apikey-add-to',
            // JWT
            'jwt-header-prefix', 'jwt-secret', 'jwt-add-to-dropdown',
            // Digest
            'digest-username', 'digest-password', 'digest-realm', 'digest-nonce',
            'digest-algorithm', 'digest-qop', 'digest-nc', 'digest-cnonce', 'digest-opaque',
            // OAuth1
            'oauth1-signature-method', 'oauth1-consumer-key', 'oauth1-consumer-secret',
            'oauth1-token', 'oauth1-token-secret', 'oauth1-callback-url', 'oauth1-verifier',
            'oauth1-timestamp', 'oauth1-nonce', 'oauth1-version', 'oauth1-realm',
            // OAuth2
            'oauth2-token', 'oauth2-header-prefix', 'oauth2-token-name', 'oauth2-grant-type',
            'oauth2-callback-url', 'oauth2-auth-url', 'oauth2-token-url', 'oauth2-client-id',
            'oauth2-client-secret', 'oauth2-scope', 'oauth2-state', 'oauth2-client-auth',
            // NTLM
            'ntlm-username', 'ntlm-password', 'ntlm-domain',
            // AWS
            'aws-access-key', 'aws-secret-key', 'aws-region', 'aws-service-name', 'aws-session-token',
            // Hawk
            'hawk-id', 'hawk-key', 'hawk-algorithm', 'hawk-user', 'hawk-nonce', 'hawk-ext', 'hawk-app', 'hawk-dlg'
        ];

        authFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = false;
                } else {
                    field.value = '';
                }
            }
        });

        // Clear JWT editors
        if (typeof jwtPayloadEditor !== 'undefined') {
            jwtPayloadEditor.setValue('{}');
        }
        if (typeof jwtHeadersEditor !== 'undefined') {
            jwtHeadersEditor.setValue('{}');
        }

        // Reset auth dropdowns to defaults
        const authDropdowns = [
            { id: 'apikey-add-to', defaultValue: 'header' },
            { id: 'jwt-add-to-dropdown', defaultValue: 'header' },
            { id: 'oauth1-add-to-dropdown', defaultValue: 'header' },
            { id: 'oauth2-add-to-dropdown', defaultValue: 'header' }
        ];

        authDropdowns.forEach(({ id, defaultValue }) => {
            const dropdown = document.getElementById(id);
            if (dropdown) {
                dropdown.dataset.selectedValue = defaultValue;
            }
        });

        // Update HTTP SVG
        updateHttpSvgTextAndColor();

        // Clear variable suggestions
        hideVariableSuggestions();

        // Show success message
        vscode.postMessage({
            command: 'showInfo',
            payload: 'All fields have been cleared.'
        });
    }

    function setupExportDialog() {
        console.log('[DEBUG] Setting up export dialog...');

        // Wait for elements to be available
        const checkElements = () => {
            const exportBtn = document.getElementById('widget-export');
            const exportDialogOverlay = document.getElementById('export-dialog-overlay');

            if (!exportBtn || !exportDialogOverlay) {
                console.log('[DEBUG] Export dialog elements not found, retrying...');
                setTimeout(checkElements, 100);
                return;
            }

            setupExportDialogElements();
        };

        const setupExportDialogElements = () => {
            const exportBtn = document.getElementById('widget-export');
            const exportDialogOverlay = document.getElementById('export-dialog-overlay');
            const exportDialogClose = document.getElementById('export-dialog-close');
            const exportDialogCloseBtn = document.getElementById('export-dialog-close-btn');
            const exportDialogCopy = document.getElementById('export-dialog-copy');

            console.log('[DEBUG] Export dialog elements found, setting up...');

            // Show export dialog
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[DEBUG] Export button clicked');
                const curlCommand = generateCurlCommand();
                const curlOutput = document.getElementById('curl-output');
                if (curlOutput) {
                    curlOutput.value = curlCommand;
                }
                exportDialogOverlay.classList.remove('hidden');
            });

            // Close dialog handlers
            const closeDialog = () => {
                console.log('[DEBUG] Closing export dialog');
                exportDialogOverlay.classList.add('hidden');
            };

            if (exportDialogClose) {
                exportDialogClose.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeDialog();
                });
            }

            if (exportDialogCloseBtn) {
                exportDialogCloseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeDialog();
                });
            }

            // Close on overlay click
            exportDialogOverlay.addEventListener('click', (e) => {
                if (e.target === exportDialogOverlay) {
                    closeDialog();
                }
            });

            // Copy to clipboard
            if (exportDialogCopy) {
                exportDialogCopy.addEventListener('click', (e) => {
                    e.stopPropagation();
                    console.log('[DEBUG] Export copy button clicked');
                    const curlOutput = document.getElementById('curl-output');
                    if (curlOutput && curlOutput.value) {
                        navigator.clipboard.writeText(curlOutput.value).then(() => {
                            const originalText = exportDialogCopy.textContent;
                            exportDialogCopy.textContent = 'Copied!';
                            exportDialogCopy.disabled = true;
                            setTimeout(() => {
                                exportDialogCopy.textContent = originalText;
                                exportDialogCopy.disabled = false;
                            }, 1500);
                        }).catch(err => {
                            vscode.postMessage({
                                command: 'showError',
                                payload: { message: 'Failed to copy to clipboard' }
                            });
                        });
                    }
                });
            }

            // Handle keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !exportDialogOverlay.classList.contains('hidden')) {
                    closeDialog();
                }
            });

            console.log('[DEBUG] Export dialog setup complete');
        };

        checkElements();
    }

    function generateCurlCommand() {
        let curlCommand = 'curl';

        // Get method
        const methodDropdown = document.getElementById('method-dropdown');
        const method = methodDropdown?.dataset.selectedValue || 'GET';
        if (method !== 'GET') {
            curlCommand += ` -X ${method}`;
        }

        // Get URL
        const urlInput = document.getElementById('raw-url');
        let url = urlInput?.value?.trim();
        if (!url) {
            return 'curl -X GET "https://example.com"';
        }

        // Resolve environment variables in URL
        if (selectedEnvironment && selectedEnvironment.variables) {
            url = resolveVariables(url, selectedEnvironment);
        }

        // Parse URL and extract query params
        let urlObject;
        try {
            urlObject = new URL(url.startsWith('http') ? url : 'http://' + url);
        } catch (e) {
            // If URL parsing fails, use as-is
            curlCommand += ` "${url}"`;
        }

        if (urlObject) {
            // Get params from URL
            let urlParams = {};
            urlObject.searchParams.forEach((value, key) => {
                urlParams[key] = value;
            });

            // Get params from fields
            const params = getKeyValueData('params-kv-body');

            // Merge params (fields take precedence)
            const mergedParams = { ...urlParams, ...params };

            // Remove all params from URL
            urlObject.search = '';

            // Add merged params to URL for cURL command
            Object.entries(mergedParams).forEach(([key, value]) => {
                urlObject.searchParams.append(key, value);
            });

            curlCommand += ` "${urlObject.toString()}"`;
        } else {
            curlCommand += ` "${url}"`;
        }

        // Get headers
        const headers = getKeyValueData('headers-kv-body', true);
        Object.entries(headers).forEach(([key, value]) => {
            curlCommand += ` -H "${key}: ${value}"`;
        });

        // Get authorization
        const authType = document.getElementById('auth-type-dropdown')?.dataset.selectedValue || 'no-auth';
        if (authType !== 'no-auth') {
            const authHeader = generateAuthHeader(authType);
            if (authHeader) {
                curlCommand += ` -H "${authHeader}"`;
            }
        }

        // Get body
        const bodyType = document.querySelector('input[name="body-type"]:checked')?.value;
        if (bodyType && bodyType !== 'none') {
            let bodyData = '';

            switch (bodyType) {
                case 'x-www-form-urlencoded':
                    const formData = getKeyValueData('urlencoded-kv-body');
                    if (Object.keys(formData).length > 0) {
                        const formString = Object.entries(formData)
                            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                            .join('&');
                        bodyData = formString;
                    }
                    break;
                case 'raw':
                    if (typeof rawBodyEditor !== 'undefined') {
                        bodyData = rawBodyEditor.getValue();
                    }
                    break;
                case 'graphql':
                    if (typeof graphqlQueryEditor !== 'undefined') {
                        const query = graphqlQueryEditor.getValue();
                        let variables = '{}';
                        try {
                            if (typeof graphqlVariablesEditor !== 'undefined') {
                                variables = graphqlVariablesEditor.getValue() || '{}';
                            }
                        } catch (e) {
                            // Use default empty object if parsing fails
                        }
                        bodyData = JSON.stringify({ query, variables });
                    }
                    break;
            }

            if (bodyData && bodyData.trim()) {
                // Escape quotes and backslashes for shell
                const escapedData = bodyData.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                curlCommand += ` -d "${escapedData}"`;
            }
        }

        return curlCommand;
    }

    function generateAuthHeader(authType) {
        switch (authType) {
            case 'basic':
                const username = document.getElementById('basic-username')?.value || '';
                const password = document.getElementById('basic-password')?.value || '';
                if (username && password) {
                    const credentials = btoa(`${username}:${password}`);
                    return `Authorization: Basic ${credentials}`;
                }
                break;

            case 'bearer':
                const token = document.getElementById('bearer-token')?.value?.trim();
                if (token) {
                    return `Authorization: Bearer ${token}`;
                }
                break;

            case 'apikey':
                const key = document.getElementById('apikey-key')?.value?.trim();
                const value = document.getElementById('apikey-value')?.value?.trim();
                const addTo = document.getElementById('apikey-add-to')?.value || 'header';
                if (key && value) {
                    if (addTo === 'header') {
                        return `${key}: ${value}`;
                    } else {
                        // For query params, they would be added to URL, not as header
                        return null;
                    }
                }
                break;

            case 'jwt':
                // JWT would be generated dynamically, for export we can't generate it
                // so we'll skip it or add a comment
                return null;

            case 'digest':
            case 'oauth1':
            case 'oauth2':
            case 'ntlm':
            case 'awsv4':
            case 'hawk':
                // These auth types are complex and would require server-side generation
                // For export, we'll add a comment indicating the auth type
                return `Authorization: ${authType.toUpperCase()} (configured in request)`;
        }

        return null;
    }

    function parseCurlCommand(curlCommand) {
        // Basic cURL parsing logic
        const result = {
            method: 'GET',
            url: '',
            headers: {},
            body: null,
            params: {},
            auth: null // Add auth field to store parsed authorization
        };

        // Simple parsing - split by spaces and handle quoted strings
        const tokens = curlCommand.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

        let i = 0;
        let currentData = ''; // Accumulate data for multi-line content

        while (i < tokens.length) {
            const token = tokens[i];

            if (token === 'curl') {
                i++;
                continue;
            }

            if (token === '-X' || token === '--request') {
                i++;
                if (i < tokens.length) {
                    result.method = tokens[i].replace(/['"]/g, '').toUpperCase();
                    i++;
                }
            } else if (token === '-H' || token === '--header') {
                i++;
                if (i < tokens.length) {
                    const headerStr = tokens[i].replace(/['"]/g, '');
                    const colonIndex = headerStr.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = headerStr.substring(0, colonIndex).trim();
                        const value = headerStr.substring(colonIndex + 1).trim();

                        // Check if this is an authorization header
                        if (key.toLowerCase() === 'authorization') {
                            result.auth = parseAuthorizationHeader(value);
                        } else if (key.toLowerCase() === 'x-api-key') {
                            result.auth = {
                                type: 'apikey',
                                key: '',
                                value: value,
                                addTo: 'header'
                            };
                        } else {
                            result.headers[key] = value;
                        }
                    }
                    i++;
                }
            } else if (token === '-d' || token === '--data' || token === '--data-raw') {
                i++;
                // Collect all data until next flag or end
                currentData = '';
                while (i < tokens.length) {
                    const nextToken = tokens[i];
                    // Stop if we hit another flag (starts with -)
                    if (nextToken.startsWith('-') && nextToken !== '-' && !nextToken.startsWith('--')) {
                        break;
                    }
                    currentData += nextToken + ' ';
                    i++;
                }
                // Clean up the data - remove surrounding quotes if present
                result.body = currentData.trim().replace(/^['"]|['"]$/g, '');
            } else if (!token.startsWith('-') && !result.url) {
                result.url = token.replace(/['"]/g, '');
                i++;
            } else {
                i++;
            }
        }

        // Helper function to parse authorization header
        function parseAuthorizationHeader(authValue) {
            const trimmedValue = authValue.trim();

            // Bearer token
            if (trimmedValue.startsWith('Bearer ')) {
                return {
                    type: 'bearer',
                    token: trimmedValue.substring(7).trim()
                };
            }

            // Basic auth
            if (trimmedValue.startsWith('Basic ')) {
                return {
                    type: 'basic',
                    username: '',
                    password: ''
                };
            }

            // Digest auth
            if (trimmedValue.startsWith('Digest ')) {
                return {
                    type: 'digest',
                    username: '',
                    password: ''
                };
            }

            // NTLM auth
            if (trimmedValue.startsWith('NTLM ')) {
                return {
                    type: 'ntlm',
                    username: '',
                    password: '',
                    domain: ''
                };
            }

            // Hawk auth
            if (trimmedValue.startsWith('Hawk ')) {
                return {
                    type: 'hawk',
                    authId: '',
                    authKey: ''
                };
            }

            // AWS Signature v4
            if (trimmedValue.startsWith('AWS4-HMAC-SHA256 ')) {
                return {
                    type: 'awsv4',
                    accessKeyId: '',
                    secretAccessKey: '',
                    region: '',
                    service: ''
                };
            }

            // OAuth 1.0 (check for oauth_token parameter)
            if (trimmedValue.includes('oauth_token=')) {
                return {
                    type: 'oauth1',
                    consumerKey: '',
                    consumerSecret: '',
                    accessToken: '',
                    tokenSecret: ''
                };
            }

            // OAuth 2.0 (check for access_token parameter)
            if (trimmedValue.includes('access_token=')) {
                return {
                    type: 'oauth2',
                    accessToken: '',
                    headerPrefix: 'Bearer'
                };
            }

            // Default to bearer if we can't determine the type
            return {
                type: 'bearer',
                token: trimmedValue
            };
        }

        // Parse URL parameters
        if (result.url) {
            try {
                const urlObj = new URL(result.url.startsWith('http') ? result.url : 'http://' + result.url);
                result.params = {};
                urlObj.searchParams.forEach((value, key) => {
                    result.params[key] = value;
                });
            } catch (e) {
                // Invalid URL, keep as is
            }
        }

        return result;
    }

    function parsePostmanData(postmanJson) {
        try {
            const data = JSON.parse(postmanJson);
            const item = data.item && data.item[0];

            if (!item || !item.request) {
                throw new Error('Invalid Postman format');
            }

            const request = item.request;
            const result = {
                method: request.method || 'GET',
                url: typeof request.url === 'string' ? request.url : request.url.raw || '',
                headers: {},
                body: null,
                params: {}
            };

            // Parse headers
            if (request.header) {
                request.header.forEach(header => {
                    if (header.key && header.value) {
                        result.headers[header.key] = header.value;
                    }
                });
            }

            // Parse body
            if (request.body) {
                if (request.body.raw) {
                    result.body = request.body.raw;
                } else if (request.body.formdata) {
                    // Convert form data to string
                    result.body = request.body.formdata.map(field => `${field.key}=${field.value}`).join('&');
                }
            }

            return result;
        } catch (error) {
            throw new Error('Invalid Postman JSON format');
        }
    }

    function parseHarData(harJson) {
        try {
            const data = JSON.parse(harJson);
            const entry = data.log && data.log.entries && data.log.entries[0];

            if (!entry) {
                throw new Error('Invalid HAR format');
            }

            const request = entry.request;
            const result = {
                method: request.method || 'GET',
                url: request.url || '',
                headers: {},
                body: null,
                params: {}
            };

            // Parse headers
            if (request.headers) {
                request.headers.forEach(header => {
                    result.headers[header.name] = header.value;
                });
            }

            // Parse post data
            if (request.postData && request.postData.text) {
                result.body = request.postData.text;
            }

            return result;
        } catch (error) {
            throw new Error('Invalid HAR JSON format');
        }
    }

    function populateRequestFields(data) {
        // Set method
        const methodDropdown = document.getElementById('method-dropdown');
        if (methodDropdown && data.method) {
            methodDropdown.dataset.selectedValue = data.method;
            const selectedText = methodDropdown.querySelector('#selected-method-text');
            if (selectedText) {
                selectedText.textContent = data.method;
                selectedText.className = `method-text method-${data.method.toLowerCase()}`;
            }
        }

        // Set URL
        const urlInput = document.getElementById('raw-url');
        if (urlInput && data.url) {
            urlInput.value = data.url;
        }

        // Clear existing headers and add new ones
        const headersBody = document.getElementById('headers-kv-body');
        if (headersBody && data.headers) {
            // Keep default headers, add new ones
            const existingRows = headersBody.querySelectorAll('.kv-row:not([data-is-default="true"])');
            existingRows.forEach(row => row.remove());

            Object.entries(data.headers).forEach(([key, value]) => {
                // Skip authorization headers as they're handled in auth section
                if (key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'x-api-key') {
                    const row = createHeaderRow();
                    row.querySelector('.kv-key').value = key;
                    row.querySelector('.kv-value').value = value;
                    row.querySelector('.kv-check').checked = true;
                    headersBody.appendChild(row);
                }
            });

            updateRequestHeaderCount();
        }

        // Clear existing params and add new ones
        const paramsBody = document.getElementById('params-kv-body');
        if (paramsBody && data.params) {
            paramsBody.innerHTML = '';

            Object.entries(data.params).forEach(([key, value]) => {
                const row = createParamRow();
                row.querySelector('.kv-key').value = key;
                row.querySelector('.kv-value').value = value;
                paramsBody.appendChild(row);
            });

            // Add empty row at the end
            paramsBody.appendChild(createParamRow());
        }

        // Set body
        if (data.body) {
            // Switch to raw body type
            const rawBodyRadio = document.querySelector('input[name="body-type"][value="raw"]');
            if (rawBodyRadio) {
                rawBodyRadio.checked = true;
                document.querySelectorAll('.body-panel').forEach(panel => panel.classList.remove('active'));
                document.getElementById('body-panel-raw').classList.add('active');
            }

            // Set body content
            if (typeof rawBodyEditor !== 'undefined') {
                rawBodyEditor.setValue(data.body);
            }
        }

        // Set authorization if present
        if (data.auth) {
            const authType = data.auth.type;
            const authDropdown = document.getElementById('auth-type-dropdown');

            if (authDropdown) {
                // Set the auth type in dropdown
                authDropdown.dataset.selectedValue = authType;
                const menu = authDropdown.querySelector('.dropdown-menu');
                if (menu) {
                    menu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                    const activeLi = menu.querySelector(`li[data-value="${authType}"]`);
                    if (activeLi) activeLi.classList.add('active');
                }

                // Update the selected text
                const selectedText = document.getElementById('selected-auth-type-text');
                if (selectedText) {
                    selectedText.textContent = authType.charAt(0).toUpperCase() + authType.slice(1).replace(/-/g, ' ');
                }

                // Populate auth fields based on type
                switch (authType) {
                    case 'bearer':
                        if (data.auth.token) {
                            document.getElementById('bearer-token').value = data.auth.token;
                        }
                        break;
                    case 'basic':
                        // Basic auth would need username:password parsing from the header
                        // For now, just set the type
                        break;
                    case 'apikey':
                        if (data.auth.value) {
                            document.getElementById('apikey-value').value = data.auth.value;
                            document.getElementById('apikey-add-to').value = data.auth.addTo || 'header';
                        }
                        break;
                    case 'digest':
                        // Digest auth fields would be populated here if we had the details
                        break;
                    case 'oauth1':
                        // OAuth1 fields would be populated here if we had the details
                        break;
                    case 'oauth2':
                        if (data.auth.accessToken) {
                            document.getElementById('oauth2-token').value = data.auth.accessToken;
                            document.getElementById('oauth2-header-prefix').value = data.auth.headerPrefix || 'Bearer';
                        }
                        break;
                    case 'ntlm':
                        // NTLM auth fields would be populated here
                        break;
                    case 'awsv4':
                        // AWS v4 auth fields would be populated here
                        break;
                    case 'hawk':
                        // Hawk auth fields would be populated here
                        break;
                }

                // Show the correct auth panel
                if (typeof updateAuthUI === 'function') {
                    updateAuthUI(authType);
                }
            }
        }

        // Update HTTP SVG
        updateHttpSvgTextAndColor();
    }

    function setupVariableSuggestions() {
        const urlInput = document.getElementById('raw-url');
        const suggestionsPopup = document.getElementById('variable-suggestions');
        const suggestionsList = document.getElementById('suggestions-list');

        if (!urlInput || !suggestionsPopup || !suggestionsList) return;

        let currentSuggestionIndex = -1;

        urlInput.addEventListener('input', (e) => {
            const value = e.target.value;
            const cursorPos = e.target.selectionStart;

            // Check if user is typing {{ to trigger suggestions
            const beforeCursor = value.substring(0, cursorPos);
            const match = beforeCursor.match(/\{\{([^}]*)$/);

            if (match && selectedEnvironment && selectedEnvironment.variables) {
                const query = match[1].toLowerCase();
                const filteredVars = selectedEnvironment.variables.filter(v =>
                    v.enabled && v.key.toLowerCase().includes(query)
                );

                if (filteredVars.length > 0) {
                    showVariableSuggestions(filteredVars, e.target);
                } else {
                    hideVariableSuggestions();
                }
            } else {
                hideVariableSuggestions();
            }

            // Always highlight variables after input changes
            // Use longer timeout to ensure contenteditable div is properly updated
            setTimeout(() => {
                console.log('[DEBUG] Input event triggered, re-applying highlighting');
                highlightVariables(urlInput);
                highlightVariablesInText(urlInput);
                highlightVariablesInInput(urlInput);
            }, 50);
        });

        // Add keydown event listener for real-time variable highlighting
        urlInput.addEventListener('keydown', (e) => {
            // Trigger highlighting on } key press or any other key that might complete a variable
            if (e.key === '}' || e.key === '{' || e.key === 'Backspace' || e.key === 'Delete') {
                setTimeout(() => {
                    console.log('[DEBUG] Keydown event triggered, re-applying highlighting');
                    highlightVariables(urlInput);
                    highlightVariablesInText(urlInput);
                    highlightVariablesInInput(urlInput);
                }, 50);
            }
        });

        urlInput.addEventListener('keydown', (e) => {
            if (!suggestionsPopup.classList.contains('hidden')) {
                const items = suggestionsList.querySelectorAll('.suggestion-item');
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    currentSuggestionIndex = Math.min(currentSuggestionIndex + 1, items.length - 1);
                    updateSuggestionSelection(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    currentSuggestionIndex = Math.max(currentSuggestionIndex - 1, -1);
                    updateSuggestionSelection(items);
                } else if (e.key === 'Enter' && currentSuggestionIndex >= 0) {
                    e.preventDefault();
                    console.log('[DEBUG] Enter key pressed on suggestion:', currentSuggestionIndex);
                    items[currentSuggestionIndex].click();
                } else if (e.key === 'Escape') {
                    hideVariableSuggestions();
                }
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.url-input-wrapper')) {
                hideVariableSuggestions();
            }
        });
    }

    function showVariableSuggestions(variables, inputElement) {
        const suggestionsPopup = document.getElementById('variable-suggestions');
        const suggestionsList = document.getElementById('suggestions-list');
        
        if (!suggestionsPopup || !suggestionsList) return;

        let html = '';
        variables.forEach((variable, index) => {
            const currentValue = variable.currentValue || variable.initialValue || '';
            const displayValue = variable.type === 'secret' && currentValue ?
                '•'.repeat(Math.min(currentValue.length, 20)) : currentValue;
            const secretClass = variable.type === 'secret' ? 'secret' : '';
            const secretFallback = variable.type === 'secret' ? 'fallback' : '';

            html += `
                <div class="suggestion-item ${secretClass}" data-var-name="${variable.key}" data-index="${index}">
                    <div class="suggestion-header">
                        <span class="var-name">{{${variable.key}}}</span>
                        <span class="var-type ${variable.type}">${variable.type}</span>
                    </div>
                    <div class="suggestion-value ${secretFallback}">${displayValue}</div>
                </div>
            `;
        });

        suggestionsList.innerHTML = html;

        // Add click handlers
        suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const varName = item.getAttribute('data-var-name');
                console.log('[DEBUG] Suggestion item clicked:', varName);
                insertVariable(varName, inputElement);
            });
        });

        suggestionsPopup.classList.remove('hidden');
        currentSuggestionIndex = -1;
    }

    function hideVariableSuggestions() {
        const suggestionsPopup = document.getElementById('variable-suggestions');
        if (suggestionsPopup) {
            suggestionsPopup.classList.add('hidden');
        }
        currentSuggestionIndex = -1;
    }

    function updateSuggestionSelection(items) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === currentSuggestionIndex);
        });
    }

    function insertVariable(varName, inputElement) {
        const value = inputElement.value;
        const cursorPos = inputElement.selectionStart;
        const beforeCursor = value.substring(0, cursorPos);
        const afterCursor = value.substring(cursorPos);

        // Find the {{ pattern and replace it
        const match = beforeCursor.match(/^(.*)\{\{([^}]*)$/);
        if (match) {
            const newValue = match[1] + `{{${varName}}}` + afterCursor;
            inputElement.value = newValue;
            inputElement.setSelectionRange(match[1].length + varName.length + 4, match[1].length + varName.length + 4);
        }

        hideVariableSuggestions();
        inputElement.focus();

        // Re-apply highlighting immediately after insertion
        // Use multiple timeouts to ensure proper synchronization
        console.log('[DEBUG] Inserting variable:', varName, 'New value:', inputElement.value);

        // First, apply basic highlighting
        setTimeout(() => {
            highlightVariables(inputElement);
            highlightVariablesInText(inputElement);
        }, 0);

        // Then apply contenteditable highlighting with longer delay
        setTimeout(() => {
            console.log('[DEBUG] Applying contenteditable highlighting');
            highlightVariablesInInput(inputElement);
        }, 50);

        // Force another update to ensure it's applied
        setTimeout(() => {
            console.log('[DEBUG] Force updating highlighting');
            highlightVariables(inputElement);
            highlightVariablesInText(inputElement);
            highlightVariablesInInput(inputElement);
        }, 100);
    }

    function updateEnvironmentButton() {
        const selectedEnvironmentText = document.getElementById('selected-environment-text');
        if (selectedEnvironmentText) {
            selectedEnvironmentText.textContent = selectedEnvironment ? selectedEnvironment.name : 'No Environment';
        }
    }

    function getKeyValueData(bodyId, hasCheckbox = false) { 
        const data = {}; 
        document.querySelectorAll(`#${bodyId} .kv-row`).forEach(row => { 
            if (hasCheckbox) { if (!row.querySelector('.kv-check')?.checked) return; } 
            const keyInput = row.querySelector('.kv-key'); 
            const valueInput = row.querySelector('.kv-value'); 
            if (keyInput && valueInput && keyInput.value.trim()) { data[keyInput.value.trim()] = valueInput.value.trim(); } 
        }); 
        return data; 
    }

    function renderResponseBody(format) {
        console.log('Rendering response body with format:', format, 'Data:', currentResponseData);
        
        const [codemirrorWrapper, hexWrapper, rawWrapper, htmlWrapper] = [
            document.getElementById('codemirror-view-wrapper'), 
            document.getElementById('hex-view-wrapper'), 
            document.getElementById('raw-text-view-wrapper'), 
            document.getElementById('html-preview-wrapper')
        ];
        
        // Hide all wrappers first
        [codemirrorWrapper, hexWrapper, rawWrapper, htmlWrapper].forEach(el => {
            if (el) el.classList.add('hidden');
        });
        
        if (responseBodyEditor) {
            responseBodyEditor.getWrapperElement().style.display = 'none';
        }
        
        const modeMap = { 
            JSON: 'application/json', 
            XML: 'application/xml', 
            HTML: 'text/html', 
            JS: 'application/javascript' 
        };
        
        if (responseBodyEditor) {
            responseBodyEditor.setOption('mode', modeMap[format] || 'text/plain');
        }
        
        switch (format) {
            case 'JSON': 
            case 'XML': 
            case 'HTML': 
            case 'JS':
                if (codemirrorWrapper && responseBodyEditor) {
                    codemirrorWrapper.classList.remove('hidden'); 
                    responseBodyEditor.getWrapperElement().style.display = ''; 
                    
                    let text = currentResponseData.text || '';
                    if (format === 'JSON' && text) { 
                        try { 
                            text = JSON.stringify(JSON.parse(text), null, 2); 
                        } catch (e) { 
                            console.log('Failed to parse JSON, showing raw text:', e);
                        } 
                    }
                    
                    console.log('Setting CodeMirror value:', text);
                    responseBodyEditor.setValue(text); 
                    responseBodyEditor.refresh();
                    console.log('CodeMirror value set and refreshed');
                }
                break;
                
            case 'Base64': 
                if (rawWrapper) {
                    const rawTextPre = document.getElementById('raw-text-pre');
                    if (rawTextPre) {
                        rawTextPre.textContent = btoa(String.fromCharCode(...currentResponseData.raw)); 
                    }
                    rawWrapper.classList.remove('hidden'); 
                }
                break;
                
            case 'Hex': 
                if (hexWrapper) {
                    hexWrapper.innerHTML = generateHexView(currentResponseData.raw); 
                    hexWrapper.classList.remove('hidden'); 
                }
                break;
                
            case 'Raw': 
                if (rawWrapper) {
                    const rawTextPre = document.getElementById('raw-text-pre');
                    if (rawTextPre) {
                        rawTextPre.textContent = currentResponseData.text || '';
                    }
                    rawWrapper.classList.remove('hidden'); 
                }
                break;
                
            default:
                // Default to showing in CodeMirror as plain text
                if (codemirrorWrapper && responseBodyEditor) {
                    console.log('Showing default view with text:', currentResponseData.text);
                    codemirrorWrapper.classList.remove('hidden'); 
                    responseBodyEditor.getWrapperElement().style.display = ''; 
                    responseBodyEditor.setValue(currentResponseData.text || ''); 
                    responseBodyEditor.refresh();
                }
                break;
        }
        
        console.log('Response body rendering complete');
    }

    function generateHexView(data) { 
        let html = ''; 
        for (let i = 0; i < data.length; i += 16) { 
            const slice = data.slice(i, i + 16); 
            const offset = i.toString(16).padStart(8, '0').toUpperCase(); 
            const hexValues = Array.from(slice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '); 
            const ascii = Array.from(slice).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join(''); 
            html += `<div class="hex-row"><div class="hex-offset">${offset}</div><div class="hex-values">${hexValues}</div><div class="hex-ascii">${ascii}</div></div>`; 
        } 
        return html; 
    }

    function formatBytes(bytes, decimals = 2) { 
        if (!+bytes) return '0 B'; const k = 1024; const dm = decimals < 0 ? 0 : decimals; const sizes = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); 
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`; 
    }

    function base64ToUint8Array(base64) {
        try { const binaryString = atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); } return bytes; }
        catch (e) { console.error('Failed to decode Base64 string:', e); return new Uint8Array(); }
    }

    // Cookie parsing and display functions
    let currentCookies = [];

    function parseCookieString(cookieString) {
        const cookie = {
            name: '',
            value: '',
            attributes: {}
        };

        // Split by semicolon to get name/value and attributes
        const parts = cookieString.split(';').map(part => part.trim());

        // First part is always name=value
        const nameValue = parts[0];
        const equalsIndex = nameValue.indexOf('=');
        if (equalsIndex !== -1) {
            cookie.name = nameValue.substring(0, equalsIndex);
            cookie.value = nameValue.substring(equalsIndex + 1);
        } else {
            cookie.name = nameValue;
            cookie.value = '';
        }

        // Parse attributes
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            const attrEqualsIndex = part.indexOf('=');
            if (attrEqualsIndex !== -1) {
                const attrName = part.substring(0, attrEqualsIndex).toLowerCase();
                const attrValue = part.substring(attrEqualsIndex + 1);
                cookie.attributes[attrName] = attrValue;
            } else {
                // Boolean attributes like Secure, HttpOnly
                cookie.attributes[part.toLowerCase()] = true;
            }
        }

        return cookie;
    }

    function renderCookies(cookies) {
        const cookiesList = document.getElementById('cookies-list');
        const cookiesEmptyState = document.getElementById('cookies-empty-state');

        if (!cookies || cookies.length === 0) {
            cookiesList.innerHTML = '';
            cookiesEmptyState.style.display = 'flex';
            return;
        }

        cookiesEmptyState.style.display = 'none';

        let html = '';
        cookies.forEach((cookie, index) => {
            const secureClass = cookie.attributes.secure ? 'secure' : '';
            const httpOnlyClass = cookie.attributes.httponly ? 'httpOnly' : '';
            const sameSiteClass = cookie.attributes.samesite ? 'sameSite' : '';

            html += `
                <div class="cookie-item" data-index="${index}">
                    <div class="cookie-header">
                        <div class="cookie-name">${escapeHtml(cookie.name)}</div>
                        <div class="cookie-actions">
                            <button class="cookie-action-btn" title="Copy Cookie" onclick="copyCookie(${index})">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M21 8C21 6.34315 19.6569 5 18 5H10C8.34315 5 7 6.34315 7 8V20C7 21.6569 8.34315 23 10 23H18C19.6569 23 21 21.6569 21 20V8ZM19 8C19 7.44772 18.5523 7 18 7H10C9.44772 7 9 7.44772 9 8V20C9 20.5523 9.44772 21 10 21H18C18.5523 21 19 20.5523 19 20V8Z"/>
                                    <path d="M6 3H16C16.5523 3 17 2.55228 17 2C17 1.44772 16.5523 1 16 1H6C4.34315 1 3 2.34315 3 4V18C3 18.5523 3.44772 19 4 19C4.55228 19 5 18.5523 5 18V4C5 3.44772 5.44772 3 6 3Z"/>
                                </svg>
                            </button>
                            <button class="cookie-action-btn" title="Delete Cookie" onclick="deleteCookie(${index})">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M2.343 2.343a.75.75 0 0 1 1.06 0L8 6.94l4.597-4.597a.75.75 0 1 1 1.06 1.06L9.06 8l4.597 4.597a.75.75 0 1 1-1.06 1.06L8 9.06l-4.597 4.597a.75.75 0 0 1-1.06-1.06L6.94 8 2.343 3.403a.75.75 0 0 1 0-1.06Z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="cookie-value">${escapeHtml(cookie.value)}</div>
                    <div class="cookie-attributes">
                        ${cookie.attributes.path ? `<div class="cookie-attribute"><div class="cookie-attribute-label">Path</div><div class="cookie-attribute-value">${escapeHtml(cookie.attributes.path)}</div></div>` : ''}
                        ${cookie.attributes.domain ? `<div class="cookie-attribute"><div class="cookie-attribute-label">Domain</div><div class="cookie-attribute-value">${escapeHtml(cookie.attributes.domain)}</div></div>` : ''}
                        ${cookie.attributes.expires ? `<div class="cookie-attribute"><div class="cookie-attribute-label">Expires</div><div class="cookie-attribute-value">${escapeHtml(cookie.attributes.expires)}</div></div>` : ''}
                        ${cookie.attributes.maxage ? `<div class="cookie-attribute"><div class="cookie-attribute-label">Max-Age</div><div class="cookie-attribute-value">${escapeHtml(cookie.attributes.maxage)}</div></div>` : ''}
                        ${cookie.attributes.secure ? `<div class="cookie-attribute"><div class="cookie-attribute-label">Secure</div><div class="cookie-attribute-value ${secureClass}">✓ Secure</div></div>` : ''}
                        ${cookie.attributes.httponly ? `<div class="cookie-attribute"><div class="cookie-attribute-label">HttpOnly</div><div class="cookie-attribute-value ${httpOnlyClass}">✓ HttpOnly</div></div>` : ''}
                        ${cookie.attributes.samesite ? `<div class="cookie-attribute"><div class="cookie-attribute-label">SameSite</div><div class="cookie-attribute-value ${sameSiteClass}">${escapeHtml(cookie.attributes.samesite)}</div></div>` : ''}
                    </div>
                </div>
            `;
        });

        cookiesList.innerHTML = html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function copyCookie(index) {
        const cookie = currentCookies[index];
        const cookieString = `${cookie.name}=${cookie.value}`;
        navigator.clipboard.writeText(cookieString).then(() => {
            vscode.postMessage({
                command: 'showInfo',
                payload: `Cookie "${cookie.name}" copied to clipboard`
            });
        }).catch(err => {
            vscode.postMessage({
                command: 'showError',
                payload: { message: 'Failed to copy cookie to clipboard' }
            });
        });
    }

    function deleteCookie(index) {
        currentCookies.splice(index, 1);
        renderCookies(currentCookies);
        vscode.postMessage({
            command: 'showInfo',
            payload: 'Cookie deleted'
        });
    }

    function copyAllCookies() {
        if (currentCookies.length === 0) {
            vscode.postMessage({
                command: 'showWarning',
                payload: 'No cookies to copy'
            });
            return;
        }

        const cookieStrings = currentCookies.map(cookie => `${cookie.name}=${cookie.value}`);
        const allCookiesString = cookieStrings.join('; ');

        navigator.clipboard.writeText(allCookiesString).then(() => {
            vscode.postMessage({
                command: 'showInfo',
                payload: `${currentCookies.length} cookies copied to clipboard`
            });
        }).catch(err => {
            vscode.postMessage({
                command: 'showError',
                payload: { message: 'Failed to copy cookies to clipboard' }
            });
        });
    }

    function clearAllCookies() {
        currentCookies = [];
        renderCookies(currentCookies);
        vscode.postMessage({
            command: 'showInfo',
            payload: 'All cookies cleared'
        });
    }

    // Make functions globally available for onclick handlers
    window.copyCookie = copyCookie;
    window.deleteCookie = deleteCookie;

    function handleExtensionMessages(event) {
        const message = event.data;
        console.log('Received message:', message);
        
        // Hide spinner for all messages except environment ones
        if (message.command !== 'environmentsData' && message.command !== 'environmentSelected') {
            spinnerOverlay.classList.add('hidden');
            sendBtn.disabled = false;
        }
        
        switch (message.command) {
            case 'environmentsData':
                console.log('Received environments data:', message.payload);
                environments = message.payload.environments || [];
                selectedEnvironment = message.payload.selectedEnvironment;
                renderEnvironmentDropdown();
                updateEnvironmentButton();
                break;
                
            case 'environmentSelected':
                console.log('Environment selected:', message.payload);
                selectedEnvironment = message.payload.selectedEnvironment;
                updateEnvironmentButton();
                hideVariableSuggestions();

                // Re-apply variable highlighting when environment changes
                setTimeout(() => {
                    const urlInput = document.getElementById('raw-url');
                    if (urlInput) {
                        console.log('[DEBUG] Environment changed, re-applying highlighting');
                        highlightVariables(urlInput);
                        highlightVariablesInText(urlInput);
                        highlightVariablesInInput(urlInput);
                    }
                }, 50);
                break;
            case 'responseReceived':
                console.log('Processing responseReceived:', message.payload);
                const { status, statusText, time, headers, body, rawBodyBase64, details } = message.payload || {};

                // Update status badge
                statusBadgeEl.textContent = `${status} ${statusText || ''}`;
                if (status >= 200 && status < 300) statusBadgeEl.className = 'status-badge status-success';
                else if (status >= 300 && status < 400) statusBadgeEl.className = 'status-badge status-redirect';
                else if (status >= 400 && status < 500) statusBadgeEl.className = 'status-badge status-client-error';
                else if (status >= 500) statusBadgeEl.className = 'status-badge status-server-error';

                // Update popup status info
                document.getElementById('popup-status-text').textContent = `${status} ${statusText || ''}`;
                document.getElementById('popup-status-desc').textContent = getStatusMessage(status);
                document.getElementById('popup-status-icon').className = 'popup-icon-success';
                document.getElementById('popup-status-icon').textContent = '✓';

                // Update timing
                const timeEl = document.getElementById('response-time');
                if (timeEl) timeEl.textContent = `${time} ms`;

                // Update size - handle case where details might be undefined
                const sizeEl = document.getElementById('response-size');
                let totalSize = 0;
                if (details && details.size) {
                    totalSize = (details.size.responseHeaders || 0) + (details.size.responseBody || 0);
                } else {
                    // Fallback: calculate size from actual data
                    const bodySize = body ? Buffer.byteLength(body, 'utf8') : 0;
                    const headersSize = headers ? Buffer.byteLength(JSON.stringify(headers)) : 0;
                    totalSize = bodySize + headersSize;
                }
                if (sizeEl) sizeEl.textContent = formatBytes(totalSize);

                // Update headers display
                const responseHeadersCountEl = document.getElementById('response-headers-count');
                const headersTableBody = document.getElementById('headers-table-body');
                const headerCount = headers ? Object.keys(headers).length : 0;
                if (responseHeadersCountEl) responseHeadersCountEl.textContent = headerCount > 0 ? `(${headerCount})` : '';
                if (headersTableBody) headersTableBody.innerHTML = '';

                if (headers && headersTableBody) {
                    for (const key in headers) {
                        const row = document.createElement('div');
                        row.className = 'headers-table-row';
                        row.innerHTML = `<div class="headers-table-cell">${key}</div><div class="headers-table-cell">${headers[key]}</div>`;
                        headersTableBody.appendChild(row);
                    }
                }
                if (responseHeadersEditorRaw) {
                    responseHeadersEditorRaw.setValue(headers ? JSON.stringify(headers, null, 2) : '{}');
                }

                // Parse and display cookies
                currentCookies = [];
                if (headers && headers['set-cookie']) {
                    let setCookieHeaders = [];

                    // Handle different formats of set-cookie headers
                    if (Array.isArray(headers['set-cookie'])) {
                        setCookieHeaders = headers['set-cookie'];
                    } else if (typeof headers['set-cookie'] === 'string') {
                        // Sometimes multiple cookies are joined with newlines
                        setCookieHeaders = headers['set-cookie'].split('\n').filter(cookie => cookie.trim());
                    } else {
                        setCookieHeaders = [headers['set-cookie']];
                    }

                    setCookieHeaders.forEach((cookieString, index) => {
                        if (cookieString && cookieString.trim()) {
                            const cookie = parseCookieString(cookieString);
                            currentCookies.push(cookie);
                        }
                    });
                }
                renderCookies(currentCookies);

                // Update response body
                currentResponseData.text = body || '';
                currentResponseData.raw = base64ToUint8Array(rawBodyBase64 || '');

                // Update popups if details are available
                if (details) {
                    updateResponsePopups(details);
                }

                // Render response body
                const currentFormat = formatSelectorDropdown.dataset.selectedValue || 'JSON';
                renderResponseBody(currentFormat);

                // Switch to response body tab
                const responseBodyTab = document.querySelector('#response-tabs-container .tab[data-tab-target="#tab-response-body"]');
                if (responseBodyTab) {
                    responseBodyTab.click();
                }

                console.log('Response processing complete. Body content:', body);
                break;
            case 'showError':
                statusBadgeEl.textContent = `Error`; statusBadgeEl.className = 'status-badge status-server-error';
                document.getElementById('popup-status-text').textContent = `Error`; document.getElementById('popup-status-desc').textContent = message.payload.message;
                document.getElementById('popup-status-icon').className = 'popup-icon-failure'; document.getElementById('popup-status-icon').textContent = '✕';
                responseHeadersEditorRaw.setValue(''); currentResponseData.text = message.payload.stack || message.payload.message; currentResponseData.raw = new Uint8Array();
                renderResponseBody('Raw');
                break;
            case 'collectionsData':
                console.log('Received collections data:', message.payload);
                renderCollections(message.payload);
                break;

            case 'collectionCreated':
                console.log('Collection created:', message.payload);
                // Refresh collections list
                vscode.postMessage({ command: 'getCollections' });
                break;

            case 'requestSaved':
                console.log('Request saved:', message.payload);
                vscode.postMessage({
                    command: 'showInfo',
                    payload: 'Request saved successfully!'
                });
                break;

            case 'populateFromCollection': {
                console.log('[populateFromCollection] Populating UI with collection request data:', message.payload);

                // Clear all fields first before populating from collection
                clearAllFields();

                const requestData = message.payload;

                // Set method
                if (requestData.method) {
                    const methodDropdown = document.getElementById('method-dropdown');
                    if (methodDropdown) {
                        methodDropdown.dataset.selectedValue = requestData.method;
                        const selectedText = methodDropdown.querySelector('#selected-method-text');
                        if (selectedText) {
                            selectedText.textContent = requestData.method;
                            selectedText.className = `method-text method-${requestData.method.toLowerCase()}`;
                        }
                        updateHttpSvgTextAndColor();
                    }
                }

                // Set URL
                if (requestData.url) {
                    const urlInput = document.getElementById('raw-url');
                    if (urlInput) {
                        urlInput.value = requestData.url;
                        // Apply variable highlighting
                        setTimeout(() => {
                            highlightVariables(urlInput);
                            highlightVariablesInText(urlInput);
                            highlightVariablesInInput(urlInput);
                        }, 50);
                    }
                }

                // Set request name
                if (requestData.name) {
                    const requestNameInput = document.getElementById('request-name-input');
                    if (requestNameInput) {
                        requestNameInput.value = requestData.name;
                        requestName = requestData.name;
                    }
                }

                // Set headers
                if (requestData.headers) {
                    console.log('[populateFromCollection] Headers data:', requestData.headers);
                    console.log('[populateFromCollection] Headers type:', typeof requestData.headers);
                    const headersBody = document.getElementById('headers-kv-body');
                    if (headersBody) {
                        headersBody.innerHTML = '';
                        let headersObj = {};
                        if (typeof requestData.headers === 'string') {
                            try {
                                headersObj = JSON.parse(requestData.headers);
                                console.log('[populateFromCollection] Parsed headers object:', headersObj);
                            } catch (e) {
                                console.error('[populateFromCollection] Failed to parse headers:', e);
                                headersObj = {};
                            }
                        } else {
                            headersObj = requestData.headers;
                        }
                        Object.entries(headersObj).forEach(([key, value]) => {
                            const row = createHeaderRow();
                            row.querySelector('.kv-key').value = key;
                            row.querySelector('.kv-value').value = value;
                            row.querySelector('.kv-check').checked = true;
                            headersBody.appendChild(row);
                        });
                        updateRequestHeaderCount();
                    }
                }

                // Set params
                if (requestData.params) {
                    const paramsBody = document.getElementById('params-kv-body');
                    if (paramsBody) {
                        paramsBody.innerHTML = '';
                        Object.entries(requestData.params).forEach(([key, value]) => {
                            const row = createParamRow();
                            row.querySelector('.kv-key').value = key;
                            row.querySelector('.kv-value').value = value;
                            paramsBody.appendChild(row);
                        });
                        // Add empty row at the end
                        paramsBody.appendChild(createParamRow());
                    }
                }

                // Set body based on bodyType
                if (requestData.bodyType) {
                    // Set the correct body type radio button
                    const bodyTypeRadio = document.querySelector(`input[name="body-type"][value="${requestData.bodyType}"]`);
                    if (bodyTypeRadio) {
                        bodyTypeRadio.checked = true;
                        // Trigger the change event to ensure proper UI updates
                        bodyTypeRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // Populate body content based on type (only for non-none types)
                    if (requestData.bodyType !== 'none') {
                        switch (requestData.bodyType) {
                            case 'raw':
                                if (requestData.rawBody && typeof rawBodyEditor !== 'undefined') {
                                    rawBodyEditor.setValue(requestData.rawBody);
                                }
                                break;
                            case 'x-www-form-urlencoded':
                                if (requestData.formBody) {
                                    const formBodyElement = document.getElementById('urlencoded-kv-body');
                                    if (formBodyElement) {
                                        formBodyElement.innerHTML = '';
                                        Object.entries(requestData.formBody).forEach(([key, value]) => {
                                            const row = createFormRow();
                                            row.querySelector('.kv-key').value = key;
                                            row.querySelector('.kv-value').value = value;
                                            formBodyElement.appendChild(row);
                                        });
                                        // Add empty row at the end
                                        formBodyElement.appendChild(createFormRow());
                                    }
                                }
                                break;
                            case 'graphql':
                                if (requestData.graphqlQuery && typeof graphqlQueryEditor !== 'undefined') {
                                    graphqlQueryEditor.setValue(requestData.graphqlQuery);
                                }
                                if (requestData.graphqlVariables && typeof graphqlVariablesEditor !== 'undefined') {
                                    graphqlVariablesEditor.setValue(requestData.graphqlVariables);
                                }
                                break;
                        }
                    }
                }

                // Set auth
                if (requestData.auth) {
                    const authType = requestData.auth.type || 'no-auth';
                    const authDropdown = document.getElementById('auth-type-dropdown');
                    if (authDropdown) {
                        authDropdown.dataset.selectedValue = authType;
                        const menu = authDropdown.querySelector('.dropdown-menu');
                        if (menu) {
                            menu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                            const activeLi = menu.querySelector(`li[data-value="${authType}"]`);
                            if (activeLi) activeLi.classList.add('active');
                        }
                        const selectedText = document.getElementById('selected-auth-type-text');
                        if (selectedText) selectedText.textContent = authType.charAt(0).toUpperCase() + authType.slice(1).replace(/-/g, ' ');
                    }

                    // Populate auth fields based on type
                    switch (authType) {
                        case 'basic':
                            if (requestData.auth.username) document.getElementById('basic-username').value = requestData.auth.username;
                            if (requestData.auth.password) document.getElementById('basic-password').value = requestData.auth.password;
                            break;
                        case 'bearer':
                            if (requestData.auth.token) document.getElementById('bearer-token').value = requestData.auth.token;
                            break;
                        case 'apikey':
                            if (requestData.auth.key) document.getElementById('apikey-key').value = requestData.auth.key;
                            if (requestData.auth.value) document.getElementById('apikey-value').value = requestData.auth.value;
                            if (requestData.auth.addTo) document.getElementById('apikey-add-to').value = requestData.auth.addTo;
                            break;
                        case 'jwt':
                            if (requestData.auth.headerPrefix) document.getElementById('jwt-header-prefix').value = requestData.auth.headerPrefix;
                            if (requestData.auth.secret) document.getElementById('jwt-secret').value = requestData.auth.secret;
                            if (requestData.auth.addTo) document.getElementById('jwt-add-to-dropdown').dataset.selectedValue = requestData.auth.addTo;
                            if (requestData.auth.payload && typeof jwtPayloadEditor !== 'undefined') {
                                jwtPayloadEditor.setValue(typeof requestData.auth.payload === 'string' ? requestData.auth.payload : JSON.stringify(requestData.auth.payload, null, 2));
                            }
                            if (requestData.auth.headers && typeof jwtHeadersEditor !== 'undefined') {
                                jwtHeadersEditor.setValue(typeof requestData.auth.headers === 'string' ? requestData.auth.headers : JSON.stringify(requestData.auth.headers, null, 2));
                            }
                            break;
                        case 'digest':
                            if (requestData.auth.username) document.getElementById('digest-username').value = requestData.auth.username;
                            if (requestData.auth.password) document.getElementById('digest-password').value = requestData.auth.password;
                            if (requestData.auth.disableRetry !== undefined) document.getElementById('digest-disable-retry').checked = requestData.auth.disableRetry;
                            if (requestData.auth.realm) document.getElementById('digest-realm').value = requestData.auth.realm;
                            if (requestData.auth.nonce) document.getElementById('digest-nonce').value = requestData.auth.nonce;
                            if (requestData.auth.algorithm) document.getElementById('digest-algorithm').value = requestData.auth.algorithm;
                            if (requestData.auth.qop) document.getElementById('digest-qop').value = requestData.auth.qop;
                            if (requestData.auth.nonceCount) document.getElementById('digest-nc').value = requestData.auth.nonceCount;
                            if (requestData.auth.clientNonce) document.getElementById('digest-cnonce').value = requestData.auth.clientNonce;
                            if (requestData.auth.opaque) document.getElementById('digest-opaque').value = requestData.auth.opaque;
                            break;
                        case 'oauth1':
                            if (requestData.auth.addTo) document.getElementById('oauth1-add-to-dropdown').dataset.selectedValue = requestData.auth.addTo;
                            if (requestData.auth.signatureMethod) document.getElementById('oauth1-signature-method').value = requestData.auth.signatureMethod;
                            if (requestData.auth.consumerKey) document.getElementById('oauth1-consumer-key').value = requestData.auth.consumerKey;
                            if (requestData.auth.consumerSecret) document.getElementById('oauth1-consumer-secret').value = requestData.auth.consumerSecret;
                            if (requestData.auth.accessToken) document.getElementById('oauth1-token').value = requestData.auth.accessToken;
                            if (requestData.auth.tokenSecret) document.getElementById('oauth1-token-secret').value = requestData.auth.tokenSecret;
                            if (requestData.auth.callbackURL) document.getElementById('oauth1-callback-url').value = requestData.auth.callbackURL;
                            if (requestData.auth.verifier) document.getElementById('oauth1-verifier').value = requestData.auth.verifier;
                            if (requestData.auth.timestamp) document.getElementById('oauth1-timestamp').value = requestData.auth.timestamp;
                            if (requestData.auth.nonce) document.getElementById('oauth1-nonce').value = requestData.auth.nonce;
                            if (requestData.auth.version) document.getElementById('oauth1-version').value = requestData.auth.version;
                            if (requestData.auth.realm) document.getElementById('oauth1-realm').value = requestData.auth.realm;
                            break;
                        case 'oauth2':
                            if (requestData.auth.addTo) document.getElementById('oauth2-add-to-dropdown').dataset.selectedValue = requestData.auth.addTo;
                            if (requestData.auth.accessToken) document.getElementById('oauth2-token').value = requestData.auth.accessToken;
                            if (requestData.auth.headerPrefix) document.getElementById('oauth2-header-prefix').value = requestData.auth.headerPrefix;
                            if (requestData.auth.config) {
                                if (requestData.auth.config.tokenName) document.getElementById('oauth2-token-name').value = requestData.auth.config.tokenName;
                                if (requestData.auth.config.grantType) document.getElementById('oauth2-grant-type').value = requestData.auth.config.grantType;
                                if (requestData.auth.config.callbackURL) document.getElementById('oauth2-callback-url').value = requestData.auth.config.callbackURL;
                                if (requestData.auth.config.authURL) document.getElementById('oauth2-auth-url').value = requestData.auth.config.authURL;
                                if (requestData.auth.config.accessTokenURL) document.getElementById('oauth2-token-url').value = requestData.auth.config.accessTokenURL;
                                if (requestData.auth.config.clientID) document.getElementById('oauth2-client-id').value = requestData.auth.config.clientID;
                                if (requestData.auth.config.clientSecret) document.getElementById('oauth2-client-secret').value = requestData.auth.config.clientSecret;
                                if (requestData.auth.config.scope) document.getElementById('oauth2-scope').value = requestData.auth.config.scope;
                                if (requestData.auth.config.state) document.getElementById('oauth2-state').value = requestData.auth.config.state;
                                if (requestData.auth.config.clientAuthentication) document.getElementById('oauth2-client-auth').value = requestData.auth.config.clientAuthentication;
                            }
                            break;
                        case 'ntlm':
                            if (requestData.auth.username) document.getElementById('ntlm-username').value = requestData.auth.username;
                            if (requestData.auth.password) document.getElementById('ntlm-password').value = requestData.auth.password;
                            if (requestData.auth.domain) document.getElementById('ntlm-domain').value = requestData.auth.domain;
                            break;
                        case 'awsv4':
                            if (requestData.auth.accessKeyId) document.getElementById('aws-access-key').value = requestData.auth.accessKeyId;
                            if (requestData.auth.secretAccessKey) document.getElementById('aws-secret-key').value = requestData.auth.secretAccessKey;
                            if (requestData.auth.region) document.getElementById('aws-region').value = requestData.auth.region;
                            if (requestData.auth.service) document.getElementById('aws-service-name').value = requestData.auth.service;
                            if (requestData.auth.sessionToken) document.getElementById('aws-session-token').value = requestData.auth.sessionToken;
                            break;
                        case 'hawk':
                            if (requestData.auth.authId) document.getElementById('hawk-id').value = requestData.auth.authId;
                            if (requestData.auth.authKey) document.getElementById('hawk-key').value = requestData.auth.authKey;
                            if (requestData.auth.algorithm) document.getElementById('hawk-algorithm').value = requestData.auth.algorithm;
                            if (requestData.auth.user) document.getElementById('hawk-user').value = requestData.auth.user;
                            if (requestData.auth.nonce) document.getElementById('hawk-nonce').value = requestData.auth.nonce;
                            if (requestData.auth.ext) document.getElementById('hawk-ext').value = requestData.auth.ext;
                            if (requestData.auth.app) document.getElementById('hawk-app').value = requestData.auth.app;
                            if (requestData.auth.dlg) document.getElementById('hawk-dlg').value = requestData.auth.dlg;
                            break;
                    }

                    // Show the correct auth panel
                    if (typeof updateAuthUI === 'function') {
                        updateAuthUI(authType);
                    }
                }

                console.log('[populateFromCollection] UI population complete');
                break;
            }
            case 'aiCurlGenerated': {
                console.log('AI cURL command generated:', message.payload);
                const { curlCommand, success, error } = message.payload;

                // Remove loading message and add actual response
                const messagesContainer = document.getElementById('ai-chat-messages');
                if (messagesContainer) {
                    const messages = messagesContainer.querySelectorAll('.ai-message');
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage && lastMessage.textContent?.includes('Generating')) {
                        lastMessage.remove();
                    }
                }

                if (success && curlCommand) {
                    // Clean the cURL command by removing prefix text
                    let cleanContent = curlCommand;

                    // If content contains curl, clean it by removing prefix text
                    if (curlCommand.includes('curl')) {
                        // Remove common AI prefixes that might appear before the curl command
                        cleanContent = curlCommand
                            .replace(/^(Generated Curl Command|Here's the cURL command|Here is the cURL command|Curl Command|Generated cURL|cURL Command)[\s:]*\s*/i, '')
                            .replace(/^(Sure,?\s*)?Here['']?s?\s+(the\s+)?c?URL\s+command[\s:]*\s*/i, '')
                            .replace(/^(I['']?ve\s+)?[Gg]enerated\s+(the\s+)?c?URL\s+command[\s:]*\s*/i, '')
                            .replace(/^[A-Z][a-z]+[\s:]*\s*/g, '') // Remove sentences starting with capital letters
                            .trim();

                        // Ensure it starts with curl
                        if (!cleanContent.toLowerCase().startsWith('curl')) {
                            // If it doesn't start with curl after cleaning, it might be wrapped in other text
                            // Try to extract just the curl part
                            const curlMatch = cleanContent.match(/curl\s+[^\n\r]*/i);
                            if (curlMatch) {
                                cleanContent = curlMatch[0];
                            }
                        }
                    }

                    // Add AI response to conversation history (use cleaned content)
                    conversationHistory.push({
                        role: 'assistant',
                        content: cleanContent
                    });

                    // Manage conversation history length
                    manageConversationHistory();

                    // Add AI response to chat
                    addChatMessage('ai', curlCommand);

                    vscode.postMessage({
                        command: 'showInfo',
                        payload: 'AI generated cURL command successfully!'
                    });
                } else {
                    // Add error message to conversation history
                    conversationHistory.push({
                        role: 'assistant',
                        content: `❌ Error: ${error || 'Failed to generate cURL command'}`
                    });

                    // Manage conversation history length
                    manageConversationHistory();

                    // Add error message to chat
                    addChatMessage('ai', `❌ Error: ${error || 'Failed to generate cURL command'}`);

                    vscode.postMessage({
                        command: 'showError',
                        payload: { message: error || 'AI failed to generate a valid cURL command.' }
                    });
                }
                break;
            }
            case 'populateFromHistory': {
                const entry = message.payload;

                // Clear all fields first before populating from history
                clearAllFields();

                // --- COMPREHENSIVE FIELD CLEARING ---
                // Clear method dropdown
                if (document.getElementById('method-dropdown')) {
                    const methodDropdown = document.getElementById('method-dropdown');
                    methodDropdown.dataset.selectedValue = '';
                    const selectedText = methodDropdown.querySelector('#selected-method-text');
                    if (selectedText) {
                        selectedText.textContent = '';
                        selectedText.className = 'method-text';
                    }
                }
                
                // Clear URL
                if (document.getElementById('raw-url')) {
                    document.getElementById('raw-url').value = '';
                }
                
                // Clear headers - remove all rows and add one empty row
                const headersBody = document.getElementById('headers-kv-body');
                if (headersBody) {
                    headersBody.innerHTML = '';
                    headersBody.appendChild(createHeaderRow());
                    updateRequestHeaderCount();
                }
                
                // Clear params - remove all rows and add one empty row
                const paramsBody = document.getElementById('params-kv-body');
                if (paramsBody) {
                    paramsBody.innerHTML = '';
                    paramsBody.appendChild(createParamRow());
                }
                
                // Clear form data (urlencoded) - remove all rows and add one empty row
                const formBody = document.getElementById('urlencoded-kv-body');
                if (formBody) {
                    formBody.innerHTML = '';
                    formBody.appendChild(createFormRow());
                }
                
                // Clear raw body editor
                if (typeof rawBodyEditor !== 'undefined') {
                    rawBodyEditor.setValue('');
                }
                
                // Clear GraphQL editors
                if (typeof graphqlQueryEditor !== 'undefined') {
                    graphqlQueryEditor.setValue('');
                }
                if (typeof graphqlVariablesEditor !== 'undefined') {
                    graphqlVariablesEditor.setValue('');
                }
                
                // Reset body type to raw
                const rawBodyRadio = document.querySelector('input[name="body-type"][value="raw"]');
                if (rawBodyRadio) {
                    rawBodyRadio.checked = true;
                    document.querySelectorAll('.body-panel').forEach(panel => panel.classList.remove('active'));
                    const rawPanel = document.getElementById('body-panel-raw');
                    if (rawPanel) rawPanel.classList.add('active');
                }
                
                // Reset raw body type to JSON
                const rawBodyTypeSelect = document.getElementById('raw-body-type-select');
                if (rawBodyTypeSelect) {
                    rawBodyTypeSelect.value = 'json';
                }
                
                // Clear ALL authentication fields
                // Reset auth type to no-auth
                const authDropdown = document.getElementById('auth-type-dropdown');
                if (authDropdown) {
                    authDropdown.dataset.selectedValue = 'no-auth';
                    const menu = authDropdown.querySelector('.dropdown-menu');
                    if (menu) {
                        menu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                    }
                    const selectedText = document.getElementById('selected-auth-type-text');
                    if (selectedText) selectedText.textContent = 'No Auth';
                }
                
                // Hide all auth panels
                document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
                const noAuthPanel = document.getElementById('auth-panel-no-auth');
                if (noAuthPanel) noAuthPanel.classList.add('active');
                
                // Clear all auth input fields
                const authFields = [
                    // Basic auth
                    'basic-username', 'basic-password',
                    // Bearer token
                    'bearer-token',
                    // API Key
                    'apikey-key', 'apikey-value', 'apikey-add-to',
                    // JWT
                    'jwt-header-prefix', 'jwt-secret', 'jwt-add-to-dropdown',
                    // Digest
                    'digest-username', 'digest-password', 'digest-realm', 'digest-nonce',
                    'digest-algorithm', 'digest-qop', 'digest-nc', 'digest-cnonce', 'digest-opaque',
                    // OAuth1
                    'oauth1-signature-method', 'oauth1-consumer-key', 'oauth1-consumer-secret',
                    'oauth1-token', 'oauth1-token-secret', 'oauth1-callback-url', 'oauth1-verifier',
                    'oauth1-timestamp', 'oauth1-nonce', 'oauth1-version', 'oauth1-realm',
                    // OAuth2
                    'oauth2-token', 'oauth2-header-prefix', 'oauth2-token-name', 'oauth2-grant-type',
                    'oauth2-callback-url', 'oauth2-auth-url', 'oauth2-token-url', 'oauth2-client-id',
                    'oauth2-client-secret', 'oauth2-scope', 'oauth2-state', 'oauth2-client-auth',
                    // NTLM
                    'ntlm-username', 'ntlm-password', 'ntlm-domain',
                    // AWS
                    'aws-access-key', 'aws-secret-key', 'aws-region', 'aws-service-name', 'aws-session-token',
                    // Hawk
                    'hawk-id', 'hawk-key', 'hawk-algorithm', 'hawk-user', 'hawk-nonce', 'hawk-ext', 'hawk-app', 'hawk-dlg'
                ];
                
                authFields.forEach(fieldId => {
                    const field = document.getElementById(fieldId);
                    if (field) {
                        if (field.type === 'checkbox') {
                            field.checked = false;
                        } else {
                            field.value = '';
                        }
                    }
                });
                
                // Clear JWT editors
                if (typeof jwtPayloadEditor !== 'undefined') {
                    jwtPayloadEditor.setValue('{}');
                }
                if (typeof jwtHeadersEditor !== 'undefined') {
                    jwtHeadersEditor.setValue('{}');
                }
                
                // Reset auth dropdowns to defaults
                const authDropdowns = [
                    { id: 'apikey-add-to', defaultValue: 'header' },
                    { id: 'jwt-add-to-dropdown', defaultValue: 'header' },
                    { id: 'oauth1-add-to-dropdown', defaultValue: 'header' },
                    { id: 'oauth2-add-to-dropdown', defaultValue: 'header' }
                ];
                
                authDropdowns.forEach(({ id, defaultValue }) => {
                    const dropdown = document.getElementById(id);
                    if (dropdown) {
                        dropdown.dataset.selectedValue = defaultValue;
                    }
                });
                
                // --- NOW POPULATE FIELDS FROM HISTORY ENTRY ---
                // Set method
                if (entry.method && document.getElementById('method-dropdown')) {
                    const methodDropdown = document.getElementById('method-dropdown');
                    methodDropdown.dataset.selectedValue = entry.method;
                    const selectedText = methodDropdown.querySelector('#selected-method-text');
                    if (selectedText) {
                        selectedText.textContent = entry.method;
                        selectedText.className = `method-text method-${entry.method.toLowerCase()}`;
                    }
                    setTimeout(updateHttpSvgTextAndColor, 0);
                }
                // Set URL
                if (entry.url && document.getElementById('raw-url')) {
                    document.getElementById('raw-url').value = entry.url;

                    // Apply variable highlighting after setting URL value
                    const urlInput = document.getElementById('raw-url');
                    if (urlInput) {
                        setTimeout(() => {
                            console.log('[DEBUG] Applying variable highlighting after URL population from history');
                            highlightVariables(urlInput);
                            highlightVariablesInText(urlInput);
                            highlightVariablesInInput(urlInput);
                        }, 50);
                    }
                }
                // Set headers
                if (entry.headers) {
                    let headersObj = {};
                    if (typeof entry.headers === 'string') {
                        try { headersObj = JSON.parse(entry.headers); } catch { headersObj = {}; }
                    } else if (typeof entry.headers === 'object') {
                        headersObj = entry.headers;
                    }
                    const headersBody = document.getElementById('headers-kv-body');
                    if (headersBody) {
                        headersBody.innerHTML = '';
                        Object.entries(headersObj).forEach(([key, value]) => {
                            const row = createHeaderRow();
                            row.querySelector('.kv-key').value = key;
                            row.querySelector('.kv-value').value = value;
                            row.querySelector('.kv-check').checked = true;
                            headersBody.appendChild(row);
                        });
                        updateRequestHeaderCount();
                    }
                }
                // Set params
                if (entry.query) {
                    let paramsObj = {};
                    if (typeof entry.query === 'string') {
                        try { paramsObj = JSON.parse(entry.query); } catch { paramsObj = {}; }
                    } else if (typeof entry.query === 'object') {
                        paramsObj = entry.query;
                    }
                    const paramsBody = document.getElementById('params-kv-body');
                    if (paramsBody) {
                        paramsBody.innerHTML = '';
                        Object.entries(paramsObj).forEach(([key, value]) => {
                            const row = createParamRow();
                            row.querySelector('.kv-key').value = key;
                            row.querySelector('.kv-value').value = value;
                            paramsBody.appendChild(row);
                        });
                        // Always add one empty row at the end
                        paramsBody.appendChild(createParamRow());
                    }
                }
                // Set body based on bodyType
                if (entry.bodyType && entry.bodyType !== 'none') {
                    // Set the correct body type radio button
                    const bodyTypeRadio = document.querySelector(`input[name="body-type"][value="${entry.bodyType}"]`);
                    if (bodyTypeRadio) {
                        bodyTypeRadio.checked = true;
                        // Trigger the change event to activate the correct panel
                        bodyTypeRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    // Populate body content based on type
                    switch (entry.bodyType) {
                        case 'raw':
                            if (entry.rawBody && typeof rawBodyEditor !== 'undefined') {
                                rawBodyEditor.setValue(entry.rawBody);
                            }
                            break;
                        case 'x-www-form-urlencoded':
                            if (entry.formBody) {
                                let formBodyObj = {};
                                if (typeof entry.formBody === 'string') {
                                    try { formBodyObj = JSON.parse(entry.formBody); } catch { formBodyObj = {}; }
                                } else if (typeof entry.formBody === 'object') {
                                    formBodyObj = entry.formBody;
                                }
                                const formBodyElement = document.getElementById('urlencoded-kv-body');
                                if (formBodyElement) {
                                    formBodyElement.innerHTML = '';
                                    Object.entries(formBodyObj).forEach(([key, value]) => {
                                        const row = createFormRow();
                                        row.querySelector('.kv-key').value = key;
                                        row.querySelector('.kv-value').value = value;
                                        formBodyElement.appendChild(row);
                                    });
                                    // Always add one empty row at the end
                                    formBodyElement.appendChild(createFormRow());
                                }
                            }
                            break;
                        case 'graphql':
                            if (entry.graphqlQuery && typeof graphqlQueryEditor !== 'undefined') {
                                graphqlQueryEditor.setValue(entry.graphqlQuery);
                            }
                            if (entry.graphqlVariables && typeof graphqlVariablesEditor !== 'undefined') {
                                graphqlVariablesEditor.setValue(entry.graphqlVariables);
                            }
                            break;
                    }
                }
                // Set auth (if present)
                if (entry.auth) {
                    let authObj = {};
                    if (typeof entry.auth === 'string') {
                        try { authObj = JSON.parse(entry.auth); } catch { authObj = {}; }
                    } else if (typeof entry.auth === 'object') {
                        authObj = entry.auth;
                    }
                    const authType = authObj.type || 'no-auth';
                    const authDropdown = document.getElementById('auth-type-dropdown');
                    if (authDropdown) {
                        authDropdown.dataset.selectedValue = authType;
                        const menu = authDropdown.querySelector('.dropdown-menu');
                        if (menu) {
                            menu.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                            const activeLi = menu.querySelector(`li[data-value="${authType}"]`);
                            if (activeLi) activeLi.classList.add('active');
                        }
                        const selectedText = document.getElementById('selected-auth-type-text');
                        if (selectedText) selectedText.textContent = authType.charAt(0).toUpperCase() + authType.slice(1).replace(/-/g, ' ');
                    }
                    // Populate fields for each auth type
                    switch (authType) {
                        case 'basic':
                            document.getElementById('basic-username').value = authObj.username || '';
                            document.getElementById('basic-password').value = authObj.password || '';
                            break;
                        case 'bearer':
                            document.getElementById('bearer-token').value = authObj.token || '';
                            break;
                        case 'apikey':
                            document.getElementById('apikey-key').value = authObj.key || '';
                            document.getElementById('apikey-value').value = authObj.value || '';
                            document.getElementById('apikey-add-to').value = authObj.addTo || 'header';
                            break;
                        case 'jwt':
                            document.getElementById('jwt-header-prefix').value = authObj.headerPrefix || 'Bearer';
                            document.getElementById('jwt-secret').value = authObj.secret || '';
                            document.getElementById('jwt-add-to-dropdown').dataset.selectedValue = authObj.addTo || 'header';
                            if (typeof jwtPayloadEditor !== 'undefined') jwtPayloadEditor.setValue(JSON.stringify(authObj.payload || {}, null, 2));
                            if (typeof jwtHeadersEditor !== 'undefined') jwtHeadersEditor.setValue(JSON.stringify(authObj.headers || {}, null, 2));
                            break;
                        case 'digest':
                            document.getElementById('digest-username').value = authObj.username || '';
                            document.getElementById('digest-password').value = authObj.password || '';
                            document.getElementById('digest-disable-retry').checked = !!authObj.disableRetry;
                            document.getElementById('digest-realm').value = authObj.realm || '';
                            document.getElementById('digest-nonce').value = authObj.nonce || '';
                            document.getElementById('digest-algorithm').value = authObj.algorithm || '';
                            document.getElementById('digest-qop').value = authObj.qop || '';
                            document.getElementById('digest-nc').value = authObj.nonceCount || '';
                            document.getElementById('digest-cnonce').value = authObj.clientNonce || '';
                            document.getElementById('digest-opaque').value = authObj.opaque || '';
                            break;
                        case 'oauth1':
                            document.getElementById('oauth1-add-to-dropdown').dataset.selectedValue = authObj.addTo || 'header';
                            document.getElementById('oauth1-signature-method').value = authObj.signatureMethod || '';
                            document.getElementById('oauth1-consumer-key').value = authObj.consumerKey || '';
                            document.getElementById('oauth1-consumer-secret').value = authObj.consumerSecret || '';
                            document.getElementById('oauth1-token').value = authObj.accessToken || '';
                            document.getElementById('oauth1-token-secret').value = authObj.tokenSecret || '';
                            document.getElementById('oauth1-callback-url').value = authObj.callbackURL || '';
                            document.getElementById('oauth1-verifier').value = authObj.verifier || '';
                            document.getElementById('oauth1-timestamp').value = authObj.timestamp || '';
                            document.getElementById('oauth1-nonce').value = authObj.nonce || '';
                            document.getElementById('oauth1-version').value = authObj.version || '';
                            document.getElementById('oauth1-realm').value = authObj.realm || '';
                            break;
                        case 'oauth2':
                            document.getElementById('oauth2-add-to-dropdown').dataset.selectedValue = authObj.addTo || 'header';
                            document.getElementById('oauth2-token').value = authObj.accessToken || '';
                            document.getElementById('oauth2-header-prefix').value = authObj.headerPrefix || 'Bearer';
                            if (authObj.config) {
                                document.getElementById('oauth2-token-name').value = authObj.config.tokenName || '';
                                document.getElementById('oauth2-grant-type').value = authObj.config.grantType || '';
                                document.getElementById('oauth2-callback-url').value = authObj.config.callbackURL || '';
                                document.getElementById('oauth2-auth-url').value = authObj.config.authURL || '';
                                document.getElementById('oauth2-token-url').value = authObj.config.accessTokenURL || '';
                                document.getElementById('oauth2-client-id').value = authObj.config.clientID || '';
                                document.getElementById('oauth2-client-secret').value = authObj.config.clientSecret || '';
                                document.getElementById('oauth2-scope').value = authObj.config.scope || '';
                                document.getElementById('oauth2-state').value = authObj.config.state || '';
                                document.getElementById('oauth2-client-auth').value = authObj.config.clientAuthentication || '';
                            }
                            break;
                        case 'ntlm':
                            document.getElementById('ntlm-username').value = authObj.username || '';
                            document.getElementById('ntlm-password').value = authObj.password || '';
                            document.getElementById('ntlm-domain').value = authObj.domain || '';
                            break;
                        case 'awsv4':
                            document.getElementById('aws-access-key').value = authObj.accessKeyId || '';
                            document.getElementById('aws-secret-key').value = authObj.secretAccessKey || '';
                            document.getElementById('aws-region').value = authObj.region || '';
                            document.getElementById('aws-service-name').value = authObj.service || '';
                            document.getElementById('aws-session-token').value = authObj.sessionToken || '';
                            break;
                        case 'hawk':
                            document.getElementById('hawk-id').value = authObj.authId || '';
                            document.getElementById('hawk-key').value = authObj.authKey || '';
                            document.getElementById('hawk-algorithm').value = authObj.algorithm || '';
                            document.getElementById('hawk-user').value = authObj.user || '';
                            document.getElementById('hawk-nonce').value = authObj.nonce || '';
                            document.getElementById('hawk-ext').value = authObj.ext || '';
                            document.getElementById('hawk-app').value = authObj.app || '';
                            document.getElementById('hawk-dlg').value = authObj.dlg || '';
                            break;
                    }
                    // --- Ensure correct auth panel is shown ---
                    if (typeof updateAuthUI === 'function') {
                        updateAuthUI(authType);
                    }
                }
                // Set request name if present
                if (entry.name && document.getElementById('request-name-input')) {
                    requestName = entry.name;
                    document.getElementById('request-name-input').value = entry.name;
                }
                break;
            }
        }
    }

    function renderJsonTree(json, container, depth = 0, isRoot = true) {
        if (depth === 0) container.innerHTML = '';
        const isArray = Array.isArray(json);
        const isObject = json && typeof json === 'object';
        if (!isObject) { container.textContent = JSON.stringify(json); return; }
        const ul = document.createElement('ul'); ul.classList.add('tree-level');
        for (const key in json) {
            const li = document.createElement('li');
            const value = json[key];
            const isNested = value && typeof value === 'object';
            const isValArray = Array.isArray(value);
            if (isNested) {
                const innerToggle = document.createElement('span'); innerToggle.textContent = '▼ '; innerToggle.classList.add('tree-toggle');
                const innerPreview = document.createElement('span'); innerPreview.classList.add('tree-preview'); innerPreview.textContent = isValArray ? '[...]' : '{...}'; innerPreview.style.display = 'none';
                const keySpan = document.createElement('span'); keySpan.classList.add('tree-key'); if (!isArray) keySpan.textContent = key;
                const innerWrapper = document.createElement('div'); innerWrapper.classList.add('brace-wrapper');
                const innerOpen = document.createElement('span'); innerOpen.classList.add('brace'); innerOpen.textContent = isValArray ? '[ ' : '{ ';
                const innerClose = document.createElement('span'); innerClose.classList.add('brace'); innerClose.textContent = isValArray ? ' ]' : ' }';
                const innerChild = document.createElement('div'); innerChild.classList.add('tree-child');
                renderJsonTree(value, innerChild, depth + 1, false);
                innerWrapper.appendChild(innerOpen); innerWrapper.appendChild(innerChild); innerWrapper.appendChild(innerClose);
                li.appendChild(innerToggle); if (!isArray) li.appendChild(keySpan); if (!isArray) li.appendChild(document.createTextNode(': ')); li.appendChild(innerPreview); li.appendChild(innerWrapper);
                innerToggle.onclick = () => { const isCollapsed = innerWrapper.classList.toggle('hidden'); innerToggle.textContent = isCollapsed ? '▶ ' : '▼ '; innerPreview.style.display = isCollapsed ? 'inline' : 'none'; };
            } else { const keyPart = isArray ? '' : `<span class="tree-key">${key}</span>: `; li.innerHTML = keyPart + `<span class="tree-value">${JSON.stringify(value)}</span>`; }
            ul.appendChild(li);
        }
        if (isRoot) {
            const outerLi = document.createElement('li');
            const toggle = document.createElement('span'); toggle.textContent = '▼ '; toggle.classList.add('tree-toggle');
            const preview = document.createElement('span'); preview.classList.add('tree-preview'); preview.textContent = isArray ? '[...]' : '{...}'; preview.style.display = 'none';
            const wrapper = document.createElement('div'); wrapper.classList.add('brace-wrapper');
            const open = document.createElement('span'); open.classList.add('brace'); open.textContent = isArray ? '[ ' : '{ ';
            const close = document.createElement('span'); close.classList.add('brace'); close.textContent = isArray ? ' ]' : ' }';
            const child = document.createElement('div'); child.classList.add('tree-child'); child.appendChild(ul);
            wrapper.appendChild(open); wrapper.appendChild(child); wrapper.appendChild(close);
            outerLi.appendChild(toggle); outerLi.appendChild(preview); outerLi.appendChild(wrapper);
            toggle.onclick = () => { const isCollapsed = wrapper.classList.toggle('hidden'); toggle.textContent = isCollapsed ? '▶ ' : '▼ '; preview.style.display = isCollapsed ? 'inline' : 'none'; };
            const outerUL = document.createElement('ul'); outerUL.appendChild(outerLi); container.appendChild(outerUL);
        } else { container.appendChild(ul); }
    }

    document.getElementById('format-selector-dropdown')?.addEventListener('click', (e) => {
        const clicked = e.target.closest('li'); if (!clicked) return;
        const format = clicked.dataset.value;
        const treeWrapper = document.getElementById('json-tree-view-wrapper'); const codeWrapper = document.getElementById('codemirror-view-wrapper');
        if (format === 'Tree') {
            treeWrapper.classList.remove('hidden'); codeWrapper.classList.add('hidden');
            try { const rawText = responseBodyEditor.getValue(); const parsed = JSON.parse(rawText); renderJsonTree(parsed, document.getElementById('json-tree-view')); }
            catch (e) { treeWrapper.innerHTML = `<div class="tree-error">Failed to parse JSON: ${e.message}</div>`; }
        } else { treeWrapper.classList.add('hidden'); codeWrapper.classList.remove('hidden'); }
    });

    // Save Request Dialog functionality
    let collections = [];
    let currentRequestData = null;

    function setupSaveDialog() {
        const saveBtn = document.getElementById('save-request-btn');
        const saveDialogOverlay = document.getElementById('save-dialog-overlay');
        const saveDialogClose = document.getElementById('save-dialog-close');
        const saveDialogCancel = document.getElementById('save-dialog-cancel');
        const saveDialogSave = document.getElementById('save-dialog-save');
        const saveCollectionSelected = document.getElementById('save-collection-selected');
        const saveDropdownMenu = document.getElementById('save-dropdown-menu');
        const saveCollectionSearch = document.getElementById('save-collection-search');
        const saveDropdownContent = document.getElementById('save-dropdown-content');
        const saveCreateCollectionBtn = document.getElementById('save-create-collection-btn');
        const saveRequestName = document.getElementById('save-request-name');

        if (!saveBtn || !saveDialogOverlay) return;

        // Show save dialog
        saveBtn.addEventListener('click', () => {
            // Gather current request data
            currentRequestData = gatherRequestData();

            // Set default request name from URL or current name
            const urlInput = document.getElementById('raw-url');
            const requestNameInput = document.getElementById('request-name-input');

            // Prioritize: URL endpoint name, then main request name input, then default
            let defaultName = 'Untitled Request';
            if (urlInput?.value) {
                // Extract the last part of the URL path as the name
                const urlParts = urlInput.value.split('/');
                const lastPart = urlParts[urlParts.length - 1];
                if (lastPart && lastPart.trim() && !lastPart.includes('?') && !lastPart.includes('#')) {
                    defaultName = lastPart;
                } else if (urlParts.length > 2) {
                    // If last part is empty or just query params, use the second-to-last part
                    const secondLast = urlParts[urlParts.length - 2];
                    if (secondLast && secondLast.trim()) {
                        defaultName = secondLast;
                    }
                }
            }

            // If we couldn't get a name from URL, use the main request name input
            if (defaultName === 'Untitled Request' && requestNameInput?.value && requestNameInput.value.trim()) {
                defaultName = requestNameInput.value.trim();
            }

            console.log('[DEBUG] Setting save dialog request name to:', defaultName);
            console.log('[DEBUG] URL value:', urlInput?.value);
            console.log('[DEBUG] Main request name input value:', requestNameInput?.value);

            if (saveRequestName) {
                saveRequestName.value = defaultName;
                // Force a change event to ensure the value is registered
                saveRequestName.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Request collections data
            vscode.postMessage({ command: 'getCollections' });

            // Show dialog
            saveDialogOverlay.classList.remove('hidden');
        });

        // Close dialog handlers
        const closeDialog = () => {
            saveDialogOverlay.classList.add('hidden');
            saveCollectionSearch.value = '';
            filterCollections('');
            currentRequestData = null;
        };

        saveDialogClose.addEventListener('click', closeDialog);
        saveDialogCancel.addEventListener('click', closeDialog);

        // Close on overlay click
        saveDialogOverlay.addEventListener('click', (e) => {
            if (e.target === saveDialogOverlay) {
                closeDialog();
            }
        });

        // Collection dropdown functionality
        if (saveCollectionSelected) {
            saveCollectionSelected.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = saveDropdownMenu.classList.contains('hidden');
                
                // Close other dropdowns
                document.querySelectorAll('.custom-dropdown').forEach(d => {
                    d.classList.remove('open');
                    d.querySelector('.dropdown-menu')?.classList.add('hidden');
                });

                if (isHidden) {
                    saveDropdownMenu.classList.remove('hidden');
                    saveCollectionSelected.parentElement.classList.add('open');
                    if (saveCollectionSearch) {
                        saveCollectionSearch.focus();
                    }
                } else {
                    saveDropdownMenu.classList.add('hidden');
                    saveCollectionSelected.parentElement.classList.remove('open');
                }
            });
        }

        // Collection search functionality
        if (saveCollectionSearch) {
            saveCollectionSearch.addEventListener('input', (e) => {
                filterCollections(e.target.value);
            });
        }

        // Create new collection
        if (saveCreateCollectionBtn) {
            saveCreateCollectionBtn.addEventListener('click', () => {
                const collectionName = prompt('Enter collection name:');
                if (collectionName && collectionName.trim()) {
                    vscode.postMessage({
                        command: 'createCollection',
                        payload: { name: collectionName.trim() }
                    });
                }
            });
        }

        // Save request
        if (saveDialogSave) {
            saveDialogSave.addEventListener('click', () => {
                // Prioritize the save dialog input, but fall back to main request name input
                const requestName = saveRequestName?.value?.trim() ||
                                   document.getElementById('request-name-input')?.value?.trim() ||
                                   'Untitled Request';

                const selectedCollectionId = saveCollectionSelected.dataset.collectionId;

                if (!selectedCollectionId) {
                    vscode.postMessage({
                        command: 'showError',
                        payload: { message: 'Please select a collection to save the request.' }
                    });
                    return;
                }

                // Re-gather request data to ensure we have the latest information
                const freshRequestData = gatherRequestData();

                // Safely parse folder path with error handling
                let folderPath = null;
                const folderPathData = saveCollectionSelected.dataset.folderPath;
                if (folderPathData && folderPathData.trim()) {
                    try {
                        folderPath = JSON.parse(folderPathData);
                        console.log('[DEBUG] Successfully parsed folder path:', folderPath);
                    } catch (parseError) {
                        console.log('[DEBUG] Error parsing folder path, using null:', parseError);
                        folderPath = null;
                    }
                }

                const saveData = {
                    name: requestName,
                    collectionId: selectedCollectionId,
                    requestData: freshRequestData,
                    folderPath: folderPath
                };

                console.log('[DEBUG] Sending save request with data:', saveData);
                console.log('[DEBUG] Collection ID:', selectedCollectionId);
                console.log('[DEBUG] Request name:', requestName);
                console.log('[DEBUG] Folder path from dataset:', saveCollectionSelected.dataset.folderPath);
                console.log('[DEBUG] Parsed folder path:', saveData.folderPath);
                console.log('[DEBUG] Folder path type:', typeof saveData.folderPath, 'isArray:', Array.isArray(saveData.folderPath));
                console.log('[DEBUG] Request data keys:', Object.keys(freshRequestData));
                console.log('[DEBUG] Request data headers:', freshRequestData.headers);
                console.log('[DEBUG] Request data params:', freshRequestData.params);
                console.log('[DEBUG] Request data bodyType:', freshRequestData.bodyType);

                vscode.postMessage({
                    command: 'saveRequest',
                    payload: saveData
                });

                closeDialog();
            });
        }

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !saveDialogOverlay.classList.contains('hidden')) {
                closeDialog();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.save-collection-dropdown')) {
                saveDropdownMenu?.classList.add('hidden');
                saveCollectionSelected?.parentElement.classList.remove('open');
            }
        });
    }

    function gatherRequestData() {
        const methodDropdown = document.getElementById('method-dropdown');
        const urlInput = document.getElementById('raw-url');
        const requestNameInput = document.getElementById('request-name-input');
        const saveRequestName = document.getElementById('save-request-name');
        const saveCollectionSelected = document.getElementById('save-collection-selected');

        // Get the request name from either the save dialog input or the main request name input
        const requestName = saveRequestName?.value?.trim() || requestNameInput?.value?.trim() || 'Untitled Request';

        console.log('[DEBUG] Gathering request data with name:', requestName);
        console.log('[DEBUG] Save request name input value:', saveRequestName?.value);
        console.log('[DEBUG] Main request name input value:', requestNameInput?.value);
        console.log('[DEBUG] Collection ID:', saveCollectionSelected?.dataset.collectionId);
        console.log('[DEBUG] Folder path:', saveCollectionSelected?.dataset.folderPath);

        // Gather all request data
        const requestData = {
            method: methodDropdown?.dataset.selectedValue || 'GET',
            url: urlInput?.value || '',
            name: requestName,
            headers: getKeyValueData('headers-kv-body', true),
            params: getKeyValueData('params-kv-body'),
            bodyType: document.querySelector('input[name="body-type"]:checked')?.value || 'none',
            rawBody: typeof rawBodyEditor !== 'undefined' ? rawBodyEditor.getValue() : '',
            formBody: getKeyValueData('urlencoded-kv-body'),
            graphqlQuery: typeof graphqlQueryEditor !== 'undefined' ? graphqlQueryEditor.getValue() : '',
            graphqlVariables: typeof graphqlVariablesEditor !== 'undefined' ? graphqlVariablesEditor.getValue() : '',
            auth: getAuthData(),
            collectionId: saveCollectionSelected?.dataset.collectionId || '',
            folderPath: (() => {
                const folderPathData = saveCollectionSelected?.dataset.folderPath;
                if (folderPathData && folderPathData.trim()) {
                    try {
                        return JSON.parse(folderPathData);
                    } catch (parseError) {
                        console.log('[DEBUG] Error parsing folder path in gatherRequestData:', parseError);
                        return null;
                    }
                }
                return null;
            })()
        };

        console.log('[DEBUG] Gathered request data:', {
            method: requestData.method,
            url: requestData.url,
            name: requestData.name,
            headersCount: Object.keys(requestData.headers).length,
            paramsCount: Object.keys(requestData.params).length,
            bodyType: requestData.bodyType,
            hasRawBody: !!requestData.rawBody,
            hasFormBody: Object.keys(requestData.formBody).length > 0,
            hasGraphQL: !!(requestData.graphqlQuery || requestData.graphqlVariables),
            authType: requestData.auth?.type,
            collectionId: requestData.collectionId,
            folderPath: requestData.folderPath
        });

        return requestData;
    }

    function getAuthData() {
        const authType = document.getElementById('auth-type-dropdown')?.dataset.selectedValue || 'no-auth';
        
        switch (authType) {
            case 'basic':
                return {
                    type: 'basic',
                    username: document.getElementById('basic-username')?.value || '',
                    password: document.getElementById('basic-password')?.value || ''
                };
            case 'bearer':
                return {
                    type: 'bearer',
                    token: document.getElementById('bearer-token')?.value?.trim() || ''
                };
            case 'apikey':
                return {
                    type: 'apikey',
                    key: document.getElementById('apikey-key')?.value?.trim() || '',
                    value: document.getElementById('apikey-value')?.value?.trim() || '',
                    addTo: document.getElementById('apikey-add-to')?.value || 'header'
                };
            case 'jwt':
                return {
                    type: 'jwt',
                    headerPrefix: document.getElementById('jwt-header-prefix')?.value?.trim() || 'Bearer',
                    secret: document.getElementById('jwt-secret')?.value || '',
                    addTo: document.getElementById('jwt-add-to-dropdown')?.dataset.selectedValue || 'header',
                    payload: typeof jwtPayloadEditor !== 'undefined' ? jwtPayloadEditor.getValue() : '{}',
                    headers: typeof jwtHeadersEditor !== 'undefined' ? jwtHeadersEditor.getValue() : '{}'
                };
            case 'digest':
                return {
                    type: 'digest',
                    username: document.getElementById('digest-username')?.value || '',
                    password: document.getElementById('digest-password')?.value || '',
                    disableRetry: document.getElementById('digest-disable-retry')?.checked || false,
                    realm: document.getElementById('digest-realm')?.value || '',
                    nonce: document.getElementById('digest-nonce')?.value || '',
                    algorithm: document.getElementById('digest-algorithm')?.value || '',
                    qop: document.getElementById('digest-qop')?.value || '',
                    nonceCount: document.getElementById('digest-nc')?.value || '',
                    clientNonce: document.getElementById('digest-cnonce')?.value || '',
                    opaque: document.getElementById('digest-opaque')?.value || ''
                };
            case 'oauth1':
                return {
                    type: 'oauth1',
                    addTo: document.getElementById('oauth1-add-to-dropdown')?.dataset.selectedValue || 'header',
                    signatureMethod: document.getElementById('oauth1-signature-method')?.value || '',
                    consumerKey: document.getElementById('oauth1-consumer-key')?.value || '',
                    consumerSecret: document.getElementById('oauth1-consumer-secret')?.value || '',
                    accessToken: document.getElementById('oauth1-token')?.value || '',
                    tokenSecret: document.getElementById('oauth1-token-secret')?.value || '',
                    callbackURL: document.getElementById('oauth1-callback-url')?.value || '',
                    verifier: document.getElementById('oauth1-verifier')?.value || '',
                    timestamp: document.getElementById('oauth1-timestamp')?.value || '',
                    nonce: document.getElementById('oauth1-nonce')?.value || '',
                    version: document.getElementById('oauth1-version')?.value || '',
                    realm: document.getElementById('oauth1-realm')?.value || ''
                };
            case 'oauth2':
                return {
                    type: 'oauth2',
                    addTo: document.getElementById('oauth2-add-to-dropdown')?.dataset.selectedValue || 'header',
                    accessToken: document.getElementById('oauth2-token')?.value?.trim() || '',
                    headerPrefix: document.getElementById('oauth2-header-prefix')?.value?.trim() || 'Bearer',
                    config: {
                        tokenName: document.getElementById('oauth2-token-name')?.value || '',
                        grantType: document.getElementById('oauth2-grant-type')?.value || '',
                        callbackURL: document.getElementById('oauth2-callback-url')?.value || '',
                        authURL: document.getElementById('oauth2-auth-url')?.value || '',
                        accessTokenURL: document.getElementById('oauth2-token-url')?.value || '',
                        clientID: document.getElementById('oauth2-client-id')?.value || '',
                        clientSecret: document.getElementById('oauth2-client-secret')?.value || '',
                        scope: document.getElementById('oauth2-scope')?.value || '',
                        state: document.getElementById('oauth2-state')?.value || '',
                        clientAuthentication: document.getElementById('oauth2-client-auth')?.value || ''
                    }
                };
            case 'ntlm':
                return {
                    type: 'ntlm',
                    username: document.getElementById('ntlm-username')?.value || '',
                    password: document.getElementById('ntlm-password')?.value || '',
                    domain: document.getElementById('ntlm-domain')?.value || ''
                };
            case 'awsv4':
                return {
                    type: 'awsv4',
                    accessKeyId: document.getElementById('aws-access-key')?.value || '',
                    secretAccessKey: document.getElementById('aws-secret-key')?.value || '',
                    region: document.getElementById('aws-region')?.value || '',
                    service: document.getElementById('aws-service-name')?.value || '',
                    sessionToken: document.getElementById('aws-session-token')?.value || ''
                };
            case 'hawk':
                return {
                    type: 'hawk',
                    authId: document.getElementById('hawk-id')?.value || '',
                    authKey: document.getElementById('hawk-key')?.value || '',
                    algorithm: document.getElementById('hawk-algorithm')?.value || '',
                    user: document.getElementById('hawk-user')?.value || '',
                    nonce: document.getElementById('hawk-nonce')?.value || '',
                    ext: document.getElementById('hawk-ext')?.value || '',
                    app: document.getElementById('hawk-app')?.value || '',
                    dlg: document.getElementById('hawk-dlg')?.value || ''
                };
            default:
                return { type: 'no-auth' };
        }
    }

    function renderFolders(folders, collectionId, depth = 0, parentPath = []) {
        let html = '';
        const indent = '  '.repeat(depth);
        const nestedClass = depth > 0 ? ` nested-level-${depth}` : '';

        folders.forEach(folder => {
            // Create folder path array by appending current folder name to parent path
            const folderPath = [...parentPath, folder.name];
            console.log('[DEBUG] Rendering folder:', folder.name, 'with path:', folderPath, 'at depth:', depth);
            html += `
                <div class="save-collection-item folder-item${nestedClass}" data-collection-id="${collectionId}" data-folder-path='${JSON.stringify(folderPath).replace(/'/g, "\\'")}' data-type="folder">
                    <div class="save-collection-item-icon">📂</div>
                    <div class="save-collection-item-label">${indent}${escapeHtml(folder.name)}</div>
                </div>
            `;

            // Add requests within this folder
            if (folder.requests && folder.requests.length > 0) {
                folder.requests.forEach(request => {
                    html += `
                        <div class="save-collection-item request-item${nestedClass}" data-collection-id="${collectionId}" data-folder-path='${JSON.stringify(folderPath).replace(/'/g, "\\'")}' data-request-id="${request.id}" data-type="request">
                            <div class="save-collection-item-icon">📄</div>
                            <div class="save-collection-item-label">${indent}  ${escapeHtml(request.name)}</div>
                        </div>
                    `;
                });
            }

            // Add nested folders recursively
            if (folder.folders && folder.folders.length > 0) {
                html += renderFolders(folder.folders, collectionId, depth + 1, folderPath);
            }
        });

        return html;
    }

    function renderCollections(collectionsData) {
        collections = collectionsData || [];
        const saveDropdownContent = document.getElementById('save-dropdown-content');
        const saveCollectionSelected = document.getElementById('save-collection-selected');

        if (!saveDropdownContent) return;

        let html = '';
        collections.forEach(collection => {
            // Add collection itself
            html += `
                <div class="save-collection-item collection-item" data-collection-id="${collection.id}" data-type="collection">
                    <div class="save-collection-item-icon">📁</div>
                    <div class="save-collection-item-label">${escapeHtml(collection.name)}</div>
                </div>
            `;

            // Add folders recursively
            if (collection.folders && collection.folders.length > 0) {
                html += renderFolders(collection.folders, collection.id, 0);
            }

            // Add requests directly in collection (not in folders)
            if (collection.requests && collection.requests.length > 0) {
                collection.requests.forEach(request => {
                    html += `
                        <div class="save-collection-item request-item" data-collection-id="${collection.id}" data-folder-path='[]' data-request-id="${request.id}" data-type="request">
                            <div class="save-collection-item-icon">📄</div>
                            <div class="save-collection-item-label">${escapeHtml(request.name)}</div>
                        </div>
                    `;
                });
            }
        });

        saveDropdownContent.innerHTML = html;

        // Add click event listeners to all collection items
        saveDropdownContent.querySelectorAll('.save-collection-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const collectionId = item.getAttribute('data-collection-id');
                const requestId = item.getAttribute('data-request-id');
                const folderPath = item.getAttribute('data-folder-path');
                const itemType = item.getAttribute('data-type');

                console.log('[DEBUG] Collection item clicked:', { collectionId, requestId, folderPath, itemType });

                if (collectionId) {
                    const collection = collections.find(c => c.id === collectionId);
                    if (collection) {
                        let displayName = collection.name;

                        if (itemType === 'folder' && folderPath) {
                            // Folder selected - save request in this folder
                            try {
                                // Parse the folder path JSON with error handling
                                let pathArray;
                                try {
                                    pathArray = JSON.parse(folderPath);
                                    console.log('[DEBUG] Selecting folder:', displayName, pathArray);
                                    console.log('[DEBUG] Raw folderPath from HTML:', folderPath);
                                } catch (parseError) {
                                    console.log('[DEBUG] Error parsing folder path:', parseError);
                                    console.log('[DEBUG] Folder path value:', folderPath);
                                    // Fallback: use the folder name from the item label
                                    const folderName = item.querySelector('.save-collection-item-label')?.textContent?.trim() || displayName;
                                    pathArray = [folderName];
                                }
                                // Use collection name for display, but pass the actual folder path
                                selectCollection(collectionId, displayName, null, pathArray);
                            } catch (error) {
                                console.log('[DEBUG] Error parsing folder path:', error);
                                console.log('[DEBUG] Folder path value:', folderPath);
                                // Fallback: use the folder name from the item label
                                const folderName = item.querySelector('.save-collection-item-label')?.textContent?.trim() || displayName;
                                selectCollection(collectionId, displayName, null, [folderName]);
                            }
                        } else if (itemType === 'request' && requestId) {
                            // Request selected - this shouldn't happen in save dialog, but handle it
                            let pathArray = [];
                            if (folderPath) {
                                try {
                                    // Parse the folder path JSON with error handling
                                    try {
                                        pathArray = JSON.parse(folderPath);
                                    } catch (parseError) {
                                        console.log('[DEBUG] Error parsing request folder path:', parseError);
                                        console.log('[DEBUG] Raw folderPath for request:', folderPath);
                                        // Fallback: use empty array for requests
                                        pathArray = [];
                                    }
                                } catch (parseError) {
                                    console.log('[DEBUG] Error parsing request folder path:', parseError);
                                    console.log('[DEBUG] Raw folderPath for request:', folderPath);
                                    // Fallback: use empty array for requests
                                    pathArray = [];
                                }
                            }
                            selectCollection(collectionId, displayName, requestId, pathArray);
                        } else if (itemType === 'collection') {
                            // Collection selected - save request directly in collection
                            console.log('[DEBUG] Selecting collection:', displayName);
                            selectCollection(collectionId, displayName);
                        }
                    }
                }
            });
        });

        // Set default selection if no collection is selected
        if (!saveCollectionSelected.dataset.collectionId && collections.length > 0) {
            selectCollection(collections[0].id, collections[0].name);
        }
    }

    function selectCollection(collectionId, collectionName, requestId = null, folderPath = null) {
        console.log('[DEBUG] selectCollection called with:', { collectionId, collectionName, requestId, folderPath });

        const saveCollectionSelected = document.getElementById('save-collection-selected');
        const saveDropdownMenu = document.getElementById('save-dropdown-menu');

        if (saveCollectionSelected) {
            saveCollectionSelected.dataset.collectionId = collectionId;
            saveCollectionSelected.dataset.requestId = requestId || '';
            saveCollectionSelected.dataset.folderPath = folderPath ? JSON.stringify(folderPath) : '';

            let displayText = collectionName;
            if (requestId) {
                displayText += ' → Request';
            } else if (folderPath && Array.isArray(folderPath) && folderPath.length > 0) {
                // Clean up the folder path display - filter out empty strings and trim
                const cleanPath = folderPath.filter(name => name && typeof name === 'string' && name.trim());
                console.log('[DEBUG] Clean path:', cleanPath);
                if (cleanPath.length > 0) {
                    // For nested folders, show the full path: CollectionName -> folder -> nested-folder -> ...
                    displayText += ' → ' + cleanPath.join(' → ');
                    console.log('[DEBUG] Full display text:', displayText);
                }
            }

            console.log('[DEBUG] Setting display text to:', displayText);

            const textElement = saveCollectionSelected.querySelector('#selected-collection-text');
            if (textElement) {
                textElement.textContent = displayText;
                console.log('[DEBUG] Text element updated successfully');
            } else {
                console.log('[DEBUG] Text element not found');
            }
        } else {
            console.log('[DEBUG] saveCollectionSelected element not found');
        }

        // Close dropdown
        if (saveDropdownMenu) {
            saveDropdownMenu.classList.add('hidden');
            saveCollectionSelected.parentElement.classList.remove('open');
        }
    }

    function filterCollections(query) {
        const items = document.querySelectorAll('.save-collection-item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const label = item.querySelector('.save-collection-item-label');
            if (label) {
                const text = label.textContent.toLowerCase();
                const isVisible = text.includes(lowerQuery);
                item.style.display = isVisible ? 'flex' : 'none';
            }
        });
    }

    // Make functions globally available
    window.selectCollection = selectCollection;

    // Add save dialog setup to initialization
    const originalInitialize = initialize;
    const wrappedInitialize = function() {
        originalInitialize();
        setupSaveDialog();
    };

    window.addEventListener('DOMContentLoaded', wrappedInitialize);
})();