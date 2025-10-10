import * as vscode from 'vscode';
import { SchemaParser } from './api/parsers/SchemaParser';
import { RequestEditorPanelManager } from './ui/RequestEditorPanel';
import { RequestHandler } from './request/RequestHandler';
import { CodeGenerator } from './codegen/CodeGenerator';
import { ApiTreeItemData, IMethodDefinition } from './types';
import { RawRequestPanel } from './ui/RawRequestPanel';
import { SidebarProvider } from './providers/SidebarProvider';
import { AddToCollectionPanel } from './ui/AddToCollectionPanel';
import { EnvironmentStore } from './state/EnvironmentStore';
import { EnvironmentManager } from './state/EnvironmentManager';
import { ManageEnvironmentPanel } from './ui/ManageEnvironmentPanel';
import { resolveVariables } from './utils/variableResolver';
import { AIRequestService, AIPromptRequest } from './request/AIRequestService';
import { AIConfigPanel } from './ui/AIConfigPanel';

declare module 'vscode' {
	interface ExtensionContext {
		sidebarProviderInstance?: SidebarProvider;
	}
}

let sidebarProviderInstance: SidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext) {

	console.log('Universal API Navigator extension is now active!');

	const schemaParser = new SchemaParser(context);
	const requestHandler = new RequestHandler(schemaParser)

	const codeGenerator = new CodeGenerator(schemaParser);

	// Ensure panel manager is instantiated
	const requestEditorPanelManager = new RequestEditorPanelManager(context, requestHandler, codeGenerator);


	// --- Register Commands ---

	// THIS IS THE COMMAND HANDLER FOR 'universalApiNavigator.openTreeView'
	context.subscriptions.push(vscode.commands.registerCommand('universalApiNavigator.openTreeView', () => {
		console.log('Command: openTreeView triggered');
		// YOU MUST CHANGE THE COMMAND ID ON THE NEXT LINE
		// It is currently trying to execute 'workbench.action.activitybar.showViewContainer' which is not found.
		// You need to change it to 'workbench.view.extension.universalApiNavigator.apiTreeView'

		// FIND THE LINE BELOW AND REPLACE IT


		// REPLACE IT WITH THIS LINE INSTEAD:
		(Promise.resolve(vscode.commands.executeCommand('workbench.view.extension.universalApiNavigator')) as Promise<void>)
			.then(() => { console.log('Command: openTreeView - executeCommand finished.'); }) // Keep this log
			.catch(err => { console.error('Command: openTreeView - Error executing command:', err); }); // Keep this log
	}));

	// Keep the parseSchema command as is - its logic for checking active editor is correct for its 'when' clause
	context.subscriptions.push(vscode.commands.registerCommand('universalApiNavigator.parseSchema', async () => {
		console.log('Command: parseSchema triggered');
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document.uri.fsPath) {
			console.log('Command: parseSchema - No active editor.');
			vscode.window.showWarningMessage('No active editor with a file open to parse.');
			return;
		}
		const filePath = editor.document.uri.fsPath;
		console.log(`Command: parseSchema - Active editor path: ${filePath}`);
		try {
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Parsing ${filePath}...`,
				cancellable: false
			}, async (progress) => {
				console.log('Command: parseSchema - Starting parsing progress.');
				await schemaParser.parse(filePath);
				console.log('Command: parseSchema - Parsing complete.');
				console.log('Command: parseSchema - Tree view refreshed.');
				vscode.window.showInformationMessage(`Schema parsed successfully: ${filePath}`);
				console.log('Command: parseSchema - Success notification shown.');
			});
		} catch (error: any) {
			console.error('Command: parseSchema - Parsing failed:', error);
			vscode.window.showErrorMessage(`Failed to parse schema: ${error.message}`);
			console.error('Command: parseSchema - Error notification shown.');
		}
	}));

	// These commands are triggered internally or by the webview/tree view click
	context.subscriptions.push(vscode.commands.registerCommand('universalApiNavigator.openRequestEditor', (item?: ApiTreeItemData) => {
		if (!item) {
			console.warn('Command: openRequestEditor - Triggered without a tree item.');
			vscode.window.showWarningMessage('This command must be triggered from the API tree view.');
			return;
		}

		const data = (item as any).data ?? item; // Support both direct and nested data

		if (data.type === 'method' && data.schemaDetails && typeof data.schemaDetails !== 'string') {
			requestEditorPanelManager.createOrShow(data.schemaDetails as IMethodDefinition);
			console.log('Command: openRequestEditor - Panel created or revealed.');
		} else {
			console.warn('Command: openRequestEditor - Invalid item or missing schemaDetails:', item);
			vscode.window.showWarningMessage('Can only open editor for API methods.');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('universalApiNavigator.runRequest', (payload) => {
		console.log('Command: runRequest triggered (via internal/webview call). Payload:', payload);
		// This log will fire if the command is invoked directly, but it's intended to be handled by the webview message listener
	}));
	context.subscriptions.push(vscode.commands.registerCommand('universalApiNavigator.generateCodeStub', (payload) => {
		console.log('Command: generateCodeStub triggered (via internal/webview call). Payload:', payload);
		// This log will fire if the command is invoked directly, but it's intended to be handled by the webview message listener
	}));

	vscode.commands.registerCommand('universalApiNavigator.openRawRequest', () => {
		RawRequestPanel.createOrShow(context, requestHandler);
	});

	// Register the command to open the Add To Collection Panel
	const addToCollectionCommand = vscode.commands.registerCommand('universalApiNavigator.openAddToCollection', (collectionId?: string) => {
		AddToCollectionPanel.createOrShow(context, collectionId);
	});
	context.subscriptions.push(addToCollectionCommand);

	// Register the command to open the Raw Request Panel
	const rawRequestCommand = vscode.commands.registerCommand('universalApiNavigator.newRawRequest', () => {
		RawRequestPanel.createOrShow(context, requestHandler);
	});
	context.subscriptions.push(rawRequestCommand);

	// Register the command to open the Collection Editor (AddToCollectionPanel) for editing a request
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openCollectionEditor', ({ collectionId, request, folderPath }) => {
			AddToCollectionPanel.createOrShow(context, collectionId, undefined, folderPath); // Pass folderPath as 3rd arg
            AddToCollectionPanel.postMessageToCurrentPanel({
                command: 'editRequestInCollection',
                payload: { collectionId, request, folderPath }
            });
			})
	);

	// ===== ENVIRONMENT SYSTEM INTEGRATION =====
	const envStore = new EnvironmentStore(context);
	const envManager = new EnvironmentManager(envStore);

	// ---- NEW CODE ----
	// Register the Sidebar Provider with the shared EnvironmentManager
	const sidebarProvider = new SidebarProvider(context.extensionUri, context, envManager);
	const sidebarView = vscode.window.registerWebviewViewProvider(
		SidebarProvider.viewType,
		sidebarProvider
	);
	context.subscriptions.push(sidebarView);
	sidebarProviderInstance = sidebarProvider;

	// Register a command to refresh the sidebar
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.refreshSidebar', () => {
			if (sidebarProviderInstance) sidebarProviderInstance.refreshSidebar();
		})
	);

	// Register a command to refresh the AddToCollectionPanel collections panel only once
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.refreshCollectionsPanel', () => {
			AddToCollectionPanel.refreshCollectionsPanel(context);
		})
	);
	// ---- END NEW CODE ----

	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.newHttp', () => {
			vscode.window.showInformationMessage('Open Raw Request triggered!');
			// TODO: Implement actual opening logic for Raw Request editor
		})
	);

	// Register the command to open a request from history and populate the Raw Request UI
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openFromHistory', async (entry) => {
			// Open or focus the Raw Request Panel
			RawRequestPanel.createOrShow(context, requestHandler);
			// Wait a short moment to ensure the panel is ready
			setTimeout(() => {
				RawRequestPanel.postMessageToCurrentPanel({
					command: 'populateFromHistory',
					payload: entry
				});
			}, 200);
		})
	);

	// Register the command to open a request from collection with full data
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openFromCollection', async (requestData) => {
			console.log('[openFromCollection] Opening request with full data:', requestData);
			// Open or focus the Raw Request Panel
			RawRequestPanel.createOrShow(context, requestHandler);
			// Wait a short moment to ensure the panel is ready
			setTimeout(() => {
				RawRequestPanel.postMessageToCurrentPanel({
					command: 'populateFromCollection',
					payload: requestData
				});
			}, 200);
		})
	);

	// Ensure you do NOT have duplicate registrations for commands
	// If you find a second registerCommand call for 'universalApiNavigator.openTreeView', delete it.

	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.saveHistory', async (entry) => {
			console.log('[saveHistory] Called with entry:', entry);
			if (sidebarProvider && typeof sidebarProvider.addToHistory === 'function') {
				sidebarProvider.addToHistory(entry);
				console.log('[saveHistory] Used sidebarProvider.addToHistory');
			} else {
				// Fallback: update global state directly
				const prev = context.globalState.get<any[]>('apiSidebar.history', []);
				context.globalState.update('apiSidebar.history', [entry, ...prev].slice(0, 100));
				if (sidebarProvider && typeof sidebarProvider.refreshSidebar === 'function') {
					sidebarProvider.refreshSidebar();
				}
				console.log('[saveHistory] Updated global state directly');
			}
			// Log current history
			const current = context.globalState.get<any[]>('apiSidebar.history', []);
			console.log('[saveHistory] Current history:', current);
		})
	);

	let statusBarItem: vscode.StatusBarItem | undefined;

	async function updateStatusBar() {
		await envManager.load();
		const env = envManager.getSelectedEnvironment();
		if (!statusBarItem) {
			statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
			statusBarItem.command = 'universalApiNavigator.openEnvironmentPanel';
			context.subscriptions.push(statusBarItem);
		}
		statusBarItem.text = env ? `$(server-environment) Env: ${env.name}` : '$(server-environment) Env: None';
		statusBarItem.show();
	}

	// Register command to open Environment Manager panel
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openEnvironmentPanel', async (environmentId?: string) => {
			await envManager.load();
			ManageEnvironmentPanel.createOrShow(context, envManager, environmentId);
		})
	);

	// Register command to open Manage Environment panel
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openManageEnvironmentPanel', async (environmentId?: string) => {
			console.log('openManageEnvironmentPanel command called with environmentId:', environmentId);
			await envManager.load();
			const selectedEnv = envManager.getSelectedEnvironment();
			console.log('Current selected environment:', selectedEnv?.name, selectedEnv?.id);
			ManageEnvironmentPanel.createOrShow(context, envManager, environmentId);
		})
	);

	// Update status bar on activation
	updateStatusBar();


	// Listen for environment changes and update status bar
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('apiSidebar.environments')) {
				await updateStatusBar();
			}
		})
	);

	// Patch request execution to resolve variables
	async function resolveRequestVariables(payload: any) {
		await envManager.load();
		const env = envManager.getSelectedEnvironment();
		// Resolve variables in url, headers, body, params
		if (payload.url) {
			const { resolved, missing } = resolveVariables(payload.url, env);
			payload.url = resolved;
			if (missing.length) vscode.window.showWarningMessage(`Missing environment variables: ${missing.join(', ')}`);
		}
		if (payload.headers) {
			for (const k in payload.headers) {
				const { resolved, missing } = resolveVariables(payload.headers[k], env);
				payload.headers[k] = resolved;
				if (missing.length) vscode.window.showWarningMessage(`Missing environment variables in headers: ${missing.join(', ')}`);
			}
		}
		if (payload.body && typeof payload.body === 'string') {
			const { resolved, missing } = resolveVariables(payload.body, env);
			payload.body = resolved;
			if (missing.length) vscode.window.showWarningMessage(`Missing environment variables in body: ${missing.join(', ')}`);
		}
		if (payload.params) {
			for (const k in payload.params) {
				const { resolved, missing } = resolveVariables(payload.params[k], env);
				payload.params[k] = resolved;
				if (missing.length) vscode.window.showWarningMessage(`Missing environment variables in params: ${missing.join(', ')}`);
			}
		}
		return payload;
	}

	// Patch runRequest command
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.runRequestWithEnv', async (payload) => {
			const resolvedPayload = await resolveRequestVariables(payload);
			vscode.commands.executeCommand('universalApiNavigator.runRequest', resolvedPayload);
		})
	);

	// Patch openRawRequest to always use resolved variables
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openRawRequestWithEnv', async (payload) => {
			const resolvedPayload = await resolveRequestVariables(payload);
			vscode.commands.executeCommand('universalApiNavigator.openRawRequest', resolvedPayload);
		})
	);

	// Add commands for Raw Request Panel environment functionality
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.getEnvironmentsForRawRequest', async () => {
			await envManager.load();
			const environments = envManager.getEnvironments();
			const selectedEnv = envManager.getSelectedEnvironment();
			
			RawRequestPanel.postMessageToCurrentPanel({
				command: 'environmentsData',
				payload: {
					environments,
					selectedEnvironment: selectedEnv
				}
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.setSelectedEnvironmentForRawRequest', async (environmentId: string) => {
			await envManager.load();
			if (environmentId) {
				await envManager.setActiveEnvironment(environmentId);
			}
			const selectedEnv = envManager.getSelectedEnvironment();
			
			RawRequestPanel.postMessageToCurrentPanel({
				command: 'environmentSelected',
				payload: {
					selectedEnvironment: selectedEnv
				}
			});
		})
	);

	// Add commands for Raw Request Panel save functionality
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.getCollections', async () => {
			const collections = context.globalState.get<any[]>('apiSidebar.collections', []);
			RawRequestPanel.postMessageToCurrentPanel({
				command: 'collectionsData',
				payload: collections
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.createCollection', async (payload) => {
			const { name } = payload;
			const collections = context.globalState.get<any[]>('apiSidebar.collections', []);
			const newCollection = {
				id: Date.now().toString(),
				name: name,
				requests: [],
				createdAt: new Date().toISOString()
			};
			collections.push(newCollection);
			await context.globalState.update('apiSidebar.collections', collections);

			RawRequestPanel.postMessageToCurrentPanel({
				command: 'collectionCreated',
				payload: newCollection
			});

			vscode.window.showInformationMessage(`Collection "${name}" created successfully!`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.saveRequest', async (payload) => {
			console.log('[DEBUG] saveRequest called with payload:', payload);
			const { name, collectionId, requestData, folderPath } = payload;
			console.log('[DEBUG] Extracted - name:', name, 'collectionId:', collectionId, 'folderPath:', folderPath);
			console.log('[DEBUG] folderPath type:', typeof folderPath, 'isArray:', Array.isArray(folderPath));
			console.log('[DEBUG] folderPath value:', JSON.stringify(folderPath, null, 2));

			const collections = context.globalState.get<any[]>('apiSidebar.collections', []);
			console.log('[DEBUG] Current collections:', collections);

			const collectionIndex = collections.findIndex(c => c.id === collectionId);
			console.log('[DEBUG] Collection index found:', collectionIndex);

			if (collectionIndex === -1) {
				console.error('[DEBUG] Collection not found for ID:', collectionId);
				vscode.window.showErrorMessage('Collection not found.');
				return;
			}

			const collection = collections[collectionIndex];
			console.log('[DEBUG] Found collection:', collection.name);

			const newRequest = {
				id: Date.now().toString(),
				name: name,
				...requestData,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};
			console.log('[DEBUG] Created new request:', newRequest);

			// Handle folder path if provided
			if (folderPath && Array.isArray(folderPath) && folderPath.length > 0) {
				console.log('[DEBUG] Saving to folder path:', folderPath);
				console.log('[DEBUG] Folder path type:', typeof folderPath, 'isArray:', Array.isArray(folderPath));

				// Ensure folders array exists
				if (!collection.folders) {
					collection.folders = [];
				}

				// Find or create the folder path
				let currentLevel: any[] = collection.folders;
				let currentPath = '';

				for (let i = 0; i < folderPath.length; i++) {
					const folderName = folderPath[i];
					currentPath += (currentPath ? ' → ' : '') + folderName;
					console.log('[DEBUG] Processing folder level', i, ':', folderName, 'at path:', currentPath);
					console.log('[DEBUG] Current level folders:', currentLevel.map(f => f.name));

					let folder = currentLevel.find((f: any) => f.name === folderName);
					if (!folder) {
						console.log('[DEBUG] Creating new folder:', folderName);
						folder = {
							id: Date.now().toString() + '_folder_' + i,
							name: folderName,
							requests: [],
							folders: [], // Ensure nested folders array exists
							createdAt: new Date().toISOString()
						};
						currentLevel.push(folder);
						console.log('[DEBUG] Created folder, current level now:', currentLevel.map(f => f.name));
					} else {
						console.log('[DEBUG] Found existing folder:', folderName);
					}

					if (i === folderPath.length - 1) {
						// Last folder in path - add request here
						console.log('[DEBUG] Adding request to final folder:', folderName);
						folder.requests.push(newRequest);
						console.log('[DEBUG] Request added to folder, folder requests:', folder.requests.length);
					} else {
						// Intermediate folder - ensure it has folders array
						if (!folder.folders) {
							folder.folders = [];
						}
						currentLevel = folder.folders;
						console.log('[DEBUG] Moving to next level, folders:', currentLevel.map(f => f.name));
					}
				}
			} else {
				// No folder path - add directly to collection
				console.log('[DEBUG] Saving directly to collection (no folder path or invalid folderPath)');
				console.log('[DEBUG] folderPath value:', folderPath, 'type:', typeof folderPath);
				collection.requests.push(newRequest);
			}

			console.log('[DEBUG] Updated collections:', collections);
			await context.globalState.update('apiSidebar.collections', collections);

			// Refresh the sidebar to show the updated collections immediately
			if (sidebarProviderInstance) {
				console.log('[DEBUG] Refreshing sidebar after saving request');
				sidebarProviderInstance.refreshSidebar();
			}

			// Also refresh the collections panel if it's open
			console.log('[DEBUG] Refreshing collections panel after saving request');
			AddToCollectionPanel.refreshCollectionsPanel(context);

			RawRequestPanel.postMessageToCurrentPanel({
				command: 'requestSaved',
				payload: newRequest
			});

			const locationText = folderPath && folderPath.length > 0 ?
				`folder "${folderPath.join(' → ')}"` :
				`collection "${collection.name}"`;

			console.log('[DEBUG] Success message:', `Request "${name}" saved to ${locationText}!`);
			vscode.window.showInformationMessage(`Request "${name}" saved to ${locationText}!`);
		})
	);

	// Add AI command for generating cURL from text prompts
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.generateCurlFromAI', async (payload) => {
			console.log('[AI] generateCurlFromAI called with payload:', payload);
			const { prompt, conversationHistory } = payload;

			if (!prompt || !prompt.trim()) {
				vscode.window.showErrorMessage('AI prompt cannot be empty.');
				return;
			}

			try {
				// Show progress notification
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Generating cURL command with AI...',
					cancellable: false
				}, async (progress) => {
					// Get AI configuration from VS Code settings
					const settingsConfig = vscode.workspace.getConfiguration('universalApiNavigator');
					const aiConfig = settingsConfig.get<any>('aiConfig', {});

					if (!aiConfig.apiKey) {
						throw new Error('AI API key not configured. Please configure it in settings.');
					}

					// Generate cURL command from prompt using static method
					const aiRequest: AIPromptRequest = {
						prompt,
						config: {
							provider: aiConfig.provider || 'huggingface',
							model: aiConfig.model || 'openai/gpt-oss-120b',
							apiKey: aiConfig.apiKey
						},
						conversationHistory: conversationHistory || []
					};

					const result = await AIRequestService.generateCurlCommand(aiRequest);

					console.log('[AI] Generated cURL command:', result.curlCommand);

					// Send the result back to the webview
					RawRequestPanel.postMessageToCurrentPanel({
						command: 'aiCurlGenerated',
						payload: {
							success: true,
							curlCommand: result.curlCommand
						}
					});
				});
			} catch (error: any) {
				console.error('[AI] Error in generateCurlFromAI:', error);

				// Send error back to webview
				RawRequestPanel.postMessageToCurrentPanel({
					command: 'aiCurlGenerated',
					payload: {
						success: false,
						error: error.message || 'Unknown error occurred'
					}
				});

				vscode.window.showErrorMessage(`AI generation failed: ${error.message}`);
			}
		})
	);

	// Add command to open AI Configuration Panel
	context.subscriptions.push(
		vscode.commands.registerCommand('universalApiNavigator.openAIConfigPanel', () => {
			console.log('[AI] openAIConfigPanel command triggered');
			AIConfigPanel.createOrShow(context);
		})
	);

	return {
		requestHandler
	};

}

export function deactivate() {
	console.log('Universal API Navigator extension deactivated.');
}
