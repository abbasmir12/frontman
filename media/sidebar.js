(function () {
  const vscode = acquireVsCodeApi();

  // DOM Cache
  const root = document.querySelector('.sidebar-root');

  // Global State
  let sidebarData = {
    history: [],
    collections: [],
    user: {},
  };

  // Track expanded/collapsed state for collections
  const expandedCollections = new Set();

  // Initial render
  renderSkeleton();

  // VS Code message listener
  window.addEventListener('message', (event) => {
    const { command, payload } = event.data;

    if (command === 'setSidebarData') {
      sidebarData = payload;
      renderSidebar();
    }
  });

  // ========== Main Renderer ==========

  function renderSidebar() {
    root.innerHTML = '';

    renderProfile();
    renderNewRequestButton();
    renderSection('Environments', sidebarData.environments, renderEnvironmentItem, { icon: 'codicon-server-environment', actions: ['add', 'import'] });
    renderSection('APIs', sidebarData.apis, renderApiItem, { icon: 'codicon-symbol-interface', actions: ['add'] });
    root.appendChild(renderCollectionsSection(sidebarData.collections, {}));
    renderHistorySection(sidebarData.history);
  }

  // ========== Skeleton ==========

  function renderSkeleton() {
    root.innerHTML = `<div class="placeholder fade-in">
      <i class="codicon codicon-clock"></i>
      <span>Loading API Sidebar...</span>
    </div>`;
  }

  // ========== Profile ==========

  function renderProfile() {
    const profile = document.createElement('div');
    profile.className = 'profile-section';
    profile.innerHTML = `
      <span>${sidebarData.user?.name || 'Developer'}</span>
      <span class="profile-meta">${sidebarData.user?.workspace || ''} <i class="codicon codicon-organization"></i></span>
      <i class="codicon codicon-chevron-down"></i>
    `;
    profile.addEventListener('click', () => {
      // Placeholder: show workspace/team switcher
      vscode.postMessage({ command: 'switchWorkspace' });
    });
    root.appendChild(profile);
  }

  // ========== Request Button ==========

  function renderNewRequestButton() {
    const btn = document.createElement('button');
    btn.className = 'new-request-btn';
    btn.innerHTML = `<i class="codicon codicon-plus"></i> New Request`;
    btn.addEventListener('click', () => {
      vscode.postMessage({ command: 'openRawRequest' });
    });
    root.appendChild(btn);
  }

  // ========== Filter Input ==========

  function renderSearchFilter() {
    const input = document.createElement('input');
    input.className = 'filter-input';
    input.placeholder = 'Filter requests...';
    input.addEventListener('input', () => {
      const value = input.value.trim().toLowerCase();
      filterHistory(value);
    });
    root.appendChild(input);
  }

  // ========== Section Renderer ==========

  function renderSection(label, data, renderItemFn, opts = {}) {
    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.section = label;

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `${opts.icon ? `<i class="codicon ${opts.icon}"></i>` : ''} ${label}`;

    // Quick actions (add/import/clear)
    if (opts.actions) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'section-actions';
      opts.actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = `section-action-btn codicon codicon-${action === 'add' ? 'add' : action === 'import' ? 'cloud-download' : action === 'clear' ? 'trash' : 'gear'}`;
        btn.title = action.charAt(0).toUpperCase() + action.slice(1);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (label === 'Environments' && action === 'add') {
            // Inline add input for environments
            if (section.querySelector('.env-add-input')) return;
            const list = section.querySelector('.section-items');
            const li = document.createElement('li');
            li.className = 'fade-in';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Environment name';
            input.className = 'env-add-input inline-add-input';
            li.appendChild(input);
            list.insertBefore(li, list.firstChild);
            input.focus();
            input.select();
            let addHandled = false;
            input.addEventListener('blur', finishAdd);
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') finishAdd();
              else if (e.key === 'Escape') cancelAdd();
            });
            function finishAdd() {
              if (addHandled) return;
              addHandled = true;
              const name = input.value.trim();
              if (name) {
                vscode.postMessage({ command: 'sectionAction', payload: { section: 'Environments', action: 'add', name } });
              }
              li.remove();
            }
            function cancelAdd() {
              addHandled = true;
              li.remove();
            }
            input.style.background = 'transparent';
            return;
          }
          vscode.postMessage({ command: `sectionAction`, payload: { section: label, action } });
        });
        actionsDiv.appendChild(btn);
      });
      
      // Add "Manage Environments" link for Environments section
      if (label === 'Environments') {
        const manageBtn = document.createElement('button');
        manageBtn.className = 'section-action-btn codicon codicon-settings-gear';
        manageBtn.title = 'Manage Environments';
        manageBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ command: 'openManageEnvironmentPanel' });
        });
        actionsDiv.appendChild(manageBtn);
      }
      
      header.appendChild(actionsDiv);
    }

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });

    const list = document.createElement('ul');
    list.className = 'section-items';

    if (!data || data.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.innerHTML = `<i class="codicon codicon-list-unordered"></i><span>No ${label.toLowerCase()} yet.</span>`;
      list.appendChild(placeholder);
    } else {
      data.forEach((item) => {
        const li = renderItemFn(item);
        list.appendChild(li);
      });
    }

    section.appendChild(header);
    section.appendChild(list);
    root.appendChild(section);
  }

  // ========== Grouped History Renderer ==========
  function renderHistorySection(historyGroups) {
    const section = document.createElement('div');
    section.className = 'section history-section';
    section.dataset.section = 'History';

    // Collapsible header with delete all button
    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `<i class="codicon codicon-chevron-down"></i> History`;
    // Delete all button
    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.className = 'section-action-btn codicon codicon-trash';
    deleteAllBtn.title = 'Clear All History';
    deleteAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ command: 'sectionAction', payload: { section: 'History', action: 'clear' } });
    });
    header.appendChild(deleteAllBtn);
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
    section.appendChild(header);

    // Filter input (scoped to history)
    const filterInput = document.createElement('input');
    filterInput.className = 'filter-input history-filter';
    filterInput.placeholder = 'Filter history...';
    filterInput.addEventListener('input', () => {
      const value = filterInput.value.trim().toLowerCase();
      filterHistoryGroups(historyGroups, value, container);
    });
    section.appendChild(filterInput);

    const container = document.createElement('div');
    container.className = 'history-groups';
    container.style.position = 'relative';

    if (!historyGroups || historyGroups.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.innerHTML = `<i class="codicon codicon-list-unordered"></i><span>No history yet.</span>`;
      container.appendChild(placeholder);
    } else {
      function recalcHistoryConnectors() {
        const groups = Array.from(container.querySelectorAll('.history-group'));
        const connectors = Array.from(container.querySelectorAll('.history-group-connector'));
        connectors.forEach((connector, i) => {
          if (groups[i]) {
            const thisGroup = groups[i];
            if (thisGroup.classList.contains('collapsed')) {
              connector.style.height = '16px';
            } else {
              connector.style.height = thisGroup.offsetHeight + 'px';
            }
          }
        });
      }
      historyGroups.forEach((group, groupIdx) => {
        // Add connector before every group (including the first)
        const connector = document.createElement('div');
        connector.className = 'history-group-connector';
        container.appendChild(connector);
        const groupDiv = document.createElement('div');
        groupDiv.className = 'history-group';
        // Collapsible group header with delete group button
        const groupHeader = document.createElement('div');
        groupHeader.className = 'history-group-header';
        groupHeader.innerHTML = `<i class="codicon codicon-chevron-down"></i> ${group.label}`;
        // Delete group button
        const deleteGroupBtn = document.createElement('button');
        deleteGroupBtn.className = 'section-action-btn codicon codicon-trash';
        deleteGroupBtn.title = 'Clear This Group';
        deleteGroupBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          console.log('[GROUP DELETE] Sending sectionAction command for group:', group.label);
          vscode.postMessage({ command: 'sectionAction', payload: { section: 'History', action: 'clearGroup', groupLabel: group.label } });
        });
        groupHeader.appendChild(deleteGroupBtn);
        groupHeader.addEventListener('click', () => {
          groupDiv.classList.toggle('collapsed');
          setTimeout(recalcHistoryConnectors, 0);
        });
        groupDiv.appendChild(groupHeader);
        const list = document.createElement('ul');
        list.className = 'history-items';
        group.items.forEach((item, idx) => {
          const li = renderHistoryItemModern(item, idx, group.items.length, groupDiv, group.label);
          list.appendChild(li);
        });
        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
      });
      // After rendering, dynamically set connector heights
      setTimeout(() => {
        recalcHistoryConnectors();
        // Hover logic: show all connectors when any history item is hovered
        const connectors = Array.from(container.querySelectorAll('.history-group-connector'));
        const items = container.querySelectorAll('.history-modern-item');
        items.forEach(item => {
          item.addEventListener('mouseenter', () => {
            connectors.forEach(conn => conn.classList.add('connector-hover'));
          });
          item.addEventListener('mouseleave', () => {
            connectors.forEach(conn => conn.classList.remove('connector-hover'));
          });
        });
      }, 0);
    }
    section.appendChild(container);
    root.appendChild(section);
  }

  // ========== Filter Logic for History ==========
  function filterHistoryGroups(historyGroups, query, container) {
    // Remove all children
    container.innerHTML = '';
    historyGroups.forEach((group) => {
      const filteredItems = group.items.filter(item => {
        const url = item.url?.toLowerCase() || '';
        const method = item.method?.toLowerCase() || '';
        return url.includes(query) || method.includes(query);
      });
      if (filteredItems.length > 0) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'history-group';
        const groupHeader = document.createElement('div');
        groupHeader.className = 'history-group-header';
        groupHeader.innerHTML = `<i class="codicon codicon-chevron-down"></i> ${group.label}`;
        groupHeader.addEventListener('click', () => {
          groupDiv.classList.toggle('collapsed');
        });
        groupDiv.appendChild(groupHeader);
        const list = document.createElement('ul');
        list.className = 'history-items';
        filteredItems.forEach((item, idx) => {
          const li = renderHistoryItemModern(item, idx, filteredItems.length, groupDiv, group.label);
          list.appendChild(li);
        });
        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
      }
    });
  }

  // ========== Modern History Item Renderer ==========
  function renderHistoryItemModern(item, idx, groupLen, groupDiv, groupLabel) {
    const li = document.createElement('li');
    li.className = 'history-modern-item';
    // Line connector logic
    if (groupLen > 1 && idx < groupLen - 1) {
      li.classList.add('with-connector');
    }
    // Method badge (no background, colored text only)
    const methodSpan = document.createElement('span');
    methodSpan.className = `method-badge-text method-${item.method?.toLowerCase()}`;
    methodSpan.textContent = item.method;
    // URL
    const urlSpan = document.createElement('span');
    urlSpan.className = 'history-url';
    urlSpan.title = item.url;
    urlSpan.textContent = item.url.length > 40 ? item.url.slice(0, 37) + '...' : item.url;
    // Delete single item button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-delete-btn codicon codicon-trash';
    deleteBtn.title = 'Delete This Entry';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[HISTORY DELETE] Sending deleteHistoryItem command for id:', item.id);
      vscode.postMessage({ command: 'deleteHistoryItem', payload: item.id });
    });
    // Timestamp (optional, tooltip)
    li.title = new Date(item.timestamp).toLocaleString();
    // Compose
    li.appendChild(methodSpan);
    li.appendChild(urlSpan);
    li.appendChild(deleteBtn);
    // Line connector
    if (li.classList.contains('with-connector')) {
      const connector = document.createElement('div');
      connector.className = 'history-connector';
      li.appendChild(connector);
    }
    // Click to load
    li.addEventListener('click', () => {
      vscode.postMessage({ command: 'loadHistoryItem', payload: item });
    });
    return li;
  }

  // ========== Item Renderers ==========

  function renderCollectionItem(collections) {
    const li = document.createElement('li');
    li.className = 'fade-in';

    li.innerHTML = `
      <span>${collections.name}</span>
      <span class="badge">${collections.endpoints}</span>
    `;
    return li;
  }

  // ========== Filter Logic ==========

  function filterHistory(query) {
    const historyItems = root.querySelectorAll('[data-section="History"] .section-items li');

    historyItems.forEach((li) => {
      const url = li.querySelector('.url')?.textContent.toLowerCase() || '';
      const method = li.querySelector('.method')?.textContent.toLowerCase() || '';
      const match = url.includes(query) || method.includes(query);
      li.style.display = match ? '' : 'none';
    });
  }

  // ========== Context Menu Logic ==========

  const contextMenu = createContextMenu();

  function showContextMenu(x, y, item) {
    contextMenu.classList.add('visible');
    contextMenu.style.top = `${y}px`;
    contextMenu.style.left = `${x}px`;

    contextMenu.onclick = (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) {
        vscode.postMessage({ command: 'contextAction', payload: { action, item } });
        hideContextMenu();
      }
    };

    document.body.appendChild(contextMenu);

    window.addEventListener('click', hideContextMenu, { once: true });
  }

  function hideContextMenu() {
    contextMenu.classList.remove('visible');
    contextMenu.remove();
  }

  function createContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'context-menu fade-in';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="copyCurl"><i class="codicon codicon-clippy"></i> Copy as cURL</div>
      <div class="context-menu-item" data-action="duplicate"><i class="codicon codicon-copy"></i> Duplicate</div>
      <div class="context-menu-item" data-action="delete"><i class="codicon codicon-trash"></i> Delete</div>
    `;
    return menu;
  }

  // ========== New Sections ==========

  function renderEnvironmentItem(env) {
    const li = document.createElement('li');
    li.className = 'fade-in';
    li.innerHTML = `<span class="codicon codicon-server-environment"></span> <span>${env.name}</span> <span class="badge">${env.variables}</span>`;
    // Highlight if active
    if (sidebarData.selectedEnvironmentId && env.id === sidebarData.selectedEnvironmentId) {
      li.classList.add('active-environment');
      li.style.background = 'var(--vscode-editorWidget-background, #2c2c32)';
      li.style.fontWeight = 'bold';
    }
    li.addEventListener('click', () => {
      console.log('Environment clicked:', env.name, 'ID:', env.id);
      vscode.postMessage({ command: 'setActiveEnvironment', payload: { id: env.id } });
    });
    // Add double-click to open environment panel
    li.addEventListener('dblclick', () => {
      vscode.postMessage({ command: 'openEnvironmentPanel', payload: { id: env.id } });
    });
    return li;
  }

  function renderApiItem(api) {
    const li = document.createElement('li');
    li.className = 'fade-in';
    li.innerHTML = `<span class="codicon codicon-symbol-interface"></span> <span>${api.name}</span> <span class="badge">${api.version}</span>`;
    return li;
  }

  // Add a recursive function to render folders and their children
  function renderFolderGroup(folder, parentCollection, expandedFolders, level = 0) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'collections-group folder-group';
    groupDiv.dataset.level = level;
    groupDiv.dataset.folderId = folder.id;
    
    // Collapsible group header with three-dot menu
    const groupHeader = document.createElement('div');
    groupHeader.className = 'collections-group-header folder-group-header';
    
    // Create treeview structure with proper indentation and connector lines
    const treeStructure = document.createElement('div');
    treeStructure.className = 'folder-tree-structure';
    treeStructure.style.paddingLeft = `0px`;
    
    // Add connector line for nested folders
    if (level > 0) {
      const connector = document.createElement('div');
      connector.className = 'folder-connector-line';
      connector.style.position = 'absolute';
      connector.style.left = '-3px';
      connector.style.top = '0';
      connector.style.bottom = '0';
      connector.style.width = '1px';
      connector.style.background = 'var(--vscode-tree-indentGuidesStroke)';
      treeStructure.appendChild(connector);
    }
    
    // Add expand/collapse chevron
    const chevron = document.createElement('i');
    chevron.className = 'codicon codicon-chevron-down folder-chevron';
    chevron.style.marginRight = '8px';
    chevron.style.transition = 'transform 0.2s ease';
    
    // Add folder icon
    const folderIcon = document.createElement('i');
    folderIcon.className = 'codicon codicon-folder';
    folderIcon.style.marginRight = '8px';
    folderIcon.style.color = 'var(--vscode-symbolIcon-folderForeground)';
    
    // Add folder name
    const folderName = document.createElement('span');
    folderName.textContent = folder.name;
    folderName.className = 'folder-name';
    
    treeStructure.appendChild(chevron);
    treeStructure.appendChild(folderIcon);
    treeStructure.appendChild(folderName);
    groupHeader.appendChild(treeStructure);
    // Three-dot menu
    const menuBtn = document.createElement('button');
    menuBtn.className = 'collection-menu-btn codicon codicon-kebab-vertical';
    menuBtn.title = 'Folder Actions';
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.tabIndex = 0;
    // Dropdown menu logic (reuse from collection)
    let currentDropdown = null;
    function closeDropdown() {
      if (currentDropdown) {
        currentDropdown.remove();
        menuBtn.setAttribute('aria-expanded', 'false');
        currentDropdown = null;
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onDropdownKeydown, true);
      }
    }
    function onDocClick(e) {
      if (currentDropdown && !currentDropdown.contains(e.target) && e.target !== menuBtn) {
        closeDropdown();
      }
    }
    function onDropdownKeydown(e) {
      if (!currentDropdown) return;
      const items = Array.from(currentDropdown.querySelectorAll('.context-menu-item'));
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
        closeDropdown();
        menuBtn.focus();
      } else if (e.key === 'Enter' && document.activeElement.classList.contains('context-menu-item')) {
        document.activeElement.click();
      }
    }
    function showDropdownMenu() {
      closeDropdown();
      const menu = document.createElement('div');
      menu.className = 'collection-context-menu context-menu fade-in';
      menu.style.position = 'absolute';
      const rect = menuBtn.getBoundingClientRect();
      const menuHeight = 6 * 40;
      const menuWidth = 180;
      let top = rect.bottom + window.scrollY + 2;
      let left = rect.left + window.scrollX;
      if (top + menuHeight > window.innerHeight) {
        top = rect.top + window.scrollY - menuHeight - 2;
      }
      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 8;
      }
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
      menu.innerHTML = `
        <div class="context-menu-item" tabindex="0" data-action="add-request"><i class="codicon codicon-plus"></i> Add Request</div>
        <div class="context-menu-item" tabindex="0" data-action="add-folder"><i class="codicon codicon-folder"></i> Add Folder</div>
        <div class="context-menu-item" tabindex="0" data-action="rename"><i class="codicon codicon-edit"></i> Rename</div>
        <div class="context-menu-item" tabindex="0" data-action="duplicate"><i class="codicon codicon-copy"></i> Duplicate</div>
        <div class="context-menu-item" tabindex="0" data-action="export"><i class="codicon codicon-export"></i> Export</div>
        <div class="context-menu-item" tabindex="0" data-action="delete"><i class="codicon codicon-trash"></i> Delete</div>
      `;
      menu.onclick = (evt) => {
        const action = evt.target.closest('[data-action]')?.dataset.action;
        console.log('Folder context menu action clicked:', action);
        if (action) {
          if (action === 'delete' || action === 'duplicate' || action === 'export') {
            vscode.postMessage({ command: 'folderContextAction', payload: { action, folderId: folder.id, parentCollectionId: parentCollection.id } });
          } else if (action === 'add-folder') {
            // Inline add folder input
            if (groupDiv.querySelector('.folder-add-input')) return;
            let reqUl = groupDiv.querySelector('ul.collections-requests-list');
            if (!reqUl) {
              reqUl = document.createElement('ul');
              reqUl.className = 'collections-requests-list';
              groupDiv.appendChild(reqUl);
            }
            const folderLi = document.createElement('li');
            folderLi.className = 'collection-request-row folder-inline';
            const folderIcon = document.createElement('i');
            folderIcon.className = 'codicon codicon-folder';
            folderIcon.style.marginRight = '6px';
            folderLi.appendChild(folderIcon);
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Folder name';
            input.className = 'folder-add-input inline-add-input';
            folderLi.appendChild(input);
            reqUl.insertBefore(folderLi, reqUl.firstChild);
            input.focus();
            input.select();
            let addHandled = false;
            input.addEventListener('blur', finishAddFolder);
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') finishAddFolder();
              else if (e.key === 'Escape') cancelAddFolder();
            });
            function finishAddFolder() {
              if (addHandled) return;
              addHandled = true;
              const name = input.value.trim();
              if (name) {
                vscode.postMessage({ command: 'addFolder', payload: { parentFolderId: folder.id, collectionId: parentCollection.id, name } });
              }
              folderLi.remove();
            }
            function cancelAddFolder() {
              addHandled = true;
              folderLi.remove();
            }
          } else if (action === 'rename') {
            console.log('[Sidebar JS] Folder rename action initiated.');
            // Inline rename for folder
            const treeStructure = groupHeader.querySelector('.folder-tree-structure');
            const nameNode = treeStructure ? treeStructure.querySelector('.folder-name') : null;
            if (!nameNode) {
              console.log('[Sidebar JS] .folder-name not found in treeStructure. Aborting rename input creation.');
              return;
            }
            if (treeStructure.querySelector('.folder-rename-input')) return;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = folder.name;
            input.className = 'folder-rename-input';
            input.style.marginLeft = '8px';
            input.style.fontSize = '15px';
            input.style.background = 'var(--vscode-input-background)';
            input.style.color = 'var(--vscode-foreground)';
            input.style.border = '1px solid var(--vscode-input-border)';
            input.style.borderRadius = '4px';
            input.style.padding = '2px 6px';
            input.style.width = 'calc(100% - 40px)';
            treeStructure.replaceChild(input, nameNode);
            input.focus();
            input.select();
            input.addEventListener('blur', finishRename);
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') finishRename();
              else if (e.key === 'Escape') cancelRename();
            });
            function finishRename() {
              const newName = input.value.trim();
              console.log('[Sidebar JS] finishRename called. New name:', newName);
              if (newName && newName !== folder.name) {
                vscode.postMessage({ command: 'folderContextAction', payload: { action: 'rename', folderId: folder.id, parentCollectionId: parentCollection.id, newName } });
                restoreSpan(newName); // Optimistically update UI
              } else {
                restoreSpan(folder.name); // Revert to original if no valid change
              }
            }
            function cancelRename() {
              console.log('[Sidebar JS] cancelRename called.');
              restoreSpan(folder.name); // Always revert to original on cancel
            }
            function restoreSpan(name) {
              const span = document.createElement('span');
              span.className = 'folder-name';
              span.textContent = name;
              treeStructure.replaceChild(span, input);
            }
          } else if (action === 'add-request') {
            // Explicitly handle Add Request for folder
            vscode.postMessage({
              command: 'addRequest',
              payload: {
                parentCollectionId: parentCollection.id,
                parentFolderId: folder.id
              }
            });
          }
          closeDropdown();
        }
      };
      // Keyboard navigation
      menu.addEventListener('keydown', onDropdownKeydown);
      document.body.appendChild(menu);
      setTimeout(() => {
        menu.querySelector('.context-menu-item').focus();
      }, 0);
      currentDropdown = menu;
      menuBtn.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onDropdownKeydown, true);
    }
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showDropdownMenu();
    });
    menuBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showDropdownMenu();
      }
    });
    groupHeader.appendChild(menuBtn);
    groupHeader.addEventListener('click', () => {
      groupDiv.classList.toggle('collapsed');
      // IMPORTANT: Recalculate connector lines so they match the new visible height after collapse/expand
      setTimeout(() => {
        // Recalculate connectors for this group and all ancestor folder groups
        let current = groupDiv;
        while (current) {
          recalcFolderConnectors(current);
          // Move up to parent .folder-group (skip self)
          current = current.parentElement;
          while (current && !current.classList.contains('folder-group') && !current.classList.contains('collections-section')) {
            current = current.parentElement;
          }
          // Stop at the top-level collections section
          if (current && current.classList.contains('collections-section')) break;
        }
      }, 0);
    });
    groupDiv.appendChild(groupHeader);

    // Requests (children) and Folders (children)
    if ((folder.folders && folder.folders.length) || (folder.requests && folder.requests.length)) {
      const reqUl = document.createElement('ul');
      reqUl.className = 'collections-requests-list';
      // Render folders first
      if (folder.folders && folder.folders.length) {
        folder.folders.forEach(subfolder => {
          reqUl.appendChild(renderFolderGroup(subfolder, parentCollection, expandedFolders, level + 1));
        });
      }
      // Then render requests
      if (folder.requests && folder.requests.length) {
        folder.requests.forEach(req => {
          const reqLi = document.createElement('li');
          reqLi.className = 'collection-request-row folder-request-row';
          
          // Create treeview structure for requests
          const requestStructure = document.createElement('div');
          requestStructure.className = 'request-tree-structure';
          requestStructure.style.position = 'relative';
          requestStructure.style.paddingLeft = `0px`;
          
          // Add connector line for requests in folders
          const connector = document.createElement('div');
          connector.className = 'request-connector-line';
          connector.style.position = 'absolute';
          connector.style.left = '-10px';
          connector.style.top = '0';
          connector.style.bottom = '0';
          connector.style.width = '1px';
          connector.style.background = 'var(--vscode-tree-indentGuidesStroke)';
          requestStructure.appendChild(connector);
          
          const requestName = (typeof req.name === 'string' && req.name.trim()) ? req.name : (req.url || 'Unnamed Request');
          requestStructure.innerHTML += `
            <span class="request-method method-${req.method.toLowerCase()}">${req.method}</span>
            <span class="request-name">${requestName}</span>
            <button class="request-menu-btn codicon codicon-kebab-vertical" title="Request Actions" tabindex="-1"></button>
          `;
          
          reqLi.appendChild(requestStructure);
          reqUl.appendChild(reqLi);

          // Attach click handlers after both elements exist
          reqLi.addEventListener('click', (e) => {
            if (!e.target.classList.contains('request-menu-btn') && !e.target.classList.contains('request-rename-input')) {
              vscode.postMessage({ command: 'loadCollectionRequest', payload: req });
            }
          });
          requestStructure.addEventListener('click', (e) => {
            if (!e.target.classList.contains('request-menu-btn') && !e.target.classList.contains('request-rename-input')) {
              vscode.postMessage({ command: 'loadCollectionRequest', payload: req });
            }
          });

          // Add dropdown menu functionality to the request menu button
          const menuBtn = requestStructure.querySelector('.request-menu-btn');
          menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const folderPath = getFolderPath(reqLi);
            showRequestDropdownMenu(menuBtn, req, parentCollection, reqLi, folderPath);
          });
          menuBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const folderPath = getFolderPath(reqLi);
              showRequestDropdownMenu(menuBtn, req, parentCollection, reqLi, folderPath);
            }
          });

          // Helper function to get folder path
          function getFolderPath(element) {
            const path = [];
            let current = element.parentElement;
            while (current) {
              if (current.classList && current.classList.contains('folder-group')) {
                const folderId = current.getAttribute('data-folder-id');
                if (folderId) path.unshift(folderId);
              }
              current = current.parentElement;
            }
            return path.length > 0 ? path : null;
          }

          // Add rename event listener
          reqLi.addEventListener('rename-request', () => {
            const nameSpan = requestStructure.querySelector('.request-name');
            if (nameSpan && !requestStructure.querySelector('.request-rename-input')) {
              const input = document.createElement('input');
              input.type = 'text';
              input.value = req.name;
              input.className = 'request-rename-input';
              input.style.fontSize = '13px';
              input.style.background = 'var(--vscode-input-background)';
              input.style.color = 'var(--vscode-foreground)';
              input.style.border = '1px solid var(--vscode-input-border)';
              input.style.borderRadius = '4px';
              input.style.padding = '2px 6px';
              input.style.width = 'calc(100% - 40px)';
              requestStructure.replaceChild(input, nameSpan);
              input.focus();
              input.select();

              function finishRename() {
                const newName = input.value.trim();
                if (newName && newName !== req.name) {
                  const folderPath = getFolderPath(reqLi);
                  vscode.postMessage({
                    command: 'collectionRequestContextAction',
                    payload: { 
                      action: 'rename', 
                      collectionId: parentCollection.id, 
                      requestId: req.id,
                      newName,
                      folderPath: folderPath && folderPath.length > 0 ? folderPath : undefined
                    }
                  });
                  restoreSpan(newName);
                } else {
                  restoreSpan(req.name);
                }
              }

              function cancelRename() {
                restoreSpan(req.name);
              }

              function restoreSpan(name) {
                const span = document.createElement('span');
                span.className = 'request-name';
                span.textContent = name;
                requestStructure.replaceChild(span, input);
              }

              input.addEventListener('blur', finishRename);
              input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishRename();
                else if (e.key === 'Escape') cancelRename();
              });
            }
          });
        });
      }
      groupDiv.appendChild(reqUl);
    }
    return groupDiv;
  }

  // Helper function to recalculate folder connectors
  function recalcFolderConnectors(folderGroup) {
    const folderContainer = folderGroup.querySelector(':scope > .collections-requests-list');
    if (!folderContainer) return;
    
    const folderGroups = Array.from(folderContainer.children).filter(child => 
      child.classList && child.classList.contains('folder-group')
    );
    const requestRows = Array.from(folderContainer.children).filter(child => 
      child.classList && child.classList.contains('folder-request-row')
    );
    
    // Update connector lines for nested folders
    folderGroups.forEach((fg, index) => {
      const connector = fg.querySelector('.folder-connector-line');
      if (connector) {
        if (fg.classList.contains('collapsed')) {
          connector.style.height = '20px';
        } else {
          // Find the last visible child (folder or request) and set the connector height to its bottom
          const folderContainer = fg.querySelector(':scope > .collections-requests-list');
          let lastChild = null;
          if (folderContainer && folderContainer.children.length > 0) {
            // Find the last visible child (folder or request)
            for (let i = folderContainer.children.length - 1; i >= 0; i--) {
              const child = folderContainer.children[i];
              if (child.offsetParent !== null) { // visible
                lastChild = child;
                break;
              }
            }
          }
          if (lastChild) {
            // Height from top of fg to bottom of lastChild (relative to fg)
            const height = lastChild.offsetTop + lastChild.offsetHeight;
            connector.style.height = height + 'px';
          } else {
            connector.style.height = fg.offsetHeight + 'px';
          }
        }
      }
      // Recursively update nested folders
      recalcFolderConnectors(fg);
    });
    
    // Update connector lines for requests
    requestRows.forEach((reqRow, index) => {
      const connector = reqRow.querySelector('.request-connector-line');
      if (connector) {
        connector.style.height = reqRow.offsetHeight + 'px';
      }
    });
  }

  // Render the Collections section as a boxed layout
  function renderCollectionsSection(collections, expandedFolders = {}) {
    const section = document.createElement('div');
    section.className = 'section collections-section';
    section.dataset.section = 'Collections';

    // Collapsible header with add button
    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `<i class="codicon codicon-chevron-down"></i> Collections`;
    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'section-action-btn codicon codicon-add';
    addBtn.title = 'New Collection';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Inline add collection input
      if (container.querySelector('.collection-add-input')) return;
      const groupDiv = document.createElement('div');
      groupDiv.className = 'collections-group';
      const groupHeader = document.createElement('div');
      groupHeader.className = 'collections-group-header';
      const nameIcon = document.createElement('i');
      nameIcon.className = 'codicon codicon-chevron-down';
      groupHeader.appendChild(nameIcon);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'collection-add-input inline-add-input';
      groupHeader.appendChild(input);
      groupDiv.appendChild(groupHeader);
      container.insertBefore(groupDiv, container.firstChild);
      input.focus();
      input.select();
      let addHandled = false;
      input.addEventListener('blur', finishAdd);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishAdd();
        else if (e.key === 'Escape') cancelAdd();
      });
      function finishAdd() {
        if (addHandled) return;
        addHandled = true;
        const name = input.value.trim();
        if (name) {
          vscode.postMessage({ command: 'addCollection', payload: { name } });
        }
        groupDiv.remove();
      }
      function cancelAdd() {
        addHandled = true;
        groupDiv.remove();
      }
      input.style.background = 'transparent';
    });
    header.appendChild(addBtn);
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
    section.appendChild(header);

    const container = document.createElement('div');
    container.className = 'collections-groups';

    if (!collections || collections.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.innerHTML = `<i class="codicon codicon-list-unordered"></i><span>No collections yet.</span>`;
      container.appendChild(placeholder);
    } else {
      function recalcConnectors() {
        // Top-level connectors for collections
        const groups = Array.from(container.children).filter(child => child.classList.contains('collections-group'));
        const connectors = Array.from(container.children).filter(child => child.classList.contains('collection-group-connector'));
        connectors.forEach((connector, i) => {
          if (groups[i]) {
            const thisGroup = groups[i];
            if (thisGroup.classList.contains('collapsed')) {
              connector.style.height = '16px';
            } else {
              connector.style.height = thisGroup.offsetHeight + 'px';
            }
          }
        });
        // Recursively handle connectors for nested folders
        function recalcFolderConnectors(folderGroup) {
          const folderContainer = folderGroup.querySelector(':scope > .collections-requests-list');
          if (!folderContainer) return;
          const folderGroups = Array.from(folderContainer.children).filter(child => child.classList && child.classList.contains('folder-group'));
          const folderConnectors = Array.from(folderContainer.children).filter(child => child.classList && child.classList.contains('collection-group-connector'));
          folderConnectors.forEach((connector, i) => {
            if (folderGroups[i]) {
              const thisGroup = folderGroups[i];
              if (thisGroup.classList.contains('collapsed')) {
                connector.style.height = '16px';
              } else {
                connector.style.height = thisGroup.offsetHeight + 'px';
              }
            }
          });
          folderGroups.forEach(fg => recalcFolderConnectors(fg));
        }
        groups.forEach(g => recalcFolderConnectors(g));
      }
      collections.forEach((collection, idx) => {
        // Add connector before every group (including the first)
        const connector = document.createElement('div');
        connector.className = 'collection-group-connector';
        container.appendChild(connector);
        const groupDiv = document.createElement('div');
        groupDiv.className = 'collections-group';
        // Collapsible group header with three-dot menu
        const groupHeader = document.createElement('div');
        groupHeader.className = 'collections-group-header';
        groupHeader.innerHTML = `<i class="codicon codicon-chevron-down"></i> ${collection.name}`;
        // Three-dot menu
        const menuBtn = document.createElement('button');
        menuBtn.className = 'collection-menu-btn codicon codicon-kebab-vertical';
        menuBtn.title = 'Collection Actions';
        menuBtn.setAttribute('aria-haspopup', 'true');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.tabIndex = 0;
        // Dropdown menu logic (reuse from before)
        let currentDropdown = null;
        function closeDropdown() {
          if (currentDropdown) {
            currentDropdown.remove();
            menuBtn.setAttribute('aria-expanded', 'false');
            currentDropdown = null;
            document.removeEventListener('click', onDocClick, true);
            document.removeEventListener('keydown', onDropdownKeydown, true);
          }
        }
        function onDocClick(e) {
          if (currentDropdown && !currentDropdown.contains(e.target) && e.target !== menuBtn) {
            closeDropdown();
          }
        }
        function onDropdownKeydown(e) {
          if (!currentDropdown) return;
          const items = Array.from(currentDropdown.querySelectorAll('.context-menu-item'));
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
            closeDropdown();
            menuBtn.focus();
          } else if (e.key === 'Enter' && document.activeElement.classList.contains('context-menu-item')) {
            document.activeElement.click();
          }
        }
        function showDropdownMenu() {
          closeDropdown();
          const menu = document.createElement('div');
          menu.className = 'collection-context-menu context-menu fade-in';
          menu.style.position = 'absolute';
          const rect = menuBtn.getBoundingClientRect();
          // Calculate dropdown position to keep it in the viewport
          const menuHeight = 6 * 40; // 6 items, ~40px each (estimate)
          const menuWidth = 180;
          let top = rect.bottom + window.scrollY + 2;
          let left = rect.left + window.scrollX;
          if (top + menuHeight > window.innerHeight) {
            top = rect.top + window.scrollY - menuHeight - 2;
          }
          if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 8;
          }
          menu.style.top = `${top}px`;
          menu.style.left = `${left}px`;
          menu.innerHTML = `
            <div class="context-menu-item" tabindex="0" data-action="add-request"><i class="codicon codicon-plus"></i> Add Request</div>
            <div class="context-menu-item" tabindex="0" data-action="add-folder"><i class="codicon codicon-folder"></i> Add Folder</div>
            <div class="context-menu-item" tabindex="0" data-action="rename"><i class="codicon codicon-edit"></i> Rename</div>
            <div class="context-menu-item" tabindex="0" data-action="duplicate"><i class="codicon codicon-copy"></i> Duplicate</div>
            <div class="context-menu-item" tabindex="0" data-action="export"><i class="codicon codicon-export"></i> Export</div>
            <div class="context-menu-item" tabindex="0" data-action="delete"><i class="codicon codicon-trash"></i> Delete</div>
          `;
          menu.onclick = (evt) => {
            const action = evt.target.closest('[data-action]')?.dataset.action;
            if (action) {
              if (action === 'delete') {
                vscode.postMessage({ command: 'deleteCollection', payload: { collectionId: collection.id } });
              } else if (action === 'add-folder') {
                // Inline add folder input
                if (groupDiv.querySelector('.folder-add-input')) return;
                let reqUl = groupDiv.querySelector('ul.collections-requests-list');
                if (!reqUl) {
                  reqUl = document.createElement('ul');
                  reqUl.className = 'collections-requests-list';
                  groupDiv.appendChild(reqUl);
                }
                const folderLi = document.createElement('li');
                folderLi.className = 'collection-request-row folder-inline';
                const folderIcon = document.createElement('i');
                folderIcon.className = 'codicon codicon-folder';
                folderIcon.style.marginRight = '6px';
                folderLi.appendChild(folderIcon);
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Folder name';
                input.className = 'folder-add-input';
                input.style.marginLeft = '2px';
                input.style.fontSize = '14px';
                input.style.background = 'transparent';
                input.style.color = 'var(--vscode-foreground)';
                input.style.border = '1px solid #292d32';
                input.style.borderRadius = '2px';
                input.style.padding = '3px 6px';
                input.style.width = 'calc(100% - 60px)';
                folderLi.appendChild(input);
                reqUl.insertBefore(folderLi, reqUl.firstChild);
                input.focus();
                input.select();
                let addHandled = false;
                input.addEventListener('blur', finishAddFolder);
                input.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter') finishAddFolder();
                  else if (e.key === 'Escape') cancelAddFolder();
                });
                function finishAddFolder() {
                  if (addHandled) return;
                  addHandled = true;
                  const name = input.value.trim();
                  if (name) {
                    vscode.postMessage({ command: 'addFolder', payload: { collectionId: collection.id, name } });
                  }
                  folderLi.remove();
                }
                function cancelAddFolder() {
                  addHandled = true;
                  folderLi.remove();
                }
              } else if (action === 'rename') {
                // Inline rename for collection
                const nameIcon = groupHeader.querySelector('.codicon-chevron-down');
                const nameNode = nameIcon.nextSibling;
                if (!nameNode || nameNode.nodeType !== Node.TEXT_NODE) return;
                // Prevent multiple inputs
                if (groupHeader.querySelector('.collection-rename-input')) return;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = collection.name;
                input.className = 'collection-rename-input inline-edit-input';
                groupHeader.replaceChild(input, nameNode);
                input.focus();
                input.select();
                input.addEventListener('blur', finishRename);
                input.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter') finishRename();
                  else if (e.key === 'Escape') cancelRename();
                });
                function finishRename() {
                  const newName = input.value.trim();
                  if (newName && newName !== collection.name) {
                    vscode.postMessage({ command: 'collectionContextAction', payload: { action: 'rename', collectionId: collection.id, newName } });
                  }
                  restoreSpan(newName || collection.name);
                }
                function cancelRename() {
                  restoreSpan(collection.name);
                }
                function restoreSpan(name) {
                  const textNode = document.createTextNode(' ' + name);
                  groupHeader.replaceChild(textNode, input);
                }
              } else if (action === 'add-request') {
                // Explicitly handle Add Request for collection
                vscode.postMessage({
                  command: 'addRequest',
                  payload: {
                    parentCollectionId: collection.id
                  }
                });
              } else {
                vscode.postMessage({ command: 'collectionContextAction', payload: { action, collectionId: collection.id } });
              }
              closeDropdown();
            }
          };
          // Keyboard navigation
          menu.addEventListener('keydown', onDropdownKeydown);
          document.body.appendChild(menu);
          setTimeout(() => {
            menu.querySelector('.context-menu-item').focus();
          }, 0);
          currentDropdown = menu;
          menuBtn.setAttribute('aria-expanded', 'true');
          document.addEventListener('click', onDocClick, true);
          document.addEventListener('keydown', onDropdownKeydown, true);
        }
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          showDropdownMenu();
        });
        menuBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showDropdownMenu();
          }
        });
        groupHeader.appendChild(menuBtn);
        groupHeader.addEventListener('click', () => {
          groupDiv.classList.toggle('collapsed');
          setTimeout(recalcConnectors, 0);
        });
        groupDiv.appendChild(groupHeader);

        // Requests (children) and Folders (children)
        if ((collection.folders && collection.folders.length) || (collection.requests && collection.requests.length)) {
          const reqUl = document.createElement('ul');
          reqUl.className = 'collections-requests-list';
                // Render folders first
      if (collection.folders && collection.folders.length) {
        collection.folders.forEach(folder => {
          reqUl.appendChild(renderFolderGroup(folder, collection, expandedFolders, 0));
        });
      }
          // Then render requests
          if (collection.requests && collection.requests.length) {
            collection.requests.forEach(req => {
              const reqLi = document.createElement('li');
              reqLi.className = 'collection-request-row';
              const requestName = (typeof req.name === 'string' && req.name.trim()) ? req.name : (req.url || 'Unnamed Request');
              reqLi.innerHTML = `
                <span class="request-method method-${req.method.toLowerCase()}">${req.method}</span>
                <span class="request-name">${requestName}</span>
                <button class="request-menu-btn codicon codicon-kebab-vertical" title="Request Actions" tabindex="-1"></button>
              `;
              const menuBtn = reqLi.querySelector('.request-menu-btn');
              menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showRequestDropdownMenu(menuBtn, req, collection, reqLi);
              });
              // Inline rename logic
              reqLi.addEventListener('rename-request', () => {
                const nameSpan = reqLi.querySelector('.request-name');
                if (!nameSpan) return;
                // Prevent multiple inputs
                if (reqLi.querySelector('.request-rename-input')) return;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = requestName;
                input.className = 'request-rename-input inline-edit-input';
                nameSpan.replaceWith(input);
                input.focus();
                input.select();
                // Save on blur or Enter
                input.addEventListener('blur', finishRename);
                input.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter') {
                    finishRename();
                  } else if (e.key === 'Escape') {
                    cancelRename();
                  }
                });
                function finishRename() {
                  const newName = input.value.trim();
                  if (newName && newName !== requestName) {
                    vscode.postMessage({
                      command: 'collectionRequestContextAction',
                      payload: { action: 'rename', collectionId: collection.id, requestId: req.id, newName }
                    });
                  }
                  restoreSpan(newName || requestName);
                }
                function cancelRename() {
                  restoreSpan(requestName);
                }
                function restoreSpan(name) {
                  const span = document.createElement('span');
                  span.className = 'request-name';
                  span.textContent = name;
                  input.replaceWith(span);
                }
              });
              // Add click handler to load in Raw Request UI (but not when clicking menu or input)
              reqLi.addEventListener('click', (e) => {
                if (!e.target.classList.contains('request-menu-btn') && !e.target.classList.contains('request-rename-input')) {
                  vscode.postMessage({ command: 'loadCollectionRequest', payload: req });
                }
              });
              reqUl.appendChild(reqLi);
            });
          }
          groupDiv.appendChild(reqUl);
        }
        container.appendChild(groupDiv);
      });
      // After rendering, dynamically set connector heights
      setTimeout(() => {
        recalcConnectors();
        // Hover logic: show all connectors when any request is hovered
        const connectors = Array.from(container.querySelectorAll('.collection-group-connector'));
        const requests = container.querySelectorAll('.collection-request-row');
        requests.forEach(req => {
          req.addEventListener('mouseenter', () => {
            connectors.forEach(conn => conn.classList.add('connector-hover'));
          });
          req.addEventListener('mouseleave', () => {
            connectors.forEach(conn => conn.classList.remove('connector-hover'));
          });
        });
      }, 0);
    }
    section.appendChild(container);
    return section;
  }

  function showRequestDropdownMenu(menuBtn, req, collection, reqLi, folderPath = null) {
    // Remove any existing dropdown
    document.querySelectorAll('.request-context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'request-context-menu context-menu fade-in';
    menu.style.position = 'fixed';
    const rect = menuBtn.getBoundingClientRect();
    const menuWidth = 170;
    const menuHeight = 180; // Approximate, adjust if needed
    let top = rect.bottom + 2;
    let left = rect.left;

    // Flip up if not enough space below
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 2;
      if (top < 0) top = 4; // Clamp to top if still not enough space
    }

    // Clamp left if menu would overflow right
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 8;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    // Remove Move option for requests inside folders
    const isFolderRequest = Array.isArray(folderPath) && folderPath.length > 0;
    menu.innerHTML = `
      <div class="context-menu-item" tabindex="0" data-action="edit"><i class="codicon codicon-editor-layout"></i> Edit</div>
      <div class="context-menu-item" tabindex="0" data-action="rename"><i class="codicon codicon-edit"></i> Rename</div>
      <div class="context-menu-item" tabindex="0" data-action="duplicate"><i class="codicon codicon-copy"></i> Duplicate</div>
      <div class="context-menu-item" tabindex="0" data-action="delete"><i class="codicon codicon-trash"></i> Delete</div>
    `;
    menu.onclick = (evt) => {
      const action = evt.target.closest('[data-action]')?.dataset.action;
      if (action) {
        if (action === 'rename') {
          if (reqLi) reqLi.dispatchEvent(new Event('rename-request', { bubbles: true }));
          menu.remove();
          return;
        }
        vscode.postMessage({
          command: 'collectionRequestContextAction',
          payload: { action, collectionId: collection.id, requestId: req.id, folderPath: isFolderRequest ? folderPath : undefined }
        });
        menu.remove();
      }
    };
    // Keyboard navigation
    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('.context-menu-item'));
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
        menu.remove();
        menuBtn.focus();
      } else if (e.key === 'Enter' && document.activeElement.classList.contains('context-menu-item')) {
        document.activeElement.click();
      }
    });
    document.body.appendChild(menu);
    setTimeout(() => {
      menu.querySelector('.context-menu-item').focus();
    }, 0);

    // Close on outside click
    function onDocClick(e) {
      if (!menu.contains(e.target) && e.target !== menuBtn) {
        menu.remove();
        document.removeEventListener('click', onDocClick, true);
      }
    }
    document.addEventListener('click', onDocClick, true);
  }
})();
