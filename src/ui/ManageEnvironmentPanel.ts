import * as vscode from 'vscode';
import { getUri, getNonce } from '../utils/vsCodeUtils';
import { EnvironmentManager } from '../state/EnvironmentManager';
import { Environment, EnvironmentVariable } from '../types';

export class ManageEnvironmentPanel {
  public static readonly viewType = 'universalApiNavigator.manageEnvironmentPanel';
  
  private static currentPanel: vscode.WebviewPanel | undefined;
  private static envManagerInstance: EnvironmentManager;

  public static async createOrShow(
    context: vscode.ExtensionContext,
    envManager: EnvironmentManager,
    environmentId?: string
  ) {
    ManageEnvironmentPanel.envManagerInstance = envManager;

    if (ManageEnvironmentPanel.currentPanel) {
      ManageEnvironmentPanel.currentPanel.reveal(vscode.ViewColumn.Active);
      // Send the environment ID to the existing panel
      if (environmentId) {
        ManageEnvironmentPanel.postMessageToCurrentPanel({
          command: 'setCurrentEnvironment',
          payload: { environmentId }
        });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ManageEnvironmentPanel.viewType,
      'Manage Environments',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    ManageEnvironmentPanel.currentPanel = panel;
    panel.webview.html = ManageEnvironmentPanel.getHtml(panel.webview, context);
    ManageEnvironmentPanel.handleMessages(panel.webview);
    
    panel.onDidDispose(() => {
      ManageEnvironmentPanel.currentPanel = undefined;
    }, null, context.subscriptions);

    // Send initial environment data
    setTimeout(() => {
      ManageEnvironmentPanel.sendEnvironmentData(environmentId);
    }, 100);
  }

  public static postMessageToCurrentPanel(message: any) {
    if (ManageEnvironmentPanel.currentPanel) {
      ManageEnvironmentPanel.currentPanel.webview.postMessage(message);
    } else {
      console.warn('ManageEnvironmentPanel: No current panel to post message to.');
    }
  }

  private static async sendEnvironmentData(selectedEnvironmentId?: string) {
    try {
      await ManageEnvironmentPanel.envManagerInstance.load();
      const environments = ManageEnvironmentPanel.envManagerInstance.getEnvironments();
      let selectedEnv = undefined;

      if (selectedEnvironmentId) {
        selectedEnv = environments.find(e => e.id === selectedEnvironmentId);
      }

      if (!selectedEnv) {
        selectedEnv = ManageEnvironmentPanel.envManagerInstance.getSelectedEnvironment();
      }

      ManageEnvironmentPanel.postMessageToCurrentPanel({
        command: 'environmentsData',
        payload: {
          environments,
          selectedEnvironment: selectedEnv
        }
      });
    } catch (error) {
      console.error('Error sending environment data:', error);
    }
  }

  private static getHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const nonce = getNonce();
    const styleUri = getUri(webview, context.extensionUri, ['media', 'manageEnvironment.css']);
    const scriptUri = getUri(webview, context.extensionUri, ['media', 'manageEnvironment.js']);
    const codiconsUri = getUri(webview, context.extensionUri, ['media', 'codicon.css']);

    const csp = `
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}';
        img-src ${webview.cspSource} data:;
        font-src ${webview.cspSource};
        connect-src *;
        frame-src 'self' blob:;
    `.replace(/\s+/g, ' ').trim();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage Environments</title>
    <link href="${codiconsUri}" rel="stylesheet">
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <input type="text" class="env-title" id="env-title" placeholder="No environment selected" readonly>
                <div class="env-status inactive" id="env-status">
                    <div class="status-dot"></div>
                    <span>Inactive</span>
                </div>
            </div>
            <div class="header-actions">
                <button class="btn" id="refresh-btn">
                    <i class="codicon codicon-refresh"></i>
                    Refresh
                </button>
                <button class="btn" id="export-btn">
                    <i class="codicon codicon-export"></i>
                    Export
                </button>
                <button class="btn btn-danger" id="delete-btn">
                    <i class="codicon codicon-trash"></i>
                    Delete
                </button>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="toolbar">
            <div class="toolbar-left">
                <div class="search-wrapper">
                    <input type="text" class="search-input" id="filter-input" placeholder="Filter variables...">
                    <i class="codicon codicon-search search-icon"></i>
                </div>
            </div>
            <div class="toolbar-right">
                <button class="bulk-btn" id="enable-all-btn">Enable All</button>
                <button class="bulk-btn" id="disable-all-btn">Disable All</button>
                <button class="bulk-btn" id="clear-values-btn">Clear Values</button>
                <button class="bulk-btn" id="reset-values-btn">Reset Values</button>
            </div>
        </div>

        <!-- Variables Table -->
        <div class="table-section">
            <div class="table-container">
                <table class="variables-table">
                    <thead>
                        <tr>
                            <th class="col-checkbox">
                                <input type="checkbox" id="select-all-checkbox">
                            </th>
                            <th class="col-variable">Variable</th>
                            <th class="col-type">Type</th>
                            <th class="col-initial">Initial Value</th>
                            <th class="col-current">Current Value</th>
                            <th class="col-actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="variables-tbody">
                        <tr class="empty-state">
                            <td colspan="6">
                                <div class="empty-content">
                                    <div class="empty-icon">
                                        <i class="codicon codicon-server-environment"></i>
                                    </div>
                                    <div class="empty-title">No environment selected</div>
                                    <div class="empty-subtitle">Select an environment from the sidebar to manage its variables</div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private static handleMessages(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (message) => {
      console.log('ManageEnvironmentPanel received message:', message);
      
      try {
        switch (message.command) {
          case 'getEnvironments':
            await ManageEnvironmentPanel.sendEnvironmentData();
            break;
            
          case 'setCurrentEnvironment':
            await ManageEnvironmentPanel.sendEnvironmentData(message.payload.environmentId);
            break;
            
          case 'deleteEnvironment':
            console.log('Deleting environment with ID:', message.payload.id);
            await ManageEnvironmentPanel.envManagerInstance.deleteEnvironment(message.payload.id);
            await ManageEnvironmentPanel.sendEnvironmentData();
            // Refresh the sidebar
            vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
            break;
            
          case 'renameEnvironment':
            await ManageEnvironmentPanel.envManagerInstance.renameEnvironment(message.payload.id, message.payload.newName);
            await ManageEnvironmentPanel.sendEnvironmentData(message.payload.id);
            vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
            break;
            
          case 'createEnvironment':
            const newEnv = await ManageEnvironmentPanel.envManagerInstance.createEnvironment(message.payload.name);
            await ManageEnvironmentPanel.sendEnvironmentData(newEnv.id);
            vscode.commands.executeCommand('universalApiNavigator.refreshSidebar');
            break;
            
          case 'addVariable':
            await ManageEnvironmentPanel.envManagerInstance.addVariable(message.payload.envId, message.payload.variable);
            await ManageEnvironmentPanel.sendEnvironmentData(message.payload.envId);
            break;
            
          case 'updateVariable':
            await ManageEnvironmentPanel.envManagerInstance.updateVariable(message.payload.envId, message.payload.varId, message.payload.variable);
            await ManageEnvironmentPanel.sendEnvironmentData(message.payload.envId);
            break;
            
          case 'deleteVariable':
            await ManageEnvironmentPanel.envManagerInstance.deleteVariable(message.payload.envId, message.payload.varId);
            await ManageEnvironmentPanel.sendEnvironmentData(message.payload.envId);
            break;
            
          case 'updateEnvironment':
            await ManageEnvironmentPanel.envManagerInstance.updateEnvironment(message.payload.id, message.payload.variables, message.payload.name);
            await ManageEnvironmentPanel.sendEnvironmentData(message.payload.id);
            break;
            
          case 'exportEnvironment':
            console.log('Exporting environment with ID:', message.payload.id);
            const json = await ManageEnvironmentPanel.envManagerInstance.exportEnvironments([message.payload.id]);
            
            // Use VSCode's save dialog instead of browser download
            const uri = await vscode.window.showSaveDialog({
              filters: { 'JSON Files': ['json'] },
              defaultUri: vscode.Uri.file(`${message.payload.name || 'environment'}.json`)
            });

            if (uri) {
              await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
              vscode.window.showInformationMessage(`Environment exported to ${uri.fsPath}`);
            }
            break;
        }
      } catch (error: any) {
        console.error('ManageEnvironmentPanel Error:', error);
        webview.postMessage({
          command: 'showError',
          payload: { message: error.message }
        });
      }
    });
  }

} 