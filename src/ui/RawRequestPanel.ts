import * as vscode from 'vscode';
import { getUri, getNonce } from '../utils/vsCodeUtils';
import { RequestHandler, AuthPayload } from '../request/RequestHandler';

/**
 * Manages the Raw Request Webview panel.
 * This class is a singleton that ensures only one panel exists at a time.
 */
export class RawRequestPanel {
    public static readonly viewType = 'universalApiNavigator.rawRequest';

    private static currentPanel: vscode.WebviewPanel | undefined;
    private static requestHandlerInstance: RequestHandler;

    /**
     * Creates a new Raw Request panel or shows an existing one.
     * @param context The extension context.
     * @param requestHandler An instance of the class responsible for making API calls.
     */
    public static createOrShow(context: vscode.ExtensionContext, requestHandler: RequestHandler) {
        RawRequestPanel.requestHandlerInstance = requestHandler;

        if (RawRequestPanel.currentPanel) {
            RawRequestPanel.currentPanel.reveal(vscode.ViewColumn.Active);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            RawRequestPanel.viewType,
            'Raw Request (Universal API)',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
                retainContextWhenHidden: true,
            }
        );

        RawRequestPanel.currentPanel = panel;
        panel.webview.html = RawRequestPanel.getHtml(panel.webview, context);
        RawRequestPanel.handleMessages(panel.webview);
        panel.onDidDispose(() => {
            RawRequestPanel.currentPanel = undefined;
        }, null, context.subscriptions);
    }

    public static postMessageToCurrentPanel(message: any) {
        if (RawRequestPanel.currentPanel) {
            RawRequestPanel.currentPanel.webview.postMessage(message);
        } else {
            console.warn('RawRequestPanel: No current panel to post message to.');
        }
    }

    private static getHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        const nonce = getNonce();
        const styleUri = getUri(webview, context.extensionUri, ['media', 'rawWebview.css']);
        const scriptUri = getUri(webview, context.extensionUri, ['media', 'rawWebview.js']);

        // Base CodeMirror assets
        const codeMirrorLibCss = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.css';
        const codeMirrorThemeCss = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/theme/monokai.css';
        const codeMirrorLibJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.js';
        
        // Language modes
        const codeMirrorJsonModeJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/javascript/javascript.js';
        const codeMirrorHtmlModeJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/htmlmixed/htmlmixed.js';
        const codeMirrorXmlModeJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/xml/xml.js';
        const codeMirrorGraphqlModeJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/graphql/graphql.js';

        // Addons
        const foldGutterCss = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/fold/foldgutter.css';
        const foldGutterJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/fold/foldgutter.js';
        const foldCodeJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/fold/foldcode.js';
        const braceFoldJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/fold/brace-fold.js';
        
        // ** Search Addons **
        const searchDialogCss = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/dialog/dialog.css';
        const searchDialogJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/dialog/dialog.js';
        const searchCursorJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/searchcursor.js';
        const searchJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/search.js';
        const jumpToLineJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/jump-to-line.js';
        const matchesonScrollbarJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/scroll/annotatescrollbar.js';
        const matchHighlighterJs = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/matchesonscrollbar.js';


        const csp = `
            default-src 'none';
            style-src ${webview.cspSource} https://cdn.jsdelivr.net 'unsafe-inline';
            script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
            img-src ${webview.cspSource} data:;
            font-src https://cdn.jsdelivr.net;
            connect-src *;
            frame-src 'self' blob:;
        `.replace(/\s+/g, ' ').trim();

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raw Request</title>
    <link href="${styleUri}" rel="stylesheet">
    <link rel="stylesheet" href="${codeMirrorLibCss}" />
    <link rel="stylesheet" href="${codeMirrorThemeCss}" />
    <link rel="stylesheet" href="${foldGutterCss}" />
    <link rel="stylesheet" href="${searchDialogCss}" />
</head>
<body>
    <div class="container">
      <!-- Top Bar -->
      <div class="topbar">
        <div class="topbar-left">
          <span class="http-icon">
            <svg width="102" height="41" viewBox="0 0 120 32" xmlns="http://www.w3.org/2000/svg" fill="none">
              <!-- Rounded border -->
              <rect x="25.5" y="-4.5" width="90" height="53" rx="11" stroke="#c9d1d936" fill="none"></rect>
              <!-- Text -->
              <text x="70" y="29" font-family="monospace" font-size="24" text-anchor="middle" fill="rgb(35, 166, 115)">/GET/</text>
            </svg>
          </span>
          <input id="request-name-input" class="request-name-input small" type="text" value="Untitled Request" />
        </div>
        <div class="topbar-right">
          <button id="save-request-btn" class="topbar-btn">
            <span class="btn-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M1 2C1 1.44772 1.44771 1 2 1H10.7929C11.0581 1 11.3125 1.10536 11.5 1.29289L14.7071 4.5C14.8946 4.68754 15 4.94189 15 5.20711V14C15 14.5523 14.5523 15 14 15H2C1.44772 15 1 14.5523 1 14V2ZM10.7929 2H9V4C9 4.55228 8.55228 5 8 5H5C4.44772 5 4 4.55228 4 4V2L2 2V14L4 14L4 10C4 9.44772 4.44772 9 5 9H11C11.5523 9 12 9.44771 12 10V14H14V5.20711L10.7929 2ZM11 14L11 10H5L5 14L11 14ZM5 2H8V4H5V2Z" fill="#707070"></path></svg>
            </span>
            Save
          </button>
          <div class="environment-selector">
            <button id="environment-btn" class="topbar-btn environment-dropdown-btn">
              <span class="btn-icon">
                <svg fill="white" width="18px" height="18px" viewBox="0 0 64 64" version="1.1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">

<g id="_x32_5_attachment"></g>

<g id="_x32_4_office"></g>

<g id="_x32_3_pin"></g>

<g id="_x32_2_business_card"></g>

<g id="_x32_1_form"></g>

<g id="_x32_0_headset"></g>

<g id="_x31_9_video_call"></g>

<g id="_x31_8_letter_box"></g>

<g id="_x31_7_papperplane"></g>

<g id="_x31_6_laptop"></g>

<g id="_x31_5_connection"></g>

<g id="_x31_4_phonebook"></g>

<g id="_x31_3_classic_telephone"></g>

<g id="_x31_2_sending_mail"></g>

<g id="_x31_1_man_talking"></g>

<g id="_x31_0_date"></g>

<g id="_x30_9_review"></g>

<g id="_x30_8_email"></g>

<g id="_x30_7_information"></g>

<g id="_x30_6_phone_talking"></g>

<g id="_x30_5_women_talking"></g>

<g id="_x30_4_calling"></g>

<g id="_x30_3_women"></g>

<g id="_x30_2_writing">

<g>

<g>

<path d="M11.8418,20.4248l29.042-0.0034c0.5522,0,1-0.4478,1-1s-0.4478-1-1-1l-29.042,0.0034c-0.5522,0-1,0.4478-1,1     S11.2896,20.4248,11.8418,20.4248z"></path>

<path d="M33.7593,25.8887H11.8418c-0.5522,0-1,0.4478-1,1s0.4478,1,1,1h21.9175c0.5522,0,1-0.4478,1-1     S34.3115,25.8887,33.7593,25.8887z"></path>

<path d="M33.7593,33.1934H11.8418c-0.5522,0-1,0.4478-1,1s0.4478,1,1,1h21.9175c0.5522,0,1-0.4478,1-1     S34.3115,33.1934,33.7593,33.1934z"></path>

<path d="M33.7763,40.5015H11.8418c-0.5522,0-1,0.4478-1,1s0.4478,1,1,1h21.9345c0.5522,0,1-0.4478,1-1     S34.3286,40.5015,33.7763,40.5015z"></path>

<path d="M33.396,48.6914h-0.0005l-8.3828,0.0034c-0.5522,0-0.9995,0.4482-0.9995,1.0005s0.4478,0.9995,1,0.9995h0.0005     l8.3828-0.0034c0.5522,0,0.9995-0.4482,0.9995-1.0005S33.9482,48.6914,33.396,48.6914z"></path>

<path d="M61.3525,12.0815l-2.2285-1.209c-0.7393-0.4023-1.5928-0.4932-2.4019-0.2515c-0.8101,0.2393-1.4771,0.7778-1.8809,1.519     l-4.3599,8.0269V5.8838c0-2.2632-1.8413-4.1045-4.1045-4.1045H9.5327c-0.2462,0-0.5461,0.1156-0.7222,0.291L1.2985,9.5375     C1.1246,9.7224,1,9.9928,1,10.25v47.8662c0,2.2632,1.8413,4.1045,4.1045,4.1045H46.377c2.2632,0,4.1045-1.8413,4.1045-4.1045     v-19.41l12.1372-22.3444C63.4482,14.834,62.8809,12.9141,61.3525,12.0815z M8.5156,5.1962v1.9493     c0,1.1606-0.9438,2.1045-2.1045,2.1045H4.4283L8.5156,5.1962z M48.4814,58.1162c0,1.1606-0.9438,2.1045-2.1045,2.1045H5.1045     C3.9438,60.2207,3,59.2769,3,58.1162V11.25h3.4111c2.2632,0,4.1045-1.8413,4.1045-4.1045V3.7793H46.377     c1.1606,0,2.1045,0.9438,2.1045,2.1045v17.9654L38.6118,42.02c-0.0438,0.0808-0.1229,0.3453-0.1211,0.4893l0.0864,7.3013     c0.0044,0.3682,0.2109,0.7046,0.5371,0.875c0.1455,0.0757,0.3047,0.1133,0.4629,0.1133c0.1968,0,0.3931-0.0581,0.562-0.1729     l5.9287-4.0278c0.0111-0.0076,0.0159-0.0214,0.0267-0.0294c0.1144-0.0842,0.2173-0.1868,0.2897-0.3197     c0,0,0.0001-0.0005,0.0002-0.0007c0.0001-0.0001,0.0002-0.0002,0.0002-0.0002l2.0967-3.86V58.1162z M40.5108,44.1913     l3.0764,1.6741l-3.032,2.0599L40.5108,44.1913z M60.8613,15.4067L45.1049,44.4142l-4.2584-2.3174L55.9409,14.313l0.6582-1.2197     c0.3062-0.5615,1.0093-0.769,1.5693-0.4639l2.2285,1.209C60.957,14.1436,61.165,14.8477,60.8613,15.4067z"></path>

</g>

</g>

</g>

<g id="_x30_1_chatting"></g>

</svg>
              </span>
              <span id="selected-environment-text">No Environment</span>
              <span class="dropdown-arrow"></span>
            </button>
            <div class="environment-dropdown hidden" id="environment-dropdown">
              <div class="environment-dropdown-header">Select Environment</div>
              <div class="environment-list" id="environment-list">
                <div class="environment-item" data-env-id="">
                  <div class="env-name">No Environment</div>
                  <div class="env-description">No variables available</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        <!-- Request Section -->
        <div class="request-card card">
            <div class="url-bar">
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
                        <li class="custom-method-item">
                            <input type="text" id="custom-method-input" placeholder="Type a new method" spellcheck="false" hidden="true" />
                        </li>
                    </ul>
                </div>
                <div class="url-input-wrapper">
                  <input type="text" id="raw-url" class="url-input" placeholder="Enter request URL" spellcheck="false" />
                  <div class="variable-suggestions hidden" id="variable-suggestions">
                    <div class="suggestions-header">Environment Variables</div>
                    <div class="suggestions-list" id="suggestions-list">
                      <!-- Variables will be populated here -->
                    </div>
                  </div>
                </div>
                <button id="send-request" class="send-button">Send</button>
            </div>

            <div class="tabs-container" id="request-tabs-container">
                <div class="tabs">
                    <button class="tab" data-tab-target="#tab-params">Params</button>
                    <button class="tab" data-tab-target="#tab-authorization">Authorization</button>
                    <button class="tab" data-tab-target="#tab-headers">Headers <span id="request-headers-count" class="tab-count"></span></button>
                    <button class="tab" data-tab-target="#tab-body">Body</button>
                </div>
                <div class="tab-content-container">
                    <div class="tab-content" id="tab-params">
                        <div class="kv-editor" id="params-kv-editor">
                            <div class="kv-editor-header">
                                <div class="kv-cell">Key</div>
                                <div class="kv-cell">Value</div>
                                <div class="kv-cell"></div>
                            </div>
                            <div class="kv-editor-body" id="params-kv-body"></div>
                            <div class="kv-editor-footer">
                                <button class="add-row-btn" data-editor-target="params-kv-body">Add Row</button>
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-authorization">
                        <div class="auth-container">
                            <div class="auth-sidebar">
                                <label class="auth-main-label">Auth Type</label>
                                <div class="custom-dropdown" id="auth-type-dropdown" data-selected-value="no-auth">
                                    <div class="dropdown-selected" tabindex="0">
                                        <span id="selected-auth-type-text">No Auth</span>
                                        <span class="dropdown-arrow"></span>
                                    </div>
                                    <ul class="dropdown-menu hidden">
                                        <li data-value="no-auth"><span class="dropdown-menu-checkmark">✓</span>No Auth</li>
                                        <li data-value="apikey"><span class="dropdown-menu-checkmark">✓</span>API Key</li>
                                        <li data-value="bearer"><span class="dropdown-menu-checkmark">✓</span>Bearer Token</li>
                                        <li data-value="basic"><span class="dropdown-menu-checkmark">✓</span>Basic Auth</li>
                                        <li class="separator"></li>
                                        <li data-value="digest"><span class="dropdown-menu-checkmark">✓</span>Digest Auth</li>
                                        <li data-value="oauth1"><span class="dropdown-menu-checkmark">✓</span>OAuth 1.0</li>
                                        <li data-value="oauth2"><span class="dropdown-menu-checkmark">✓</span>OAuth 2.0</li>
                                        <li data-value="hawk"><span class="dropdown-menu-checkmark">✓</span>Hawk Authentication</li>
                                        <li data-value="awsv4"><span class="dropdown-menu-checkmark">✓</span>AWS Signature</li>
                                        <li data-value="ntlm"><span class="dropdown-menu-checkmark">✓</span>NTLM Authentication</li>
                                        <li data-value="jwt"><span class="dropdown-menu-checkmark">✓</span>JWT Bearer</li>
                                    </ul>
                                </div>
                                <div id="auth-description-panel" class="auth-description"></div>
                                <div class="auth-sidebar-extra" id="auth-sidebar-extra-jwt">
                                    <label class="auth-main-label">Add JWT token to</label>
                                    <div class="custom-dropdown" id="jwt-add-to-dropdown" data-selected-value="header">
                                        <div class="dropdown-selected" tabindex="0"><span class="selected-text">Request Header</span><span class="dropdown-arrow"></span></div>
                                        <ul class="dropdown-menu hidden"><li data-value="header" class="active">Request Header</li><li data-value="query">Query Param</li></ul>
                                    </div>
                                </div>
                                <div class="auth-sidebar-extra" id="auth-sidebar-extra-digest">
                                    <label class="auth-main-label">Options</label>
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
                                        <input type="checkbox" id="digest-disable-retry"> Disable retrying the request
                                    </label>
                                </div>
                                <div class="auth-sidebar-extra" id="auth-sidebar-extra-oauth1">
                                    <label class="auth-main-label">Add authorization data to</label>
                                    <div class="custom-dropdown" id="oauth1-add-to-dropdown" data-selected-value="header">
                                        <div class="dropdown-selected" tabindex="0">
                                            <span class="selected-text">Request Headers</span>
                                            <span class="dropdown-arrow"></span>
                                        </div>
                                        <ul class="dropdown-menu hidden">
                                            <li data-value="header">Request Headers</li>
                                            <li data-value="body">Request Body & URL</li>
                                        </ul>
                                    </div>
                                </div>
                                <div class="auth-sidebar-extra" id="auth-sidebar-extra-oauth2">
                                    <label class="auth-main-label">Add authorization data to</label>
                                    <div class="custom-dropdown" id="oauth2-add-to-dropdown" data-selected-value="header">
                                        <div class="dropdown-selected" tabindex="0">
                                            <span class="selected-text">Request Headers</span>
                                            <span class="dropdown-arrow"></span>
                                        </div>
                                        <ul class="dropdown-menu hidden">
                                            <li data-value="header">Request Headers</li>
                                            <li data-value="url">Request URL</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div class="auth-details">
                                <div class="auth-panel active" id="auth-panel-no-auth">
                                    <div class="placeholder">This request does not use any authorization.</div>
                                </div>
                                <div class="auth-panel" id="auth-panel-basic">
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="basic-username">Username</label>
                                        <input type="text" id="basic-username" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="basic-password">Password</label>
                                        <input type="password" id="basic-password" class="auth-input">
                                    </div>
                                </div>
                                <div class="auth-panel" id="auth-panel-bearer">
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="bearer-token">Token</label>
                                        <textarea id="bearer-token" class="auth-input auth-textarea" spellcheck="false"></textarea>
                                    </div>
                                </div>
                                <div class="auth-panel" id="auth-panel-apikey">
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="apikey-key">Key</label>
                                        <input type="text" id="apikey-key" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="apikey-value">Value</label>
                                        <input type="text" id="apikey-value" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="apikey-add-to">Add to</label>
                                        <select id="apikey-add-to" class="auth-input">
                                            <option value="header">Header</option>
                                            <option value="query">Query Params</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="auth-panel" id="auth-panel-jwt">
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="jwt-algorithm">Algorithm</label>
                                        <select id="jwt-algorithm" class="auth-input">
                                            <option value="HS256">HS256</option>
                                            <option value="RS256" disabled>RS256</option>
                                        </select>
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="jwt-secret">Secret</label>
                                        <input type="password" id="jwt-secret" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label"></label>
                                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                            <input type="checkbox" id="jwt-secret-base64"> Secret Base64 encoded
                                        </label>
                                    </div>
                                    <div class="auth-form-row-column">
                                        <label class="auth-label-column">Payload</label>
                                        <div class="auth-editor-wrapper">
                                            <textarea id="jwt-payload">{ "iat": ${Math.floor(Date.now() / 1000)} }</textarea>
                                        </div>
                                    </div>
                                    <details class="auth-advanced" id="jwt-advanced-details">
                                        <summary>Advanced configuration</summary>
                                        <div class="auth-advanced-content">
                                            <div class="auth-form-row-wide">
                                                <label class="auth-label">Request header prefix</label>
                                                <input type="text" id="jwt-header-prefix" class="auth-input" value="Bearer">
                                            </div>
                                            <div class="auth-form-row-column">
                                                <label class="auth-label-column">JWT Headers (JSON)</label>
                                                <div class="auth-editor-wrapper">
                                                    <textarea id="jwt-headers">{ "alg": "HS256", "typ": "JWT" }</textarea>
                                                </div>
                                            </div>
                                        </div>
                                    </details>
                                </div>
                                <div class="auth-panel" id="auth-panel-digest">
                                    <div class="auth-form-row"><label class="auth-label">Username</label><input type="text" id="digest-username" class="auth-input"></div>
                                    <div class="auth-form-row"><label class="auth-label">Password</label><input type="password" id="digest-password" class="auth-input"></div>
                                    <details class="auth-advanced">
                                        <summary>Advanced Configuration</summary>
                                        <div class="auth-advanced-content">
                                            <p class="auth-info-text" style="margin-top: 0;">Postman auto-generates default values for some fields unless a value is specified.</p>
                                            <div class="auth-form-row"><label class="auth-label">Realm</label><input type="text" id="digest-realm" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Nonce</label><input type="text" id="digest-nonce" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Algorithm</label><select id="digest-algorithm" class="auth-input"><option value="MD5">MD5</option><option value="MD5-sess">MD5-sess</option></select></div>
                                            <div class="auth-form-row"><label class="auth-label">qop</label><input type="text" id="digest-qop" class="auth-input" placeholder="auth | auth-int"></div>
                                            <div class="auth-form-row"><label class="auth-label">Nonce Count</label><input type="text" id="digest-nc" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Client Nonce</label><input type="text" id="digest-cnonce" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Opaque</label><input type="text" id="digest-opaque" class="auth-input"></div>
                                        </div>
                                    </details>
                                </div>
                                <div class="auth-panel" id="auth-panel-hawk">
                                    <div class="auth-form-row"><label class="auth-label">Hawk Auth ID</label><input type="text" id="hawk-id" class="auth-input"></div>
                                    <div class="auth-form-row"><label class="auth-label">Hawk Auth Key</label><input type="password" id="hawk-key" class="auth-input"></div>
                                    <div class="auth-form-row"><label class="auth-label">Algorithm</label><select id="hawk-algorithm" class="auth-input"><option value="sha256">sha256</option><option value="sha1">sha1</option></select></div>
                                    <details class="auth-advanced">
                                        <summary>Advanced Configuration</summary>
                                        <div class="auth-advanced-content">
                                            <p class="auth-info-text" style="margin-top: 0;">Postman auto-generates default values for some fields unless a value is specified.</p>
                                            <div class="auth-form-row"><label class="auth-label">User</label><input type="text" id="hawk-user" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Nonce</label><input type="text" id="hawk-nonce" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Ext</label><input type="text" id="hawk-ext" class="auth-input" placeholder="e.g. some-app-extra-data"></div>
                                            <div class="auth-form-row"><label class="auth-label">App</label><input type="text" id="hawk-app" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">dlg</label><input type="text" id="hawk-dlg" class="auth-input"></div>
                                        </div>
                                    </details>
                                </div>
                                <div class="auth-panel" id="auth-panel-oauth1">
                                    <div class="auth-form-row-wide">
                                        <label class="auth-label">Signature Method</label>
                                        <select id="oauth1-signature-method" class="auth-input">
                                            <option value="HMAC-SHA1">HMAC-SHA1</option>
                                            <option value="HMAC-SHA256">HMAC-SHA256</option>
                                            <option value="PLAINTEXT">PLAINTEXT</option>
                                        </select>
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label">Consumer Key</label>
                                        <input type="text" id="oauth1-consumer-key" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label">Consumer Secret</label>
                                        <input type="password" id="oauth1-consumer-secret" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label">Access Token</label>
                                        <input type="text" id="oauth1-token" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label">Token Secret</label>
                                        <input type="password" id="oauth1-token-secret" class="auth-input">
                                    </div>
                                    <details class="auth-advanced">
                                        <summary>Advanced Configuration</summary>
                                        <div class="auth-advanced-content">
                                            <p class="auth-info-text" style="margin-top: 0;">Postman auto-generates default values for some of these fields unless a value is specified.</p>
                                            <div class="auth-form-row"><label class="auth-label">Callback URL</label><input type="text" id="oauth1-callback-url" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Verifier</label><input type="text" id="oauth1-verifier" class="auth-input"></div>
                                            <div class="auth-form-row"><label class="auth-label">Timestamp</label><input type="text" id="oauth1-timestamp" class="auth-input" placeholder="Auto-generated"></div>
                                            <div class="auth-form-row"><label class="auth-label">Nonce</label><input type="text" id="oauth1-nonce" class="auth-input" placeholder="Auto-generated"></div>
                                            <div class="auth-form-row"><label class="auth-label">Version</label><input type="text" id="oauth1-version" class="auth-input" value="1.0"></div>
                                            <div class="auth-form-row"><label class="auth-label">Realm</label><input type="text" id="oauth1-realm" class="auth-input"></div>
                                        </div>
                                    </details>
                                </div>
                                <div class="auth-panel" id="auth-panel-oauth2">
                                    <div class="auth-group">
                                        <div class="auth-group-header">Current Token</div>
                                        <div class="auth-form-row-column">
                                            <label class="auth-label-column" for="oauth2-token">Access Token</label>
                                            <textarea id="oauth2-token" class="auth-input auth-textarea" placeholder="Paste token here or configure below to generate one"></textarea>
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-header-prefix">Header Prefix</label>
                                            <input type="text" id="oauth2-header-prefix" class="auth-input" value="Bearer">
                                        </div>
                                        <div class="auth-form-row-toggle">
                                            <label class="auth-label">Auto-refresh Token</label>
                                            <label class="toggle-switch">
                                                <input type="checkbox" id="oauth2-auto-refresh" disabled>
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <p class="auth-info-text">Your expired token will be auto-refreshed before sending a request.</p>
                                    </div>
                                    <hr class="auth-separator">
                                    <div class="auth-group">
                                        <div class="auth-group-header">Configure New Token</div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-token-name">Token Name</label>
                                            <input type="text" id="oauth2-token-name" class="auth-input" placeholder="e.g., My App Token">
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-grant-type">Grant Type</label>
                                            <select id="oauth2-grant-type" class="auth-input">
                                                <option value="authorization_code">Authorization Code</option>
                                                <option value="implicit" disabled>Implicit</option>
                                                <option value="password_credentials" disabled>Password Credentials</option>
                                                <option value="client_credentials" disabled>Client Credentials</option>
                                            </select>
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-callback-url">Callback URL</label>
                                            <input type="text" id="oauth2-callback-url" class="auth-input" placeholder="https://oauth.pstmn.io/v1/callback (for example)">
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-auth-url">Auth URL</label>
                                            <input type="text" id="oauth2-auth-url" class="auth-input">
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-token-url">Access Token URL</label>
                                            <input type="text" id="oauth2-token-url" class="auth-input">
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-client-id">Client ID</label>
                                            <input type="text" id="oauth2-client-id" class="auth-input">
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-client-secret">Client Secret</label>
                                            <input type="password" id="oauth2-client-secret" class="auth-input">
                                        </div>
                                        <div class="auth-form-row">
                                            <label class="auth-label" for="oauth2-scope">Scope</label>
                                            <input type="text" id="oauth2-scope" class="auth-input" placeholder="e.g., read,write">
                                        </div>
                                        <details class="auth-advanced">
                                            <summary>Advanced Options</summary>
                                            <div class="auth-advanced-content">
                                                <div class="auth-form-row">
                                                    <label class="auth-label" for="oauth2-state">State</label>
                                                    <input type="text" id="oauth2-state" class="auth-input" placeholder="Optional security token">
                                                </div>
                                                <div class="auth-form-row">
                                                    <label class="auth-label" for="oauth2-client-auth">Client Auth</label>
                                                    <select id="oauth2-client-auth" class="auth-input">
                                                        <option value="body">Send as Basic Auth header</option>
                                                        <option value="header">Send client credentials in body</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                    <button id="oauth2-get-token-btn" class="send-button add-row-btn" style="align-self: flex-start;">Get New Access Token</button>
                                </div>
                                <div class="auth-panel" id="auth-panel-ntlm">
                                    <div class="auth-form-row">
                                        <label class="auth-label">Username</label>
                                        <input type="text" id="ntlm-username" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label">Password</label>
                                        <input type="password" id="ntlm-password" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label">Domain</label>
                                        <input type="text" id="ntlm-domain" class="auth-input" placeholder="Optional">
                                    </div>
                                </div>
                                <div class="auth-panel" id="auth-panel-awsv4">
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="aws-access-key">Access Key</label>
                                        <input type="text" id="aws-access-key" class="auth-input">
                                    </div>
                                    <div class="auth-form-row">
                                        <label class="auth-label" for="aws-secret-key">Secret Key</label>
                                        <input type="password" id="aws-secret-key" class="auth-input">
                                    </div>
                                    <details class="auth-advanced">
                                        <summary>Advanced Configuration</summary>
                                        <div class="auth-advanced-content">
                                            <div class="auth-form-row">
                                                <label class="auth-label" for="aws-region">AWS Region</label>
                                                <input type="text" id="aws-region" class="auth-input" placeholder="e.g., us-east-1">
                                            </div>
                                            <div class="auth-form-row">
                                                <label class="auth-label" for="aws-service-name">Service Name</label>
                                                <input type="text" id="aws-service-name" class="auth-input" placeholder="e.g., execute-api">
                                            </div>
                                            <div class="auth-form-row">
                                                <label class="auth-label" for="aws-session-token">Session Token</label>
                                                <input type="text" id="aws-session-token" class="auth-input" placeholder="(Optional) STS token">
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-headers">
                        <div class="kv-editor" id="headers-kv-editor">
                            <div class="kv-editor-header">
                                <div class="kv-cell-check"></div>
                                <div class="kv-cell">Key</div>
                                <div class="kv-cell">Value</div>
                                <div class="kv-cell">Description</div>
                                <div class="kv-cell"></div>
                            </div>
                            <div class="kv-editor-body" id="headers-kv-body">
                                <div class="kv-row" data-is-default="true">
                                    <div class="kv-cell-check"><input type="checkbox" class="kv-check" checked></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-key" value="User-Agent" readonly></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-value" value="vscode-universal-api-client/1.0"></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-desc" placeholder="Description"></div>
                                    <div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row" disabled>×</button></div>
                                </div>
                                <div class="kv-row" data-is-default="true">
                                    <div class="kv-cell-check"><input type="checkbox" class="kv-check" checked></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-key" value="Accept" readonly></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-value" value="*/*"></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-desc" placeholder="Description"></div>
                                    <div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row" disabled>×</button></div>
                                </div>
                                <div class="kv-row" data-is-default="true">
                                    <div class="kv-cell-check"><input type="checkbox" class="kv-check" checked></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-key" value="Accept-Encoding" readonly></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-value" value="gzip, deflate, br"></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-desc" placeholder="Description"></div>
                                    <div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row" disabled>×</button></div>
                                </div>
                                <div class="kv-row" data-is-default="true">
                                    <div class="kv-cell-check"><input type="checkbox" class="kv-check" checked></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-key" value="Connection" readonly></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-value" value="keep-alive"></div>
                                    <div class="kv-cell"><input type="text" class="kv-input kv-desc" placeholder="Description"></div>
                                    <div class="kv-cell-delete"><button class="delete-row-btn" title="Delete Row" disabled>×</button></div>
                                </div>
                            </div>
                            <div class="kv-editor-footer">
                                <button class="add-row-btn" data-editor-target="headers-kv-body">Add Row</button>
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-body">
                        <div class="body-type-options">
                            <label><input type="radio" name="body-type" value="none" checked> none</label>
                            <label><input type="radio" name="body-type" value="form-data" disabled> form-data</label>
                            <label><input type="radio" name="body-type" value="x-www-form-urlencoded"> x-www-form-urlencoded</label>
                            <label><input type="radio" name="body-type" value="raw"> raw</label>
                            <label><input type="radio" name="body-type" value="binary" disabled> binary</label>
                            <label><input type="radio" name="body-type" value="graphql"> GraphQL</label>
                        </div>
                        <div class="body-content-panels">
                            <div class="body-panel active" id="body-panel-none">
                                <div class="placeholder">This request does not have a body.</div>
                            </div>
                            <div class="body-panel" id="body-panel-form-data">
                                <div class="placeholder">Multipart form-data is not yet implemented.</div>
                            </div>
                            <div class="body-panel" id="body-panel-x-www-form-urlencoded">
                                <div class="kv-editor" id="urlencoded-kv-editor">
                                    <div class="kv-editor-header">
                                        <div class="kv-cell">Key</div>
                                        <div class="kv-cell">Value</div>
                                        <div class="kv-cell">Description</div>
                                        <div class="kv-cell"></div>
                                    </div>
                                    <div class="kv-editor-body" id="urlencoded-kv-body"></div>
                                    <div class="kv-editor-footer">
                                        <button class="add-row-btn" data-editor-target="urlencoded-kv-body">Add Row</button>
                                    </div>
                                </div>
                            </div>
                            <div class="body-panel" id="body-panel-raw">
                                <div class="body-options">
                                    <select id="raw-body-type-select">
                                        <option value="json">JSON</option>
                                        <option value="text">Text</option>
                                        <option value="html">HTML</option>
                                        <option value="xml">XML</option>
                                        <option value="javascript">JavaScript</option>
                                    </select>
                                    <button id="format-body" class="format-btn">Format JSON</button>
                                </div>
                                <textarea id="raw-body-content"></textarea>
                            </div>
                            <div class="body-panel" id="body-panel-binary">
                                <div class="placeholder">Binary file uploads are not yet implemented.</div>
                            </div>
                            <div class="body-panel" id="body-panel-graphql">
                                <div class="graphql-container">
                                    <div class="graphql-panel">
                                        <label class="graphql-label">QUERY</label>
                                        <textarea id="graphql-query-content"></textarea>
                                    </div>
                                    <div class="graphql-panel">
                                        <label class="graphql-label">GRAPHQL VARIABLES</label>
                                        <textarea id="graphql-variables-content"></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Response Section -->
        <div class="response-card card">
            <div class="response-header">
                <h2>Response</h2>
                <div class="response-status-line">
                    <div class="popup-container">
                        <span id="response-status-badge" class="status-badge status-info">N/A</span>
                        <div class="popup-dialog" id="status-popup">
                            <div class="popup-caret"></div>
                            <div class="popup-header"><span id="popup-status-icon"></span><span id="popup-status-text"></span></div>
                            <p id="popup-status-desc"></p>
                        </div>
                    </div>
                    <div class="popup-container">
                        <div class="status-item" id="response-time-trigger"><span class="icon">⏱️</span><span id="response-time">N/A</span></div>
                        <div class="popup-dialog wide" id="time-popup">
                            <div class="popup-caret"></div>
                            <div class="popup-header">Response Time</div>
                            <div class="time-breakdown" id="time-breakdown-container"></div>
                        </div>
                    </div>
                    <div class="popup-container">
                        <div class="status-item" id="response-size-trigger"><span class="icon">📦</span><span id="response-size">N/A</span></div>
                        <div class="popup-dialog wide" id="size-popup">
                            <div class="popup-caret"></div>
                            <div class="popup-header">Response Size</div>
                            <div class="size-group-grid">
                                <div class="size-icon">↓</div><div class="size-label">Headers</div><div class="size-value" id="popup-size-res-headers"></div>
                                <div></div><div class="size-label">Body</div><div class="size-value" id="popup-size-res-body"></div>
                                <div></div><div class="size-label disabled">Uncompressed</div><div class="size-value disabled" id="popup-size-res-uncompressed"></div>
                            </div>
                            <div class="popup-subtitle">Request Size</div>
                            <div class="size-group-grid">
                                <div class="size-icon">↑</div><div class="size-label">Headers</div><div class="size-value" id="popup-size-req-headers"></div>
                                <div></div><div class="size-label">Body</div><div class="size-value" id="popup-size-req-body"></div>
                            </div>
                        </div>
                    </div>
                    <div class="popup-container">
                        <div class="status-item" id="network-trigger"><span class="icon">🌐</span></div>
                        <div class="popup-dialog wide" id="network-popup">
                            <div class="popup-caret"></div>
                            <div class="popup-header">Network</div>
                            <div class="popup-kv-group">
                                <div class="popup-kv-row"><span>HTTP Version</span><span id="popup-net-http"></span></div>
                                <div class="popup-kv-row"><span>Local Address</span><span id="popup-net-local"></span></div>
                                <div class="popup-kv-row"><span>Remote Address</span><span id="popup-net-remote"></span></div>
                            </div>
                            <div class="popup-subtitle">TLS</div>
                            <div class="popup-kv-group">
                                <div class="popup-kv-row"><span>Protocol</span><span id="popup-net-tls"></span></div>
                                <div class="popup-kv-row"><span>Cipher Name</span><span id="popup-net-cipher"></span></div>
                            </div>
                            <div class="popup-subtitle">Certificate</div>
                            <div class="popup-kv-group">
                                <div class="popup-kv-row"><span>Subject</span><span id="popup-net-cert-cn"></span></div>
                                <div class="popup-kv-row"><span>Issuer</span><span id="popup-net-cert-issuer"></span></div>
                                <div class="popup-kv-row"><span>Valid Until</span><span id="popup-net-cert-expiry"></span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="tabs-container" id="response-tabs-container">
                <div class="tabs">
                    <button class="tab active" data-tab-target="#tab-response-body">Body</button>
                    <button class="tab" data-tab-target="#tab-response-cookies">Cookies</button>
                    <button class="tab" data-tab-target="#tab-response-headers">
                        Headers
                        <span id="response-headers-count" class="tab-count"></span>
                    </button>
                    <button class="tab" data-tab-target="#tab-test-results">Test Results</button>
                </div>
                <div class="tab-content-container">
                    <div class="tab-content active" id="tab-response-body">
                        <div class="response-body-controls">
                            <div class="custom-dropdown" id="format-selector-dropdown" data-selected-value="JSON">
                                <div class="dropdown-selected" tabindex="0">
                                    <span id="selected-format-icon" class="format-icon">{}</span>
                                    <span id="selected-format-text">JSON</span>
                                    <span class="dropdown-arrow"></span>
                                </div>
                                <ul class="dropdown-menu hidden">
                                    <li data-value="JSON" data-icon="{}"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">{}</span><span>JSON</span></li>
                                    <li data-value="Tree" data-icon="🌳"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">🌳</span><span>Tree View</span></li>
                                    <li data-value="XML" data-icon="</>"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">&lt;|&gt;</span><span>XML</span></li>
                                    <li data-value="HTML" data-icon="<"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">&lt;/&gt;</span><span>HTML</span></li>
                                    <li data-value="JS" data-icon="JS"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">JS</span><span>JavaScript</span></li>
                                    <li class="separator"></li>
                                    <li data-value="Raw" data-icon="T="><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">T=</span><span>Raw</span></li>
                                    <li data-value="Hex" data-icon="0x"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">0x</span><span>Hex</span></li>
                                    <li data-value="Base64" data-icon="64"><span class="dropdown-menu-checkmark">✓</span><span class="dropdown-menu-icon">64</span><span>Base64</span></li>
                                </ul>
                            </div>
                            <div class="response-body-actions">
                                <button id="response-wrap-btn" class="response-action-btn" title="Toggle Word Wrap">
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M4 7H20" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        <path d="M4 17H9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        <path d="M4 12H17.5C18.8807 12 20 13.1193 20 14.5V14.5C20 15.8807 18.8807 17 17.5 17H12.5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        <path d="M15 15.5L12.5 17L15 18.5V15.5Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </button>
                                <button id="response-search-btn" class="response-action-btn" title="Search (Ctrl+F)">
                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path fill-rule="evenodd" clip-rule="evenodd" d="M7.25007 2.38782C8.54878 2.0992 10.1243 2 12 2C13.8757 2 15.4512 2.0992 16.7499 2.38782C18.06 2.67897 19.1488 3.176 19.9864 4.01358C20.824 4.85116 21.321 5.94002 21.6122 7.25007C21.9008 8.54878 22 10.1243 22 12C22 13.8757 21.9008 15.4512 21.6122 16.7499C21.321 18.06 20.824 19.1488 19.9864 19.9864C19.1488 20.824 18.06 21.321 16.7499 21.6122C15.4512 21.9008 13.8757 22 12 22C10.1243 22 8.54878 21.9008 7.25007 21.6122C5.94002 21.321 4.85116 20.824 4.01358 19.9864C3.176 19.1488 2.67897 18.06 2.38782 16.7499C2.0992 15.4512 2 13.8757 2 12C2 10.1243 2.0992 8.54878 2.38782 7.25007C2.67897 5.94002 3.176 4.85116 4.01358 4.01358C4.85116 3.176 5.94002 2.67897 7.25007 2.38782ZM9 11.5C9 10.1193 10.1193 9 11.5 9C12.8807 9 14 10.1193 14 11.5C14 12.8807 12.8807 14 11.5 14C10.1193 14 9 12.8807 9 11.5ZM11.5 7C9.01472 7 7 9.01472 7 11.5C7 13.9853 9.01472 16 11.5 16C12.3805 16 13.202 15.7471 13.8957 15.31L15.2929 16.7071C15.6834 17.0976 16.3166 17.0976 16.7071 16.7071C17.0976 16.3166 17.0976 15.6834 16.7071 15.2929L15.31 13.8957C15.7471 13.202 16 12.3805 16 11.5C16 9.01472 13.9853 7 11.5 7Z"/>
                                    </svg>
                                </button>
                                <button id="response-copy-btn" class="response-action-btn" title="Copy to Clipboard">
                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path fill-rule="evenodd" clip-rule="evenodd" d="M21 8C21 6.34315 19.6569 5 18 5H10C8.34315 5 7 6.34315 7 8V20C7 21.6569 8.34315 23 10 23H18C19.6569 23 21 21.6569 21 20V8ZM19 8C19 7.44772 18.5523 7 18 7H10C9.44772 7 9 7.44772 9 8V20C9 20.5523 9.44772 21 10 21H18C18.5523 21 19 20.5523 19 20V8Z"/>
                                        <path d="M6 3H16C16.5523 3 17 2.55228 17 2C17 1.44772 16.5523 1 16 1H6C4.34315 1 3 2.34315 3 4V18C3 18.5523 3.44772 19 4 19C4.55228 19 5 18.5523 5 18V4C5 3.44772 5.44772 3 6 3Z"/>
                                    </svg>
                                </button>
                                <button id="response-save-btn" class="response-action-btn" title="Save to File">
                                    <svg viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M790.706 338.824v112.94H395.412c-31.06 0-56.47 25.3-56.47 56.471v744.509c17.73-6.325 36.592-10.391 56.47-10.391h1129.412c19.877 0 38.738 4.066 56.47 10.39V508.236c0-31.171-25.412-56.47-56.47-56.47h-395.295V338.824h395.295c93.402 0 169.411 76.009 169.411 169.411v1242.353c0 93.403-76.01 169.412-169.411 169.412H395.412C302.009 1920 226 1843.99 226 1750.588V508.235c0-93.402 76.01-169.411 169.412-169.411h395.294Zm734.118 1016.47H395.412c-31.06 0-56.47 25.299-56.47 56.47v338.824c0 31.172 25.41 56.47 56.47 56.47h1129.412c31.058 0 56.47-25.298 56.47-56.47v-338.823c0-31.172-25.412-56.47-56.47-56.47ZM1016.622-.023v880.151l246.212-246.325 79.85 79.85-382.532 382.644-382.645-382.644 79.85-79.85L903.68 880.128V-.022h112.941ZM564.824 1468.235c-62.344 0-112.942 50.71-112.942 112.941s50.598 112.942 112.942 112.942c62.343 0 112.94-50.71 112.94-112.942 0-62.23-50.597-112.94-112.94-112.94Z" fill-rule="evenodd"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="response-body-viewport" id="response-body-viewport">
                            <div id="codemirror-view-wrapper">
                                <textarea id="response-body-display"></textarea>
                                <div id="response-search-widget" class="response-search-widget">
                                    <div class="search-input-container">
                                        <input type="text" id="search-widget-input" placeholder="Search" spellcheck="false">
                                        <div id="search-widget-matches" class="search-matches"></div>
                                    </div>
                                    <div class="search-actions">
                                        <button id="search-widget-prev" class="search-btn" title="Previous match (Shift+Enter)">
                                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.53 9.53a.75.75 0 0 1-1.06 0L8 5.94 4.53 9.53a.75.75 0 1 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06Z"></path></svg>
                                        </button>
                                        <button id="search-widget-next" class="search-btn" title="Next match (Enter)">
                                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.47 6.47a.75.75 0 0 1 1.06 0L8 9.94l3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06Z"></path></svg>
                                        </button>
                                        <button id="search-widget-close" class="search-btn" title="Close (Escape)">
                                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.343 2.343a.75.75 0 0 1 1.06 0L8 6.94l4.597-4.597a.75.75 0 1 1 1.06 1.06L9.06 8l4.597 4.597a.75.75 0 1 1-1.06 1.06L8 9.06l-4.597 4.597a.75.75 0 0 1-1.06-1.06L6.94 8 2.343 3.403a.75.75 0 0 1 0-1.06Z"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div id="json-tree-view-wrapper" class="hidden">
                                <div id="json-tree-view"></div>
                            </div>
                            <div id="hex-view-wrapper" class="hidden"></div>
                            <div id="raw-text-view-wrapper" class="hidden">
                                <pre id="raw-text-pre"></pre>
                            </div>
                            <div id="html-preview-wrapper" class="hidden">
                                <iframe id="html-preview-iframe" sandbox="allow-scripts"></iframe>
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-response-headers">
                        <div class="response-view-controls">
                            <button id="headers-view-toggle" class="view-toggle-btn">Raw</button>
                        </div>
                        <div id="headers-table-view" class="headers-view active">
                            <div class="headers-table-header">
                                <div class="headers-table-cell">Key</div>
                                <div class="headers-table-cell">Value</div>
                            </div>
                            <div id="headers-table-body" class="headers-table-body"></div>
                        </div>
                        <div id="headers-raw-view" class="headers-view">
                            <textarea id="response-headers-display-raw"></textarea>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-response-cookies">
                        <div class="cookies-container">
                            <div class="cookies-header">
                                <h4>Cookies</h4>
                                <div class="cookies-actions">
                                    <button id="cookies-copy-btn" class="cookies-action-btn" title="Copy All Cookies">
                                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path fill-rule="evenodd" clip-rule="evenodd" d="M21 8C21 6.34315 19.6569 5 18 5H10C8.34315 5 7 6.34315 7 8V20C7 21.6569 8.34315 23 10 23H18C19.6569 23 21 21.6569 21 20V8ZM19 8C19 7.44772 18.5523 7 18 7H10C9.44772 7 9 7.44772 9 8V20C9 20.5523 9.44772 21 10 21H18C18.5523 21 19 20.5523 19 20V8Z"/>
                                            <path d="M6 3H16C16.5523 3 17 2.55228 17 2C17 1.44772 16.5523 1 16 1H6C4.34315 1 3 2.34315 3 4V18C3 18.5523 3.44772 19 4 19C4.55228 19 5 18.5523 5 18V4C5 3.44772 5.44772 3 6 3Z"/>
                                        </svg>
                                    </button>
                                    <button id="cookies-clear-btn" class="cookies-action-btn" title="Clear All Cookies">
                                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path fill-rule="evenodd" clip-rule="evenodd" d="M2.343 2.343a.75.75 0 0 1 1.06 0L8 6.94l4.597-4.597a.75.75 0 1 1 1.06 1.06L9.06 8l4.597 4.597a.75.75 0 1 1-1.06 1.06L8 9.06l-4.597 4.597a.75.75 0 0 1-1.06-1.06L6.94 8 2.343 3.403a.75.75 0 0 1 0-1.06Z"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="cookies-content">
                                <div class="cookies-empty-state" id="cookies-empty-state">
                                    <div class="empty-state-icon">🍪</div>
                                    <div class="empty-state-text">No cookies found in response</div>
                                    <div class="empty-state-subtext">Cookies will appear here when the server sets them</div>
                                </div>
                                <div class="cookies-list" id="cookies-list">
                                    <!-- Cookies will be populated here -->
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tab-content" id="tab-test-results">
                        <div class="placeholder">Test results coming soon...</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Floating Action Widget -->
    <div class="floating-widget" id="floating-widget">
        <div class="widget-trigger" id="widget-trigger">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="widget-menu" id="widget-menu">
            <div class="widget-item" id="widget-ai-generate">
                <div class="widget-icon ai-icon">
                    <svg fill="#ffffff" viewBox="0 0 32 32" id="icon" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><defs><style>.cls-1{fill:none;}</style></defs><title>chat-bot</title><path d="M16,19a6.9908,6.9908,0,0,1-5.833-3.1287l1.666-1.1074a5.0007,5.0007,0,0,0,8.334,0l1.666,1.1074A6.9908,6.9908,0,0,1,16,19Z"></path><path d="M20,8a2,2,0,1,0,2,2A1.9806,1.9806,0,0,0,20,8Z"></path><path d="M12,8a2,2,0,1,0,2,2A1.9806,1.9806,0,0,0,12,8Z"></path><path d="M17.7358,30,16,29l4-7h6a1.9966,1.9966,0,0,0,2-2V6a1.9966,1.9966,0,0,0-2-2H6A1.9966,1.9966,0,0,0,4,6V20a1.9966,1.9966,0,0,0,2,2h9v2H6a3.9993,3.9993,0,0,1-4-4V6A3.9988,3.9988,0,0,1,6,2H26a3.9988,3.9988,0,0,1,4,4V20a3.9993,3.9993,0,0,1-4,4H21.1646Z"></path><rect id="_Transparent_Rectangle_" data-name="&lt;Transparent Rectangle&gt;" class="cls-1" width="32" height="32"></rect></g></svg>
                </div>
                <span class="widget-label">AI Generate</span>
                <div class="widget-connector"></div>
            </div>
            <div class="widget-item" id="widget-import">
                <div class="widget-icon import-icon">
<svg fill="#ffffff" height="16px" width="16px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
	 viewBox="0 0 490.065 490.065" xml:space="preserve">
<g>
	<g>
		<path d="M223.783,340.965c3.7,3,8.7,3.7,13,1.6c4.3-2,7-6.3,7-11.1v-83.4c78,0.3,131.9,5.9,197.2,121.2c2.2,3.9,6.3,6.2,10.7,6.2
			c1,0,2.1-0.1,3.1-0.4c5.4-1.4,9.1-6.3,9.1-11.8v-9.7c0.5-81.5,1.4-249.5-220.1-257.5v-83.8c0-4.7-2.7-9.1-7-11.1s-9.4-1.4-13,1.6
			l-193.2,159.5c-2.8,2.3-4.5,5.8-4.5,9.4c0,3.7,1.6,7.1,4.4,9.4L223.783,340.965z M219.283,38.265v69.8c0,6.7,5.4,12.2,12.1,12.3
			c92.1,0.9,151.8,29,182.6,86.1c19.4,35.8,24.1,78.1,25.2,113.6c-62.9-91.3-122-96.4-207.7-96.5l0,0c-3.2,0-6.4,1.3-8.7,3.6
			s-3.6,5.4-3.6,8.7v69.7l-161.6-133.9L219.283,38.265z"/>
		<path d="M463.983,477.865v-53.8c0-6.8-5.5-12.3-12.3-12.3s-12.3,5.5-12.3,12.3v41.6h-386.3v-213.8c0-6.8-5.5-12.3-12.3-12.3
			s-12.3,5.5-12.3,12.3v225.9c0,6.8,5.5,12.3,12.3,12.3h410.9C458.483,490.065,463.983,484.565,463.983,477.865z"/>
	</g>
</g>
</svg>
                </div>
                <span class="widget-label">Import</span>
                <div class="widget-connector"></div>
            </div>
            <div class="widget-item" id="widget-export">
                <div class="widget-icon export-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L12 16M12 16L6 10M12 16L18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M21 20H3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </div>
                <span class="widget-label">Export</span>
                <div class="widget-connector"></div>
            </div>
            <div class="widget-item" id="widget-clear" data-testid="clear-request-btn">
                <div class="widget-icon clear-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <span class="widget-label">Clear</span>
                <div class="widget-connector"></div>
            </div>
        </div>
    </div>

    <!-- Import Dialog -->
    <div class="import-dialog-overlay hidden" id="import-dialog-overlay">
        <div class="import-dialog">
            <div class="import-dialog-header">
                <h3>Import cURL / Request</h3>
                <button class="import-dialog-close" id="import-dialog-close">×</button>
            </div>
            <div class="import-dialog-content">
                <div class="import-tabs">
                    <button class="import-tab active" data-tab="curl">cURL</button>
                    <button class="import-tab" data-tab="postman">Postman</button>
                    <button class="import-tab" data-tab="har">HAR</button>
                </div>
                <div class="import-tab-content active" id="curl-tab">
                    <label class="import-label">Paste your cURL command:</label>
                    <textarea id="curl-input" class="import-textarea" placeholder="curl -X GET 'https://api.example.com/users' -H 'Authorization: Bearer token123'"></textarea>
                    <div class="import-info">
                        <p>💡 <strong>Supported options:</strong> -X, -H, -d, --data-raw, --header, --url, --request</p>
                    </div>
                </div>
                <div class="import-tab-content" id="postman-tab">
                    <label class="import-label">Paste Postman collection JSON:</label>
                    <textarea id="postman-input" class="import-textarea" placeholder='{"info":{"name":"My Collection"},"item":[{"name":"Get Users","request":{"method":"GET","url":"https://api.example.com/users"}}]}'></textarea>
                </div>
                <div class="import-tab-content" id="har-tab">
                    <label class="import-label">Paste HAR (HTTP Archive) JSON:</label>
                    <textarea id="har-input" class="import-textarea" placeholder='{"log":{"entries":[{"request":{"method":"GET","url":"https://api.example.com/users"}}]}}'></textarea>
                </div>
            </div>
            <div class="import-dialog-footer">
                <button class="import-btn-secondary" id="import-dialog-cancel">Cancel</button>
                <button class="import-btn-primary" id="import-dialog-import">Import</button>
            </div>
        </div>
    </div>

    <!-- Export Dialog -->
    <div class="export-dialog-overlay hidden" id="export-dialog-overlay">
        <div class="export-dialog">
            <div class="export-dialog-header">
                <h3>Export as cURL</h3>
                <button class="export-dialog-close" id="export-dialog-close">×</button>
            </div>
            <div class="export-dialog-content">
                <div class="export-info">
                    <p>💡 <strong>Generated cURL command:</strong></p>
                </div>
                <textarea id="curl-output" class="export-textarea" readonly></textarea>
            </div>
            <div class="export-dialog-footer">
                <button class="export-btn-secondary" id="export-dialog-copy">Copy to Clipboard</button>
                <button class="export-btn-primary" id="export-dialog-close-btn">Close</button>
            </div>
        </div>
    </div>

    <!-- Save Request Dialog -->
    <div class="save-dialog-overlay hidden" id="save-dialog-overlay">
        <div class="save-dialog">
            <div class="save-dialog-header">
                <h3>Save Request</h3>
                <button class="save-dialog-close" id="save-dialog-close">×</button>
            </div>
            <div class="save-dialog-content">
                <div class="save-form-row">
                    <label class="save-label" for="save-request-name">Request Name</label>
                    <input type="text" id="save-request-name" class="save-input" placeholder="Enter request name">
                </div>
                <div class="save-form-row">
                    <label class="save-label">Select Collection</label>
                    <div class="save-collection-dropdown">
                        <div class="save-dropdown-selected" id="save-collection-selected" tabindex="0">
                            <span id="selected-collection-text">Choose a collection...</span>
                            <span class="dropdown-arrow">▼</span>
                        </div>
                        <div class="save-dropdown-menu hidden" id="save-dropdown-menu">
                            <div class="save-dropdown-search">
                                <input type="text" id="save-collection-search" placeholder="Search for collection or folder" class="save-search-input">
                            </div>
                            <div class="save-dropdown-content" id="save-dropdown-content">
                                <!-- Collections will be populated here -->
                            </div>
                            <div class="save-dropdown-footer">
                                <button class="save-create-collection-btn" id="save-create-collection-btn">
                                    <span class="btn-icon">+</span>
                                    Create Collection
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="save-dialog-footer">
                <button class="save-btn-secondary" id="save-dialog-cancel">Cancel</button>
                <button class="save-btn-primary" id="save-dialog-save">Save</button>
            </div>
        </div>
    </div>

    <!-- AI Chat Widget -->
    <div class="ai-chat-widget hidden" id="ai-chat-widget">
       

        <!-- Expanded Chat Mode (Full Interface) -->
        <div class="ai-chat-mode hidden" id="ai-chat-mode">
                <div class="ai-chat-title">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="27" height="27" viewBox="524.44232 141.3269 369.6731 369.6731"><g fill="none" fill-rule="nonzero" stroke="none" stroke-width="none" stroke-linecap="none" stroke-linejoin="none" stroke-miterlimit="10" stroke-dasharray="none" font-family="none" font-weight="none" font-size="none"><path d="M779.74034,466.63928l-107.47488,-234.88648l16.90899,-4.13767l89.10982,88.08506z" id="Path-1" fill="#d9d3d3" stroke="#c7c6cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,1"></path><path d="M533.44232,328.16345c0,-97.11184 78.72471,-175.83655 175.83655,-175.83655c97.11184,0 175.83655,78.72471 175.83655,175.83655c0,97.11184 -78.72471,175.83655 -175.83655,175.83655c-97.11184,0 -175.83655,-78.72471 -175.83655,-175.83655z" id="Path-1-1" fill-opacity="0" fill="#000000" stroke="#dadbe2" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path><g id="Path-1-2"><path d="M677.98124,256.76298c2.90608,23.51744 0.34916,42.88483 -5.29921,65.69257c-2.151,8.68561 -2.95199,16.82561 -7.34079,24.67166" id="Path-1-3" fill-opacity="0" fill="#000000"></path><path d="M665.41646,346.9855c-0.00043,0.00146 0.00022,0.00303 0.00155,0.00377c0.00134,0.00074 0.003,0.00045 0.00402,-0.00069v0c0.16339,-0.29067 0.32677,-0.58134 0.48525,-0.87477c0.15847,-0.29343 0.31203,-0.58964 0.46202,-0.88768c0.14999,-0.29804 0.29641,-0.59792 0.43897,-0.89969c0.14256,-0.30177 0.28126,-0.60543 0.41628,-0.91076c0.13503,-0.30533 0.26638,-0.61233 0.39416,-0.92086c0.12778,-0.30852 0.252,-0.61857 0.37281,-0.92997c0.12081,-0.3114 0.23821,-0.62416 0.35239,-0.93811c0.11418,-0.31395 0.22514,-0.6291 0.33308,-0.94529c0.10795,-0.31619 0.21288,-0.63343 0.31503,-0.95156c0.10215,-0.31813 0.20152,-0.63716 0.29836,-0.95696c0.09684,-0.31979 0.19114,-0.64035 0.28317,-0.96154c0.09203,-0.32119 0.18179,-0.64302 0.26956,-0.96537c0.08776,-0.32235 0.17353,-0.64522 0.25758,-0.9685c0.08405,-0.32328 0.16638,-0.64698 0.24728,-0.97099c0.0809,-0.32401 0.16037,-0.64834 0.23869,-0.9729c0.07832,-0.32456 0.15549,-0.64934 0.23181,-0.97426c0.07631,-0.32493 0.15177,-0.65 0.22665,-0.97514c0.07488,-0.32514 0.14918,-0.65035 0.22318,-0.97555c0.074,-0.3252 0.14771,-0.6504 0.22139,-0.97553c0.07368,-0.32513 0.14734,-0.65018 0.22123,-0.9751c0.0739,-0.32492 0.14803,-0.6497 0.22267,-0.97428c0.07463,-0.32458 0.14977,-0.64895 0.22564,-0.97306c0.07587,-0.32411 0.15248,-0.64795 0.2301,-0.97146c0.07762,-0.32351 0.15624,-0.6467 0.23597,-0.96947c0.07973,-0.32277 0.16055,-0.64513 0.24319,-0.96708c0.08263,-0.32195 0.16708,-0.6435 0.25142,-0.9659c0.08435,-0.3224 0.16859,-0.64564 0.25231,-0.96882c0.08372,-0.32318 0.1669,-0.64629 0.24964,-0.96959c0.08274,-0.3233 0.16505,-0.64678 0.24687,-0.97039c0.08182,-0.32361 0.16315,-0.64734 0.24398,-0.97121c0.08083,-0.32388 0.16116,-0.6479 0.24097,-0.97206c0.07981,-0.32416 0.1591,-0.64847 0.23786,-0.97293c0.07875,-0.32446 0.15697,-0.64906 0.23462,-0.97382c0.07765,-0.32476 0.15475,-0.64967 0.23126,-0.97473c0.07652,-0.32506 0.15245,-0.65028 0.22779,-0.97566c0.07534,-0.32538 0.15007,-0.65091 0.22419,-0.97661c0.07412,-0.3257 0.14762,-0.65156 0.22047,-0.97758c0.07286,-0.32602 0.14508,-0.65221 0.21663,-0.97856c0.07156,-0.32635 0.14245,-0.65287 0.21267,-0.97956c0.07022,-0.32669 0.13976,-0.65354 0.20858,-0.98056c0.06882,-0.32703 0.13693,-0.65422 0.20437,-0.98158c0.06744,-0.32736 0.13422,-0.65488 0.20003,-0.98261c0.06582,-0.32773 0.13067,-0.65568 0.19557,-0.98365c0.0649,-0.32798 0.12985,-0.65598 0.19099,-0.98469c0.06114,-0.32871 0.11848,-0.65813 0.17228,-0.98815c0.0538,-0.33002 0.10408,-0.66063 0.15424,-0.99125c0.05017,-0.33062 0.10023,-0.66124 0.14925,-0.99202c0.04902,-0.33078 0.09699,-0.66172 0.14414,-0.99278c0.04715,-0.33105 0.09348,-0.66222 0.13891,-0.99352c0.04543,-0.33129 0.08995,-0.66271 0.13357,-0.99424c0.04362,-0.33153 0.08633,-0.66318 0.12812,-0.99494c0.04179,-0.33176 0.08264,-0.66364 0.12256,-0.99562c0.03991,-0.33199 0.07888,-0.66408 0.11689,-0.99628c0.03801,-0.3322 0.07505,-0.66451 0.11112,-0.99692c0.03607,-0.33241 0.07116,-0.66492 0.10526,-0.99752c0.0341,-0.3326 0.0672,-0.6653 0.0993,-0.99809c0.0321,-0.33279 0.06318,-0.66567 0.09325,-0.99864c0.03006,-0.33297 0.05911,-0.66602 0.08711,-0.99915c0.02801,-0.33313 0.05498,-0.66634 0.0809,-0.99962c0.02592,-0.33328 0.05079,-0.66663 0.07461,-1.00005c0.02381,-0.33342 0.04657,-0.66691 0.06825,-1.00045c0.02168,-0.33355 0.04229,-0.66715 0.06182,-1.00081c0.01953,-0.33366 0.03798,-0.66737 0.05534,-1.00112c0.01736,-0.33376 0.03363,-0.66756 0.0488,-1.00139c0.01517,-0.33384 0.02925,-0.66771 0.04222,-1.00162c0.01297,-0.33391 0.02483,-0.66784 0.03559,-1.0018c0.01075,-0.33396 0.0204,-0.66794 0.02893,-1.00194c0.00853,-0.334 0.01594,-0.66801 0.02223,-1.00203c0.00629,-0.33402 0.01147,-0.66805 0.01552,-1.00208c0.00405,-0.33403 0.00698,-0.66805 0.00878,-1.00207c0.0018,-0.33402 0.00248,-0.66803 0.00204,-1.00202c-0.00045,-0.33399 -0.00202,-0.66797 -0.00472,-1.00192c-0.0027,-0.33395 -0.00652,-0.66788 -0.01147,-1.00178c-0.00495,-0.3339 -0.01102,-0.66776 -0.01821,-1.00159c-0.00719,-0.33382 -0.01551,-0.66761 -0.02495,-1.00135c-0.00944,-0.33374 -0.01999,-0.66743 -0.03166,-1.00106c-0.01167,-0.33364 -0.02446,-0.66722 -0.03836,-1.00074c-0.0139,-0.33352 -0.02891,-0.66698 -0.04502,-1.00036c-0.01612,-0.33339 -0.03334,-0.66671 -0.05166,-0.99995c-0.01832,-0.33324 -0.03774,-0.66641 -0.05825,-0.99949c-0.02051,-0.33308 -0.04212,-0.66608 -0.06481,-0.99899c-0.02269,-0.33291 -0.04646,-0.66573 -0.07131,-0.99846c-0.02485,-0.33272 -0.05078,-0.66535 -0.07777,-0.99788c-0.02699,-0.33253 -0.05505,-0.66495 -0.08417,-0.99727c-0.02912,-0.33231 -0.05929,-0.66451 -0.09051,-0.99662c-0.03122,-0.33211 -0.0635,-0.66412 -0.09679,-0.99594c-0.0333,-0.33182 -0.06762,-0.66344 -0.10301,-0.99523c-0.03539,-0.33179 -0.07185,-0.66374 -0.10915,-0.99449c-0.03731,-0.33075 -0.07547,-0.66029 -0.11523,-0.99371c-0.03976,-0.33343 -0.08113,-0.67074 -0.12123,-0.99292c-0.0401,-0.32217 -0.07894,-0.62919 -0.12716,-0.99209c-0.04822,-0.3629 -0.10582,-0.78166 -0.13301,-0.99124c-0.02718,-0.20958 0,0 0,0v0c0,0 -0.02394,-0.20997 0,0c0.02394,0.20997 0.06859,0.63029 0.10645,0.99437c0.03786,0.36407 0.06893,0.6719 0.10057,0.9949c0.03164,0.323 0.06383,0.66118 0.09461,0.9954c0.03078,0.33422 0.06013,0.66447 0.08857,0.99587c0.02845,0.33141 0.05599,0.66397 0.08247,0.99631c0.02648,0.33234 0.05191,0.66446 0.0763,0.99671c0.02439,0.33226 0.04775,0.66465 0.07006,0.99708c0.02231,0.33243 0.04356,0.6649 0.06376,0.99742c0.0202,0.33252 0.03933,0.6651 0.0574,0.99771c0.01807,0.33262 0.03506,0.66527 0.05098,0.99797c0.01592,0.33269 0.03076,0.66542 0.04452,0.99818c0.01376,0.33276 0.02643,0.66555 0.038,0.99836c0.01158,0.33281 0.02206,0.66564 0.03145,0.99849c0.00938,0.33285 0.01767,0.66571 0.02485,0.99858c0.00718,0.33287 0.01326,0.66575 0.01822,0.99863c0.00497,0.33288 0.00882,0.66576 0.01156,0.99864c0.00274,0.33287 0.00437,0.66574 0.00488,0.9986c0.00051,0.33285 -0.0001,0.66569 -0.00182,0.99851c-0.00173,0.33282 -0.00457,0.66562 -0.00854,0.99839c-0.00397,0.33277 -0.00905,0.66551 -0.01526,0.99821c-0.00621,0.3327 -0.01354,0.66537 -0.02199,0.998c-0.00845,0.33263 -0.01802,0.66521 -0.02871,0.99774c-0.01069,0.33253 -0.0225,0.66501 -0.03542,0.99744c-0.01292,0.33242 -0.02697,0.66479 -0.04212,0.99709c-0.01515,0.3323 -0.03142,0.66454 -0.0488,0.9967c-0.01738,0.33217 -0.03586,0.66426 -0.05545,0.99627c-0.01959,0.33202 -0.04028,0.66395 -0.06206,0.99581c-0.02179,0.33185 -0.04467,0.66362 -0.06864,0.9953c-0.02397,0.33168 -0.04903,0.66327 -0.07518,0.99476c-0.02614,0.33149 -0.05337,0.66288 -0.08166,0.99418c-0.02829,0.33129 -0.05766,0.66248 -0.08809,0.99356c-0.03043,0.33108 -0.06192,0.66206 -0.09446,0.99292c-0.03254,0.33086 -0.06613,0.66161 -0.10076,0.99224c-0.03463,0.33063 -0.0703,0.66114 -0.10699,0.99153c-0.03669,0.33039 -0.07441,0.66066 -0.11314,0.9908c-0.03873,0.33014 -0.07847,0.66016 -0.11922,0.99004c-0.04074,0.32989 -0.08248,0.65964 -0.1252,0.98926c-0.04272,0.32962 -0.08643,0.65911 -0.1311,0.98846c-0.04467,0.32935 -0.09031,0.65857 -0.13691,0.98764c-0.04659,0.32908 -0.09414,0.65801 -0.14261,0.98681c-0.04848,0.3288 -0.09789,0.65745 -0.14822,0.98596c-0.05033,0.32851 -0.10157,0.65688 -0.15372,0.9851c-0.05215,0.32822 -0.1052,0.6563 -0.15911,0.98423c-0.05392,0.32793 -0.1087,0.65572 -0.1644,0.98335c-0.0557,0.32763 -0.11231,0.6551 -0.16957,0.98246c-0.05726,0.32736 -0.11517,0.65461 -0.17463,0.98158c-0.05946,0.32697 -0.12047,0.65367 -0.17957,0.98069c-0.0591,0.32702 -0.11628,0.65436 -0.17123,0.98213c-0.05495,0.32777 -0.10768,0.65596 -0.16198,0.98391c-0.0543,0.32795 -0.11019,0.65565 -0.16661,0.98328c-0.05642,0.32763 -0.11338,0.6552 -0.17112,0.98264c-0.05774,0.32745 -0.11628,0.65478 -0.17551,0.98201c-0.05923,0.32723 -0.11915,0.65435 -0.17977,0.98137c-0.06062,0.32702 -0.12193,0.65393 -0.18392,0.98073c-0.06198,0.3268 -0.12463,0.6535 -0.18794,0.98009c-0.0633,0.32659 -0.12725,0.65308 -0.19183,0.97946c-0.06458,0.32638 -0.12979,0.65266 -0.19561,0.97883c-0.06582,0.32617 -0.13225,0.65224 -0.19926,0.97821c-0.06702,0.32597 -0.13462,0.65183 -0.20279,0.9776c-0.06817,0.32576 -0.13692,0.65143 -0.20621,0.97699c-0.06929,0.32556 -0.13913,0.65103 -0.2095,0.9764c-0.07037,0.32537 -0.14127,0.65063 -0.21267,0.97581c-0.07141,0.32518 -0.14332,0.65026 -0.21573,0.97523c-0.07241,0.32497 -0.1453,0.64984 -0.21868,0.97467c-0.07337,0.32483 -0.14722,0.64963 -0.22151,0.97412c-0.07429,0.32449 -0.14901,0.64868 -0.22422,0.97358c-0.07521,0.3249 -0.1509,0.6505 -0.22478,0.97658c-0.07389,0.32608 -0.14597,0.65262 -0.21687,0.97928c-0.07091,0.32666 -0.14063,0.65343 -0.2093,0.98033c-0.06867,0.32691 -0.13629,0.65395 -0.20312,0.98105c-0.06683,0.32711 -0.13288,0.65428 -0.19839,0.98147c-0.06551,0.32719 -0.13048,0.6544 -0.19517,0.98159c-0.06469,0.32718 -0.12911,0.65434 -0.19352,0.98142c-0.06441,0.32708 -0.12882,0.65408 -0.19349,0.98096c-0.06468,0.32688 -0.12962,0.65363 -0.19512,0.98021c-0.0655,0.32658 -0.13155,0.65299 -0.19844,0.97916c-0.06689,0.32618 -0.13462,0.65213 -0.20348,0.97779c-0.06886,0.32566 -0.13885,0.65104 -0.21026,0.97606c-0.07141,0.32502 -0.14423,0.6497 -0.21877,0.97394c-0.07453,0.32425 -0.15078,0.64807 -0.22901,0.97139c-0.07823,0.32332 -0.15846,0.64614 -0.24096,0.96836c-0.0825,0.32222 -0.16727,0.64385 -0.25458,0.96479c-0.08731,0.32094 -0.17716,0.64118 -0.26981,0.96062c-0.09265,0.31944 -0.18809,0.63807 -0.28657,0.95579c-0.09848,0.31771 -0.19999,0.6345 -0.30477,0.95023c-0.10477,0.31573 -0.2128,0.63041 -0.32428,0.9439c-0.11148,0.31349 -0.22641,0.62579 -0.34497,0.93674c-0.11856,0.31096 -0.24075,0.62058 -0.36668,0.92872c-0.12593,0.30814 -0.2556,0.61481 -0.38922,0.9198c-0.13362,0.30499 -0.27119,0.60831 -0.41241,0.90999c-0.14123,0.30168 -0.28611,0.60172 -0.43606,0.89928c-0.14994,0.29756 -0.30495,0.59264 -0.45995,0.88772z" id="item14161-1" fill="#c7c6cf" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g><g id="Path-1-4"><path d="M681.31474,272.08304c0.32338,2.62686 0.35817,5.3056 0.97014,7.88057c0.3999,1.68264 3.09091,3.04566 3.80988,4.63517c1.56171,3.45266 0.82539,8.28009 0.60995,11.91131c-0.47369,7.98417 -2.51793,15.75613 -4.67737,23.46179c-1.40534,5.01475 -2.00198,8.72572 -6.32872,11.83527" id="Path-1-5" fill-opacity="0" fill="#000000"></path><path d="M676.30673,331.29315c-0.01256,0.01573 -0.01253,0.03806 0.00006,0.05376c0.01259,0.0157 0.03438,0.02058 0.05246,0.01175v0c0.26236,-0.20784 0.52473,-0.41568 0.77696,-0.63617c0.25223,-0.22049 0.49433,-0.45364 0.72702,-0.69626c0.23268,-0.24262 0.45595,-0.49472 0.66796,-0.75648c0.21201,-0.26177 0.41277,-0.5332 0.60196,-0.81271c0.18919,-0.2795 0.36681,-0.56707 0.53328,-0.86095c0.16648,-0.29389 0.32181,-0.59409 0.46735,-0.89876c0.14554,-0.30467 0.28129,-0.61379 0.40912,-0.9258c0.12783,-0.31201 0.24775,-0.62689 0.36181,-0.94343c0.11407,-0.31654 0.22229,-0.63473 0.32664,-0.95371c0.10436,-0.31898 0.20485,-0.63874 0.30328,-0.95862c0.09842,-0.31988 0.19478,-0.63988 0.29049,-0.95971c0.09572,-0.31982 0.1908,-0.63946 0.28671,-0.95804c0.09591,-0.31858 0.19264,-0.63609 0.29031,-0.95445c0.09767,-0.31837 0.19628,-0.63759 0.29429,-0.95676c0.098,-0.31917 0.1954,-0.63829 0.29247,-0.95764c0.09707,-0.31935 0.19383,-0.63894 0.29006,-0.95872c0.09623,-0.31979 0.19194,-0.63977 0.28706,-0.96001c0.09512,-0.32024 0.18964,-0.64073 0.28346,-0.9615c0.09382,-0.32077 0.18694,-0.64182 0.27926,-0.96318c0.09232,-0.32136 0.18383,-0.64304 0.27445,-0.96505c0.09061,-0.32202 0.18032,-0.64437 0.26902,-0.9671c0.0887,-0.32273 0.1764,-0.64583 0.26298,-0.96932c0.08658,-0.32349 0.17206,-0.64739 0.25631,-0.9717c0.08425,-0.32431 0.16729,-0.64905 0.249,-0.97423c0.08172,-0.32518 0.16212,-0.6508 0.24106,-0.97689c0.07894,-0.32609 0.15641,-0.65265 0.23246,-0.97967c0.07604,-0.32702 0.15065,-0.6545 0.2232,-0.98255c0.07255,-0.32805 0.14305,-0.65665 0.21327,-0.98552c0.07022,-0.32886 0.14017,-0.65798 0.20267,-0.98855c0.0625,-0.33057 0.11756,-0.6626 0.16571,-0.99574c0.04814,-0.33314 0.08937,-0.66739 0.12977,-1.00171c0.0404,-0.33433 0.07998,-0.66873 0.11695,-1.00348c0.03697,-0.33474 0.07134,-0.66982 0.10345,-1.00511c0.03212,-0.33529 0.06199,-0.67078 0.0893,-1.00658c0.02731,-0.3358 0.05206,-0.67189 0.07449,-1.00786c0.02243,-0.33597 0.04254,-0.67182 0.05904,-1.00892c0.0165,-0.3371 0.02939,-0.67545 0.04295,-1.00826c0.01357,-0.33281 0.02781,-0.66007 0.04424,-0.99032c0.01643,-0.33025 0.03505,-0.66348 0.05321,-0.99706c0.01816,-0.33358 0.03586,-0.66751 0.05197,-1.00235c0.01611,-0.33484 0.03061,-0.67058 0.04214,-1.00699c0.01153,-0.33641 0.02007,-0.6735 0.02433,-1.01123c0.00425,-0.33773 0.00422,-0.6761 -0.00157,-1.01496c-0.00579,-0.33886 -0.01734,-0.67821 -0.03625,-1.01777c-0.0189,-0.33957 -0.04516,-0.67935 -0.08091,-1.01886c-0.03575,-0.33951 -0.08098,-0.67875 -0.13729,-1.01681c-0.0563,-0.33806 -0.12367,-0.67495 -0.20746,-1.00928c-0.08378,-0.33433 -0.18398,-0.66609 -0.29345,-0.99251c-0.10947,-0.32642 -0.22822,-0.6475 -0.39663,-0.96203c-0.16841,-0.31453 -0.38649,-0.6225 -0.61931,-0.89246c-0.23281,-0.26996 -0.48036,-0.5019 -0.73095,-0.72813c-0.25059,-0.22623 -0.50421,-0.44675 -0.75352,-0.66604c-0.24932,-0.21929 -0.49433,-0.43735 -0.72943,-0.66507c-0.2351,-0.22772 -0.46029,-0.4651 -0.64545,-0.716c-0.18516,-0.2509 -0.33029,-0.51531 -0.43394,-0.81393c-0.10364,-0.29862 -0.16579,-0.63144 -0.22947,-0.95918c-0.06368,-0.32774 -0.12888,-0.65041 -0.18597,-0.97627c-0.05709,-0.32586 -0.10606,-0.65493 -0.15171,-0.98464c-0.04564,-0.32971 -0.08795,-0.66006 -0.12759,-0.98996c-0.03964,-0.32991 -0.0766,-0.65938 -0.11375,-0.99303c-0.03714,-0.33365 -0.07447,-0.67146 -0.11021,-0.99428c-0.03575,-0.32281 -0.06992,-0.63062 -0.11699,-0.99384c-0.04708,-0.36322 -0.10706,-0.78186 -0.13412,-0.99149c-0.02706,-0.20963 0,0 0,0v0c0,0 -0.02121,-0.21026 0,0c0.02121,0.21026 0.05776,0.6314 0.08608,0.99631c0.02832,0.36491 0.04842,0.67358 0.06885,0.9975c0.02042,0.32392 0.04118,0.66308 0.0621,0.99829c0.02092,0.33521 0.042,0.66648 0.0658,0.99889c0.0238,0.33241 0.05031,0.66597 0.08002,0.9992c0.0297,0.33323 0.0626,0.66612 0.10486,0.99876c0.04227,0.33265 0.09391,0.66505 0.14045,0.99677c0.04654,0.33172 0.08797,0.66277 0.18844,0.9964c0.10047,0.33363 0.25997,0.66985 0.45325,0.96659c0.19328,0.29674 0.42034,0.55399 0.65424,0.80151c0.2339,0.24753 0.47463,0.48532 0.71481,0.71813c0.24018,0.23281 0.47982,0.46063 0.7128,0.69402c0.23298,0.23339 0.45931,0.47235 0.6524,0.71502c0.19309,0.24267 0.35295,0.48905 0.48383,0.76844c0.13088,0.27939 0.23277,0.5918 0.32203,0.90323c0.08926,0.31144 0.16588,0.62191 0.22848,0.93742c0.0626,0.31552 0.11117,0.63609 0.14909,0.95819c0.03792,0.3221 0.06518,0.64574 0.08355,0.97064c0.01837,0.3249 0.02784,0.65107 0.03025,0.97785c0.00241,0.32678 -0.00225,0.65417 -0.01248,0.98196c-0.01023,0.32779 -0.02603,0.65598 -0.04605,0.98447c-0.02002,0.3285 -0.04426,0.65731 -0.07148,0.98644c-0.02722,0.32913 -0.05743,0.65857 -0.08932,0.98867c-0.0319,0.3301 -0.06548,0.66086 -0.0996,0.99189c-0.03411,0.33104 -0.06876,0.66235 -0.10162,0.99694c-0.03286,0.33459 -0.06394,0.67245 -0.09362,1.00491c-0.02968,0.33246 -0.05797,0.65951 -0.08992,0.9873c-0.03196,0.32779 -0.06758,0.65631 -0.10545,0.98428c-0.03786,0.32797 -0.07796,0.65539 -0.12052,0.98259c-0.04256,0.3272 -0.08758,0.65417 -0.13497,0.98079c-0.04739,0.32662 -0.09717,0.65289 -0.14879,0.9789c-0.05162,0.32601 -0.1051,0.65176 -0.16197,0.97696c-0.05687,0.3252 -0.11714,0.64987 -0.1745,0.97499c-0.05736,0.32513 -0.11181,0.65072 -0.16261,0.97712c-0.05079,0.3264 -0.09793,0.6536 -0.14836,0.98039c-0.05043,0.3268 -0.10415,0.65319 -0.15916,0.97949c-0.05501,0.3263 -0.11132,0.65251 -0.16932,0.97855c-0.058,0.32603 -0.11769,0.65188 -0.17884,0.97758c-0.06114,0.32569 -0.12374,0.65123 -0.18771,0.97661c-0.06397,0.32537 -0.12933,0.65059 -0.19595,0.97564c-0.06662,0.32506 -0.1345,0.64996 -0.20355,0.97471c-0.06904,0.32475 -0.13925,0.64935 -0.21051,0.97382c-0.07126,0.32446 -0.14358,0.64879 -0.21685,0.97298c-0.07327,0.32419 -0.14749,0.64826 -0.22256,0.97221c-0.07507,0.32395 -0.15098,0.64778 -0.22764,0.97151c-0.07666,0.32373 -0.15406,0.64736 -0.23211,0.97091c-0.07804,0.32355 -0.15672,0.64702 -0.23595,0.97039c-0.07923,0.32338 -0.15901,0.64666 -0.23919,0.96998c-0.08017,0.32332 -0.16074,0.64668 -0.2418,0.96968c-0.08106,0.323 -0.16262,0.64564 -0.24381,0.96949c-0.08119,0.32386 -0.16202,0.64893 -0.24159,0.97352c-0.07957,0.32458 -0.15788,0.64867 -0.23664,0.97227c-0.07877,0.32361 -0.158,0.64674 -0.23905,0.96891c-0.08105,0.32217 -0.16393,0.64339 -0.25043,0.96318c-0.0865,0.31979 -0.17661,0.63815 -0.27231,0.95442c-0.0957,0.31627 -0.19699,0.63044 -0.30595,0.94163c-0.10896,0.31119 -0.2256,0.6194 -0.35188,0.92347c-0.12628,0.30407 -0.26219,0.60401 -0.40929,0.89842c-0.1471,0.29442 -0.30539,0.58331 -0.47559,0.86533c-0.1702,0.28202 -0.35232,0.55716 -0.54638,0.82402c-0.19406,0.26687 -0.40008,0.52546 -0.61636,0.77586c-0.21629,0.2504 -0.44284,0.4926 -0.68083,0.72352c-0.23799,0.23092 -0.4874,0.45057 -0.73682,0.67022z" id="item12335-1" fill="#c7c6cf" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g><path d="M653.63162,339.85625c1.54008,-10.11073 10.98497,-17.05859 21.09571,-15.51849c10.11073,1.54009 17.05859,10.98498 15.51849,21.09571c-1.54008,10.11073 -10.98496,17.05859 -21.0957,15.51849c-10.11073,-1.54009 -17.0586,-10.98498 -15.5185,-21.09571z" id="Path-1-6" fill="#d9d3d3" stroke="#c7c6cf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path><path d="M650.98078,209.43389c0,-10.22258 8.28703,-18.50961 18.50961,-18.50961c10.22257,0 18.50961,8.28704 18.50961,18.50961c0,10.22258 -8.28703,18.50961 -18.50961,18.50961c-10.22257,0 -18.50961,-8.28704 -18.50961,-18.50961z" id="Path-1-7" fill="#d9d3d3" stroke="#c7c6cf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path><g id="Path-1-8" fill="#000000"><path d="M657.42354,207.27358c8.06724,3.49303 15.39046,7.7517 23.35159,11.2007" id="Path-1-9"></path><path d="M679.91935,218.17721c0.03345,0.00661 0.06701,-0.01084 0.08081,-0.04202c0.01379,-0.03118 0.00413,-0.06776 -0.02326,-0.08806v0c-0.29755,-0.15065 -0.59511,-0.30129 -0.89186,-0.45337c-0.29675,-0.15208 -0.59269,-0.30559 -0.8881,-0.46003c-0.29542,-0.15444 -0.59031,-0.3098 -0.88467,-0.4661c-0.29436,-0.1563 -0.58819,-0.31354 -0.88157,-0.47159c-0.29338,-0.15805 -0.5863,-0.31691 -0.87882,-0.47649c-0.29252,-0.15958 -0.58465,-0.31988 -0.87644,-0.48081c-0.29179,-0.16093 -0.58324,-0.32249 -0.87445,-0.48453c-0.29121,-0.16204 -0.58217,-0.32454 -0.87284,-0.48766c-0.29067,-0.16312 -0.58105,-0.32684 -0.87164,-0.4902c-0.29059,-0.16336 -0.58139,-0.32637 -0.87084,-0.49216c-0.28945,-0.16579 -0.57755,-0.33436 -0.87045,-0.49352c-0.29291,-0.15916 -0.59063,-0.30891 -0.89287,-0.44987c-0.30224,-0.14096 -0.609,-0.27312 -0.91467,-0.40756c-0.30567,-0.13444 -0.61025,-0.27116 -0.9153,-0.40704c-0.30505,-0.13589 -0.61056,-0.27094 -0.91616,-0.40585c-0.3056,-0.13491 -0.6113,-0.26968 -0.91724,-0.40398c-0.30594,-0.1343 -0.61211,-0.26813 -0.91853,-0.40143c-0.30641,-0.1333 -0.61307,-0.26608 -0.92002,-0.39822c-0.30696,-0.13214 -0.61422,-0.26363 -0.92172,-0.39435c-0.3075,-0.13072 -0.61524,-0.26065 -0.92359,-0.38982c-0.30836,-0.12917 -0.61733,-0.25757 -0.92564,-0.38465c-0.30831,-0.12708 -0.61595,-0.25285 -0.92785,-0.37884c-0.3119,-0.12599 -0.62806,-0.25219 -0.9302,-0.3724c-0.30213,-0.12021 -0.59023,-0.23443 -0.93267,-0.36536c-0.34243,-0.13093 -0.7392,-0.27858 -0.93525,-0.35771c-0.19605,-0.07914 0,0 0,0v0c0,0 -0.19139,-0.08976 0,0c0.19139,0.08976 0.56949,0.27992 0.89673,0.44469c0.32723,0.16477 0.6036,0.30415 0.8928,0.45173c0.28921,0.14758 0.59126,0.30337 0.88915,0.45823c0.29789,0.15487 0.59161,0.30882 0.88579,0.46419c0.29418,0.15537 0.58882,0.31214 0.88275,0.46959c0.29393,0.15745 0.58714,0.31556 0.88003,0.47443c0.29289,0.15887 0.58545,0.31848 0.87766,0.4787c0.29221,0.16022 0.58407,0.32105 0.87566,0.48241c0.29159,0.16136 0.5829,0.32327 0.87403,0.48555c0.29113,0.16228 0.58207,0.32495 0.87279,0.48811c0.29072,0.16316 0.58121,0.32683 0.87194,0.49009c0.29073,0.16326 0.58171,0.32613 0.8715,0.49149c0.28978,0.16536 0.57836,0.33323 0.87146,0.4923c0.2931,0.15908 0.5907,0.30937 0.89323,0.45005c0.30252,0.14068 0.60996,0.27175 0.91625,0.40519c0.30629,0.13344 0.61144,0.26925 0.91712,0.40407c0.30567,0.13482 0.61188,0.26865 0.9182,0.40225c0.30633,0.1336 0.61278,0.26697 0.9195,0.39975c0.30673,0.13278 0.61373,0.26499 0.92102,0.39656c0.30728,0.13157 0.61485,0.26251 0.92273,0.39268c0.30788,0.13017 0.61608,0.25958 0.92463,0.38812c0.30855,0.12854 0.61744,0.25622 0.92671,0.38289c0.30927,0.12667 0.61893,0.25232 0.92895,0.37698c0.31002,0.12465 0.62041,0.24831 0.93134,0.3704c0.31093,0.12209 0.62239,0.24263 0.93386,0.36317z" id="item13586-1" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g><g id="Path-1-10"><path d="M669.0117,198.87114c3.37222,1.53792 6.97069,2.75475 9.89439,5.17762" id="Path-1-11" fill-opacity="0" fill="#000000"></path><path d="M678.7215,203.94768c0.01661,0.00818 0.03667,0.00376 0.0483,-0.01065c0.01163,-0.01441 0.01172,-0.03495 0.00022,-0.04946v0c-0.24327,-0.2325 -0.48654,-0.465 -0.73893,-0.68895c-0.25239,-0.22394 -0.51389,-0.43933 -0.78028,-0.64929c-0.26639,-0.20996 -0.53766,-0.41449 -0.81413,-0.61185c-0.27647,-0.19737 -0.55814,-0.38757 -0.84061,-0.57801c-0.28247,-0.19044 -0.56573,-0.3811 -0.86014,-0.54879c-0.29441,-0.16769 -0.59997,-0.3124 -0.91586,-0.43201c-0.31589,-0.11961 -0.64212,-0.21412 -0.96449,-0.31197c-0.32237,-0.09785 -0.64089,-0.19904 -0.96388,-0.29882c-0.323,-0.09978 -0.65047,-0.19816 -0.96244,-0.29359c-0.31196,-0.09543 -0.60841,-0.18792 -0.96026,-0.29626c-0.35185,-0.10834 -0.7591,-0.23253 -0.95728,-0.30691c-0.19818,-0.07437 0,0 0,0v0c0,0 -0.18731,-0.09892 0,0c0.18731,0.09892 0.55104,0.32132 0.86903,0.50828c0.31799,0.18695 0.59023,0.33847 0.87488,0.49888c0.28465,0.16041 0.58171,0.32971 0.87534,0.49546c0.29362,0.16575 0.58381,0.32794 0.87054,0.49797c0.28673,0.17003 0.57002,0.3479 0.86045,0.50626c0.29043,0.15835 0.58801,0.29719 0.89297,0.42119c0.30496,0.124 0.61728,0.23315 0.92512,0.35262c0.30783,0.11946 0.61117,0.24924 0.91251,0.38431c0.30134,0.13508 0.60069,0.27546 0.89703,0.42314c0.29634,0.14768 0.58969,0.30265 0.87784,0.46861c0.28815,0.16596 0.57112,0.3429 0.85409,0.51984z" id="item14111-1" fill="#000000" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g></g></svg>
                    <span style="position: relative; top: -8px;">Frontman AI</span>
                </div>
                <div class="ai-chat-actions">
                    <button class="ai-chat-menu-btn" id="ai-chat-menu-btn" title="Options">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="6" r="2" fill="currentColor"/>
                            <circle cx="12" cy="12" r="2" fill="currentColor"/>
                            <circle cx="12" cy="18" r="2" fill="currentColor"/>
                        </svg>
                    </button>
                    <div class="ai-chat-menu-dropdown hidden" id="ai-chat-menu-dropdown">
                        <div class="ai-chat-menu-item" id="configure-ai-chat-settings">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="2"/>
                                <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.5003 16.5883 19.74 16.84L19.84 16.94C20.0917 17.1917 20.395 17.3472 20.7194 17.406C21.0438 17.4648 21.3784 17.4251 21.68 17.292C21.9816 17.1589 22.2362 16.9363 22.414 16.66C22.5918 16.3837 22.685 16.0661 22.685 15.74C22.685 15.4139 22.5918 15.0963 22.414 14.82C22.2362 14.5437 21.9816 14.2081 21.68 14.075C21.3784 13.9419 21.0438 13.9032 20.7194 13.8444C20.395 13.7856 20.0917 13.7311 19.84 13.98L19.74 14.08C19.5003 14.3317 19.3448 14.634 19.286 14.9584C19.2272 15.2828 19.2669 15.6174 19.4 15.92V15Z" stroke="currentColor" stroke-width="2"/>
                                <path d="M4.6 9C4.73309 8.69836 4.77276 8.36381 4.714 8.03941C4.65524 7.71502 4.49973 7.41169 4.26 7.16L4.16 7.06C3.90833 6.80833 3.605 6.65276 3.2806 6.59398C2.95621 6.5352 2.62157 6.57487 2.32 6.708C2.01844 6.84115 1.76381 7.06372 1.586 7.34C1.40719 7.61628 1.314 7.93388 1.314 8.26C1.314 8.58612 1.40719 8.90372 1.586 9.18C1.76381 9.45628 2.01844 9.79187 2.32 9.925C2.62157 10.0581 2.95621 10.0968 3.2806 10.1556C3.605 10.2144 3.90833 10.2689 4.16 10.02L4.26 9.92C4.49973 9.66833 4.65524 9.366 4.714 9.0416C4.77276 8.7172 4.73309 8.38264 4.6 8.08V9Z" stroke="currentColor" stroke-width="2"/>
                                <path d="M12 2C13.1046 2 14 2.89543 14 4V6C14 7.10457 13.1046 8 12 8C10.8954 8 10 7.10457 10 6V4C10 2.89543 10.8954 2 12 2Z" stroke="currentColor" stroke-width="2"/>
                                <path d="M12 16C13.1046 16 14 16.8954 14 18V20C14 21.1046 13.1046 22 12 22C10.8954 22 10 21.1046 10 20V18C10 16.8954 10.8954 16 12 16Z" stroke="currentColor" stroke-width="2"/>
                            </svg>
                            Configure AI Settings
                        </div>
                        <div class="ai-chat-menu-item" id="clear-chat-conversation">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 6H21M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.53043 21.4142C5.10571 21.0391 4.89464 20.5304 4.89464 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.53043C8.96086 2.10571 9.46957 2 10 2H14C14.5304 2 15.0391 2.10571 15.4142 2.53043C15.7893 2.96086 16 3.46957 16 4V6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Clear Conversation
                        </div>
                    </div>
                    <button class="ai-chat-close" id="ai-chat-close">×</button>
                </div>
            </div>

            <div class="ai-chat-messages" id="ai-chat-messages">
                <!-- Empty state illustration -->
                <div class="ai-empty-state" id="ai-empty-state">
                    <div class="ai-empty-illustration">
                        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="369.6731" height="369.6731" viewBox="524.44232 143.3269 369.6731 369.6731"><g fill="none" fill-rule="nonzero" stroke="none" stroke-width="none" stroke-linecap="none" stroke-linejoin="none" stroke-miterlimit="10" stroke-dasharray="none" font-family="none" font-weight="none" font-size="none"><path d="M779.74034,466.63928l-107.47488,-234.88648l16.90899,-4.13767l89.10982,88.08506z" id="Path-1" fill="#d9d3d3" stroke="#c7c6cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,1"></path><path d="M533.44232,328.16345c0,-97.11184 78.72471,-175.83655 175.83655,-175.83655c97.11184,0 175.83655,78.72471 175.83655,175.83655c0,97.11184 -78.72471,175.83655 -175.83655,175.83655c-97.11184,0 -175.83655,-78.72471 -175.83655,-175.83655z" id="Path-1-1" fill-opacity="0" fill="#000000" stroke="#dadbe2" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path><g id="Path-1-2"><path d="M677.98124,256.76298c2.90608,23.51744 0.34916,42.88483 -5.29921,65.69257c-2.151,8.68561 -2.95199,16.82561 -7.34079,24.67166" id="Path-1-3" fill-opacity="0" fill="#000000"></path><path d="M665.41646,346.9855c-0.00043,0.00146 0.00022,0.00303 0.00155,0.00377c0.00134,0.00074 0.003,0.00045 0.00402,-0.00069v0c0.16339,-0.29067 0.32677,-0.58134 0.48525,-0.87477c0.15847,-0.29343 0.31203,-0.58964 0.46202,-0.88768c0.14999,-0.29804 0.29641,-0.59792 0.43897,-0.89969c0.14256,-0.30177 0.28126,-0.60543 0.41628,-0.91076c0.13503,-0.30533 0.26638,-0.61233 0.39416,-0.92086c0.12778,-0.30852 0.252,-0.61857 0.37281,-0.92997c0.12081,-0.3114 0.23821,-0.62416 0.35239,-0.93811c0.11418,-0.31395 0.22514,-0.6291 0.33308,-0.94529c0.10795,-0.31619 0.21288,-0.63343 0.31503,-0.95156c0.10215,-0.31813 0.20152,-0.63716 0.29836,-0.95696c0.09684,-0.31979 0.19114,-0.64035 0.28317,-0.96154c0.09203,-0.32119 0.18179,-0.64302 0.26956,-0.96537c0.08776,-0.32235 0.17353,-0.64522 0.25758,-0.9685c0.08405,-0.32328 0.16638,-0.64698 0.24728,-0.97099c0.0809,-0.32401 0.16037,-0.64834 0.23869,-0.9729c0.07832,-0.32456 0.15549,-0.64934 0.23181,-0.97426c0.07631,-0.32493 0.15177,-0.65 0.22665,-0.97514c0.07488,-0.32514 0.14918,-0.65035 0.22318,-0.97555c0.074,-0.3252 0.14771,-0.6504 0.22139,-0.97553c0.07368,-0.32513 0.14734,-0.65018 0.22123,-0.9751c0.0739,-0.32492 0.14803,-0.6497 0.22267,-0.97428c0.07463,-0.32458 0.14977,-0.64895 0.22564,-0.97306c0.07587,-0.32411 0.15248,-0.64795 0.2301,-0.97146c0.07762,-0.32351 0.15624,-0.6467 0.23597,-0.96947c0.07973,-0.32277 0.16055,-0.64513 0.24319,-0.96708c0.08263,-0.32195 0.16708,-0.6435 0.25142,-0.9659c0.08435,-0.3224 0.16859,-0.64564 0.25231,-0.96882c0.08372,-0.32318 0.1669,-0.64629 0.24964,-0.96959c0.08274,-0.3233 0.16505,-0.64678 0.24687,-0.97039c0.08182,-0.32361 0.16315,-0.64734 0.24398,-0.97121c0.08083,-0.32388 0.16116,-0.6479 0.24097,-0.97206c0.07981,-0.32416 0.1591,-0.64847 0.23786,-0.97293c0.07875,-0.32446 0.15697,-0.64906 0.23462,-0.97382c0.07765,-0.32476 0.15475,-0.64967 0.23126,-0.97473c0.07652,-0.32506 0.15245,-0.65028 0.22779,-0.97566c0.07534,-0.32538 0.15007,-0.65091 0.22419,-0.97661c0.07412,-0.3257 0.14762,-0.65156 0.22047,-0.97758c0.07286,-0.32602 0.14508,-0.65221 0.21663,-0.97856c0.07156,-0.32635 0.14245,-0.65287 0.21267,-0.97956c0.07022,-0.32669 0.13976,-0.65354 0.20858,-0.98056c0.06882,-0.32703 0.13693,-0.65422 0.20437,-0.98158c0.06744,-0.32736 0.13422,-0.65488 0.20003,-0.98261c0.06582,-0.32773 0.13067,-0.65568 0.19557,-0.98365c0.0649,-0.32798 0.12985,-0.65598 0.19099,-0.98469c0.06114,-0.32871 0.11848,-0.65813 0.17228,-0.98815c0.0538,-0.33002 0.10408,-0.66063 0.15424,-0.99125c0.05017,-0.33062 0.10023,-0.66124 0.14925,-0.99202c0.04902,-0.33078 0.09699,-0.66172 0.14414,-0.99278c0.04715,-0.33105 0.09348,-0.66222 0.13891,-0.99352c0.04543,-0.33129 0.08995,-0.66271 0.13357,-0.99424c0.04362,-0.33153 0.08633,-0.66318 0.12812,-0.99494c0.04179,-0.33176 0.08264,-0.66364 0.12256,-0.99562c0.03991,-0.33199 0.07888,-0.66408 0.11689,-0.99628c0.03801,-0.3322 0.07505,-0.66451 0.11112,-0.99692c0.03607,-0.33241 0.07116,-0.66492 0.10526,-0.99752c0.0341,-0.3326 0.0672,-0.6653 0.0993,-0.99809c0.0321,-0.33279 0.06318,-0.66567 0.09325,-0.99864c0.03006,-0.33297 0.05911,-0.66602 0.08711,-0.99915c0.02801,-0.33313 0.05498,-0.66634 0.0809,-0.99962c0.02592,-0.33328 0.05079,-0.66663 0.07461,-1.00005c0.02381,-0.33342 0.04657,-0.66691 0.06825,-1.00045c0.02168,-0.33355 0.04229,-0.66715 0.06182,-1.00081c0.01953,-0.33366 0.03798,-0.66737 0.05534,-1.00112c0.01736,-0.33376 0.03363,-0.66756 0.0488,-1.00139c0.01517,-0.33384 0.02925,-0.66771 0.04222,-1.00162c0.01297,-0.33391 0.02483,-0.66784 0.03559,-1.0018c0.01075,-0.33396 0.0204,-0.66794 0.02893,-1.00194c0.00853,-0.334 0.01594,-0.66801 0.02223,-1.00203c0.00629,-0.33402 0.01147,-0.66805 0.01552,-1.00208c0.00405,-0.33403 0.00698,-0.66805 0.00878,-1.00207c0.0018,-0.33402 0.00248,-0.66803 0.00204,-1.00202c-0.00045,-0.33399 -0.00202,-0.66797 -0.00472,-1.00192c-0.0027,-0.33395 -0.00652,-0.66788 -0.01147,-1.00178c-0.00495,-0.3339 -0.01102,-0.66776 -0.01821,-1.00159c-0.00719,-0.33382 -0.01551,-0.66761 -0.02495,-1.00135c-0.00944,-0.33374 -0.01999,-0.66743 -0.03166,-1.00106c-0.01167,-0.33364 -0.02446,-0.66722 -0.03836,-1.00074c-0.0139,-0.33352 -0.02891,-0.66698 -0.04502,-1.00036c-0.01612,-0.33339 -0.03334,-0.66671 -0.05166,-0.99995c-0.01832,-0.33324 -0.03774,-0.66641 -0.05825,-0.99949c-0.02051,-0.33308 -0.04212,-0.66608 -0.06481,-0.99899c-0.02269,-0.33291 -0.04646,-0.66573 -0.07131,-0.99846c-0.02485,-0.33272 -0.05078,-0.66535 -0.07777,-0.99788c-0.02699,-0.33253 -0.05505,-0.66495 -0.08417,-0.99727c-0.02912,-0.33231 -0.05929,-0.66451 -0.09051,-0.99662c-0.03122,-0.33211 -0.0635,-0.66412 -0.09679,-0.99594c-0.0333,-0.33182 -0.06762,-0.66344 -0.10301,-0.99523c-0.03539,-0.33179 -0.07185,-0.66374 -0.10915,-0.99449c-0.03731,-0.33075 -0.07547,-0.66029 -0.11523,-0.99371c-0.03976,-0.33343 -0.08113,-0.67074 -0.12123,-0.99292c-0.0401,-0.32217 -0.07894,-0.62919 -0.12716,-0.99209c-0.04822,-0.3629 -0.10582,-0.78166 -0.13301,-0.99124c-0.02718,-0.20958 0,0 0,0v0c0,0 -0.02394,-0.20997 0,0c0.02394,0.20997 0.06859,0.63029 0.10645,0.99437c0.03786,0.36407 0.06893,0.6719 0.10057,0.9949c0.03164,0.323 0.06383,0.66118 0.09461,0.9954c0.03078,0.33422 0.06013,0.66447 0.08857,0.99587c0.02845,0.33141 0.05599,0.66397 0.08247,0.99631c0.02648,0.33234 0.05191,0.66446 0.0763,0.99671c0.02439,0.33226 0.04775,0.66465 0.07006,0.99708c0.02231,0.33243 0.04356,0.6649 0.06376,0.99742c0.0202,0.33252 0.03933,0.6651 0.0574,0.99771c0.01807,0.33262 0.03506,0.66527 0.05098,0.99797c0.01592,0.33269 0.03076,0.66542 0.04452,0.99818c0.01376,0.33276 0.02643,0.66555 0.038,0.99836c0.01158,0.33281 0.02206,0.66564 0.03145,0.99849c0.00938,0.33285 0.01767,0.66571 0.02485,0.99858c0.00718,0.33287 0.01326,0.66575 0.01822,0.99863c0.00497,0.33288 0.00882,0.66576 0.01156,0.99864c0.00274,0.33287 0.00437,0.66574 0.00488,0.9986c0.00051,0.33285 -0.0001,0.66569 -0.00182,0.99851c-0.00173,0.33282 -0.00457,0.66562 -0.00854,0.99839c-0.00397,0.33277 -0.00905,0.66551 -0.01526,0.99821c-0.00621,0.3327 -0.01354,0.66537 -0.02199,0.998c-0.00845,0.33263 -0.01802,0.66521 -0.02871,0.99774c-0.01069,0.33253 -0.0225,0.66501 -0.03542,0.99744c-0.01292,0.33242 -0.02697,0.66479 -0.04212,0.99709c-0.01515,0.3323 -0.03142,0.66454 -0.0488,0.9967c-0.01738,0.33217 -0.03586,0.66426 -0.05545,0.99627c-0.01959,0.33202 -0.04028,0.66395 -0.06206,0.99581c-0.02179,0.33185 -0.04467,0.66362 -0.06864,0.9953c-0.02397,0.33168 -0.04903,0.66327 -0.07518,0.99476c-0.02614,0.33149 -0.05337,0.66288 -0.08166,0.99418c-0.02829,0.33129 -0.05766,0.66248 -0.08809,0.99356c-0.03043,0.33108 -0.06192,0.66206 -0.09446,0.99292c-0.03254,0.33086 -0.06613,0.66161 -0.10076,0.99224c-0.03463,0.33063 -0.0703,0.66114 -0.10699,0.99153c-0.03669,0.33039 -0.07441,0.66066 -0.11314,0.9908c-0.03873,0.33014 -0.07847,0.66016 -0.11922,0.99004c-0.04074,0.32989 -0.08248,0.65964 -0.1252,0.98926c-0.04272,0.32962 -0.08643,0.65911 -0.1311,0.98846c-0.04467,0.32935 -0.09031,0.65857 -0.13691,0.98764c-0.04659,0.32908 -0.09414,0.65801 -0.14261,0.98681c-0.04848,0.3288 -0.09789,0.65745 -0.14822,0.98596c-0.05033,0.32851 -0.10157,0.65688 -0.15372,0.9851c-0.05215,0.32822 -0.1052,0.6563 -0.15911,0.98423c-0.05392,0.32793 -0.1087,0.65572 -0.1644,0.98335c-0.0557,0.32763 -0.11231,0.6551 -0.16957,0.98246c-0.05726,0.32736 -0.11517,0.65461 -0.17463,0.98158c-0.05946,0.32697 -0.12047,0.65367 -0.17957,0.98069c-0.0591,0.32702 -0.11628,0.65436 -0.17123,0.98213c-0.05495,0.32777 -0.10768,0.65596 -0.16198,0.98391c-0.0543,0.32795 -0.11019,0.65565 -0.16661,0.98328c-0.05642,0.32763 -0.11338,0.6552 -0.17112,0.98264c-0.05774,0.32745 -0.11628,0.65478 -0.17551,0.98201c-0.05923,0.32723 -0.11915,0.65435 -0.17977,0.98137c-0.06062,0.32702 -0.12193,0.65393 -0.18392,0.98073c-0.06198,0.3268 -0.12463,0.6535 -0.18794,0.98009c-0.0633,0.32659 -0.12725,0.65308 -0.19183,0.97946c-0.06458,0.32638 -0.12979,0.65266 -0.19561,0.97883c-0.06582,0.32617 -0.13225,0.65224 -0.19926,0.97821c-0.06702,0.32597 -0.13462,0.65183 -0.20279,0.9776c-0.06817,0.32576 -0.13692,0.65143 -0.20621,0.97699c-0.06929,0.32556 -0.13913,0.65103 -0.2095,0.9764c-0.07037,0.32537 -0.14127,0.65063 -0.21267,0.97581c-0.07141,0.32518 -0.14332,0.65026 -0.21573,0.97523c-0.07241,0.32497 -0.1453,0.64984 -0.21868,0.97467c-0.07337,0.32483 -0.14722,0.64963 -0.22151,0.97412c-0.07429,0.32449 -0.14901,0.64868 -0.22422,0.97358c-0.07521,0.3249 -0.1509,0.6505 -0.22478,0.97658c-0.07389,0.32608 -0.14597,0.65262 -0.21687,0.97928c-0.07091,0.32666 -0.14063,0.65343 -0.2093,0.98033c-0.06867,0.32691 -0.13629,0.65395 -0.20312,0.98105c-0.06683,0.32711 -0.13288,0.65428 -0.19839,0.98147c-0.06551,0.32719 -0.13048,0.6544 -0.19517,0.98159c-0.06469,0.32718 -0.12911,0.65434 -0.19352,0.98142c-0.06441,0.32708 -0.12882,0.65408 -0.19349,0.98096c-0.06468,0.32688 -0.12962,0.65363 -0.19512,0.98021c-0.0655,0.32658 -0.13155,0.65299 -0.19844,0.97916c-0.06689,0.32618 -0.13462,0.65213 -0.20348,0.97779c-0.06886,0.32566 -0.13885,0.65104 -0.21026,0.97606c-0.07141,0.32502 -0.14423,0.6497 -0.21877,0.97394c-0.07453,0.32425 -0.15078,0.64807 -0.22901,0.97139c-0.07823,0.32332 -0.15846,0.64614 -0.24096,0.96836c-0.0825,0.32222 -0.16727,0.64385 -0.25458,0.96479c-0.08731,0.32094 -0.17716,0.64118 -0.26981,0.96062c-0.09265,0.31944 -0.18809,0.63807 -0.28657,0.95579c-0.09848,0.31771 -0.19999,0.6345 -0.30477,0.95023c-0.10477,0.31573 -0.2128,0.63041 -0.32428,0.9439c-0.11148,0.31349 -0.22641,0.62579 -0.34497,0.93674c-0.11856,0.31096 -0.24075,0.62058 -0.36668,0.92872c-0.12593,0.30814 -0.2556,0.61481 -0.38922,0.9198c-0.13362,0.30499 -0.27119,0.60831 -0.41241,0.90999c-0.14123,0.30168 -0.28611,0.60172 -0.43606,0.89928c-0.14994,0.29756 -0.30495,0.59264 -0.45995,0.88772z" id="item14161-1" fill="#c7c6cf" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g><g id="Path-1-4"><path d="M681.31474,272.08304c0.32338,2.62686 0.35817,5.3056 0.97014,7.88057c0.3999,1.68264 3.09091,3.04566 3.80988,4.63517c1.56171,3.45266 0.82539,8.28009 0.60995,11.91131c-0.47369,7.98417 -2.51793,15.75613 -4.67737,23.46179c-1.40534,5.01475 -2.00198,8.72572 -6.32872,11.83527" id="Path-1-5" fill-opacity="0" fill="#000000"></path><path d="M676.30673,331.29315c-0.01256,0.01573 -0.01253,0.03806 0.00006,0.05376c0.01259,0.0157 0.03438,0.02058 0.05246,0.01175v0c0.26236,-0.20784 0.52473,-0.41568 0.77696,-0.63617c0.25223,-0.22049 0.49433,-0.45364 0.72702,-0.69626c0.23268,-0.24262 0.45595,-0.49472 0.66796,-0.75648c0.21201,-0.26177 0.41277,-0.5332 0.60196,-0.81271c0.18919,-0.2795 0.36681,-0.56707 0.53328,-0.86095c0.16648,-0.29389 0.32181,-0.59409 0.46735,-0.89876c0.14554,-0.30467 0.28129,-0.61379 0.40912,-0.9258c0.12783,-0.31201 0.24775,-0.62689 0.36181,-0.94343c0.11407,-0.31654 0.22229,-0.63473 0.32664,-0.95371c0.10436,-0.31898 0.20485,-0.63874 0.30328,-0.95862c0.09842,-0.31988 0.19478,-0.63988 0.29049,-0.95971c0.09572,-0.31982 0.1908,-0.63946 0.28671,-0.95804c0.09591,-0.31858 0.19264,-0.63609 0.29031,-0.95445c0.09767,-0.31837 0.19628,-0.63759 0.29429,-0.95676c0.098,-0.31917 0.1954,-0.63829 0.29247,-0.95764c0.09707,-0.31935 0.19383,-0.63894 0.29006,-0.95872c0.09623,-0.31979 0.19194,-0.63977 0.28706,-0.96001c0.09512,-0.32024 0.18964,-0.64073 0.28346,-0.9615c0.09382,-0.32077 0.18694,-0.64182 0.27926,-0.96318c0.09232,-0.32136 0.18383,-0.64304 0.27445,-0.96505c0.09061,-0.32202 0.18032,-0.64437 0.26902,-0.9671c0.0887,-0.32273 0.1764,-0.64583 0.26298,-0.96932c0.08658,-0.32349 0.17206,-0.64739 0.25631,-0.9717c0.08425,-0.32431 0.16729,-0.64905 0.249,-0.97423c0.08172,-0.32518 0.16212,-0.6508 0.24106,-0.97689c0.07894,-0.32609 0.15641,-0.65265 0.23246,-0.97967c0.07604,-0.32702 0.15065,-0.6545 0.2232,-0.98255c0.07255,-0.32805 0.14305,-0.65665 0.21327,-0.98552c0.07022,-0.32886 0.14017,-0.65798 0.20267,-0.98855c0.0625,-0.33057 0.11756,-0.6626 0.16571,-0.99574c0.04814,-0.33314 0.08937,-0.66739 0.12977,-1.00171c0.0404,-0.33433 0.07998,-0.66873 0.11695,-1.00348c0.03697,-0.33474 0.07134,-0.66982 0.10345,-1.00511c0.03212,-0.33529 0.06199,-0.67078 0.0893,-1.00658c0.02731,-0.3358 0.05206,-0.67189 0.07449,-1.00786c0.02243,-0.33597 0.04254,-0.67182 0.05904,-1.00892c0.0165,-0.3371 0.02939,-0.67545 0.04295,-1.00826c0.01357,-0.33281 0.02781,-0.66007 0.04424,-0.99032c0.01643,-0.33025 0.03505,-0.66348 0.05321,-0.99706c0.01816,-0.33358 0.03586,-0.66751 0.05197,-1.00235c0.01611,-0.33484 0.03061,-0.67058 0.04214,-1.00699c0.01153,-0.33641 0.02007,-0.6735 0.02433,-1.01123c0.00425,-0.33773 0.00422,-0.6761 -0.00157,-1.01496c-0.00579,-0.33886 -0.01734,-0.67821 -0.03625,-1.01777c-0.0189,-0.33957 -0.04516,-0.67935 -0.08091,-1.01886c-0.03575,-0.33951 -0.08098,-0.67875 -0.13729,-1.01681c-0.0563,-0.33806 -0.12367,-0.67495 -0.20746,-1.00928c-0.08378,-0.33433 -0.18398,-0.66609 -0.29345,-0.99251c-0.10947,-0.32642 -0.22822,-0.6475 -0.39663,-0.96203c-0.16841,-0.31453 -0.38649,-0.6225 -0.61931,-0.89246c-0.23281,-0.26996 -0.48036,-0.5019 -0.73095,-0.72813c-0.25059,-0.22623 -0.50421,-0.44675 -0.75352,-0.66604c-0.24932,-0.21929 -0.49433,-0.43735 -0.72943,-0.66507c-0.2351,-0.22772 -0.46029,-0.4651 -0.64545,-0.716c-0.18516,-0.2509 -0.33029,-0.51531 -0.43394,-0.81393c-0.10364,-0.29862 -0.16579,-0.63144 -0.22947,-0.95918c-0.06368,-0.32774 -0.12888,-0.65041 -0.18597,-0.97627c-0.05709,-0.32586 -0.10606,-0.65493 -0.15171,-0.98464c-0.04564,-0.32971 -0.08795,-0.66006 -0.12759,-0.98996c-0.03964,-0.32991 -0.0766,-0.65938 -0.11375,-0.99303c-0.03714,-0.33365 -0.07447,-0.67146 -0.11021,-0.99428c-0.03575,-0.32281 -0.06992,-0.63062 -0.11699,-0.99384c-0.04708,-0.36322 -0.10706,-0.78186 -0.13412,-0.99149c-0.02706,-0.20963 0,0 0,0v0c0,0 -0.02121,-0.21026 0,0c0.02121,0.21026 0.05776,0.6314 0.08608,0.99631c0.02832,0.36491 0.04842,0.67358 0.06885,0.9975c0.02042,0.32392 0.04118,0.66308 0.0621,0.99829c0.02092,0.33521 0.042,0.66648 0.0658,0.99889c0.0238,0.33241 0.05031,0.66597 0.08002,0.9992c0.0297,0.33323 0.0626,0.66612 0.10486,0.99876c0.04227,0.33265 0.09391,0.66505 0.14045,0.99677c0.04654,0.33172 0.08797,0.66277 0.18844,0.9964c0.10047,0.33363 0.25997,0.66985 0.45325,0.96659c0.19328,0.29674 0.42034,0.55399 0.65424,0.80151c0.2339,0.24753 0.47463,0.48532 0.71481,0.71813c0.24018,0.23281 0.47982,0.46063 0.7128,0.69402c0.23298,0.23339 0.45931,0.47235 0.6524,0.71502c0.19309,0.24267 0.35295,0.48905 0.48383,0.76844c0.13088,0.27939 0.23277,0.5918 0.32203,0.90323c0.08926,0.31144 0.16588,0.62191 0.22848,0.93742c0.0626,0.31552 0.11117,0.63609 0.14909,0.95819c0.03792,0.3221 0.06518,0.64574 0.08355,0.97064c0.01837,0.3249 0.02784,0.65107 0.03025,0.97785c0.00241,0.32678 -0.00225,0.65417 -0.01248,0.98196c-0.01023,0.32779 -0.02603,0.65598 -0.04605,0.98447c-0.02002,0.3285 -0.04426,0.65731 -0.07148,0.98644c-0.02722,0.32913 -0.05743,0.65857 -0.08932,0.98867c-0.0319,0.3301 -0.06548,0.66086 -0.0996,0.99189c-0.03411,0.33104 -0.06876,0.66235 -0.10162,0.99694c-0.03286,0.33459 -0.06394,0.67245 -0.09362,1.00491c-0.02968,0.33246 -0.05797,0.65951 -0.08992,0.9873c-0.03196,0.32779 -0.06758,0.65631 -0.10545,0.98428c-0.03786,0.32797 -0.07796,0.65539 -0.12052,0.98259c-0.04256,0.3272 -0.08758,0.65417 -0.13497,0.98079c-0.04739,0.32662 -0.09717,0.65289 -0.14879,0.9789c-0.05162,0.32601 -0.1051,0.65176 -0.16197,0.97696c-0.05687,0.3252 -0.11714,0.64987 -0.1745,0.97499c-0.05736,0.32513 -0.11181,0.65072 -0.16261,0.97712c-0.05079,0.3264 -0.09793,0.6536 -0.14836,0.98039c-0.05043,0.3268 -0.10415,0.65319 -0.15916,0.97949c-0.05501,0.3263 -0.11132,0.65251 -0.16932,0.97855c-0.058,0.32603 -0.11769,0.65188 -0.17884,0.97758c-0.06114,0.32569 -0.12374,0.65123 -0.18771,0.97661c-0.06397,0.32537 -0.12933,0.65059 -0.19595,0.97564c-0.06662,0.32506 -0.1345,0.64996 -0.20355,0.97471c-0.06904,0.32475 -0.13925,0.64935 -0.21051,0.97382c-0.07126,0.32446 -0.14358,0.64879 -0.21685,0.97298c-0.07327,0.32419 -0.14749,0.64826 -0.22256,0.97221c-0.07507,0.32395 -0.15098,0.64778 -0.22764,0.97151c-0.07666,0.32373 -0.15406,0.64736 -0.23211,0.97091c-0.07804,0.32355 -0.15672,0.64702 -0.23595,0.97039c-0.07923,0.32338 -0.15901,0.64666 -0.23919,0.96998c-0.08017,0.32332 -0.16074,0.64668 -0.2418,0.96968c-0.08106,0.323 -0.16262,0.64564 -0.24381,0.96949c-0.08119,0.32386 -0.16202,0.64893 -0.24159,0.97352c-0.07957,0.32458 -0.15788,0.64867 -0.23664,0.97227c-0.07877,0.32361 -0.158,0.64674 -0.23905,0.96891c-0.08105,0.32217 -0.16393,0.64339 -0.25043,0.96318c-0.0865,0.31979 -0.17661,0.63815 -0.27231,0.95442c-0.0957,0.31627 -0.19699,0.63044 -0.30595,0.94163c-0.10896,0.31119 -0.2256,0.6194 -0.35188,0.92347c-0.12628,0.30407 -0.26219,0.60401 -0.40929,0.89842c-0.1471,0.29442 -0.30539,0.58331 -0.47559,0.86533c-0.1702,0.28202 -0.35232,0.55716 -0.54638,0.82402c-0.19406,0.26687 -0.40008,0.52546 -0.61636,0.77586c-0.21629,0.2504 -0.44284,0.4926 -0.68083,0.72352c-0.23799,0.23092 -0.4874,0.45057 -0.73682,0.67022z" id="item12335-1" fill="#c7c6cf" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g><path d="M653.63162,339.85625c1.54008,-10.11073 10.98497,-17.05859 21.09571,-15.51849c10.11073,1.54009 17.05859,10.98498 15.51849,21.09571c-1.54008,10.11073 -10.98496,17.05859 -21.0957,15.51849c-10.11073,-1.54009 -17.0586,-10.98498 -15.5185,-21.09571z" id="Path-1-6" fill="#d9d3d3" stroke="#c7c6cf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path><path d="M650.98078,209.43389c0,-10.22258 8.28703,-18.50961 18.50961,-18.50961c10.22257,0 18.50961,8.28704 18.50961,18.50961c0,10.22258 -8.28703,18.50961 -18.50961,18.50961c-10.22257,0 -18.50961,-8.28704 -18.50961,-18.50961z" id="Path-1-7" fill="#d9d3d3" stroke="#c7c6cf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"></path><g id="Path-1-8" fill="#000000"><path d="M657.42354,207.27358c8.06724,3.49303 15.39046,7.7517 23.35159,11.2007" id="Path-1-9"></path><path d="M679.91935,218.17721c0.03345,0.00661 0.06701,-0.01084 0.08081,-0.04202c0.01379,-0.03118 0.00413,-0.06776 -0.02326,-0.08806v0c-0.29755,-0.15065 -0.59511,-0.30129 -0.89186,-0.45337c-0.29675,-0.15208 -0.59269,-0.30559 -0.8881,-0.46003c-0.29542,-0.15444 -0.59031,-0.3098 -0.88467,-0.4661c-0.29436,-0.1563 -0.58819,-0.31354 -0.88157,-0.47159c-0.29338,-0.15805 -0.5863,-0.31691 -0.87882,-0.47649c-0.29252,-0.15958 -0.58465,-0.31988 -0.87644,-0.48081c-0.29179,-0.16093 -0.58324,-0.32249 -0.87445,-0.48453c-0.29121,-0.16204 -0.58217,-0.32454 -0.87284,-0.48766c-0.29067,-0.16312 -0.58105,-0.32684 -0.87164,-0.4902c-0.29059,-0.16336 -0.58139,-0.32637 -0.87084,-0.49216c-0.28945,-0.16579 -0.57755,-0.33436 -0.87045,-0.49352c-0.29291,-0.15916 -0.59063,-0.30891 -0.89287,-0.44987c-0.30224,-0.14096 -0.609,-0.27312 -0.91467,-0.40756c-0.30567,-0.13444 -0.61025,-0.27116 -0.9153,-0.40704c-0.30505,-0.13589 -0.61056,-0.27094 -0.91616,-0.40585c-0.3056,-0.13491 -0.6113,-0.26968 -0.91724,-0.40398c-0.30594,-0.1343 -0.61211,-0.26813 -0.91853,-0.40143c-0.30641,-0.1333 -0.61307,-0.26608 -0.92002,-0.39822c-0.30696,-0.13214 -0.61422,-0.26363 -0.92172,-0.39435c-0.3075,-0.13072 -0.61524,-0.26065 -0.92359,-0.38982c-0.30836,-0.12917 -0.61733,-0.25757 -0.92564,-0.38465c-0.30831,-0.12708 -0.61595,-0.25285 -0.92785,-0.37884c-0.3119,-0.12599 -0.62806,-0.25219 -0.9302,-0.3724c-0.30213,-0.12021 -0.59023,-0.23443 -0.93267,-0.36536c-0.34243,-0.13093 -0.7392,-0.27858 -0.93525,-0.35771c-0.19605,-0.07914 0,0 0,0v0c0,0 -0.19139,-0.08976 0,0c0.19139,0.08976 0.56949,0.27992 0.89673,0.44469c0.32723,0.16477 0.6036,0.30415 0.8928,0.45173c0.28921,0.14758 0.59126,0.30337 0.88915,0.45823c0.29789,0.15487 0.59161,0.30882 0.88579,0.46419c0.29418,0.15537 0.58882,0.31214 0.88275,0.46959c0.29393,0.15745 0.58714,0.31556 0.88003,0.47443c0.29289,0.15887 0.58545,0.31848 0.87766,0.4787c0.29221,0.16022 0.58407,0.32105 0.87566,0.48241c0.29159,0.16136 0.5829,0.32327 0.87403,0.48555c0.29113,0.16228 0.58207,0.32495 0.87279,0.48811c0.29072,0.16316 0.58121,0.32683 0.87194,0.49009c0.29073,0.16326 0.58171,0.32613 0.8715,0.49149c0.28978,0.16536 0.57836,0.33323 0.87146,0.4923c0.2931,0.15908 0.5907,0.30937 0.89323,0.45005c0.30252,0.14068 0.60996,0.27175 0.91625,0.40519c0.30629,0.13344 0.61144,0.26925 0.91712,0.40407c0.30567,0.13482 0.61188,0.26865 0.9182,0.40225c0.30633,0.1336 0.61278,0.26697 0.9195,0.39975c0.30673,0.13278 0.61373,0.26499 0.92102,0.39656c0.30728,0.13157 0.61485,0.26251 0.92273,0.39268c0.30788,0.13017 0.61608,0.25958 0.92463,0.38812c0.30855,0.12854 0.61744,0.25622 0.92671,0.38289c0.30927,0.12667 0.61893,0.25232 0.92895,0.37698c0.31002,0.12465 0.62041,0.24831 0.93134,0.3704c0.31093,0.12209 0.62239,0.24263 0.93386,0.36317z" id="item13586-1" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g><g id="Path-1-10"><path d="M669.0117,198.87114c3.37222,1.53792 6.97069,2.75475 9.89439,5.17762" id="Path-1-11" fill-opacity="0" fill="#000000"></path><path d="M678.7215,203.94768c0.01661,0.00818 0.03667,0.00376 0.0483,-0.01065c0.01163,-0.01441 0.01172,-0.03495 0.00022,-0.04946v0c-0.24327,-0.2325 -0.48654,-0.465 -0.73893,-0.68895c-0.25239,-0.22394 -0.51389,-0.43933 -0.78028,-0.64929c-0.26639,-0.20996 -0.53766,-0.41449 -0.81413,-0.61185c-0.27647,-0.19737 -0.55814,-0.38757 -0.84061,-0.57801c-0.28247,-0.19044 -0.56573,-0.3811 -0.86014,-0.54879c-0.29441,-0.16769 -0.59997,-0.3124 -0.91586,-0.43201c-0.31589,-0.11961 -0.64212,-0.21412 -0.96449,-0.31197c-0.32237,-0.09785 -0.64089,-0.19904 -0.96388,-0.29882c-0.323,-0.09978 -0.65047,-0.19816 -0.96244,-0.29359c-0.31196,-0.09543 -0.60841,-0.18792 -0.96026,-0.29626c-0.35185,-0.10834 -0.7591,-0.23253 -0.95728,-0.30691c-0.19818,-0.07437 0,0 0,0v0c0,0 -0.18731,-0.09892 0,0c0.18731,0.09892 0.55104,0.32132 0.86903,0.50828c0.31799,0.18695 0.59023,0.33847 0.87488,0.49888c0.28465,0.16041 0.58171,0.32971 0.87534,0.49546c0.29362,0.16575 0.58381,0.32794 0.87054,0.49797c0.28673,0.17003 0.57002,0.3479 0.86045,0.50626c0.29043,0.15835 0.58801,0.29719 0.89297,0.42119c0.30496,0.124 0.61728,0.23315 0.92512,0.35262c0.30783,0.11946 0.61117,0.24924 0.91251,0.38431c0.30134,0.13508 0.60069,0.27546 0.89703,0.42314c0.29634,0.14768 0.58969,0.30265 0.87784,0.46861c0.28815,0.16596 0.57112,0.3429 0.85409,0.51984z" id="item14111-1" fill="#000000" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter"></path></g></g></svg>
                    </div>
                    <div class="ai-empty-text">
                        <h3>AI-Powered Request Builder</h3>
                        <p>Describe what you want to build and I'll generate the perfect cURL command for you!</p>
                        <div class="ai-empty-examples">
                            <div class="example-badge">Try: "POST to httpbin.org with JSON data"</div>
                            <div class="example-badge">Try: "GET request with custom headers"</div>
                            <div class="example-badge">Try: "Upload file to API endpoint"</div>
                        </div>
                    </div>
                </div>
                <!-- Messages will be added here -->
            </div>

            <div class="ai-chat-footer">
                <div class="ai-disclaimer">
                    <span>Let AI Build A Complete Request For You Inside Frontman</span>
                </div>
                <div class="ai-chat-input-area">
                    <div class="ai-chat-input-container">
                        <textarea id="ai-chat-input" class="ai-chat-input" placeholder="What can I help you build?" rows="1"></textarea>
                        <button class="ai-chat-send-btn" id="ai-chat-send-btn" disabled>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Spinner -->
    <div class="spinner-overlay hidden">
        <div class="spinner"></div>
    </div>
    
    <script src="${codeMirrorLibJs}"></script>
    <script src="${codeMirrorJsonModeJs}"></script>
    <script src="${codeMirrorHtmlModeJs}"></script>
    <script src="${codeMirrorXmlModeJs}"></script>
    <script src="${codeMirrorGraphqlModeJs}"></script>
    <script src="${foldCodeJs}"></script>
    <script src="${foldGutterJs}"></script>
    <script src="${braceFoldJs}"></script>
    <script src="${searchDialogJs}"></script>
    <script src="${searchCursorJs}"></script>
    <script src="${searchJs}"></script>
    <script src="${jumpToLineJs}"></script>
    <script src="${matchesonScrollbarJs}"></script>
    <script src="${matchHighlighterJs}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
`;
}

// Add UUID generator as a private static method
private static uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

private static handleMessages(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'getEnvironments':
                // Get environments from the extension
                vscode.commands.executeCommand('universalApiNavigator.getEnvironmentsForRawRequest');
                break;
            case 'setSelectedEnvironment':
                // Set the selected environment
                vscode.commands.executeCommand('universalApiNavigator.setSelectedEnvironmentForRawRequest', message.payload.environmentId);
                break;
            case 'runRequest':
                try {
                    const response = await RawRequestPanel.requestHandlerInstance.runRequest(message.payload);
                    webview.postMessage({ command: 'responseReceived', payload: response });
                    // Save history after successful request
                    vscode.commands.executeCommand('universalApiNavigator.saveHistory', {
                        id: RawRequestPanel.uuidv4(),
                        method: message.payload.method,
                        url: message.payload.url,
                        headers: message.payload.headers,
                        body: message.payload.body,
                        auth: message.payload.auth,
                        timestamp: new Date().toISOString(),
                        status: response.status,
                        bodyType: message.payload.bodyType,
                        rawBody: message.payload.rawBody,
                        formBody: message.payload.formBody,
                        graphqlQuery: message.payload.graphqlQuery,
                        graphqlVariables: message.payload.graphqlVariables,
                        params: message.payload.params
                    });
                } catch (err: any) {
                    const errorMessage = err.response?.data?.message || err.message;
                    webview.postMessage({ command: 'showError', payload: { message: errorMessage, stack: err.stack } });
                    vscode.window.showErrorMessage(`API Request Failed: ${errorMessage}`);
                    // Save history after failed request
                    vscode.commands.executeCommand('universalApiNavigator.saveHistory', {
                        id: RawRequestPanel.uuidv4(),
                        method: message.payload.method,
                        url: message.payload.url,
                        headers: message.payload.headers,
                        body: message.payload.body,
                        auth: message.payload.auth,
                        timestamp: new Date().toISOString(),
                        status: 0,
                        error: errorMessage,
                        bodyType: message.payload.bodyType,
                        rawBody: message.payload.rawBody,
                        formBody: message.payload.formBody,
                        graphqlQuery: message.payload.graphqlQuery,
                        graphqlVariables: message.payload.graphqlVariables,
                        params: message.payload.params
                    });
                }
                break;
            case 'saveResponse':
                try {
                    const { content, format } = message.payload;
                    const fileExtensionMap = {
                        JSON: 'json',
                        XML: 'xml',
                        HTML: 'html',
                        JS: 'js',
                        Raw: 'txt',
                        Base64: 'txt',
                        Hex: 'txt'
                    };
                    const formatKey = format as keyof typeof fileExtensionMap;
                    const fileExtension = fileExtensionMap[formatKey] || 'txt';
            
                    const uri = await vscode.window.showSaveDialog({
                        filters: { 'Response Data': [fileExtension] },
                        defaultUri: vscode.Uri.file(`response.${fileExtension}`)
                    });

                    if (uri) {
                        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                        vscode.window.showInformationMessage(`Response saved to ${uri.fsPath}`);
                    }
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to save file: ${err.message}`);
                }
                break;
            case 'showError':
                vscode.window.showErrorMessage(message.payload.message);
                break;
            case 'showWarning':
                vscode.window.showWarningMessage(message.payload);
                break;
            case 'populateFromHistory':
                // Forward to webview for UI population
                webview.postMessage({ command: 'populateFromHistory', payload: message.payload });
                break;
            case 'populateFromCollection':
                // Forward to webview for UI population with full collection data
                webview.postMessage({ command: 'populateFromCollection', payload: message.payload });
                break;
            case 'getCollections':
                // Get collections from global state
                vscode.commands.executeCommand('universalApiNavigator.getCollections');
                break;
            case 'createCollection':
                // Create a new collection
                vscode.commands.executeCommand('universalApiNavigator.createCollection', message.payload);
                break;
            case 'saveRequest':
                // Save request to collection
                vscode.commands.executeCommand('universalApiNavigator.saveRequest', message.payload);
                break;
            case 'collectionsData':
                // Forward collections data to webview
                webview.postMessage({ command: 'collectionsData', payload: message.payload });
                break;
            case 'collectionCreated':
                // Forward collection created confirmation to webview
                webview.postMessage({ command: 'collectionCreated', payload: message.payload });
                break;
            case 'requestSaved':
                // Forward request saved confirmation to webview
                webview.postMessage({ command: 'requestSaved', payload: message.payload });
                break;
            case 'aiGenerateRequest':
                // Handle AI generation request
                vscode.commands.executeCommand('universalApiNavigator.aiGenerateRequest', message.payload);
                break;
            case 'generateCurlFromAI':
                // Handle AI generation request from frontend
                vscode.commands.executeCommand('universalApiNavigator.generateCurlFromAI', message.payload);
                break;
            case 'aiConfigStatus':
                // Forward AI configuration status to webview
                webview.postMessage({ command: 'aiConfigStatus', payload: message.payload });
                break;
            case 'openAIConfigPanel':
                // Open the AI configuration panel
                vscode.commands.executeCommand('universalApiNavigator.openAIConfigPanel');
                break;
        }
    });
}

public static getCurrentPanel(): vscode.WebviewPanel | undefined {
    return RawRequestPanel.currentPanel;
}
}