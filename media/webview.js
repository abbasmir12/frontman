// Script running inside the webview
const vscode = acquireVsCodeApi();

// Elements from the HTML
const methodTitle = document.getElementById('method-name');
const requestForm = document.getElementById('request-form');
// CORRECTED: Ensure requestHeaders is correctly selected if it's an element
const requestHeaders = document.getElementById('request-headers'); // Example: maybe a simple JSON input or dynamic fields
const runButton = document.getElementById('run-request-button');
const generateCodeButton = document.getElementById('generate-code-button');

// Elements for generated code display
const codegenOutputSection = document.getElementById('codegen-output');
const generatedCodeDisplay = document.getElementById('generated-code-display');
const copyCodeButton = document.getElementById('copy-code-button');


const responseStatus = document.getElementById('response-status');
const responseTime = document.getElementById('response-time');
const responseHeadersDisplay = document.getElementById('response-headers-display');
// CORRECTED: Ensure responseBodyDisplay is correctly selected
const responseBodyDisplay = document.getElementById('response-body-display'); // Target the <code> element

const toggleModeButton = document.getElementById('toggle-mode-button');
const schemaFormContainer = document.getElementById('schema-mode-form');
const rawFormContainer = document.getElementById('raw-mode-form');
let isRawMode = false;

if (toggleModeButton) {
  toggleModeButton.addEventListener('click', () => {
    isRawMode = !isRawMode;
    if (isRawMode) {
      toggleModeButton.textContent = 'Use Schema Mode';
      schemaFormContainer.style.display = 'none';
      rawFormContainer.style.display = 'block';
    } else {
      toggleModeButton.textContent = 'Use Raw Mode';
      schemaFormContainer.style.display = 'block';
      rawFormContainer.style.display = 'none';
    }
  });
}



let currentMethod = null; // Store the current method schema

// Listen for messages from the extension host
window.addEventListener('message', event => {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
        case 'schemaLoaded':
            currentMethod = message.payload;
            console.log('Webview received schema:', currentMethod);
            renderMethodDetails(currentMethod);
            break;
        case 'responseReceived':
            const response = message.payload;
            console.log('Webview received response:', response);
            displayResponse(response);
            break;
        case 'showError':
            const error = message.payload;
            console.error('Webview received error:', error);
            displayError(error);
            break;
        // CORRECTED: Handle codeGenerated message
        case 'codeGenerated':
             const code = message.payload;
             console.log('Webview received generated code:', code);
             displayGeneratedCode(code);
             break;
        // TODO: Handle 'requestSaved', etc.
    }
});

function renderMethodDetails(method) {
    if (!method) {
        methodTitle.textContent = 'Error: Method not loaded';
        return;
    }

    methodTitle.textContent = method.name;

    // --- Dynamically Generate Form ---
    // This is complex and depends heavily on the IMethodDefinition structure.
    // You might use a library like 'json-schema-form' or build custom logic.
    // Example (very basic):
    if (requestForm) { // Check if element exists
        requestForm.innerHTML = '<h3>Parameters:</h3>';
        if (method.parameters && method.parameters.length > 0) {
            method.parameters.forEach((param) => {
                const paramDiv = document.createElement('div');
                paramDiv.innerHTML = `
                    <label for="param-${param.name}">${param.name}${param.required ? '*' : ''}:</label>
                    <input type="text" id="param-${param.name}" placeholder="${param.description || param.type || ''}">
                `; // Basic input, needs type handling (number, boolean, object, array)
                requestForm.appendChild(paramDiv);
            });
        } else {
            requestForm.innerHTML += '<p>No parameters required.</p>';
        }
    }

    // Add this in renderMethodDetails
if (method.protocolDetails?.requestBody?.content?.['application/json']?.schema) {
    const schema = method.protocolDetails.requestBody.content['application/json'].schema;

    requestForm.innerHTML += '<h3>Body:</h3>';
    if (schema.properties) {
        Object.entries(schema.properties).forEach(([propName, propSchema]) => {
            const required = (schema.required || []).includes(propName);
            const inputField = document.createElement('div');
            inputField.innerHTML = `
                <label for="body-${propName}">${propName}${required ? '*' : ''}:</label>
                <input type="text" id="body-${propName}" placeholder="${propSchema.description || propSchema.type || ''}">
            `;
            requestForm.appendChild(inputField);
        });
    }
}


     // TODO: Generate inputs for Headers, Auth etc.
     if (requestHeaders) { // Check if element exists
         requestHeaders.innerHTML = '<textarea id="headers-input" placeholder="{\n  \"Authorization\": \"Bearer ...\"\n}"></textarea>';
     }


    // Clear previous response and generated code
    displayResponse({ status: 'N/A', time: 'N/A', headers: {}, body: '' }); // Use a dummy payload
    hideGeneratedCode(); // Hide generated code section
}

function collectRequestData() {
     if (!currentMethod) {
         console.warn("currentMethod is null when collecting data.");
         return null;
     }

    const requestData = {};
     // TODO: Collect data from dynamically generated form inputs
     // This requires mapping input IDs back to schema parameters and handling types.
     // Example: loop through form elements (assuming basic input fields)
     if (currentMethod.parameters) {
         currentMethod.parameters.forEach((param) => {
             const inputElement = document.getElementById(`param-${param.name}`);
             if (inputElement) {
                 // Basic string value - needs parsing for numbers, booleans, JSON objects/arrays
                 // TODO: Add logic to parse input based on param.type
                 requestData[param.name] = inputElement.value;
                 // Add basic validation (e.g., check required)
                 if (param.required && !inputElement.value) {
                      alert(`${param.name} is required!`);
                      throw new Error(`${param.name} is required`); // Or handle validation errors properly
                 }
             }
         });
     }


     let headers = {};
     try {
         const headersInput = document.getElementById('headers-input');
         if (headersInput && headersInput.value.trim()) {
             // TODO: Add more robust JSON parsing with error handling
             headers = JSON.parse(headersInput.value);
         }
     } catch (e) {
         alert("Invalid Headers JSON!");
         throw e; // Or handle error
     }

     let bodyData = {};
if (currentMethod.protocolDetails?.requestBody?.content?.['application/json']?.schema) {
    const schema = currentMethod.protocolDetails.requestBody.content['application/json'].schema;
    if (schema.properties) {
        Object.entries(schema.properties).forEach(([propName]) => {
            const input = document.getElementById(`body-${propName}`);
            if (input) {
                bodyData[propName] = input.value;
            }
        });
    }
}


    return {
    methodId: currentMethod.id,
    requestData: requestData, // query params
    headers: headers,
    body: bodyData // ADD THIS LINE
};

}


function displayResponse(response) {
    if (responseStatus) responseStatus.textContent = `Status: ${response.status}`;
    if (responseTime) responseTime.textContent = `Time: ${response.time}ms`;

    if (responseHeadersDisplay) {
        try {
            // Pretty print headers
            responseHeadersDisplay.textContent = JSON.stringify(response.headers, null, 2);
        } catch (e) {
             responseHeadersDisplay.textContent = String(response.headers); // Fallback
        }
    }


    if (responseBodyDisplay) { // Check if element exists
        // Display body - handle JSON vs plain text, add syntax highlighting
        if (typeof response.body === 'object' && response.body !== null) {
            try {
                 responseBodyDisplay.textContent = JSON.stringify(response.body, null, 2);
                 // TODO: Apply syntax highlighting (e.g., using highlight.js)
                 // Example (requires highlight.js library included in webview HTML/media):
                 // if (window.hljs) { hljs.highlightElement(responseBodyDisplay); }
            } catch (e) {
                 responseBodyDisplay.textContent = String(response.body); // Fallback
            }
        } else {
             responseBodyDisplay.textContent = String(response.body); // Ensure it's a string
        }
         // Reset text color if it was set to red for errors
         responseBodyDisplay.style.color = '';
    }
}

function displayError(error) {
    if (responseStatus) responseStatus.textContent = `Status: Error`;
    if (responseTime) responseTime.textContent = '';
    if (responseHeadersDisplay) responseHeadersDisplay.textContent = '';
    if (responseBodyDisplay) {
        responseBodyDisplay.textContent = `Error: ${error.message}\n\n${error.stack || ''}`;
        responseBodyDisplay.style.color = 'red'; // Simple styling
    }
}

// CORRECTED: Functions for displaying generated code
function displayGeneratedCode(code) {
    if (codegenOutputSection && generatedCodeDisplay) {
        generatedCodeDisplay.textContent = code;
        codegenOutputSection.style.display = 'block'; // Show the section
        // TODO: Apply syntax highlighting to the code block
         // Example (requires highlight.js):
         // if (window.hljs) { hljs.highlightElement(generatedCodeDisplay); }
    }
}

function hideGeneratedCode() {
    if (codegenOutputSection && generatedCodeDisplay) {
         generatedCodeDisplay.textContent = '';
         codegenOutputSection.style.display = 'none'; // Hide the section
    }
}

function collectRawRequestData() {
  const rawUrl = document.getElementById('raw-url')?.value || '';
  const rawMethod = document.getElementById('raw-method')?.value || 'GET';
  const rawBody = document.getElementById('raw-body')?.value || '';
  let headers = {};

  try {
    const headersInput = document.getElementById('headers-input');
    if (headersInput && headersInput.value.trim()) {
      headers = JSON.parse(headersInput.value);
    }
  } catch (e) {
    alert("Invalid Headers JSON!");
    throw e;
  }

  return {
    methodId: '__raw__',
    headers,
    rawUrl,
    rawMethod,
    rawBody
  };
}



// --- Button Event Listeners ---

if (runButton) { // Check if element exists
    runButton.addEventListener('click', () => {
        try {
            const requestPayload = isRawMode ? collectRawRequestData() : collectRequestData();
            if (!requestPayload) return;

            // Clear previous response display while waiting
            displayResponse({ status: 'Sending Request...', time: 'N/A', headers: {}, body: '' }); // Use dummy payload
            hideGeneratedCode(); // Hide generated code when running request


            vscode.postMessage({
                command: 'runRequest',
                payload: requestPayload
            });

        } catch (e) {
            console.error("Error collecting request data:", e);
            // Error handling for data collection is done inside collectRequestData (alerts/throws)
        }
    });
}

if (generateCodeButton) { // Check if element exists
    generateCodeButton.addEventListener('click', () => {
         if (!currentMethod) {
             console.warn("currentMethod is null when generating code.");
             return;
         }

         // TODO: Prompt user for language/library? Or use configuration?
         const targetLanguage = 'typescript-axios'; // Example default

         vscode.postMessage({
             command: 'generateCodeStub',
             payload: {
                 methodId: currentMethod.id,
                 language: targetLanguage
             }
         });
    });
}

// CORRECTED: Add event listener for copy code button
if (copyCodeButton) {
    copyCodeButton.addEventListener('click', async () => {
         if (generatedCodeDisplay && generatedCodeDisplay.textContent) {
             try {
                 await navigator.clipboard.writeText(generatedCodeDisplay.textContent);
                 // Optional: Provide visual feedback (e.g., change button text briefly)
                 const originalText = copyCodeButton.textContent;
                 copyCodeButton.textContent = 'Copied!';
                 setTimeout(() => { copyCodeButton.textContent = originalText; }, 2000);
             } catch (err) {
                 console.error('Failed to copy code:', err);
                 alert('Failed to copy code.');
             }
         }
    });
}


// --- Initial Load ---
// You might want to request the initial schema data if it wasn't sent immediately
// Or rely on the 'schemaLoaded' message arriving after the panel is created.
// vscode.postMessage({ command: 'requestInitialSchema' }); // Example if needed

// Initial state setup
hideGeneratedCode(); // Ensure code section is hidden on load

// Add basic support for light/dark mode CSS variables from VS Code
// This assumes webview.css uses standard VS Code CSS variables like --vscode-editor-background etc.
// No code needed here if using CSS variables, the browser/webview picks them up automatically.
// Tell extension host we are ready to receive messages
vscode.postMessage({ command: 'webviewReady' });
