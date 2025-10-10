import * as vscode from 'vscode';
import { getUri, getNonce } from '../utils/vsCodeUtils';
import { AddToCollectionPanel } from '../ui/AddToCollectionPanel';
import { EnvironmentStore } from '../state/EnvironmentStore';
import { EnvironmentManager } from '../state/EnvironmentManager';

/** Message structure for incoming sidebar events */
type SidebarMessage =
  | { command: 'newRequest' }
  | { command: 'loadHistoryItem'; payload: RequestEntry }
  | { command: 'deleteHistoryItem'; payload: string }
  | { command: 'clearHistory' }
  | { command: 'refreshSidebar' }
  | { command: 'contextAction'; payload: { action: string; item: RequestEntry } }
  | { command: 'sectionAction'; payload: { section: string; action: string; name?: string } }
  | { command: 'switchWorkspace' }
  | { command: 'openRawRequest' }
  | { command: 'deleteCollection'; payload: { collectionId: string } }
  | { command: 'collectionContextAction'; payload: { action: string; collectionId: string; newName?: string } }
  | { command: 'deleteRequestFromCollection'; payload: { collectionId: string; requestId: string } }
  | { command: 'loadCollectionRequest'; payload: RequestEntry }
  | { command: 'collectionRequestContextAction'; payload: { action: string; collectionId: string; requestId: string; newName?: string; folderPath?: string[] } }
  | { command: 'addCollection'; payload: { name: string } }
  | { command: 'addFolder'; payload: { collectionId: string; parentFolderId?: string; name: string } }
  | { command: 'addRequest'; payload: { parentCollectionId: string; parentFolderId?: string; name?: string; method?: string; url?: string } }
  | { command: 'deleteFolder'; payload: { folderId: string; parentCollectionId: string } }
  | { command: 'folderContextAction'; payload: { action: string; folderId: string; parentCollectionId: string; newName?: string } }
  | { command: 'setActiveEnvironment'; payload: { id: string } }
  | { command: 'openEnvironmentPanel'; payload: { id: string } }
  | { command: 'openManageEnvironmentPanel' };

/** Represents a single request log entry */
interface RequestEntry {
  id: string;
  method: string;
  url: string;
  timestamp: string;
  hidden?: boolean;
  headers?: any; // Changed from string to any to support objects
  body?: string;
  query?: any; // Changed from string to any to support objects
  auth?: any; // Changed from string to any to support objects
  bodyType?: string;
  rawBody?: string;
  formBody?: any;
  graphqlQuery?: string;
  graphqlVariables?: string;
  tags?: string;
  description?: string;
  preRequestScript?: string;
  testScript?: string;
  name?: string;
  collectionId?: string;
  folderPath?: string[];
}

/** Represents a collection group, now supporting nested folders/items */
interface CollectionEntry {
  id: string;
  name: string;
  endpoints?: number;
  folders?: CollectionEntry[];
  requests?: RequestEntry[];
}

/** Represents an environment */
interface EnvironmentEntry {
  id: string;
  name: string;
  variables: number;
}

/** Represents an API (for APIs section) */
interface ApiEntry {
  name: string;
  version: string;
}

/** Sidebar global state keys */
const STATE_KEYS = {
  history: 'apiSidebar.history',
  collections: 'apiSidebar.collections',
  environments: 'apiSidebar.environments',
  apis: 'apiSidebar.apis',
};

// Utility to find folder by path (move outside class)
function findFolderByPath(collection: CollectionEntry, folderPath?: string[]): CollectionEntry | null {
    let parent: CollectionEntry | null = collection;
    if (folderPath && folderPath.length > 0) {
        for (const folderId of folderPath) {
            parent = parent?.folders?.find(f => f.id === folderId) ?? null;
            if (!parent) return null;
        }
    }
    return parent;
}

// Helper to find the full folder path for a request
function findFolderPathForRequest(collection: CollectionEntry, requestId: string, path: string[] = []): string[] | null {
    if (collection.requests && collection.requests.some(r => r.id === requestId)) {
        return path;
    }
    if (collection.folders) {
        for (const folder of collection.folders) {
            const result = findFolderPathForRequest(folder, requestId, [...path, folder.id]);
            if (result) return result;
        }
    }
    return null;
}

/** Sidebar provider class */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'universalApiNavigator.sidebarView';
  private _view?: vscode.WebviewView;
  private envStore: EnvironmentStore;
  private envManager: EnvironmentManager;

  constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext, envManager?: EnvironmentManager) {
    if (envManager) {
      this.envManager = envManager;
      this.envStore = (envManager as any).store; // Access the store from the manager
    } else {
      this.envStore = new EnvironmentStore(context);
      this.envManager = new EnvironmentManager(this.envStore);
    }
  }

  /** Entry point: resolves and sets up webview */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: SidebarMessage) => this._handleMessage(msg));

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.refreshSidebar();
    });

    this.refreshSidebar();
  }

  /** Central message router */
  private async _handleMessage(msg: SidebarMessage) {
    switch (msg.command) {
      case 'openRawRequest':
        vscode.commands.executeCommand('universalApiNavigator.openRawRequest');
        break;
      case 'loadHistoryItem':
        vscode.commands.executeCommand('universalApiNavigator.openFromHistory', msg.payload);
        break;
      case 'loadCollectionRequest':
        vscode.commands.executeCommand('universalApiNavigator.openFromCollection', msg.payload);
        break;
      case 'deleteHistoryItem':
        this.deleteHistoryItem(msg.payload);
        break;
      case 'clearHistory':
        this.clearHistory();
        break;
      case 'refreshSidebar':
        this.refreshSidebar();
        break;
      case 'contextAction':
        this._handleContextAction(msg.payload.action, msg.payload.item);
        break;
      case 'collectionContextAction':
        this._handleCollectionContextAction(msg.payload.action, msg.payload.collectionId, msg.payload.newName);
        break;
      case 'sectionAction':
        this._handleSectionAction(msg.payload);
        break;
      case 'switchWorkspace':
        vscode.window.showInformationMessage('Workspace/team switcher coming soon!');
        break;
      case 'deleteCollection':
        this._deleteCollection(msg.payload.collectionId);
        break;
      case 'deleteRequestFromCollection':
        this._deleteRequestFromCollection(msg.payload.collectionId, msg.payload.requestId);
        break;
      case 'collectionRequestContextAction': {
        // Pass newName and folderPath if present
        const { action, collectionId, requestId, newName, folderPath } = msg.payload;
        if (action === 'edit') {
          // Open the panel and send only the edit message
          AddToCollectionPanel.createOrShow(this.context, collectionId, undefined, folderPath);
          setTimeout(() => {
            AddToCollectionPanel.postMessageToCurrentPanel({
              command: 'editRequestInCollection',
              payload: { collectionId, request: this._findRequest(collectionId, requestId, folderPath), folderPath }
            });
          }, 200);
        } else {
          this._handleCollectionRequestContextAction(action, collectionId, requestId, newName, folderPath);
        }
        break;
      }
      case 'addCollection': {
        const { name } = msg.payload;
        if (name && typeof name === 'string') {
          const collections = this.getCollections();
          collections.unshift({ id: this._uuid(), name, requests: [] });
          this.setCollections(collections);
          this.refreshSidebar();
          vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
        }
        break;
      }
      case 'addFolder': {
        const { collectionId, parentFolderId, name } = msg.payload;
        if (collectionId && name && typeof name === 'string') {
          const collections = this.getCollections();
          const collectionIdx = collections.findIndex(col => col.id === collectionId);
          if (collectionIdx !== -1) {
            const newFolder = { id: this._uuid(), name, requests: [], folders: [] };
            if (parentFolderId) {
              // Find the parent folder recursively and add the new folder
              function addToParentFolder(folders: any[]): boolean {
                if (!folders) return false;
                for (const folder of folders) {
                  if (folder.id === parentFolderId) {
                    if (!folder.folders) folder.folders = [];
                    folder.folders.unshift(newFolder);
                    return true;
                  }
                  if (addToParentFolder(folder.folders)) return true;
                }
                return false;
              }
              if (addToParentFolder(collections[collectionIdx].folders || [])) {
                // Folder added
              } else {
                // Parent folder not found, fallback to root
                if (!collections[collectionIdx].folders) collections[collectionIdx].folders = [];
                collections[collectionIdx].folders.unshift(newFolder);
              }
            } else {
              if (!collections[collectionIdx].folders) collections[collectionIdx].folders = [];
              collections[collectionIdx].folders.unshift(newFolder);
            }
            this.setCollections(collections);
            this.refreshSidebar();
            vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
          }
        }
        break;
      }
      case 'addRequest': {
        const { parentCollectionId, parentFolderId, name, method, url } = msg.payload;
        // Compute folderPath if parentFolderId is present
        let folderPath = undefined;
        if (parentFolderId) {
          const collections = this.getCollections();
          const collection = collections.find(col => col.id === parentCollectionId);
          if (collection) {
            function findPathToFolder(folderId: string, folders: any[], currentPath: string[] = []): string[] | null {
              for (const folder of folders || []) {
                const newPath = [...currentPath, folder.id];
                if (folder.id === folderId) return newPath;
                const result = findPathToFolder(folderId, folder.folders, newPath);
                if (result) return result;
              }
              return null;
            }
            folderPath = findPathToFolder(parentFolderId, collection.folders || []) || undefined;
          }
        }
        // Open the AddToCollectionPanel for Add mode (no edit message)
        AddToCollectionPanel.createOrShow(this.context, parentCollectionId, parentFolderId, folderPath);
        setTimeout(() => {
          AddToCollectionPanel.postMessageToCurrentPanel({
            command: 'addRequestInCollection',
            payload: {
              collectionId: parentCollectionId,
              folderPath: folderPath || []
            }
          });
          // Only send prefillRequest if there is data to prefill
          if (name || method || url) {
            AddToCollectionPanel.postMessageToCurrentPanel({
              command: 'prefillRequest',
              payload: { parentCollectionId, parentFolderId, name, method, url }
            });
          }
        }, 200);
        break;
      }
      case 'deleteFolder': {
        const { folderId, parentCollectionId } = msg.payload;
        const collections = this.getCollections();
        const collection = collections.find(col => col.id === parentCollectionId);
        if (collection) {
          function removeFolder(folders: any[]): boolean {
            if (!folders) return false;
            const idx = folders.findIndex((f: any) => f.id === folderId);
            if (idx !== -1) {
              folders.splice(idx, 1);
              return true;
            }
            for (const folder of folders) {
              if (removeFolder(folder.folders)) return true;
            }
            return false;
          }
          if (removeFolder(collection.folders || [])) {
            this.setCollections(collections);
            this.refreshSidebar();
            vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
          }
        }
        break;
      }
      case 'folderContextAction': {
        const { action, folderId, parentCollectionId, newName } = msg.payload;
        const collections = this.getCollections();
        const collection = collections.find(col => col.id === parentCollectionId);
        if (collection) {
          function findFolder(folders: any[]): any {
            if (!folders) return null;
            for (const folder of folders) {
              if (folder.id === folderId) return folder;
              const found: any = findFolder(folder.folders);
              if (found) return found;
            }
            return null;
          }
          const folder = findFolder(collection.folders || []);
          if (folder) {
            if (action === 'rename' && typeof newName === 'string' && newName.length > 0) {
              console.log('Renaming folder', folderId, 'in collection', parentCollectionId, 'to', newName);
              console.log('Before rename:', JSON.stringify(folder));
              folder.name = newName;
              this.setCollections(collections);
              this.refreshSidebar();
              vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
              console.log('After rename:', JSON.stringify(folder));
            } else if (action === 'duplicate') {
              const copy = JSON.parse(JSON.stringify(folder));
              copy.id = this._uuid();
              copy.name = folder.name + ' (Copy)';
              if (!collection.folders) collection.folders = [];
              collection.folders.unshift(copy);
              this.setCollections(collections);
              this.refreshSidebar();
              vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
            } else if (action === 'export') {
              vscode.window.showInformationMessage('Export folder: Not implemented yet.');
            } else if (action === 'delete') {
              function removeFolder(folders: any[]): boolean {
                if (!folders) return false;
                const idx = folders.findIndex((f: any) => f.id === folderId);
                if (idx !== -1) {
                  folders.splice(idx, 1);
                  return true;
                }
                for (const folder of folders) {
                  if (removeFolder(folder.folders)) return true;
                }
                return false;
              }
              if (removeFolder(collection.folders || [])) {
                this.setCollections(collections);
                this.refreshSidebar();
                vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
              }
            }
          }
        }
        break;
      }
      case 'setActiveEnvironment': {
        console.log('SidebarProvider: setActiveEnvironment called with ID:', msg.payload.id);
        await this.envManager.load();
        await this.envManager.setActiveEnvironment(msg.payload.id);
        const selectedEnv = this.envManager.getSelectedEnvironment();
        console.log('SidebarProvider: Environment set to:', selectedEnv?.name, selectedEnv?.id);
        this.refreshSidebar();
        // Open/manage panel for selected env, passing the environment ID
        const envId = msg.payload.id;
        console.log('SidebarProvider: Opening manage panel with envId:', envId);
        vscode.commands.executeCommand('universalApiNavigator.openManageEnvironmentPanel', envId);
        break;
      }
      case 'openEnvironmentPanel': {
        const envId = msg.payload.id;
        vscode.commands.executeCommand('universalApiNavigator.openManageEnvironmentPanel', envId);
        break;
      }
      case 'openManageEnvironmentPanel': {
        vscode.commands.executeCommand('universalApiNavigator.openManageEnvironmentPanel');
        break;
      }
    }
  }

  /** Respond to right-click menu */
  private _handleContextAction(action: string, item: RequestEntry & { groupLabel?: string }) {
    switch (action) {
      case 'copyCurl':
        vscode.env.clipboard.writeText(this._toCurl(item));
        vscode.window.showInformationMessage('Copied as cURL!');
        break;
      case 'duplicate':
        this.addToHistory({ ...item, id: this._uuid(), timestamp: new Date().toISOString() });
        break;
      case 'delete':
        this.deleteHistoryItem(item.id);
        break;
    }
  }

  /** Handle section quick actions */
  private async _handleSectionAction(payload: { section: string, action: string, groupLabel?: string, name?: string }) {
    const { section, action, groupLabel, name } = payload;
    switch (section) {
      case 'History':
        if (action === 'clear') this.clearHistory();
        if (action === 'clearGroup' && groupLabel) this.clearHistoryGroup(groupLabel);
        break;
      case 'Collections':
        if (action === 'add') await this.addCollection();
        if (action === 'import') await this.importCollections();
        if (action === 'clear') await this.clearCollections();
        break;
      case 'Environments':
        if (action === 'add') {
          if (name && typeof name === 'string') {
            // Create environment using EnvironmentManager instead of local storage
            await this.envManager.load();
            await this.envManager.createEnvironment(name);
          }
        }
        if (action === 'import') await this.importEnvironments();
        if (action === 'clear') await this.clearEnvironments();
        break;
      case 'APIs':
        if (action === 'add') await this.addApi();
        if (action === 'clear') await this.clearApis();
        break;
    }
    this.refreshSidebar();
  }

  private clearHistoryGroup(groupLabel: string) {
    const entries = this.getHistory();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const isSameDay = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    const getLabel = (entryDate: Date) => {
      if (isSameDay(entryDate, today)) return 'Today';
      if (isSameDay(entryDate, yesterday)) return 'Yesterday';
      return entryDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: today.getFullYear() !== entryDate.getFullYear() ? 'numeric' : undefined,
      });
    };

    // Debug log: show all entry labels
    const labelMap = entries.map(entry => ({ id: entry.id, label: getLabel(new Date(entry.timestamp)), url: entry.url }));
    console.log('[clearHistoryGroup] groupLabel:', groupLabel, 'All entry labels:', labelMap);

    const updated = entries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return getLabel(entryDate) !== groupLabel;
    });
    const deleted = entries.filter(entry => {
      const entryDate = new Date(entry.timestamp);
      return getLabel(entryDate) === groupLabel;
    });
    console.log('[clearHistoryGroup] Deleted entries:', deleted);
    this.setHistory(updated);
  }

  public deleteHistoryItem(id: string) {
    console.log('[deleteHistoryItem] Deleting id:', id);
    const updated = this.getHistory().filter((item) => item.id !== id);
    this.setHistory(updated);
    this.refreshSidebar();
  }

  // ========== State Management for All Sections ==========

  // --- History (already implemented) ---
  private readonly STATE_KEY = STATE_KEYS.history;
  private getHistory(): RequestEntry[] {
    return this.context.globalState.get<RequestEntry[]>(STATE_KEYS.history, []);
  }
  private setHistory(entries: RequestEntry[]) {
    this.context.globalState.update(STATE_KEYS.history, entries);
  }
  public addToHistory(entry: RequestEntry) {
    const entries = this.getHistory();
    entries.unshift(entry);
    this.setHistory(entries.slice(0, 100));
    this.refreshSidebar();
  }
  private clearHistory() {
    this.setHistory([]);
    this.refreshSidebar();
  }

  // --- Collections ---
  private getCollections(): CollectionEntry[] {
    // Filter out requests with hidden=true
    const collections = this.context.globalState.get<CollectionEntry[]>(STATE_KEYS.collections, []);
    return collections.map(col => ({
      ...col,
      requests: (col.requests || []).filter(req => !req.hidden)
    }));
  }
  private setCollections(entries: CollectionEntry[]) {
    this.context.globalState.update(STATE_KEYS.collections, entries);
  }
  private async addCollection() {
    const name = await vscode.window.showInputBox({ prompt: 'Collection name' });
    if (name) {
      const collections = this.getCollections();
      collections.unshift({ id: this._uuid(), name, requests: [] });
      this.setCollections(collections);
      this.refreshSidebar();
      vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
    }
  }
  private async importCollections() {
    vscode.window.showInformationMessage('Import collections: Not implemented yet.');
  }
  private async clearCollections() {
    this.setCollections([]);
  }

  // --- Environments --- (Now using EnvironmentManager)
  private async getEnvironments(): Promise<EnvironmentEntry[]> {
    await this.envManager.load();
    const envs = this.envManager.getEnvironments();
    return envs.map(e => ({ id: e.id, name: e.name, variables: e.variables?.length || 0 }));
  }
  private async addEnvironment() {
    const name = await vscode.window.showInputBox({ prompt: 'Environment name' });
    if (name) {
      await this.envManager.load();
      await this.envManager.createEnvironment(name);
    }
  }
  private async importEnvironments() {
    try {
      // Show file picker for JSON files
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'JSON Files': ['json'],
          'All Files': ['*']
        },
        title: 'Select Environment JSON File to Import'
      });

      if (fileUri && fileUri[0]) {
        const fileContent = await vscode.workspace.fs.readFile(fileUri[0]);
        const jsonString = Buffer.from(fileContent).toString('utf8');
        
        console.log('Importing environments from file:', fileUri[0].fsPath);
        await this.envManager.importEnvironments(jsonString);
        
        vscode.window.showInformationMessage('Environments imported successfully!');
        this.refreshSidebar();
      }
    } catch (error: any) {
      console.error('Error importing environments:', error);
      vscode.window.showErrorMessage(`Failed to import environments: ${error.message}`);
    }
  }
  private async clearEnvironments() {
    // Clear environments through EnvironmentManager
    await this.envManager.load();
    const envs = this.envManager.getEnvironments();
    for (const env of envs) {
      await this.envManager.deleteEnvironment(env.id);
    }
  }

  // --- APIs ---
  private getApis(): ApiEntry[] {
    return this.context.globalState.get<ApiEntry[]>(STATE_KEYS.apis, []);
  }
  private setApis(entries: ApiEntry[]) {
    this.context.globalState.update(STATE_KEYS.apis, entries);
  }
  private async addApi() {
    const name = await vscode.window.showInputBox({ prompt: 'API name' });
    if (name) {
      const version = await vscode.window.showInputBox({ prompt: 'API version' });
      const apis = this.getApis();
      apis.unshift({ name, version: version || 'v1.0' });
      this.setApis(apis);
    }
  }
  private async clearApis() {
    this.setApis([]);
  }

  // ========== Sidebar Refresh ========== (now uses state)
  public async refreshSidebar() {
    await this.envManager.load();
    const envs = this.envManager.getEnvironments();
    const selectedEnv = this.envManager.getSelectedEnvironment();
    const environmentEntries = await this.getEnvironments();
    
    console.log('RefreshSidebar - Environment data:', {
      envsFromManager: envs.length,
      selectedEnv: selectedEnv?.name,
      environmentEntries: environmentEntries.length
    });
    
    const payload = {
      user: {
        name: 'Dev Pro',
        workspace: 'My Workspace',
        team: 'API Team',
        avatar: '',
      },
      collections: this.getCollections(),
      environments: environmentEntries,
      selectedEnvironmentId: selectedEnv?.id,
      apis: this.getApis(),
      history: this._groupHistoryByDate(this.getHistory()),
    };
    this._postMessage({ command: 'setSidebarData', payload });
  }

  /**
   * Group history entries by date (Today, Yesterday, or date string)
   */
  private _groupHistoryByDate(entries: RequestEntry[]) {
    const groups: { label: string; items: RequestEntry[] }[] = [];
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    const dateMap: Record<string, RequestEntry[]> = {};
    for (const entry of entries) {
      const entryDate = new Date(entry.timestamp);
      let label = entry.timestamp ? entry.timestamp : '';
      if (isSameDay(entryDate, today)) label = 'Today';
      else if (isSameDay(entryDate, yesterday)) label = 'Yesterday';
      else label = entryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: today.getFullYear() !== entryDate.getFullYear() ? 'numeric' : undefined });
      if (!dateMap[label]) dateMap[label] = [];
      dateMap[label].push(entry);
    }
    for (const label of Object.keys(dateMap)) {
      groups.push({ label, items: dateMap[label] });
    }
    return groups;
  }

  /** Send message to webview */
  private _postMessage(msg: any) {
    this._view?.webview.postMessage(msg);
  }

  // ─── HTML Content ─────────────────────────────────────────────

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = getUri(webview, this.extensionUri, ['media', 'sidebar.css']);
    const scriptUri = getUri(webview, this.extensionUri, ['media', 'sidebar.js']);
    const codiconsUri = getUri(webview, this.extensionUri, ['node_modules', '@vscode', 'codicons', 'dist', 'codicon.css']);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${codiconsUri}" rel="stylesheet" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>API Sidebar</title>
</head>
<body>
  <div class="sidebar-root"><!-- Rendered by JS --></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  // ─── Utilities ─────────────────────────────────────────────

  private _toCurl(entry: RequestEntry): string {
    return `curl -X ${entry.method || 'GET'} "${entry.url}"`;
  }

  private _uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private _deleteCollection(collectionId: string) {
    const collections = this.getCollections();
    const updated = collections.filter(col => col.id !== collectionId);
    this.setCollections(updated);
    this.refreshSidebar();
    vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
  }

  private _handleCollectionContextAction(action: string, collectionId: string, newName?: string) {
    const collections = this.getCollections();
    const collectionIdx = collections.findIndex(col => col.id === collectionId);
    if (collectionIdx === -1) return;
    switch (action) {
      case 'add-request': {
        vscode.commands.executeCommand('universalApiNavigator.openAddToCollection', collectionId);
        break;
      }
      case 'add-folder': {
        vscode.window.showInputBox({ prompt: 'Folder name' }).then(folderName => {
          if (folderName) {
            const newFolder = { id: this._uuid(), name: folderName, requests: [], folders: [] };
            if (!collections[collectionIdx].folders) collections[collectionIdx].folders = [];
            collections[collectionIdx].folders!.unshift(newFolder);
            this.setCollections(collections);
            this.refreshSidebar();
            vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
          }
        });
        break;
      }
      case 'rename': {
        if (newName) {
          collections[collectionIdx].name = newName;
          this.setCollections(collections);
          this.refreshSidebar();
          vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
          break;
        }
        vscode.window.showInputBox({ prompt: 'Rename collection', value: collections[collectionIdx].name }).then(inputName => {
          if (inputName && inputName !== collections[collectionIdx].name) {
            collections[collectionIdx].name = inputName;
            this.setCollections(collections);
            this.refreshSidebar();
            vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
          }
        });
        break;
      }
      case 'duplicate': {
        const orig = collections[collectionIdx];
        const copy = {
          ...orig,
          id: this._uuid(),
          name: orig.name + ' (Copy)',
          requests: orig.requests ? orig.requests.map(r => ({ ...r, id: this._uuid(), timestamp: new Date().toISOString() })) : [],
          folders: orig.folders ? orig.folders.map(f => ({ ...f, id: this._uuid() })) : [],
        };
        collections.splice(collectionIdx + 1, 0, copy);
        this.setCollections(collections);
        this.refreshSidebar();
        vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
        break;
      }
      case 'export': {
        const col = collections[collectionIdx];
        const json = JSON.stringify(col, null, 2);
        vscode.env.clipboard.writeText(json);
        vscode.window.showInformationMessage('Collection exported to clipboard as JSON!');
        break;
      }
    }
  }

  private _deleteRequestFromCollection(collectionId: string, requestId: string) {
    const collections = this.getCollections();
    const updated = collections.map(col => {
      if (col.id === collectionId) {
        return {
          ...col,
          requests: (col.requests || []).filter(req => req.id !== requestId)
        };
      }
      return col;
    });
    this.setCollections(updated);
    this.refreshSidebar();
    vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
  }

  private async _handleCollectionRequestContextAction(action: string, collectionId: string, requestId: string, newName?: string, folderPath?: string[]) {
    console.log('[SidebarProvider] _handleCollectionRequestContextAction:', { action, collectionId, requestId, newName, folderPath });
    const collections = this.getCollections();
    const collection = collections.find(col => col.id === collectionId);
    if (!collection) return;

    // Find the parent folder/collection and the request itself
    const parent = findFolderByPath(collection, folderPath);
    if (!parent) return;

    const requestIndex = parent.requests?.findIndex(req => req.id === requestId) ?? -1;
    if (requestIndex === -1) return;
    const request = parent.requests![requestIndex];

    switch (action) {
      case 'edit': {
        // Compute the full folder path for the request
        const fullFolderPath = findFolderPathForRequest(collection, requestId) || [];
        // Always fetch the latest request object from state
        const latestCollections = this.getCollections();
        const latestCollection = latestCollections.find(col => col.id === collectionId);
        let latestRequest = null;
        if (latestCollection) {
          const latestParent = findFolderByPath(latestCollection, fullFolderPath);
          if (latestParent && latestParent.requests) {
            latestRequest = latestParent.requests.find(r => r.id === requestId);
          }
        }
            vscode.commands.executeCommand('universalApiNavigator.openCollectionEditor', { 
                collectionId, 
          request: latestRequest || request,
          folderPath: fullFolderPath
            });
            break;
      }
        case 'rename':
            if (newName && newName !== request.name) {
                request.name = newName;
                this.setCollections(collections);
                this.refreshSidebar();
          // Always send selectedFolderPath for folder requests
          this._postMessage({
            command: 'setCollectionsData',
            payload: {
              collections,
              selectedCollectionId: collectionId,
              selectedFolderPath: folderPath && folderPath.length > 0 ? folderPath : undefined
            }
          });
          break;
            }
            break;
        case 'duplicate':
            const newId = this._uuid();
            const duplicatedRequest = { ...request, id: newId, name: `${request.name} (Copy)` };
        parent.requests!.splice(requestIndex + 1, 0, duplicatedRequest);
            this.setCollections(collections);
            this.refreshSidebar();
            break;
        case 'delete':
        parent.requests!.splice(requestIndex, 1);
            this.setCollections(collections);
            this.refreshSidebar();
            vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
            break;
    }
    vscode.commands.executeCommand('universalApiNavigator.refreshCollectionsPanel');
}
  
  /** Find a request by collectionId, requestId, and folderPath */
  private _findRequest(collectionId: string, requestId: string, folderPath?: string[]): RequestEntry | undefined {
    const collections = this.getCollections();
    const collection = collections.find(col => col.id === collectionId);
    if (!collection) return undefined;
    let parent: CollectionEntry | undefined = collection;
    if (folderPath && folderPath.length > 0) {
      for (const folderId of folderPath) {
        parent = parent?.folders?.find(f => f.id === folderId);
        if (!parent) return undefined;
      }
    }
    return parent?.requests?.find(r => r.id === requestId);
  }
}
