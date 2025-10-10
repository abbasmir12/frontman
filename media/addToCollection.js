(function () {
    console.log('[addToCollection.js] script loaded');
    const vscode = acquireVsCodeApi();

    // Notify extension that webview is ready
    vscode.postMessage({ command: 'webviewReady' });

    // --- State ---
    let collections = [];
    let selectedCollectionId = '';

    // Track hidden requests by collectionId
    let hiddenRequestsByCollection = {};

    // --- Edit Mode State ---
    let editMode = false;
    let editingRequestId = null;
    let pendingEditRequest = null;
    let pendingEditCollectionId = null;
    let pendingFolderPath = null;
    let lastSavedEditData = null;

    // Add pending edit payload variable
    let pendingEditRequestPayload = null;

    // --- Custom Dropdown Logic ---
    function setupCustomDropdown(dropdownId, onSelect) {
        const dropdown = document.getElementById(dropdownId);
        const selected = dropdown.querySelector('.dropdown-selected');
        const menu = dropdown.querySelector('.dropdown-menu');
        let isOpen = false;

        function openMenu() {
            menu.classList.remove('hidden');
            dropdown.classList.add('open');
            isOpen = true;
            selected.setAttribute('aria-expanded', 'true');
        }
        function closeMenu() {
            menu.classList.add('hidden');
            dropdown.classList.remove('open');
            isOpen = false;
            selected.setAttribute('aria-expanded', 'false');
        }
        function toggleMenu() {
            isOpen ? closeMenu() : openMenu();
        }
        selected.addEventListener('click', toggleMenu);
        selected.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleMenu();
            } else if (e.key === 'Escape') {
                closeMenu();
            }
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) closeMenu();
        });
        menu.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-value]');
            if (li && !li.hasAttribute('disabled')) {
                onSelect(li.dataset.value, li);
                closeMenu();
            }
        });
        // Keyboard navigation
        menu.addEventListener('keydown', (e) => {
            const items = Array.from(menu.querySelectorAll('li:not([disabled])'));
            let idx = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (idx < 0 || idx === items.length - 1) items[0].focus();
                else items[idx + 1].focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (idx <= 0) items[items.length - 1].focus();
                else items[idx - 1].focus();
            } else if (e.key === 'Escape') {
                closeMenu();
                selected.focus();
            } else if (e.key === 'Enter') {
                if (document.activeElement.tagName === 'LI') {
                    document.activeElement.click();
                }
            }
        });
    }

    // --- Populate Collection Dropdown and Requests ---
    // Track expanded/collapsed state for dropdown treeview
    let dropdownExpandedState = {};

        function renderCollectionsDropdown(collections, selectedId) {
        const collectionMenu = document.getElementById('collection-dropdown-menu');
        collectionMenu.innerHTML = '';

        // Helper function to recursively render collections and folders
        function renderHierarchicalItems(items, level = 0, parentPath = '') {
            const ul = document.createElement('ul');
            ul.className = 'dropdown-menu-subtree';
            if (level === 0) {
                ul.classList.add('dropdown-menu-root');
            }

            items.forEach(item => {
                const fullPath = parentPath ? `${parentPath} / ${item.name}` : item.name;
                const isExpandable = (item.type === 'collection' && item.folders && item.folders.length > 0) ||
                                     (item.type === 'folder' && item.folders && item.folders.length > 0);
                const isExpanded = dropdownExpandedState[item.id];

                const li = document.createElement('li');
                li.className = 'dropdown-item';
                if (isExpandable) li.classList.add('has-children');
                if (isExpanded) li.classList.add('is-expanded');
                li.dataset.value = item.id;
                li.dataset.type = item.type || 'collection';
                li.dataset.path = fullPath;
                if (item.parentCollectionId) li.dataset.parentCollectionId = item.parentCollectionId;

                const content = document.createElement('div');
                content.className = 'dropdown-item-content';
                content.style.paddingLeft = `${(level * 20) + 13}px`;

                if (isExpandable) {
                    const chevron = document.createElement('i');
                    chevron.className = 'codicon dropdown-chevron ' + (isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right');
                    chevron.addEventListener('click', (e) => {
                        e.stopPropagation();
                        dropdownExpandedState[item.id] = !isExpanded;
                        const currentSelectedId = document.getElementById('collection-dropdown').dataset.selectedValue || selectedId;
                        renderCollectionsDropdown(collections, currentSelectedId);
                    });
                    content.appendChild(chevron);
                } else {
                    const spacer = document.createElement('span');
                    spacer.className = 'dropdown-chevron';
                    content.appendChild(spacer);
                }

                if (item.type === 'folder') {
                    const folderIcon = document.createElement('i');
                    folderIcon.className = 'codicon codicon-folder dropdown-folder-icon';
                    content.appendChild(folderIcon);
                }

                const nameSpan = document.createElement('span');
                nameSpan.textContent = item.name;
                nameSpan.className = item.type === 'collection' ? 'dropdown-collection-label' : 'dropdown-folder-label';
                content.addEventListener('click', (e) => {
                    const menu = document.getElementById('collection-dropdown-menu');
                    menu.dispatchEvent(new CustomEvent('dropdown-select', { detail: { value: item.id, li } }));
                });
                content.appendChild(nameSpan);
                li.appendChild(content);

                if (item.id === selectedId) {
                    li.classList.add('active');
                }

                if (isExpandable && isExpanded) {
                    const children = (item.folders || []).map(folder => ({
                        ...folder,
                        type: 'folder',
                        parentCollectionId: item.type === 'collection' ? item.id : item.parentCollectionId
                    }));
                    const childUl = renderHierarchicalItems(children, level + 1, fullPath);
                    li.appendChild(childUl);
                }
                
                ul.appendChild(li);
            });
            return ul;
        }

        const hierarchicalItems = collections.map(collection => ({ ...collection, type: 'collection' }));
        const menuContent = renderHierarchicalItems(hierarchicalItems);
        collectionMenu.appendChild(menuContent);

        collectionMenu.removeEventListener('dropdown-select', handleDropdownSelect);
        collectionMenu.addEventListener('dropdown-select', handleDropdownSelect);
    }

    

    // Custom handler for dropdown selection
    function handleDropdownSelect(e) {
        const { value, li } = e.detail;
        // Simulate the same logic as setupCustomDropdown
        const menu = document.getElementById('collection-dropdown-menu');
        const dropdown = document.getElementById('collection-dropdown');
        const onSelect = dropdown._onSelect;
        if (typeof onSelect === 'function') {
            onSelect(value, li);
        }
        // Update selectedCollectionId based on the selected item's parentCollectionId if it's a folder
        const itemType = li.dataset.type;
        if (itemType === 'folder') {
            selectedCollectionId = li.dataset.parentCollectionId;
        } else {
            selectedCollectionId = value;
        }
        // Close the dropdown
        menu.classList.add('hidden');
        dropdown.classList.remove('open');
        dropdown.querySelector('.dropdown-selected').setAttribute('aria-expanded', 'false');
    }

    // Patch setupCustomDropdown to expose onSelect for custom event
    const origSetupCustomDropdown = setupCustomDropdown;
    setupCustomDropdown = function (dropdownId, onSelect) {
        const dropdown = document.getElementById(dropdownId);
        dropdown._onSelect = onSelect;
        origSetupCustomDropdown(dropdownId, onSelect);
    };

    function renderCollectionLabelAndRequests(collection) {
        // Update left panel label
        document.querySelector('.collection-header label').textContent = collection ? collection.name : 'Collection Name';
        // Update request list
        const requestList = document.getElementById('request-list');
        requestList.innerHTML = '';
        if (collection && Array.isArray(collection.requests)) {
            if (!hiddenRequestsByCollection[collection.id]) {
                hiddenRequestsByCollection[collection.id] = new Set();
            }
            // --- Helper to get folderPath from label ---
            function getFolderPathFromLabel(collection, labelText) {
                // labelText: "CollectionName / Folder1 / Subfolder2"
                const parts = labelText.split(' / ').slice(1); // skip collection name
                let current = collection;
                const folderPath = [];
                for (const name of parts) {
                    if (!current.folders) break;
                    const folder = current.folders.find(f => f.name === name);
                    if (!folder) break;
                    folderPath.push(folder.id);
                    current = folder;
                }
                return folderPath.length > 0 ? folderPath : undefined;
            }
            // --- End helper ---
            collection.requests.forEach(req => {
                const div = document.createElement('div');
                div.className = 'request-item';
                const isHidden = req.hidden || hiddenRequestsByCollection[collection.id].has(req.id);
                if (isHidden) div.classList.add('overline');
                div.innerHTML = `<input type='checkbox' ${isHidden ? '' : 'checked'} />
                    <span class='request-method method-${req.method.toLowerCase()}'>${req.method}</span>
                    <span class='request-name'>${req.name || req.url || 'Unnamed Request'}</span>`;
                const checkbox = div.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', function () {
                    if (!hiddenRequestsByCollection[collection.id]) {
                        hiddenRequestsByCollection[collection.id] = new Set();
                    }
                    if (!this.checked) {
                        div.classList.add('overline');
                        hiddenRequestsByCollection[collection.id].add(req.id);
                        vscode.postMessage({
                            command: 'setRequestHiddenState',
                            payload: { collectionId: collection.id, requestId: req.id, hidden: true }
                        });
                    } else {
                        div.classList.remove('overline');
                        hiddenRequestsByCollection[collection.id].delete(req.id);
                        vscode.postMessage({
                            command: 'setRequestHiddenState',
                            payload: { collectionId: collection.id, requestId: req.id, hidden: false }
                        });
                    }
                });
                div.addEventListener('click', function (e) {
                    if (e.target.tagName === 'INPUT') return;
                    if (!div.classList.contains('overline')) {
                        // --- LOG: Request-Line Click (Collection Root) ---
                        const labelText = document.getElementById('selected-collection-text').textContent;
                        const folderPath = getFolderPathFromLabel(collection, labelText);
                        console.log('[MIR4-LOG][Request-Line Click] labelText:', labelText, 'requestId:', req.id, 'collectionId:', collection.id, 'folderPath:', JSON.stringify(folderPath));
                        editMode = true;
                        window.fillRequestForm(req, collection.id, folderPath);
                        const collectionLabel = document.getElementById('selected-collection-text');
                        if (collectionLabel) collectionLabel.textContent = collection.name;
                        const dropdown = document.getElementById('collection-dropdown');
                        if (dropdown) dropdown.dataset.selectedPath = collection.name;
                        setButtonDisabledVisual(true);
                        hasUnsavedChanges = false;
                    }
                });
                requestList.appendChild(div);
            });
        }
    }

    // --- Method Dropdown ---
    setupCustomDropdown('method-dropdown', (value, li) => {
        const text = li.textContent;
        const selectedText = document.getElementById('selected-method-text');
        selectedText.textContent = text;
        selectedText.className = 'method-text method-' + value.toLowerCase();
        const dropdown = document.getElementById('method-dropdown');
        const prevValue = dropdown.dataset.selectedValue;
        dropdown.dataset.selectedValue = value;
        // Only enable Save/Cancel if value actually changed in edit mode
        if (editMode && prevValue !== value) {
            enableSaveCancelOnInput();
        }
    });

    // --- Collection Dropdown ---
    setupCustomDropdown('collection-dropdown', (value, li) => {
        const itemType = li.dataset.type;
        const itemPath = li.dataset.path;
        const selectedText = document.getElementById('selected-collection-text');
        const dropdown = document.getElementById('collection-dropdown');
        
        // Clear all active states first
        document.querySelectorAll('#collection-dropdown-menu li').forEach(liEl => liEl.classList.remove('active'));
        
        // Set active state on the selected item
        li.classList.add('active');
        
        // Display the full path for folders, just the name for collections
        if (itemType === 'folder') {
            selectedText.textContent = itemPath;
            dropdown.dataset.selectedPath = itemPath;
            dropdown.dataset.selectedType = 'folder';
        } else if (itemType === 'collection') {
            const colName = li.querySelector('.dropdown-collection-label')?.textContent || li.dataset.path || li.textContent;
            selectedText.textContent = colName;
            dropdown.dataset.selectedPath = colName;
            dropdown.dataset.selectedType = 'collection';
        }
        
        const prevValue = dropdown.dataset.selectedValue;
        dropdown.dataset.selectedValue = value;
        selectedCollectionId = value;
        
        // Find the collection (either directly or parent of folder)
        let collection;
        let folder = null;
        let folderPath = [];
        if (itemType === 'collection') {
            collection = collections.find(c => c.id === value);
            renderCollectionLabelAndRequests(collection);
        } else if (itemType === 'folder') {
            const parentCollectionId = li.dataset.parentCollectionId;
            collection = collections.find(c => c.id === parentCollectionId);
            // Reconstruct folderPath from li's ancestry
            let currentLi = li;
            while (currentLi && currentLi.dataset.type === 'folder') {
                folderPath.unshift(currentLi.dataset.value);
                currentLi = currentLi.parentElement.closest('li[data-type="folder"]');
            }
            folder = findFolderByPathInCollection(collection, folderPath);
            const fullPathLabel = buildFullPathLabel(collections, collection.id, folderPath);
            renderFolderLabelAndRequests(folder, collection, folderPath, fullPathLabel);
            return; // Prevent any further logic for folders
        }
        // (No Save/Cancel for collection dropdown, handled by special logic)
    });

    // --- Auth Dropdown ---
    setupCustomDropdown('auth-dropdown', (value, li) => {
        const text = li.textContent;
        const dropdown = document.getElementById('auth-dropdown');
        const prevValue = dropdown.dataset.selectedValue;
        document.getElementById('selected-auth-text').textContent = text;
        dropdown.dataset.selectedValue = value;
        showAuthDetailsBox(value);
        // Only enable Save/Cancel if value actually changed in edit mode
        if (editMode && prevValue !== value) {
            enableSaveCancelOnInput();
        }
    });

    function showAuthDetailsBox(authType) {
        let box = document.getElementById('auth-details-box');
        let connector = document.getElementById('auth-details-connector');
        const authDropdown = document.getElementById('auth-dropdown');
        const parent = authDropdown.parentElement;
        if (!box) {
            box = document.createElement('div');
            box.id = 'auth-details-box';
            box.className = 'auth-details-box';
            parent.style.position = 'relative';
            parent.appendChild(box);
        }
        if (!connector) {
            connector = document.createElement('div');
            connector.id = 'auth-details-connector';
            connector.className = 'auth-details-connector';
            parent.appendChild(connector);
        }

        // Remove animation classes before starting
        connector.classList.remove('animated');
        box.classList.remove('animated');

        // Set content
        if (authType === 'basic') {
            box.innerHTML = `
                <div class="auth-field"><label>Username</label><input type="text" id="auth-basic-username" autocomplete="username" /></div>
                <div class="auth-field"><label>Password</label><input type="password" id="auth-basic-password" autocomplete="current-password" /></div>
            `;
        } else if (authType === 'bearer') {
            box.innerHTML = `
                <div class="auth-field"><label>Token</label><input type="text" id="auth-bearer-token" autocomplete="off" /></div>
            `;
        }

        if (authType === 'basic' || authType === 'bearer') {
            box.classList.add('visible');
            connector.style.opacity = '1';
            connector.style.display = 'block';
            box.style.display = 'block';

            // Wait for DOM update, then center box and connector
            setTimeout(() => {
                // Center the box vertically to the dropdown
                const dropdownRect = authDropdown.getBoundingClientRect();
                const boxRect = box.getBoundingClientRect();
                const parentRect = parent.getBoundingClientRect();

                // Calculate the vertical center of the dropdown relative to parent
                const dropdownCenter = dropdownRect.top + dropdownRect.height / 2 - parentRect.top;
                // Position the box so its center aligns with the dropdown center
                box.style.top = `${dropdownCenter - boxRect.height / 2}px`;

                // Position the connector at the same vertical center
                connector.style.top = `${dropdownCenter}px`;

                connector.classList.add('animated');
                setTimeout(() => {
                    box.classList.add('animated');
                }, 350);
            }, 10);

        } else {
            box.classList.remove('visible', 'animated');
            connector.classList.remove('animated');
            connector.style.opacity = '0';
            connector.style.display = 'none';
            box.style.display = 'none';
        }
    }
    // On load, hide the box
    showAuthDetailsBox('none');

    // --- Fill the form for editing a request ---
    function setButtonDisabledVisual(disabled) {
        if (disabled) {
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            saveBtn.style.opacity = '0.5';
            cancelBtn.style.opacity = '0.5';
            saveBtn.style.pointerEvents = 'none';
            cancelBtn.style.pointerEvents = 'none';
        } else {
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            saveBtn.style.opacity = '1';
            cancelBtn.style.opacity = '1';
            saveBtn.style.pointerEvents = 'auto';
            cancelBtn.style.pointerEvents = 'auto';
        }
    }

    // Define fillRequestForm in the global scope
    window.fillRequestForm = function(req, collectionId, folderPath) {
        console.log('[MIR4-LOG][fillRequestForm][ENTRY] req:', req && req.id, 'collectionId:', collectionId, 'folderPath:', JSON.stringify(folderPath));
        console.trace('[MIR4-LOG][fillRequestForm][STACK]');
        editMode = true;
        editingRequestId = req.id;
        lastSavedEditData = { req, collectionId, folderPath }; // Always use the passed-in folderPath as-is
        console.log('[MIR4-LOG][fillRequestForm] lastSavedEditData:', { req: req.id, collectionId, folderPath: JSON.stringify(folderPath) });
        // Set collection dropdown to the correct collection
        if (collectionId) {
            document.getElementById('collection-dropdown').dataset.selectedValue = collectionId;
            const selectedCol = collections.find(c => c.id === collectionId);
            // Build the full path label to maintain folder context
            const fullPathLabel = buildFullPathLabel(collections, collectionId, folderPath);
            document.getElementById('selected-collection-text').textContent = fullPathLabel;
            // Also update dropdown path
            const dropdown = document.getElementById('collection-dropdown');
            if (dropdown) dropdown.dataset.selectedPath = fullPathLabel;
        }
        // Method
        document.getElementById('method-dropdown').dataset.selectedValue = req.method || 'GET';
        document.getElementById('selected-method-text').textContent = req.method || 'GET';
        document.getElementById('selected-method-text').className = 'method-text method-' + (req.method || 'GET').toLowerCase();

        // URL, Name, Body, Scripts
        document.getElementById('request-url').value = req.url || '';
        document.getElementById('request-name').value = (typeof req.name === 'string' && req.name.trim().length > 0) ? req.name : '';
        document.getElementById('request-body').value = req.body || '';
        document.getElementById('pre-request-script').value = req.preRequestScript || '';
        document.getElementById('test-script').value = req.testScript || '';
        document.getElementById('request-description').value = req.description || '';

        // Auth
        let auth = {};
        try { auth = typeof req.auth === 'string' ? JSON.parse(req.auth) : req.auth || {}; } catch { auth = {}; }
        document.getElementById('auth-dropdown').dataset.selectedValue = auth.type || 'none';
        document.getElementById('selected-auth-text').textContent = (auth.type || 'None').charAt(0).toUpperCase() + (auth.type || 'None').slice(1);
        showAuthDetailsBox(auth.type || 'none');
        if (auth.type === 'basic') {
            document.getElementById('auth-basic-username').value = auth.username || '';
            document.getElementById('auth-basic-password').value = auth.password || '';
        } else if (auth.type === 'bearer') {
            document.getElementById('auth-bearer-token').value = auth.token || '';
        }

        // Headers
        setupKVEditor('headers-kv-body');
        if (req.headers) {
            let headers = {};
            try { headers = typeof req.headers === 'string' ? JSON.parse(req.headers) : req.headers; } catch { headers = {}; }
            const body = document.getElementById('headers-kv-body');
            body.innerHTML = '';
            Object.entries(headers || {}).forEach(([k, v]) => {
                body.appendChild(createKVRow(k, v));
            });
            body.appendChild(createKVRow());
        }

        // Query Params
        setupKVEditor('query-kv-body');
        if (req.query) {
            let query = {};
            try { query = typeof req.query === 'string' ? JSON.parse(req.query) : req.query; } catch { query = {}; }
            const body = document.getElementById('query-kv-body');
            body.innerHTML = '';
            Object.entries(query || {}).forEach(([k, v]) => {
                body.appendChild(createKVRow(k, v));
            });
            body.appendChild(createKVRow());
        }
        // Show Save/Cancel, hide Add
        document.getElementById('save-request-btn').style.display = '';
        document.getElementById('add-request-btn').style.display = 'none';
        document.getElementById('cancel-request-btn').style.display = '';
        setButtonDisabledVisual(true);
    }

    // --- Listen for messages from extension ---
    window.addEventListener('message', (event) => {
        const msg = event.data;
        console.log('[addToCollection.js] Received message:', msg);
        // --- PATCH: Handle loadCollectionRequest for folder requests ---
        if (msg.command === 'loadCollectionRequest' && msg.payload) {
            // Try to extract collectionId and folderPath from payload, or compute if missing
            const req = msg.payload;
            let collectionId = null;
            let folderPath = null;
            if (req.collectionId) {
                collectionId = req.collectionId;
            }
            if (req.folderPath) {
                folderPath = req.folderPath;
            }
            // If not present, try to find them from collections (if already loaded)
            if ((!collectionId || !folderPath) && Array.isArray(collections) && collections.length > 0) {
                function findRequestPath(collections, requestId, path = []) {
                    for (const col of collections) {
                        if (col.requests && col.requests.some(r => r.id === requestId)) {
                            return { collectionId: col.id, folderPath: path };
                        }
                        if (col.folders) {
                            const result = findRequestPathInFolders(col.folders, requestId, path);
                            if (result) return result;
                        }
                    }
                    return null;
                }
                function findRequestPathInFolders(folders, requestId, path) {
                    for (const folder of folders) {
                        const newPath = [...path, folder.id];
                        if (folder.requests && folder.requests.some(r => r.id === requestId)) {
                            return { collectionId: null, folderPath: newPath };
                        }
                        if (folder.folders) {
                            const result = findRequestPathInFolders(folder.folders, requestId, newPath);
                            if (result) return result;
                        }
                    }
                    return null;
                }
                const found = findRequestPath(collections, req.id);
                if (found) {
                    if (!collectionId && found.collectionId) collectionId = found.collectionId;
                    if (!folderPath && found.folderPath) folderPath = found.folderPath;
                }
            }
            pendingEditRequest = req;
            pendingEditCollectionId = collectionId;
            pendingFolderPath = folderPath;
            // If collections are already loaded, fill immediately
            if (collections && collections.length > 0) {
                window.fillRequestForm(pendingEditRequest, pendingEditCollectionId, pendingFolderPath);
                pendingEditRequest = null;
                pendingEditCollectionId = null;
                pendingFolderPath = null;
            }
            return;
        }
        if (msg.command === 'setCollectionsData' && msg.payload) {
            console.log('[addToCollection.js] setCollectionsData received:', msg.payload);
            
            collections = msg.payload.collections || [];
            const { selectedCollectionId: initialCollectionId, selectedFolderId: initialFolderId, selectedFolderPath } = msg.payload;

            // --- Auto-expand logic ---
            if (initialFolderId) {
                const path = findPathToFolder(initialFolderId);
                if (path) {
                    path.forEach(id => dropdownExpandedState[id] = true);
                }
            }

            // --- FULL RESET OF DROPDOWN STATE ---
            const dropdown = document.getElementById('collection-dropdown');
            dropdown.dataset.selectedValue = '';
            dropdown.dataset.selectedType = '';
            dropdown.dataset.selectedPath = '';
            document.getElementById('selected-collection-text').textContent = 'Select a collection';
            const menu = document.getElementById('collection-dropdown-menu');
            if (menu) menu.innerHTML = '';

            // Determine what should be selected. Folder takes precedence.
            const targetId = initialFolderId || initialCollectionId || (collections.length > 0 ? collections[0].id : null);

            // Render the dropdown menu, highlighting the target item
            renderCollectionsDropdown(collections, targetId);

            // Force the dropdown label to the selected item's text if found
            const selectedLi = document.querySelector(`#collection-dropdown-menu li[data-value="${targetId}"]`);
            if (selectedLi) {
                document.getElementById('selected-collection-text').textContent = selectedLi.textContent.trim();
            }

            // Defer UI updates to ensure DOM is ready
            setTimeout(() => {
                // Now, find the corresponding <li> element to get its metadata and set the state
                const selectedText = document.getElementById('selected-collection-text');
                const dropdown = document.getElementById('collection-dropdown');

                if (targetId) {
                    const selectedLi = document.querySelector(`#collection-dropdown-menu li[data-value="${targetId}"]`);
                    if (selectedLi) {
                        const itemType = selectedLi.dataset.type;
                        const itemPath = selectedLi.dataset.path;
                        const parentCollectionId = selectedLi.dataset.parentCollectionId;

                        // Update the dropdown's state and appearance
                        dropdown.dataset.selectedValue = targetId;
                        dropdown.dataset.selectedType = itemType;
                        dropdown.dataset.selectedPath = itemPath;
                        selectedText.textContent = itemPath;

                        // Update the global selectedCollectionId based on the actual selected item
                        if (itemType === 'collection') {
                            selectedCollectionId = targetId;
                        } else if (itemType === 'folder') {
                            selectedCollectionId = parentCollectionId;
                        }

                        // Find the collection to display its requests
                        let collectionToDisplay;
                        if (itemType === 'folder') {
                            collectionToDisplay = collections.find(c => c.id === parentCollectionId);
                            // For folders, render folder requests instead of collection requests
                            const folderPath = selectedFolderPath || [];
                            const folder = findFolderByPathInCollection(collectionToDisplay, folderPath);
                            const fullPathLabel = buildFullPathLabel(collections, parentCollectionId, folderPath);
                            renderFolderLabelAndRequests(folder, collectionToDisplay, folderPath, fullPathLabel);
                        } else { // 'collection'
                            collectionToDisplay = collections.find(c => c.id === targetId);
                        renderCollectionLabelAndRequests(collectionToDisplay);
                        }
                    } else {
                        // Fallback for safety, though it shouldn't be needed
                        selectedText.textContent = 'Select a collection';
                        renderCollectionLabelAndRequests(null);
                    }
                } else {
                    // Nothing to select
                    selectedText.textContent = 'Select a collection';
                    renderCollectionLabelAndRequests(null);
                }

                // Ensure dropdown state is consistent after all updates
                ensureDropdownStateConsistency();
                
                // Debug: Log the final state
                const finalDropdownState = document.getElementById('collection-dropdown');
                console.log('[addToCollection.js] Final dropdown state:', {
                    selectedValue: finalDropdownState.dataset.selectedValue,
                    selectedType: finalDropdownState.dataset.selectedType,
                    selectedPath: finalDropdownState.dataset.selectedPath,
                    labelText: document.getElementById('selected-collection-text').textContent
                });

                // After all dropdown/label logic, force the label and dropdown to use the full path
                let fullPathLabel;
                let finalCollectionId = initialCollectionId;
                let finalFolderPath = selectedFolderPath;
                
                if (editMode && editingRequestId) {
                    // Find the request and its collection/folder path
                    function findRequestPath(collections, requestId, path = []) {
                        for (const col of collections) {
                            // Check root requests
                            if (col.requests && col.requests.some(r => r.id === requestId)) {
                                return { collectionId: col.id, folderPath: path };
                            }
                            // Check folders recursively
                            if (col.folders) {
                                const result = findRequestPathInFolders(col.folders, requestId, path);
                                if (result) return result;
                            }
                        }
                        return null;
                    }
                    function findRequestPathInFolders(folders, requestId, path) {
                        for (const folder of folders) {
                            const newPath = [...path, folder.id];
                            if (folder.requests && folder.requests.some(r => r.id === requestId)) {
                                return { collectionId: null, folderPath: newPath };
                            }
                            if (folder.folders) {
                                const result = findRequestPathInFolders(folder.folders, requestId, newPath);
                                if (result) return result;
                            }
                        }
                        return null;
                    }
                    const reqPath = findRequestPath(collections, editingRequestId);
                    finalCollectionId = reqPath ? (reqPath.collectionId || initialCollectionId) : initialCollectionId;
                    finalFolderPath = reqPath ? reqPath.folderPath : selectedFolderPath;
                    fullPathLabel = buildFullPathLabel(collections, finalCollectionId, finalFolderPath);
                } else {
                    // Use selectedFolderPath if present (for folder requests)
                    fullPathLabel = buildFullPathLabel(collections, initialCollectionId, selectedFolderPath);
                }
                
                const collectionLabel = document.getElementById('selected-collection-text');
                if (collectionLabel) {
                    collectionLabel.textContent = fullPathLabel;
                }
                const dropdownEl = document.getElementById('collection-dropdown');
                if (dropdownEl) {
                    dropdownEl.dataset.selectedPath = fullPathLabel;
                }
                
                // Ensure request list matches the final label
                const finalCollection = collections.find(c => c.id === finalCollectionId);
                if (finalCollection) {
                    if (!finalFolderPath || finalFolderPath.length === 0) {
                        renderCollectionLabelAndRequests(finalCollection, fullPathLabel);
                    } else {
                        const folder = findFolderByPathInCollection(finalCollection, finalFolderPath);
                        renderFolderLabelAndRequests(folder, finalCollection, finalFolderPath, fullPathLabel);
                    }
                }
            }, 0);

            // If there is a pending edit, apply it now
            if (pendingEditRequest && pendingEditCollectionId) {
                window.fillRequestForm(pendingEditRequest, pendingEditCollectionId, pendingFolderPath);
                pendingEditRequest = null;
                pendingFolderPath = null;
                pendingEditCollectionId = null;
            }
            // If currently editing a request, update the Name (Optional) field if the name has changed
            if (editMode && editingRequestId) {
                // Find the request in the entire collections tree (including folders)
                function findRequestInTree(collections, requestId) {
                    for (const col of collections) {
                        // Check root requests
                        if (col.requests) {
                            const req = col.requests.find(r => r.id === requestId);
                            if (req) return req;
                        }
                        // Check folders recursively
                        if (col.folders) {
                            const req = findRequestInFolders(col.folders, requestId);
                            if (req) return req;
                        }
                    }
                    return null;
                }
                function findRequestInFolders(folders, requestId) {
                    for (const folder of folders) {
                        if (folder.requests) {
                            const req = folder.requests.find(r => r.id === requestId);
                            if (req) return req;
                        }
                        if (folder.folders) {
                            const req = findRequestInFolders(folder.folders, requestId);
                            if (req) return req;
                        }
                    }
                    return null;
                }
                const req = findRequestInTree(collections, editingRequestId);
                    if (req) {
                        document.getElementById('request-name').value = (typeof req.name === 'string' && req.name.trim().length > 0) ? req.name : '';
                }
            }
            // If not in edit mode, or just finished a save/cancel, show Add button
            if (!editMode) {
                saveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                addRequestBtn.style.display = '';
            }
        }
        if (msg.command === 'editRequestInCollection') {
            console.log('[addToCollection.js] editRequestInCollection payload:', msg.payload);
                if (!collections || collections.length === 0) {
                // Collections not loaded yet, store payload for later
                pendingEditRequestPayload = msg.payload;
                console.log('[addToCollection.js] editRequestInCollection: collections not loaded, deferring fillRequestForm');
            } else if (msg.payload && msg.payload.request) {
                window.fillRequestForm(msg.payload.request, msg.payload.collectionId, msg.payload.folderPath);
                lastSavedEditData = {
                    req: msg.payload.request,
                    collectionId: msg.payload.collectionId,
                    folderPath: msg.payload.folderPath
                };
                // --- PATCH: Force dropdown and label to correct folder context after edit ---
                const fullPathLabel = buildFullPathLabel(collections, msg.payload.collectionId, msg.payload.folderPath);
                const collectionLabel = document.getElementById('selected-collection-text');
                if (collectionLabel) {
                    collectionLabel.textContent = fullPathLabel;
                }
                const dropdownEl = document.getElementById('collection-dropdown');
                if (dropdownEl) {
                    dropdownEl.dataset.selectedPath = fullPathLabel;
                }
                // --- END PATCH ---
            } else {
                console.error('[addToCollection.js] editRequestInCollection missing request property:', msg.payload);
                // Defensive: Try to find the request by ID if possible
                if (msg.payload && msg.payload.requestId && collections && collections.length > 0) {
                    let foundReq = null;
                    let foundCollectionId = msg.payload.collectionId;
                    let foundFolderPath = msg.payload.folderPath;
                    for (const col of collections) {
                        // Search collection root
                        if (col.requests) {
                            const req = col.requests.find(r => r.id === msg.payload.requestId);
                            if (req) {
                                foundReq = req;
                                foundCollectionId = col.id;
                                foundFolderPath = null;
                                break;
                            }
                        }
                        // Search folders recursively
                        function searchFolders(folders, path) {
                            for (const folder of folders || []) {
                                if (folder.requests) {
                                    const req = folder.requests.find(r => r.id === msg.payload.requestId);
                                    if (req) {
                                        foundReq = req;
                                        foundCollectionId = col.id;
                                        foundFolderPath = [...path, folder.id];
                                        return true;
                                    }
                                }
                                if (folder.folders && searchFolders(folder.folders, [...path, folder.id])) {
                                    return true;
                                }
                            }
                            return false;
                        }
                        if (col.folders && searchFolders(col.folders, [])) break;
                    }
                    if (foundReq) {
                        console.warn('[addToCollection.js] Found request by ID defensively:', foundReq, foundCollectionId, foundFolderPath);
                        window.fillRequestForm(foundReq, foundCollectionId, foundFolderPath);
                        lastSavedEditData = {
                            req: foundReq,
                            collectionId: foundCollectionId,
                            folderPath: foundFolderPath
                        };
                    } else {
                        console.error('[addToCollection.js] Could not find request by ID:', msg.payload.requestId);
                    }
                }
            }
        }
        if (msg.command === 'renameRequest' && msg.payload) {
            const { requestId, newName } = msg.payload;
            if (editMode && editingRequestId === requestId) {
                document.getElementById('request-name').value = newName;
                if (lastSavedEditData && lastSavedEditData.req) {
                    lastSavedEditData.req.name = newName;
                }
            }
        }
        if (msg.command === 'addRequest' && msg.payload) {
            console.log('[MIR4-LOG][addRequest] handler triggered');
            console.log('[MIR4-LOG][addRequest] Received:', msg.payload, 'editMode before:', editMode);
            // Convert to addRequestInCollection with correct folderPath and handle immediately
            const { parentCollectionId, parentFolderId } = msg.payload;
            const payload = {
                collectionId: parentCollectionId,
                folderPath: parentFolderId ? [parentFolderId] : []
            };
            exitEditModeUI();
            console.log('[MIR4-LOG][addRequest] After exitEditModeUI, editMode:', editMode);
            // --- FULL RESET OF ADD REQUEST PANEL ---
            document.getElementById('request-url').value = '';
            document.getElementById('request-name').value = '';
            document.getElementById('request-body').value = '';
            document.getElementById('pre-request-script').value = '';
            document.getElementById('test-script').value = '';
            document.getElementById('request-description').value = '';
            document.getElementById('method-dropdown').dataset.selectedValue = 'GET';
            document.getElementById('selected-method-text').textContent = 'GET';
            document.getElementById('selected-method-text').className = 'method-text method-get';
            document.getElementById('auth-dropdown').dataset.selectedValue = 'none';
            document.getElementById('selected-auth-text').textContent = 'None';
            showAuthDetailsBox('none');
            setupKVEditor('headers-kv-body');
            setupKVEditor('query-kv-body');
            // --- END FULL RESET ---
            console.log('[MIR4-LOG][addRequest] Panel reset complete, editMode:', editMode);
            // Set the label to the full path
            const { collectionId, folderPath } = payload;
            const fullPathLabel = buildFullPathLabel(collections, collectionId, folderPath);
            const collectionLabel = document.getElementById('selected-collection-text');
            if (collectionLabel) {
                collectionLabel.textContent = fullPathLabel;
            }
            const dropdownEl = document.getElementById('collection-dropdown');
            if (dropdownEl) {
                dropdownEl.dataset.selectedPath = fullPathLabel;
            }
            // --- Update right-side request-line for Add mode ---
            const col = collections.find(c => c.id === collectionId);
            if (folderPath && folderPath.length > 0) {
                const folder = findFolderByPathInCollection(col, folderPath);
                renderFolderLabelAndRequests(folder, col, folderPath, fullPathLabel);
            } else {
                renderCollectionLabelAndRequests(col, fullPathLabel);
            }
        }
        if (msg.command === 'addRequestInCollection' && msg.payload) {
            console.log('[MIR4-LOG][addRequestInCollection] handler triggered');
            console.log('[MIR4-LOG][addRequestInCollection] Received:', msg.payload, 'editMode before:', editMode);
            exitEditModeUI();
            console.log('[MIR4-LOG][addRequestInCollection] After exitEditModeUI, editMode:', editMode);
            // --- FULL RESET OF ADD REQUEST PANEL ---
            document.getElementById('request-url').value = '';
            document.getElementById('request-name').value = '';
            document.getElementById('request-body').value = '';
            document.getElementById('pre-request-script').value = '';
            document.getElementById('test-script').value = '';
            document.getElementById('request-description').value = '';
            document.getElementById('method-dropdown').dataset.selectedValue = 'GET';
            document.getElementById('selected-method-text').textContent = 'GET';
            document.getElementById('selected-method-text').className = 'method-text method-get';
            document.getElementById('auth-dropdown').dataset.selectedValue = 'none';
            document.getElementById('selected-auth-text').textContent = 'None';
            showAuthDetailsBox('none');
            setupKVEditor('headers-kv-body');
            setupKVEditor('query-kv-body');
            // --- END FULL RESET ---
            console.log('[MIR4-LOG][addRequestInCollection] Panel reset complete, editMode:', editMode);
            // Set the label to the full path
            const { collectionId, folderPath } = msg.payload;
            const fullPathLabel = buildFullPathLabel(collections, collectionId, folderPath);
            const collectionLabel = document.getElementById('selected-collection-text');
            if (collectionLabel) {
                collectionLabel.textContent = fullPathLabel;
            }
            const dropdownEl = document.getElementById('collection-dropdown');
            if (dropdownEl) {
                dropdownEl.dataset.selectedPath = fullPathLabel;
            }
            // --- Update right-side request-line for Add mode ---
            const col = collections.find(c => c.id === collectionId);
            if (folderPath && folderPath.length > 0) {
                const folder = findFolderByPathInCollection(col, folderPath);
                renderFolderLabelAndRequests(folder, col, folderPath, fullPathLabel);
            } else {
                renderCollectionLabelAndRequests(col, fullPathLabel);
            }
        }
    });

    // --- Helper to find the path to a folder ---
    function findPathToFolder(folderId) {
        let path = [];
        function find(items, currentPath) {
            for (const item of items) {
                const newPath = [...currentPath, item.id];
                if (item.id === folderId) {
                    path = newPath;
                    return true;
                }
                if (item.folders && find(item.folders, newPath)) {
                    return true;
                }
            }
            return false;
        }
        find(collections, []);
        return path.length > 0 ? path : null;
    }

    // --- Add Save and Cancel buttons to the form ---
    const addRequestBtn = document.querySelector('button.primary-btn');
    addRequestBtn.id = 'add-request-btn';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.id = 'save-request-btn';
    saveBtn.className = 'primary-btn';
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';
    saveBtn.disabled = true;
    addRequestBtn.parentNode.insertBefore(saveBtn, addRequestBtn.nextSibling);
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'cancel-request-btn';
    cancelBtn.className = 'primary-btn'; // Make style same as Save
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.display = 'none';
    cancelBtn.disabled = true;
    saveBtn.parentNode.insertBefore(cancelBtn, saveBtn.nextSibling);

    // --- Track if there are unsaved changes in edit mode ---
    let hasUnsavedChanges = false;

    function enableSaveCancelOnInput() {
        console.log('[enableSaveCancelOnInput] Called. editMode:', editMode);
        if (!editMode) return;
        setButtonDisabledVisual(false);
        hasUnsavedChanges = true;
    }

    // --- Listen for collection dropdown selection (not just click) to auto-save and stay in edit mode ---
    const collectionDropdownMenu = document.getElementById('collection-dropdown-menu');
    let lastSelectedCollectionId = document.getElementById('collection-dropdown').dataset.selectedValue;
    collectionDropdownMenu.addEventListener('click', function (e) {
        const li = e.target.closest('li[data-value]');
        if (!li) return;
        const newCollectionId = li.dataset.value;
        if (!editMode) {
            lastSelectedCollectionId = newCollectionId;
            return;
        }
        if (newCollectionId !== lastSelectedCollectionId) {
            // If there are unsaved changes, auto-save
            if (hasUnsavedChanges && !saveBtn.disabled) {
                saveBtn.click();
            }
            // Stay in edit mode, clear fields for new collection
            editingRequestId = null;
            lastSavedEditData = null;
            hasUnsavedChanges = false;
            // Clear all fields but keep Save/Cancel visible and disabled
            document.getElementById('request-url').value = '';
            document.getElementById('request-name').value = '';
            document.getElementById('request-body').value = '';
            document.getElementById('pre-request-script').value = '';
            document.getElementById('test-script').value = '';
            document.getElementById('method-dropdown').dataset.selectedValue = 'GET';
            document.getElementById('selected-method-text').textContent = 'GET';
            document.getElementById('selected-method-text').className = 'method-text method-get';
            setupKVEditor('headers-kv-body');
            setupKVEditor('query-kv-body');
            document.getElementById('auth-dropdown').dataset.selectedValue = 'none';
            document.getElementById('selected-auth-text').textContent = 'None';
            showAuthDetailsBox('none');
            // Save/Cancel remain visible and are explicitly styled as disabled
            saveBtn.style.display = '';
            cancelBtn.style.display = '';
            addRequestBtn.style.display = 'none';
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            saveBtn.style.opacity = '0.5';
            cancelBtn.style.opacity = '0.5';
            saveBtn.style.pointerEvents = 'none';
            cancelBtn.style.pointerEvents = 'none';
            lastSelectedCollectionId = newCollectionId;
        }
    });
    [
        'request-url', 'request-name', 'request-body',
        'pre-request-script', 'test-script',
        'request-description',
    ].forEach(id => {
        document.getElementById(id).addEventListener('input', enableSaveCancelOnInput);
    });
    // For key-value editors
    document.getElementById('headers-kv-body').addEventListener('input', enableSaveCancelOnInput);
    document.getElementById('query-kv-body').addEventListener('input', enableSaveCancelOnInput);

    saveBtn.addEventListener('click', function () {
        console.log('[Save Button] Clicked. editMode:', editMode, 'editingRequestId:', editingRequestId, 'saveBtn.disabled:', saveBtn.disabled, 'lastSavedEditData:', lastSavedEditData);
        if (!editMode || !editingRequestId || saveBtn.disabled) return;
        const method = document.getElementById('method-dropdown').dataset.selectedValue;
        const collectionId = document.getElementById('collection-dropdown').dataset.selectedValue;
        const url = document.getElementById('request-url').value;
        const name = document.getElementById('request-name').value || url;
        const description = document.getElementById('request-description').value;
        const headersObj = getKVData('headers-kv-body');
        console.log('[DEBUG] Headers object before stringify:', headersObj);
        const headers = JSON.stringify(headersObj);
        console.log('[DEBUG] Headers string after stringify:', headers);
        const body = document.getElementById('request-body').value;
        const query = JSON.stringify(getKVData('query-kv-body'));
        // --- AUTH FIELDS ---
        const authType = document.getElementById('auth-dropdown').dataset.selectedValue;
        let auth = { type: authType };
        if (authType === 'basic') {
            auth.username = document.getElementById('auth-basic-username')?.value || '';
            auth.password = document.getElementById('auth-basic-password')?.value || '';
        } else if (authType === 'bearer') {
            auth.token = document.getElementById('auth-bearer-token')?.value || '';
        }
        const preRequestScript = document.getElementById('pre-request-script').value;
        const testScript = document.getElementById('test-script').value;
        // --- PATCH: For edit, always use lastSavedEditData.folderPath ---
        let folderPath = lastSavedEditData?.folderPath || null;
        vscode.postMessage({
            command: 'updateRequestInCollection',
            payload: {
                collectionId,
                requestId: editingRequestId,
                folderPath,
                method, url, name, description, headers, body, query,
                auth: JSON.stringify(auth),
                preRequestScript, testScript
            }
        });
        // Update lastSavedEditData to this checkpoint
        lastSavedEditData = JSON.parse(JSON.stringify({
            req: {
                id: editingRequestId, method, url, name, description, headers, body, query,
                auth: JSON.stringify(auth), preRequestScript, testScript
            },
            collectionId,
            folderPath
        }));
        // --- PATCH: Always update lastSavedEditData.req.name to the current value ---
        if (lastSavedEditData && lastSavedEditData.req) {
            lastSavedEditData.req.name = name;
        }
        setButtonDisabledVisual(true);
        // Do NOT call exitEditModeUI here
    });

    cancelBtn.addEventListener('click', function () {
        if (!editMode || !lastSavedEditData) return;
        // Save these before calling fillRequestForm in case lastSavedEditData is changed
        const revertCollectionId = lastSavedEditData.collectionId;
        const revertFolderPath = lastSavedEditData.folderPath;
        const collections = window.collections || [];
        const fullPathLabel = buildFullPathLabel(collections, revertCollectionId, revertFolderPath);
        window.fillRequestForm(lastSavedEditData.req, revertCollectionId, revertFolderPath);
        setButtonDisabledVisual(true);
        enforceEditModePathLabel();
    });

    // --- Request collections data on load ---
    vscode.postMessage({ command: 'requestCollectionsData', payload: {} });

    // --- Key-Value Editor Logic for Headers and Query Params ---
    function createKVRow(key = '', value = '', onInput) {
        const row = document.createElement('div');
        row.className = 'kv-row';
        row.innerHTML = `
            <input class="kv-key" placeholder="Key" value="${key}"/>
            <input class="kv-value" placeholder="Value" value="${value}"/>
        `;
        const keyInput = row.querySelector('.kv-key');
        const valueInput = row.querySelector('.kv-value');
        function handleInput() {
            const parent = row.parentElement;
            const rows = parent.querySelectorAll('.kv-row');
            // If this is the last row and not empty, add a new empty row
            if (row === rows[rows.length - 1] && (keyInput.value || valueInput.value)) {
                parent.appendChild(createKVRow('', '', onInput));
            }
            // If this is not the last row and both fields are empty, remove the row
            if (row !== rows[rows.length - 1] && !keyInput.value && !valueInput.value) {
                row.remove();
            }
            if (onInput) onInput();
        }
        keyInput.addEventListener('input', handleInput);
        valueInput.addEventListener('input', handleInput);
        return row;
    }
    function setupKVEditor(bodyId) {
        const body = document.getElementById(bodyId);
        body.innerHTML = '';
        body.appendChild(createKVRow());
    }
    setupKVEditor('headers-kv-body');
    setupKVEditor('query-kv-body');
    function getKVData(bodyId) {
        const obj = {};
        const rows = document.querySelectorAll(`#${bodyId} .kv-row`);
        rows.forEach((row, idx) => {
            const key = row.querySelector('.kv-key').value.trim();
            const value = row.querySelector('.kv-value').value.trim();
            // Only include non-empty key rows
            if (key) obj[key] = value;
        });
        return obj;
    }
    // --- Form Submission ---
    document.getElementById('add-request-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const method = document.getElementById('method-dropdown').dataset.selectedValue;
        const dropdown = document.getElementById('collection-dropdown');
        const selectedId = dropdown.dataset.selectedValue;
        const selectedType = dropdown.dataset.selectedType;
        
        // Determine the actual collection ID and folder ID
        let collectionId = selectedId;
        let folderId = null;
        
        if (selectedType === 'folder') {
            // Find the parent collection ID from the dropdown item
            const dropdownItem = document.querySelector(`#collection-dropdown-menu li[data-value="${selectedId}"]`);
            if (dropdownItem) {
                collectionId = dropdownItem.dataset.parentCollectionId;
                folderId = selectedId;
            }
        }
        
        const url = document.getElementById('request-url').value;
        const name = document.getElementById('request-name').value || url;
        const description = document.getElementById('request-description').value;
        const headersObj = getKVData('headers-kv-body');
        console.log('[DEBUG] Headers object before stringify (form submit):', headersObj);
        const headers = JSON.stringify(headersObj);
        console.log('[DEBUG] Headers string after stringify (form submit):', headers);
        const body = document.getElementById('request-body').value;
        const query = JSON.stringify(getKVData('query-kv-body'));
        // --- AUTH FIELDS ---
        const authType = document.getElementById('auth-dropdown').dataset.selectedValue;
        let auth = { type: authType };
        if (authType === 'basic') {
            auth.username = document.getElementById('auth-basic-username')?.value || '';
            auth.password = document.getElementById('auth-basic-password')?.value || '';
        } else if (authType === 'bearer') {
            auth.token = document.getElementById('auth-bearer-token')?.value || '';
        }
        const preRequestScript = document.getElementById('pre-request-script').value;
        const testScript = document.getElementById('test-script').value;
        vscode.postMessage({
            command: 'addRequestToCollection',
            payload: {
                collectionId,
                folderId,
                method, url, name, description, headers, body, query,
                auth: JSON.stringify(auth),
                preRequestScript, testScript
            }
        });
        // Reset form after add
        document.getElementById('request-url').value = '';
        document.getElementById('request-name').value = '';
        document.getElementById('request-description').value = '';
        document.getElementById('request-body').value = '';
        document.getElementById('pre-request-script').value = '';
        document.getElementById('test-script').value = '';
        document.getElementById('method-dropdown').dataset.selectedValue = 'GET';
        document.getElementById('selected-method-text').textContent = 'GET';
        document.getElementById('selected-method-text').className = 'method-text method-get';
        setupKVEditor('headers-kv-body');
        setupKVEditor('query-kv-body');
        document.getElementById('auth-dropdown').dataset.selectedValue = 'none';
        document.getElementById('selected-auth-text').textContent = 'None';
        showAuthDetailsBox('none');
    });

    // --- Helper to update collection dropdown disabled state and style ---
    function updateCollectionDropdownDisabledState() {
        const menu = document.getElementById('collection-dropdown-menu');
        const currentId = document.getElementById('collection-dropdown').dataset.selectedValue;
        Array.from(menu.children).forEach(li => {
            if (editMode && li.dataset.value !== currentId) {
                li.setAttribute('disabled', 'true');
                li.style.opacity = '0.5';
                li.style.color = '#aaa';
                li.style.pointerEvents = 'none';
            } else {
                li.removeAttribute('disabled');
                li.style.opacity = '';
                li.style.color = '';
                li.style.pointerEvents = '';
            }
        });
    }

    // Helper function to ensure dropdown state consistency
    function ensureDropdownStateConsistency() {
        const dropdown = document.getElementById('collection-dropdown');
        const selectedValue = dropdown.dataset.selectedValue;
        const selectedType = dropdown.dataset.selectedType;
        const selectedText = document.getElementById('selected-collection-text');
        
        // Ensure active state matches the selected value
        document.querySelectorAll('#collection-dropdown-menu li').forEach(li => li.classList.remove('active'));
        if (selectedValue) {
            const activeLi = document.querySelector(`#collection-dropdown-menu li[data-value="${selectedValue}"]`);
            if (activeLi) {
                activeLi.classList.add('active');
            }
        }
        
        // Ensure label matches the selected type and value
        if (selectedType === 'collection' && selectedValue) {
            const collection = collections.find(c => c.id === selectedValue);
            if (collection) {
                selectedText.textContent = collection.name;
                dropdown.dataset.selectedPath = collection.name;
            }
        } else if (selectedType === 'folder' && selectedValue) {
            const folderLi = document.querySelector(`#collection-dropdown-menu li[data-value="${selectedValue}"][data-type="folder"]`);
            if (folderLi && folderLi.dataset.path) {
                selectedText.textContent = folderLi.dataset.path;
                dropdown.dataset.selectedPath = folderLi.dataset.path;
            }
        }
    }

    // Patch renderCollectionsDropdown to call updateCollectionDropdownDisabledState and ensure consistency
    const origRenderCollectionsDropdown = renderCollectionsDropdown;
    renderCollectionsDropdown = function (collections, selectedId) {
        origRenderCollectionsDropdown(collections, selectedId);
        updateCollectionDropdownDisabledState();
        // Ensure state consistency after rendering
        setTimeout(ensureDropdownStateConsistency, 0);
    };

    // Patch fillRequestForm to update dropdown state
    const origFillRequestForm = fillRequestForm;
    fillRequestForm = function (req, collectionId, folderPath) {
        origFillRequestForm(req, collectionId, folderPath);
        updateCollectionDropdownDisabledState();
    };

    // --- Helper to update the edit indicator in the request list (right side) ---
    function updateEditIndicator() {
        const requestList = document.getElementById('request-list');
        if (!requestList) return;
        Array.from(requestList.children).forEach(div => {
            const circle = div.querySelector('.edit-indicator-circle');
            if (circle) circle.remove();
            const reqId = div.dataset?.requestId;
            if (editMode && reqId && reqId === editingRequestId) {
                const indicator = document.createElement('span');
                indicator.className = 'edit-indicator-circle';
                indicator.style.display = 'inline-block';
                indicator.style.width = '12px';
                indicator.style.height = '12px';
                indicator.style.borderRadius = '50%';
                indicator.style.marginLeft = '8px';
                indicator.style.verticalAlign = 'middle';
                indicator.style.background = saveBtn.disabled ? '#888' : '#00c853';
                // Move to right side
                div.appendChild(indicator);
            }
        });
    }

    // --- Ensure correct collection is selected when opening Add Request panel ---
    // Patch setCollectionsData message handler to always select and reveal the correct collection
    // const origWindowAddEventListener = window.addEventListener;
    // window.addEventListener = function(type, listener, options) {
    //     if (type === 'message') {
    //         const wrappedListener = function(event) {
    //             const msg = event.data;
    //             if (msg.command === 'setCollectionsData' && msg.payload) {
    //                 collections = msg.payload.collections || [];
    //                 selectedCollectionId = msg.payload.selectedCollectionId;
    //                 const selectedFolderId = msg.payload.selectedFolderId;
    //                 // DEBUG: Log the incoming data
    //                 console.log('[setCollectionsData] selectedCollectionId:', selectedCollectionId, 'selectedFolderId:', selectedFolderId, 'collections:', collections);
    //                 let col = collections.find(c => c.id === selectedCollectionId);
    //                 let folderLi = null;
    //                 if (selectedFolderId) {
    //                     // Try to find the <li> for the folder
    //                     const folderLi = document.querySelector(`#collection-dropdown-menu li[data-value="${selectedFolderId}"][data-type="folder"]`);
    //                     if (folderLi) {
    //                         // Use its data-path for the label
    //                         const dropdown = document.getElementById('collection-dropdown');
    //                         dropdown.dataset.selectedValue = selectedFolderId;
    //                         dropdown.dataset.selectedType = 'folder';
    //                         dropdown.dataset.selectedPath = folderLi.dataset.path;
    //                         document.getElementById('selected-collection-text').textContent = folderLi.dataset.path;
    //                     } else {
    //                         // Fallback: reconstruct path from collections data
    //                         let path = [];
    //                         function findPath(folders, targetId) {
    //                             for (const folder of folders || []) {
    //                                 if (folder.id === targetId) {
    //                                     path.unshift(folder.name);
    //                                     return true;
    //                                 }
    //                                 if (findPath(folder.folders, targetId)) {
    //                                     path.unshift(folder.name);
    //                                     return true;
    //                                 }
    //                             }
    //                             return false;
    //                         }
    //                         for (const c of collections) {
    //                             if (findPath(c.folders, selectedFolderId)) {
    //                                 path.unshift(c.name);
    //                                 break;
    //                             }
    //                         }
    //                         if (path.length) {
    //                             const dropdown = document.getElementById('collection-dropdown');
    //                             dropdown.dataset.selectedValue = selectedFolderId;
    //                             dropdown.dataset.selectedType = 'folder';
    //                             dropdown.dataset.selectedPath = path.join(' / ');
    //                             document.getElementById('selected-collection-text').textContent = path.join(' / ');
    //                         }
    //                     }
    //                 } else {
    //                     renderCollectionsDropdown(collections, selectedCollectionId);
    //                     if (col) {
    //                         const dropdown = document.getElementById('collection-dropdown');
    //                         // Remove active from all, add to this
    //                         document.querySelectorAll('#collection-dropdown-menu li').forEach(li => li.classList.remove('active'));
    //                         const colLi = document.querySelector(`#collection-dropdown-menu li[data-value="${selectedCollectionId}"]`);
    //                         if (colLi) colLi.classList.add('active');
    //                         dropdown.dataset.selectedValue = selectedCollectionId;
    //                         dropdown.dataset.selectedType = 'collection';
    //                         dropdown.dataset.selectedPath = col.name;
    //                         document.getElementById('selected-collection-text').textContent = col.name;
    //                     }
    //                 }
    //                 renderCollectionLabelAndRequests(col);
    //             }
    //             listener(event);
    //         };
    //         origWindowAddEventListener.call(window, type, wrappedListener, options);
    //     } else {
    //         origWindowAddEventListener.call(window, type, listener, options);
    //     }
    // };

    // Helper to build full path from collection and folderPath
    function buildFullPathLabel(collections, collectionId, folderPath) {
        let col = collections.find(c => c.id === collectionId);
        let path = [];
        if (col) {
            path.push(col.name);
            if (Array.isArray(folderPath) && folderPath.length > 0) {
                let current = col;
                for (const folderId of folderPath) {
                    const folder = (current.folders || []).find(f => f.id === folderId);
                    if (folder) {
                        path.push(folder.name);
                        current = folder;
                    } else {
                        break;
                    }
                }
            }
        }
        return path.join(' / ');
    }

    // Patch renderCollectionLabelAndRequests to accept a fullPathLabel
    const origRenderCollectionLabelAndRequests = renderCollectionLabelAndRequests;
    renderCollectionLabelAndRequests = function (collection, fullPathLabel) {
        document.querySelector('.collection-header label').textContent = fullPathLabel || (collection ? collection.name : 'Collection Name');
        origRenderCollectionLabelAndRequests(collection);
    };

    // Patch fillRequestForm to always set the full path label and ensure request list matches
    const origFillRequestForm2 = fillRequestForm;
    fillRequestForm = function (req, collectionId, folderPath) {
        const fullPathLabel = buildFullPathLabel(collections, collectionId, folderPath);
        let col = collections.find(c => c.id === collectionId);
        
        // Always render the correct request list based on the current context
        if (!folderPath || folderPath.length === 0) {
            renderCollectionLabelAndRequests(col, fullPathLabel);
        } else {
            // For folder requests, render folder requests to match the label
            const folder = findFolderByPathInCollection(col, folderPath);
            renderFolderLabelAndRequests(folder, col, folderPath, fullPathLabel);
        }
        
        // Also update the dropdown label
        const collectionLabel = document.getElementById('selected-collection-text');
        if (collectionLabel) collectionLabel.textContent = fullPathLabel;
        origFillRequestForm2(req, collectionId, folderPath);
    };

    // Utility: Find folder by path in a collection
    function findFolderByPathInCollection(collection, folderPath) {
        let current = collection;
        for (const folderId of folderPath) {
            if (!current.folders) return null;
            current = current.folders.find(f => f.id === folderId);
            if (!current) return null;
        }
        return current;
    }

    // Render folder label and requests (like collection)
    function renderFolderLabelAndRequests(folder, collection, folderPath, fullPathLabel) {
        // Update left panel label
        document.querySelector('.collection-header label').textContent = fullPathLabel || (folder ? folder.name : 'Folder');
        // Update request list
        const requestList = document.getElementById('request-list');
        requestList.innerHTML = '';
        if (folder && Array.isArray(folder.requests)) {
            // Use a hidden set per folder (keyed by collectionId + folderPath)
            const folderKey = collection.id + ':' + (folderPath ? folderPath.join('/') : '');
            if (!hiddenRequestsByCollection[folderKey]) {
                hiddenRequestsByCollection[folderKey] = new Set();
            }
            folder.requests.forEach(req => {
                const div = document.createElement('div');
                div.className = 'request-item';
                // Check if this request is hidden
                const isHidden = req.hidden || hiddenRequestsByCollection[folderKey].has(req.id);
                if (isHidden) div.classList.add('overline');
                div.innerHTML = `<input type='checkbox' ${isHidden ? '' : 'checked'} />
                    <span class='request-method method-${req.method.toLowerCase()}'>${req.method}</span>
                    <span class='request-name'>${req.name || req.url || 'Unnamed Request'}</span>`;
                // Checkbox logic
                const checkbox = div.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', function () {
                    if (!hiddenRequestsByCollection[folderKey]) {
                        hiddenRequestsByCollection[folderKey] = new Set();
                    }
                    if (!this.checked) {
                        div.classList.add('overline');
                        hiddenRequestsByCollection[folderKey].add(req.id);
                        vscode.postMessage({
                            command: 'setRequestHiddenState',
                            payload: { collectionId: collection.id, requestId: req.id, hidden: true, folderPath }
                        });
                        vscode.postMessage({ command: 'refreshSidebar' });
                    } else {
                        div.classList.remove('overline');
                        hiddenRequestsByCollection[folderKey].delete(req.id);
                        vscode.postMessage({
                            command: 'setRequestHiddenState',
                            payload: { collectionId: collection.id, requestId: req.id, hidden: false, folderPath }
                        });
                        vscode.postMessage({ command: 'refreshSidebar' });
                    }
                });
                // Edit mode: clicking a request fills the form with its data
                div.addEventListener('click', function (e) {
                    if (e.target.tagName === 'INPUT') return;
                    if (!div.classList.contains('overline')) {
                        // --- LOG: Folder Request Click ---
                        const currentFolderPath = Array.isArray(folderPath) ? folderPath.slice() : [];
                        console.log('[MIR4-LOG][Folder Request Click] requestId:', req.id, 'collectionId:', collection.id, 'folderPath:', JSON.stringify(currentFolderPath));
                        editMode = true;
                        window.fillRequestForm(req, collection.id, currentFolderPath);
                        // Ensure the label maintains the full folder path
                        const fullPathLabel = buildFullPathLabel(collections, collection.id, currentFolderPath);
                        const collectionLabel = document.getElementById('selected-collection-text');
                        if (collectionLabel) collectionLabel.textContent = fullPathLabel;
                        const dropdown = document.getElementById('collection-dropdown');
                        if (dropdown) dropdown.dataset.selectedPath = fullPathLabel;
                        // Ensure save button is properly enabled
                        setButtonDisabledVisual(true);
                        hasUnsavedChanges = false;
                        console.log('[Folder Request Click] After setup. editMode:', editMode, 'editingRequestId:', editingRequestId, 'lastSavedEditData:', lastSavedEditData);
                    }
                });
                // Only append if not hidden
                if (!isHidden) {
                    requestList.appendChild(div);
                }
            });
        }
    }

    // Update dropdown handler to use folder request-list for folders
    // (Find the handler and update only the relevant part)
    const origDropdownHandler = document.getElementById('collection-dropdown')._onSelect;
    document.getElementById('collection-dropdown')._onSelect = function(value, li) {
        const itemType = li.dataset.type;
        const itemPath = li.dataset.path;
        const selectedText = document.getElementById('selected-collection-text');
        const dropdown = document.getElementById('collection-dropdown');
        document.querySelectorAll('#collection-dropdown-menu li').forEach(liEl => liEl.classList.remove('active'));
        li.classList.add('active');
        if (itemType === 'folder') {
            selectedText.textContent = itemPath;
            dropdown.dataset.selectedPath = itemPath;
            dropdown.dataset.selectedType = 'folder';
        } else if (itemType === 'collection') {
            const colName = li.querySelector('.dropdown-collection-label')?.textContent || li.dataset.path || li.textContent;
            selectedText.textContent = colName;
            dropdown.dataset.selectedPath = colName;
            dropdown.dataset.selectedType = 'collection';
        }
        const prevValue = dropdown.dataset.selectedValue;
        dropdown.dataset.selectedValue = value;
        selectedCollectionId = value;
        let collection;
        let folder = null;
        let folderPath = [];
        if (itemType === 'collection') {
            collection = collections.find(c => c.id === value);
            renderCollectionLabelAndRequests(collection);
        } else if (itemType === 'folder') {
            const parentCollectionId = li.dataset.parentCollectionId;
            collection = collections.find(c => c.id === parentCollectionId);
            // Reconstruct folderPath from li's ancestry
            let currentLi = li;
            while (currentLi && currentLi.dataset.type === 'folder') {
                folderPath.unshift(currentLi.dataset.value);
                currentLi = currentLi.parentElement.closest('li[data-type="folder"]');
            }
            folder = findFolderByPathInCollection(collection, folderPath);
            const fullPathLabel = buildFullPathLabel(collections, collection.id, folderPath);
            renderFolderLabelAndRequests(folder, collection, folderPath, fullPathLabel);
            return; // <--- Prevent any further logic for folders
        }
    };

    // When exiting edit mode, revert panel title and update indicator
    function exitEditModeUI() {
        editMode = false;
        editingRequestId = null;
        lastSavedEditData = null;
        // Reset form fields
        document.getElementById('add-request-form').reset();
        // Hide Save/Cancel, show Add
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        addRequestBtn.style.display = '';
        // Rebuild the full path label using the last selected collection and folder path
        const collections = window.collections || [];
        const dropdown = document.getElementById('collection-dropdown');
        const selectedCollectionId = dropdown ? dropdown.dataset.selectedValue : '';
        // Try to get the folder path from the last selected request in the sidebar (if any)
        let folderPath = undefined;
        if (window.lastSavedEditData && window.lastSavedEditData.folderPath) {
            folderPath = window.lastSavedEditData.folderPath;
        } else if (dropdown && dropdown.dataset.selectedPathArray) {
            folderPath = JSON.parse(dropdown.dataset.selectedPathArray);
        } else {
            folderPath = undefined;
        }
        const fullPathLabel = buildFullPathLabel(collections, selectedCollectionId, folderPath);
        const collectionLabel = document.getElementById('selected-collection-text');
        if (collectionLabel) {
            collectionLabel.textContent = fullPathLabel;
        }
        if (dropdown) {
            dropdown.dataset.selectedPath = fullPathLabel;
        }
    }

    // Patch setButtonDisabledVisual to update indicator color
    const origSetButtonDisabledVisual = setButtonDisabledVisual;
    setButtonDisabledVisual = function (disabled) {
        origSetButtonDisabledVisual(disabled);
        updateEditIndicator();
    };

    // Helper to always enforce the correct full path label and request list in edit mode
    function enforceEditModePathLabel() {
        if (editMode && editingRequestId) {
            // Find the request and its collection/folder path
            function findRequestPath(collections, requestId, path = []) {
                for (const col of collections) {
                    // Check root requests
                    if (col.requests && col.requests.some(r => r.id === requestId)) {
                        return { collectionId: col.id, folderPath: path };
                    }
                    // Check folders recursively
                    if (col.folders) {
                        const result = findRequestPathInFolders(col.folders, requestId, path);
                        if (result) return result;
                    }
                }
                return null;
            }
            function findRequestPathInFolders(folders, requestId, path) {
                for (const folder of folders) {
                    const newPath = [...path, folder.id];
                    if (folder.requests && folder.requests.some(r => r.id === requestId)) {
                        return { collectionId: null, folderPath: newPath };
                    }
                    if (folder.folders) {
                        const result = findRequestPathInFolders(folder.folders, requestId, newPath);
                        if (result) return result;
                    }
                }
                return null;
            }
            const reqPath = findRequestPath(collections, editingRequestId);
            const colId = reqPath ? (reqPath.collectionId || selectedCollectionId) : selectedCollectionId;
            const folderPath = reqPath ? reqPath.folderPath : undefined;
            const fullPathLabel = buildFullPathLabel(collections, colId, folderPath);
            
            // Update the label
            const collectionLabel = document.getElementById('selected-collection-text');
            if (collectionLabel) collectionLabel.textContent = fullPathLabel;
            const dropdown = document.getElementById('collection-dropdown');
            if (dropdown) dropdown.dataset.selectedPath = fullPathLabel;
            
            // Ensure request list matches the label
            const col = collections.find(c => c.id === colId);
            if (col) {
                if (!folderPath || folderPath.length === 0) {
                    renderCollectionLabelAndRequests(col, fullPathLabel);
                } else {
                    const folder = findFolderByPathInCollection(col, folderPath);
                    renderFolderLabelAndRequests(folder, col, folderPath, fullPathLabel);
                }
            }
        }
    }
})();

