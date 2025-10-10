import * as vscode from 'vscode';
import { getUri, getNonce } from '../utils/vsCodeUtils';

/**
 * Manages the Add Request to Collection Webview panel.
 * This class is a singleton that ensures only one panel exists at a time.
 */
export class AddToCollectionPanel {
    public static readonly viewType = 'universalApiNavigator.addToCollection';
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static lastRequestedCollectionId: string | undefined;
    private static lastRequestedFolderId: string | undefined;
    private static lastRequestedFolderPath: string[] | undefined;
    private static pendingEditRequestMessage: any = null;
    private static webviewIsReady: boolean = false;

    /**
     * Creates a new Add to Collection panel or shows an existing one.
     * @param context The extension context.
     */
    public static createOrShow(
        context: vscode.ExtensionContext,
        selectedCollectionId?: string,
        selectedFolderId?: string,
        selectedFolderPath?: string[]
    ) {
        console.log('[AddToCollectionPanel] createOrShow called with:', { selectedCollectionId, selectedFolderId });

        // Always update static state FIRST
        AddToCollectionPanel.lastRequestedCollectionId = selectedCollectionId;
        AddToCollectionPanel.lastRequestedFolderId = selectedFolderId;
        AddToCollectionPanel.lastRequestedFolderPath = selectedFolderPath || [];

        console.log('[AddToCollectionPanel] Updated state:', { 
            lastRequestedCollectionId: AddToCollectionPanel.lastRequestedCollectionId, 
            lastRequestedFolderId: AddToCollectionPanel.lastRequestedFolderId 
        });

        if (AddToCollectionPanel.currentPanel) {
            AddToCollectionPanel.currentPanel.reveal(vscode.ViewColumn.Active);
            // Send a message to the webview to update selection
            AddToCollectionPanel.postMessageToCurrentPanel({
                command: 'setCollectionsData',
                payload: {
                    collections: context.globalState.get('apiSidebar.collections', []),
                    selectedCollectionId,
                    selectedFolderId,
                    selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath
                }
            });
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            AddToCollectionPanel.viewType,
            'Add Request to Collection',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
                retainContextWhenHidden: true,
            }
        );

        AddToCollectionPanel.currentPanel = panel;
        panel.webview.html = AddToCollectionPanel.getHtml(panel.webview, context);
        AddToCollectionPanel.handleMessages(panel.webview, context);
        panel.onDidDispose(() => {
            AddToCollectionPanel.currentPanel = undefined;
        }, null, context.subscriptions);
        // Request collections data after webview loads
    }

    public static refreshCollectionsPanel(context: vscode.ExtensionContext) {
        const collections: any[] = context.globalState.get('apiSidebar.collections', []);
        const selectedCollectionId = AddToCollectionPanel.lastRequestedCollectionId || (collections[0]?.id ?? '');
        const selectedFolderId = AddToCollectionPanel.lastRequestedFolderId;
        const selectedFolderPath = AddToCollectionPanel.lastRequestedFolderPath;
        AddToCollectionPanel.postMessageToCurrentPanel({
            command: 'setCollectionsData',
            payload: { collections, selectedCollectionId, selectedFolderId, selectedFolderPath }
        });
    }

    public static postMessageToCurrentPanel(message: any) {
        console.log('[AddToCollectionPanel] Sending message:', message);
        if (AddToCollectionPanel.currentPanel) {
            AddToCollectionPanel.currentPanel.webview.postMessage(message);
        } else {
            console.warn('AddToCollectionPanel: No current panel to post message to.');
        }
    }

    private static getHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Add Request to Collection</title>
    <link href="${getUri(webview, context.extensionUri, ['media', 'addToCollection.css'])}" rel="stylesheet">
    <link rel="stylesheet" href="${getUri(webview, context.extensionUri, ['media', 'codicon.css'])}" />
</head>
<body>
    <div class="add-collection-container">
        <div class="collection-list-panel panel-1">
            <div class="collection-header">
                <label>Collection Name</label>
            </div>
            <div class="request-list" id="request-list"></div>
        </div>
        <div class="request-config-panel">
            <h2>Collection Configuration</h2>
            <form id="add-request-form">
                <div class="form-group">
                    <label for="method-dropdown">Method</label>
                    <div class="custom-dropdown" id="method-dropdown" data-selected-value="GET">
                        <div class="dropdown-selected" tabindex="0">
                            <span id="selected-method-text" class="method-text method-get">GET</span>
                            <span class="dropdown-arrow"></span>
                        </div>
                        <ul class="dropdown-menu hidden">
                            <li data-value="GET" class="method-get">GET</li>
                            <li data-value="POST" class="method-post">POST</li>
                            <li data-value="PUT" class="method-put">PUT</li>
                            <li data-value="PATCH" class="method-patch">PATCH</li>
                            <li data-value="DELETE" class="method-delete">DELETE</li>
                            <li data-value="HEAD" class="method-head">HEAD</li>
                            <li data-value="OPTIONS" class="method-options">OPTIONS</li>
                        </ul>
                    </div>
                </div>
                <div class="form-group">
                    <label for="collection-dropdown">Collection</label>
                    <div class="custom-dropdown" id="collection-dropdown" data-selected-value="">
                        <div class="dropdown-selected" tabindex="0">
                            <span id="selected-collection-text">Select a collection</span>
                            <span class="dropdown-arrow"></span>
                        </div>
                        <ul class="dropdown-menu hidden" id="collection-dropdown-menu">
                            <!-- Populated by JS -->
                        </ul>
                    </div>
                </div>
                <div class="form-group">
                    <label for="request-url">URL</label>
                    <input type="text" id="request-url" required />
                </div>
                <div class="form-group">
                    <label for="request-name">Name (Optional)</label>
                    <input type="text" id="request-name" placeholder="" />
                </div>
                <div class="form-group">
                    <label for="request-description">Description</label>
                    <textarea id="request-description" rows="2"></textarea>
                </div>
                <details class="advanced-settings">
                    <summary>Advanced Settings</summary>
                    <div class="form-group">
                        <label for="request-headers">Headers</label>
                        <div class="kv-editor" id="headers-kv-editor">
                            <div class="kv-editor-header">
                                <div class="kv-cell">Key</div>
                                <div class="kv-cell">Value</div>
                                <div class="kv-cell"></div>
                            </div>
                            <div class="kv-editor-body" id="headers-kv-body"></div>
                            <div class="kv-editor-footer">
                                <button type="button" id="add-header-row">Add Row</button>
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="request-body">Body</label>
                        <textarea id="request-body" rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="request-query">Query Params</label>
                        <div class="kv-editor" id="query-kv-editor">
                            <div class="kv-editor-header">
                                <div class="kv-cell">Key</div>
                                <div class="kv-cell">Value</div>
                                <div class="kv-cell"></div>
                            </div>
                            <div class="kv-editor-body" id="query-kv-body"></div>
                            <div class="kv-editor-footer">
                                <button type="button" id="add-query-row">Add Row</button>
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="auth-dropdown">Auth</label>
                        <div class="custom-dropdown" id="auth-dropdown" data-selected-value="none">
                            <div class="dropdown-selected" tabindex="0">
                                <span id="selected-auth-text">None</span>
                                <span class="dropdown-arrow"></span>
                            </div>
                            <ul class="dropdown-menu hidden">
                                <li data-value="none">None</li>
                                <li data-value="basic">Basic</li>
                                <li data-value="bearer">Bearer</li>
                            </ul>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="pre-request-script">Pre-request Script</label>
                        <textarea id="pre-request-script" rows="2"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="test-script">Test Script</label>
                        <textarea id="test-script" rows="2"></textarea>
                    </div>
                </details>
                <button type="submit" class="primary-btn">Add Request</button>
            </form>
        </div>
    </div>
    <script src="${getUri(webview, context.extensionUri, ['media', 'addToCollection.js'])}" nonce="${nonce}"></script>
</body>
</html>`;
    }

    private static handleMessages(webview: vscode.Webview, context: vscode.ExtensionContext) {
        webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'webviewReady') {
                AddToCollectionPanel.webviewIsReady = true;
                // Now send the initial data
                AddToCollectionPanel.postMessageToCurrentPanel({
                    command: 'requestCollectionsData',
                    payload: {
                        selectedCollectionId: AddToCollectionPanel.lastRequestedCollectionId,
                        selectedFolderId: AddToCollectionPanel.lastRequestedFolderId
                    }
                });
                // Send any pending edit message
                if (AddToCollectionPanel.pendingEditRequestMessage) {
                    AddToCollectionPanel.postMessageToCurrentPanel(AddToCollectionPanel.pendingEditRequestMessage);
                    AddToCollectionPanel.pendingEditRequestMessage = null;
                } else if (
                    AddToCollectionPanel.lastRequestedCollectionId &&
                    AddToCollectionPanel.lastRequestedFolderId
                ) {
                    // Only send addRequestInCollection for Add mode, not prefillRequest
                    AddToCollectionPanel.postMessageToCurrentPanel({
                        command: 'addRequestInCollection',
                        payload: {
                            collectionId: AddToCollectionPanel.lastRequestedCollectionId,
                            folderPath: AddToCollectionPanel.lastRequestedFolderPath || []
                        }
                    });
                }
                return;
            }
            switch (message.command) {
                case 'addRequestToCollection': {
                    const { collectionId, folderId, ...request } = message.payload;
                    // Add the request to the correct collection or folder in global state
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    const collectionIdx = collections.findIndex(c => c.id === collectionId);
                    console.log('[AddToCollectionPanel] addRequestToCollection payload:', { collectionId, folderId, request });
                    console.log('[AddToCollectionPanel] Headers in add request:', request.headers);
                    console.log('[AddToCollectionPanel] Headers type in add request:', typeof request.headers);
                    if (collectionIdx !== -1) {
                        const newRequest = {
                            ...request,
                            id: AddToCollectionPanel.uuidv4(),
                            timestamp: new Date().toISOString(),
                            description: request.description || '', // Ensure description is set
                        };
                        
                        if (folderId) {
                            // Add to specific folder
                            const addToFolder = (folders: any[]): boolean => {
                                for (let i = 0; i < folders.length; i++) {
                                    if (folders[i].id === folderId) {
                                        folders[i].requests = folders[i].requests || [];
                                        folders[i].requests.unshift(newRequest);
                                        return true;
                                    }
                                    if (folders[i].folders && addToFolder(folders[i].folders)) {
                                        return true;
                                    }
                                }
                                return false;
                            };
                            
                            if (!addToFolder(collections[collectionIdx].folders || [])) {
                                // Folder not found, add to collection root
                                collections[collectionIdx].requests = collections[collectionIdx].requests || [];
                                collections[collectionIdx].requests.unshift(newRequest);
                            }
                        } else {
                            // Add to collection root
                            collections[collectionIdx].requests = collections[collectionIdx].requests || [];
                            collections[collectionIdx].requests.unshift(newRequest);
                        }
                        
                        context.globalState.update('apiSidebar.collections', collections);
                        // Refresh sidebar
                        vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
                        vscode.commands.executeCommand('universalApiNavigator.openTreeView');
                        // Broadcast update to all AddToCollectionPanel webviews
                        vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
                        // Send updated collections to webview
                        AddToCollectionPanel.postMessageToCurrentPanel({
                            command: 'setCollectionsData',
                            payload: {
                                collections,
                                selectedCollectionId: collectionId, // Keep the parent collection selected
                                selectedFolderId: folderId, // Ensure the folder remains selected
                                selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || []
                            }
                        });
                    }
                    break;
                }
                case 'requestCollectionsData': {
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    // Use the current state from the class, which should be the most recent
                    const selectedCollectionId = AddToCollectionPanel.lastRequestedCollectionId || (collections[0]?.id ?? '');
                    const selectedFolderId = AddToCollectionPanel.lastRequestedFolderId;
                    console.log('[AddToCollectionPanel] requestCollectionsData - using state:', { selectedCollectionId, selectedFolderId });
                    AddToCollectionPanel.postMessageToCurrentPanel({
                        command: 'setCollectionsData',
                        payload: {
                            collections,
                            selectedCollectionId,
                            selectedFolderId,
                            selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || []
                        }
                    });
                    break;
                }
                case 'setRequestHiddenState': {
                    const { collectionId, requestId, hidden } = message.payload;
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    const collectionIdx = collections.findIndex(c => c.id === collectionId);
                    if (collectionIdx !== -1) {
                        const reqIdx = collections[collectionIdx].requests?.findIndex((r: any) => r.id === requestId);
                        if (reqIdx !== undefined && reqIdx !== -1) {
                            collections[collectionIdx].requests[reqIdx].hidden = hidden;
                            context.globalState.update('apiSidebar.collections', collections);
                            vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
                            vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
                            // Send updated collections and keep the same collection selected
                            AddToCollectionPanel.postMessageToCurrentPanel({
                                command: 'setCollectionsData',
                                payload: {
                                    collections,
                                    selectedCollectionId: collectionId,
                                    selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || []
                                }
                            });
                        }
                    }
                    break;
                }
                case 'renameRequest': {
                    const { collectionId, requestId, newName, folderPath } = message.payload;
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    const collectionIdx = collections.findIndex(c => c.id === collectionId);
                    if (collectionIdx !== -1) {
                        if (folderPath && folderPath.length > 0) {
                            const parent = findFolderByPath(collections[collectionIdx], folderPath);
                            if (parent && parent.requests) {
                                const reqIndex = parent.requests.findIndex((r: any) => r.id === requestId);
                                if (reqIndex !== -1) {
                                    parent.requests[reqIndex].name = newName;
                                }
                            }
                        } else {
                            const reqIdx = collections[collectionIdx].requests?.findIndex((r: any) => r.id === requestId);
                            if (reqIdx !== undefined && reqIdx !== -1) {
                                collections[collectionIdx].requests[reqIdx].name = newName;
                            }
                        }
                        context.globalState.update('apiSidebar.collections', collections);
                        vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
                        vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
                        AddToCollectionPanel.postMessageToCurrentPanel({
                            command: 'setCollectionsData',
                            payload: { collections, selectedCollectionId: collectionId, selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || [] }
                        });
                    }
                    break;
                }
                case 'duplicateRequest': {
                    const { collectionId, requestId, folderPath } = message.payload;
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    const collectionIdx = collections.findIndex(c => c.id === collectionId);
                    if (collectionIdx !== -1) {
                        if (folderPath && folderPath.length > 0) {
                            const parent = findFolderByPath(collections[collectionIdx], folderPath);
                            if (parent && parent.requests) {
                                const reqIndex = parent.requests.findIndex((r: any) => r.id === requestId);
                                if (reqIndex !== -1) {
                                    const origReq = parent.requests[reqIndex];
                                        const newReq = {
                                            ...origReq,
                                            id: AddToCollectionPanel.uuidv4(),
                                        name: origReq.name || origReq.url,
                                        description: (origReq.description || '') + ' (Copy)',
                                            timestamp: new Date().toISOString(),
                                        };
                                    parent.requests.splice(reqIndex + 1, 0, newReq);
                                }
                            }
                        } else {
                            const reqIdx = collections[collectionIdx].requests?.findIndex((r: any) => r.id === requestId);
                            if (reqIdx !== undefined && reqIdx !== -1) {
                                const origReq = collections[collectionIdx].requests[reqIdx];
                                const newReq = {
                                    ...origReq,
                                    id: AddToCollectionPanel.uuidv4(),
                                    name: origReq.name || origReq.url,
                                    description: (origReq.description || '') + ' (Copy)',
                                    timestamp: new Date().toISOString(),
                                };
                                collections[collectionIdx].requests.splice(reqIdx + 1, 0, newReq);
                            }
                        }
                        context.globalState.update('apiSidebar.collections', collections);
                        vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
                        vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
                        AddToCollectionPanel.postMessageToCurrentPanel({
                            command: 'setCollectionsData',
                            payload: { collections, selectedCollectionId: collectionId, selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || [] }
                        });
                    }
                    break;
                }
                case 'deleteRequest': {
                    const { collectionId, requestId, folderPath } = message.payload;
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    const collectionIdx = collections.findIndex(c => c.id === collectionId);
                    if (collectionIdx !== -1) {
                        if (folderPath && folderPath.length > 0) {
                            const parent = findFolderByPath(collections[collectionIdx], folderPath);
                            if (parent && parent.requests) {
                                const reqIndex = parent.requests.findIndex((r: any) => r.id === requestId);
                                if (reqIndex !== -1) {
                                    parent.requests.splice(reqIndex, 1);
                                }
                            }
                        } else {
                            const reqIdx = collections[collectionIdx].requests?.findIndex((r: any) => r.id === requestId);
                            if (reqIdx !== undefined && reqIdx !== -1) {
                                collections[collectionIdx].requests.splice(reqIdx, 1);
                            }
                        }
                        context.globalState.update('apiSidebar.collections', collections);
                        vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
                        vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
                        AddToCollectionPanel.postMessageToCurrentPanel({
                            command: 'setCollectionsData',
                            payload: { collections, selectedCollectionId: collectionId, selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || [] }
                        });
                    }
                    break;
                }
                case 'updateRequestInCollection': {
                    const { collectionId, requestId, folderPath, ...request } = message.payload;
                    const collections: any[] = context.globalState.get('apiSidebar.collections', []);
                    const collectionIdx = collections.findIndex(c => c.id === collectionId);
                    console.log('[AddToCollectionPanel] updateRequestInCollection payload:', { collectionId, requestId, folderPath, request });
                    console.log('[AddToCollectionPanel] Headers in request:', request.headers);
                    console.log('[AddToCollectionPanel] Headers type:', typeof request.headers);
                    if (collectionIdx !== -1) {
                        if (folderPath && folderPath.length > 0) {
                            const parent = findFolderByPath(collections[collectionIdx], folderPath);
                            console.log('[AddToCollectionPanel] found parent:', parent);
                            if (parent && parent.requests) {
                                const reqIndex = parent.requests.findIndex((r: any) => r.id === requestId);
                                console.log('[AddToCollectionPanel] found reqIndex:', reqIndex);
                                if (reqIndex !== -1) {
                                    parent.requests[reqIndex] = {
                                        ...parent.requests[reqIndex],
                                            ...request,
                                        description: request.description || '',
                                    };
                                } else {
                                    console.error('[AddToCollectionPanel] Request not found in folder:', requestId, folderPath);
                                }
                            } else {
                                console.error('[AddToCollectionPanel] Parent folder not found or has no requests:', folderPath);
                            }
                        } else {
                            const reqIdx = collections[collectionIdx].requests?.findIndex((r: any) => r.id === requestId);
                            if (reqIdx !== undefined && reqIdx !== -1) {
                                collections[collectionIdx].requests[reqIdx] = {
                                    ...collections[collectionIdx].requests[reqIdx],
                                    ...request,
                                    description: request.description || '',
                                };
                            }
                        }
                        context.globalState.update('apiSidebar.collections', collections);
                        vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
                        vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
                        AddToCollectionPanel.postMessageToCurrentPanel({
                            command: 'setCollectionsData',
                            payload: { collections, selectedCollectionId: collectionId, selectedFolderPath: AddToCollectionPanel.lastRequestedFolderPath || [] }
                        });
                    }
                    break;
                }
                case 'editRequestInCollection': {
                    if (AddToCollectionPanel.webviewIsReady) {
                        AddToCollectionPanel.postMessageToCurrentPanel(message);
                    } else {
                        AddToCollectionPanel.pendingEditRequestMessage = message;
                    }
                    break;
                }
            }
        });
    }

    private static uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

// Utility to find folder by path
function findFolderByPath(collection: any, folderPath: string[]): any {
    let parent = collection;
    for (const folderId of folderPath) {
        if (!parent.folders) return null;
        parent = parent.folders.find((f: any) => f.id === folderId);
        if (!parent) return null;
    }
    return parent;
}
