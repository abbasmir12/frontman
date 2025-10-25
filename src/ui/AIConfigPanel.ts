import * as vscode from 'vscode';
import { getUri, getNonce } from '../utils/vsCodeUtils';
import { AIRequestService, AIProvider, AIConfig } from '../request/AIRequestService';

/**
 * Manages the AI Configuration Webview panel.
 * This panel allows users to configure AI settings for generating cURL commands.
 */
export class AIConfigPanel {
    public static readonly viewType = 'universalApiNavigator.aiConfig';

    private static currentPanel: vscode.WebviewPanel | undefined;
    private static disposables: vscode.Disposable[] = [];

    /**
     * Creates or shows the AI Configuration panel
     */
    public static createOrShow(context: vscode.ExtensionContext) {
        if (AIConfigPanel.currentPanel) {
            AIConfigPanel.currentPanel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            AIConfigPanel.viewType,
            'AI Configuration',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
                retainContextWhenHidden: true,
            }
        );

        AIConfigPanel.currentPanel = panel;
        panel.webview.html = AIConfigPanel.getHtml(panel.webview, context);

        // Handle panel disposal
        panel.onDidDispose(() => {
            AIConfigPanel.currentPanel = undefined;
            AIConfigPanel.disposables.forEach(d => d.dispose());
            AIConfigPanel.disposables = [];
        }, null, context.subscriptions);

        // Handle messages from webview
        AIConfigPanel.disposables.push(
            panel.webview.onDidReceiveMessage(async (message) => {
                await AIConfigPanel.handleMessage(message, context);
            })
        );

        // Load current configuration
        AIConfigPanel.loadCurrentConfig(panel.webview, context);
    }

    private static getHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        const nonce = getNonce();
        const styleUri = getUri(webview, context.extensionUri, ['media', 'aiConfig.css']);
        const scriptUri = getUri(webview, context.extensionUri, ['media', 'aiConfig.js']);

        const csp = `
            default-src 'none';
            style-src ${webview.cspSource} 'unsafe-inline';
            script-src 'nonce-${nonce}';
            img-src ${webview.cspSource} data:;
            font-src ${webview.cspSource};
            connect-src https://router.huggingface.co;
        `.replace(/\s+/g, ' ').trim();

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="${csp}">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Configuration</title>
                <link href="${styleUri}" rel="stylesheet">
            </head>
            <body>
                <div class="ai-config-container">
                    <div class="ai-config-header">
                        <h1>AI-Powered Request Configuration</h1>
                        <p>Configure your AI settings to generate cURL commands from natural language prompts</p>
                    </div>

                    <div class="ai-config-form">
                        <!-- Provider Selection -->
                        <div class="form-group">
                            <label for="ai-provider-select">AI Provider</label>
                            <div class="custom-dropdown" id="provider-dropdown" data-selected-value="huggingface">
                                <div class="dropdown-selected" tabindex="0">
                                    <span id="selected-provider-text">Hugging Face</span>
                                    <span class="dropdown-arrow"></span>
                                </div>
                                <ul class="dropdown-menu hidden">
                                    <li data-value="huggingface" class="active">
                                        <span class="dropdown-menu-checkmark">✓</span>
                                        Hugging Face
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <!-- Model Selection -->
                        <div class="form-group">
                            <label for="ai-model-select">Model</label>
                            <div class="custom-dropdown" id="model-dropdown" data-selected-value="openai/gpt-oss-120b">
                                <div class="dropdown-selected" tabindex="0">
                                    <span id="selected-model-text">openai/gpt-oss-120b</span>
                                    <span class="dropdown-arrow"></span>
                                </div>
                                <ul class="dropdown-menu hidden">
                                    <li data-value="openai/gpt-oss-120b" class="active">
                                        <span class="dropdown-menu-checkmark">✓</span>
                                        openai/gpt-oss-120b
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <!-- API Key Input -->
                        <div class="form-group">
                            <label for="ai-api-key">API Key</label>
                            <div class="input-with-button">
                                <input type="password" id="ai-api-key" placeholder="Enter your Hugging Face API key" spellcheck="false" />
                                <button id="toggle-api-key" class="toggle-visibility-btn" title="Toggle API key visibility">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="input-help">
                                <a href="https://huggingface.co/settings/tokens" target="_blank" class="help-link">
                                    Get your API key from Hugging Face
                                </a>
                            </div>
                        </div>

                        <!-- Test Configuration -->
                        <div class="form-group">
                            <button id="test-config-btn" class="test-btn">
                                <span class="btn-text">Test Configuration</span>
                                <span class="btn-spinner hidden"></span>
                            </button>
                            <div id="test-result" class="test-result hidden"></div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="form-actions">
                            <button id="save-config-btn" class="primary-btn">Save Configuration</button>
                            <button id="cancel-btn" class="secondary-btn">Cancel</button>
                        </div>
                    </div>

                    <!-- Info Section -->
                    <div class="ai-config-info">
                        <h3>ℹ️ How it works</h3>
                        <ol>
                            <li>Configure your AI provider and API key above</li>
                            <li>Open the Raw Request panel</li>
                            <li>Click the "AI Generate" button</li>
                            <li>Describe your request in natural language</li>
                            <li>The AI will generate a cURL command and populate all fields automatically</li>
                        </ol>

                        <h3>🔒 Privacy</h3>
                        <p>Your API keys are stored securely in VS Code settings and are never transmitted to our servers.</p>
                    </div>
                </div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }

    private static async handleMessage(message: any, context: vscode.ExtensionContext) {
        switch (message.command) {
            case 'saveConfig':
                await this.saveConfig(message.payload, context);
                break;
            case 'testConfig':
                await this.testConfig(message.payload, AIConfigPanel.currentPanel?.webview);
                break;
            case 'getCurrentConfig':
                await this.loadCurrentConfig(AIConfigPanel.currentPanel?.webview, context);
                break;
        }
    }

    private static async saveConfig(config: AIConfig, context: vscode.ExtensionContext) {
        try {
            // Validate configuration
            if (!AIRequestService.validateConfig(config)) {
                throw new Error('Invalid configuration: All fields are required');
            }

            // Save to VS Code settings
            const settingsConfig = vscode.workspace.getConfiguration('universalApiNavigator');
            await settingsConfig.update('aiConfig', config, vscode.ConfigurationTarget.Global);

            // Show success message
            vscode.window.showInformationMessage('AI configuration saved successfully!');

            // Close the panel
            AIConfigPanel.currentPanel?.dispose();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save configuration: ${error.message}`);
        }
    }

    private static async testConfig(config: AIConfig, webview?: vscode.Webview) {
        if (!webview) return;

        try {
            // Show loading state in webview
            webview.postMessage({
                command: 'testConfigStart'
            });

            const isValid = await AIRequestService.testConfig(config);

            // Send result to webview
            webview.postMessage({
                command: 'testConfigResult',
                payload: {
                    success: isValid,
                    message: isValid
                        ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="false" role="img" focusable="false"><title>Check mark</title><g fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></g></svg> Configuration test successful!'
                        : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="false" role="img" focusable="false"><title>Close / Error</title><g fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></g></svg> Configuration test failed. Please check your API key.'
                }
            });
        } catch (error: any) {
            // Send error to webview
            webview.postMessage({
                command: 'testConfigResult',
                payload: {
                    success: false,
                    message: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="false" role="img" focusable="false"><title>Close / Error</title><g fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></g></svg> Test failed: ${error.message}`
                }
            });
        }
    }

    private static async loadCurrentConfig(webview?: vscode.Webview, context?: vscode.ExtensionContext) {
        if (!webview || !context) return;

        try {
            const settingsConfig = vscode.workspace.getConfiguration('universalApiNavigator');
            const currentConfig = settingsConfig.get<AIConfig>('aiConfig');

            if (currentConfig) {
                webview.postMessage({
                    command: 'loadConfig',
                    payload: currentConfig
                });
            }
        } catch (error: any) {
            console.error('Failed to load current config:', error);
        }
    }

    /**
     * Post message to current panel
     */
    public static postMessageToCurrentPanel(message: any) {
        if (AIConfigPanel.currentPanel) {
            AIConfigPanel.currentPanel.webview.postMessage(message);
        }
    }
}