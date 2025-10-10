// src/utils/vsCodeUtils.ts
import * as vscode from 'vscode';

/**
 * Helper to get the URI for a resource relative to the extension's media folder.
 * @param webview - The webview instance.
 * @param extensionUri - The base URI of the extension.
 * @param pathList - The path segments to the resource (e.g., ['media', 'webview.js']).
 * @returns The webview-accessible URI.
 */
export function getUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathList: string[]
): vscode.Uri {
  const resourceUri = vscode.Uri.joinPath(extensionUri, ...pathList);
  return webview.asWebviewUri(resourceUri); // ✅ This converts to vscode-webview:// URI
}

/**
 * Helper to generate a random nonce string for Content Security Policy.
 * @returns A random string.
 */
export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}