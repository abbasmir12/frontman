import * as vscode from 'vscode';
// Ensure these types are correctly imported
import { IMethodDefinition, WebviewMessage, RunRequestPayload, ResponseReceivedPayload } from '../types';
import { RequestHandler } from '../request/RequestHandler';
import { CodeGenerator } from '../codegen/CodeGenerator';
// CORRECTED: Import getUri and getNonce from the utils file
import { getUri, getNonce } from '../utils/vsCodeUtils'; // Helper to get webview resource URIs


/**
 * Manages webview panels for API request editing and execution.
 * Ensures only one panel per method (or handles multiple if designed that way).
 */
export class RequestEditorPanelManager {
    public static readonly viewType = 'universalApiNavigator.requestEditor';
    private panels: Map<string, vscode.WebviewPanel> = new Map(); // Map methodId to panel

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly requestHandler: RequestHandler,
        private readonly codeGenerator: CodeGenerator
    ) { }

    /**
     * Creates or shows a webview panel for the given API method.
     * @param method The method definition to open in the editor.
     */
    public createOrShow(method: IMethodDefinition) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel for this method, reveal it.
        const existingPanel = this.panels.get(method.id);
        if (existingPanel) {
            existingPanel.reveal(column);
            // Optional: Send updated schema/context if needed
            existingPanel.webview.postMessage({
                command: 'schemaLoaded',
                payload: method // Send the method schema details to the webview
            } as WebviewMessage);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            RequestEditorPanelManager.viewType, // Identifies the type of the webview
            `API: ${method.name}`, // Title of the panel
            column || vscode.ViewColumn.One, // Show in a new column or column 1
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                // Restrict the webview to only loading content from our extension's `media` directory.
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
                // Retain context when hidden
                retainContextWhenHidden: true
            }
        );

        // Set the HTML content for the webview
        panel.webview.html = this.getWebviewContent(panel.webview);

        // Store the panel
        this.panels.set(method.id, panel);

        // Send the initial schema data to the webview once it's ready
        // You might need to wait for a 'webviewReady' message from the webview JS

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                console.log(`Received message from webview: ${message.command}`);
                switch (message.command) {
                    case 'runRequest':
                        const runPayload = message.payload as RunRequestPayload;
                        try {
                            // Execute the request using the backend handler
                            const response = await this.requestHandler.runRequest(runPayload);
                            // Send the response back to the webview
                            panel.webview.postMessage({
                                command: 'responseReceived',
                                payload: response
                            } as WebviewMessage);
                        } catch (error: any) {
                            console.error('Request execution failed:', error);
                            panel.webview.postMessage({
                                command: 'showError',
                                payload: { message: error.message || 'An unknown error occurred during request execution.' }
                            } as WebviewMessage);
                            // Also show error in VS Code notification
                            vscode.window.showErrorMessage(`Request failed: ${error.message}`);
                        }
                        return; // Don't re-run this command on the extension side directly

                    case 'generateCodeStub':
                        // Define payload type based on what the webview sends
                        const codePayload = message.payload as { methodId: string; language: string };
                        try {
                            // Generate code using the backend generator
                            const code = await this.codeGenerator.generateCode(codePayload.methodId, codePayload.language);
                            // Send the generated code back to the webview
                            panel.webview.postMessage({
                                command: 'codeGenerated',
                                payload: code
                            } as WebviewMessage);

                        } catch (error: any) {
                            console.error('Code generation failed:', error);
                            panel.webview.postMessage({
                                command: 'showError',
                                payload: { message: error.message || 'An unknown error occurred during code generation.' }
                            } as WebviewMessage);
                            vscode.window.showErrorMessage(`Code generation failed: ${error.message}`);
                        }
                        return;

                    case 'webviewReady':
                        console.log('Webview signaled ready, sending schema...');
                        panel.webview.postMessage({
                            command: 'schemaLoaded',
                            payload: method
                        } as WebviewMessage);
                        break;


                    // TODO: Handle 'saveRequest', 'loadRequest', 'updateEnvironment' etc.
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Handle panel closure
        panel.onDidDispose(() => {
            this.panels.delete(method.id);
        }, null, this.context.subscriptions);
    }

    public openRawEditor() {
  const panel = vscode.window.createWebviewPanel(
    RequestEditorPanelManager.viewType,
    '📝 Raw API Request',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = this.getWebviewContent(panel.webview, true); // true = rawMode

  panel.webview.onDidReceiveMessage(
    async (message: WebviewMessage) => {
      if (message.command === 'runRequest') {
        const response = await this.requestHandler.runRequest(message.payload);
        panel.webview.postMessage({ command: 'responseReceived', payload: response });
      }
    },
    undefined,
    this.context.subscriptions
  );
}


    /**
     * Generates the HTML content for the webview.
     * @param webview The webview instance.
     * @param rawMode Optional. If true, render in raw mode.
     */
    private getWebviewContent(webview: vscode.Webview, rawMode=false): string {
        // Local path to script and css for the webview
        const scriptUri = getUri(webview, this.context.extensionUri, ['media', 'webview.js']);
        const styleUri = getUri(webview, this.context.extensionUri, ['media', 'webview.css']);

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        // TODO: Build a more sophisticated HTML structure for request/response split view and dynamic form

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts from our extension directory, or the ones we add via the nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>API Request Editor</title>
			</head>
			<body>
				<h1>API Method: <span id="method-name">Loading...</span></h1>

                <div id="request-section">
                    <h2>Request</h2>
                    <div id="request-form"><!-- Dynamic form based on schema goes here --></div>
                    <div>
                        <h3>Headers</h3>
                        <div id="request-headers"><!-- Headers input goes here --></div>
                    </div>
                    <button id="run-request-button">Run Request</button>
                    <button id="generate-code-button">Generate Code</button>
                    <!-- TODO: Add Environment selection, Auth config, Save/Load request -->
                </div>

                <hr>

                 <div id="codegen-output" style="display: none;">
                     <h2>Generated Code</h2>
                     <pre><code id="generated-code-display"></code></pre>
                     <button id="copy-code-button">Copy Code</button>
                 </div>

                <hr>

                <div id="response-section">
                    <h2>Response</h2>
                    <div id="response-status">Status: N/A</div>
                    <div id="response-time">Time: N/A</div>
                    <h3>Headers</h3>
                    <pre id="response-headers-display"></pre>
                    <h3>Body</h3>
                    <pre><code id="response-body-display"></code></pre> <!-- Use <code> for code/JSON -->
                </div>

                <button id="toggle-mode-button">Use Raw Mode</button>

<!-- Wrap request form in a container for toggle visibility -->
<div id="schema-mode-form">
  <div id="request-form"></div>
</div>

<!-- Raw mode inputs (initially hidden) -->
<div id="raw-mode-form" style="display: none;">
  <h3>Raw Request</h3>
  <label>URL:</label>
  <input type="text" id="raw-url" placeholder="https://api.example.com/path">
  
  <label>Method:</label>
  <input type="text" id="raw-method" placeholder="GET, POST, etc.">
  
  <label>Body:</label>
  <textarea id="raw-body" rows="6" placeholder='{"key": "value"}'></textarea>
</div>


				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

// CORRECTED: Remove the duplicate getNonce function as it's now in utils