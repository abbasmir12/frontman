// Define your core unified schema types here
// This is a simplified example - you'll expand this significantly
export interface IApiDefinition {
  id: string;
  name: string;
  type: 'openapi' | 'graphql' | 'grpc';
  servers: { url: string }[],
  services: IServiceDefinition[];
  version?: string;
  description?: string;
  // 👇 Add this field
  protocolDetails?: {
    baseUrl?: string;         // e.g. https://petstore3.swagger.io
    servers?: { url: string }[];
  };
}

export interface IServiceDefinition {
    id: string; // Unique ID (e.g., API ID + service name)
    name: string;
    description?: string;
    methods: IMethodDefinition[];
}

export interface IMethodDefinition {
    id: string; // Unique ID (e.g., Service ID + method name)
    name: string;
    description?: string;
    parameters: IParameter[]; // Request parameters/fields
    // CORRECTED: Allow response to be a complex type definition, a primitive string name, or undefined
    response?: ITypeDefinition | string;
    // Protocol specific details (e.g., httpMethod, path for REST; stream info for gRPC)
    protocolDetails: any;
    parentServiceId: string; // Useful for lookup
    parentApiId: string; // Useful for lookup
}

export interface IParameter {
     name: string;
     description?: string;
     type: ITypeDefinition | string; // Can be a complex type or a primitive string name (e.g., 'string', 'integer')
     required: boolean;
     // Add validation rules, default values, etc.
     schema?: any; // Raw schema snippet (e.g., from OpenAPI Parameter Object or GraphQL Arg)
     // ADDED: Store 'in' property for OpenAPI parameters
     in?: 'query' | 'header' | 'path' | 'cookie' | 'body' | 'form'; // Extended possibilities based on common usage/OAS 2
}

export interface ITypeDefinition {
    name: string; // Type name (e.g., 'User', 'Pet', 'string', 'array', 'object')
    type: 'object' | 'array' | 'primitive' | 'enum' | 'ref'; // Basic type categories
    description?: string;
    properties?: IParameter[]; // For object types
    items?: ITypeDefinition | string; // For array items (can also be a primitive name)
    enum?: string[]; // For enum types
    ref?: string; // For references to other types (id or name)
    // Add format, pattern, min/max, etc. for primitives
}

// Tree View Item types
export type ApiItemType = 'api' | 'service' | 'method' | 'parameter' | 'type' | 'parametersGroup' | 'responseGroup'; // ADDED: Distinct types for groups

export interface ApiTreeItemData {
    id: string; // Corresponds to the ID in the schema definitions or a generated ID for groups
    type: ApiItemType; // Use the specific types now
    label: string;
    description?: string;
    // Store a reference or copy of the relevant schema data
    // Use a union type to be more precise
    schemaDetails?: IApiDefinition | IServiceDefinition | IMethodDefinition | IParameter | ITypeDefinition | string; // ADDED: string for primitive responses
}

// Messages between webview and extension
export interface WebviewMessage {
    command: 'runRequest' | 'generateCodeStub' | 'schemaLoaded' | 'responseReceived' | 'showError' | 'codeGenerated' | 'webviewReady'; // ADDED: codeGenerated command
    payload?: any;
}

export interface RunRequestPayload {
  methodId: string;
  requestData?: Record<string, any>;
  headers?: Record<string, string>;
  body?: any;
  method?: string;
  url?: string; // Added to support raw requests
  params?: Record<string, string>; // Optional query params for raw requests
}


export interface ResponseReceivedPayload {
  methodId: string;
  status: number;
  statusText?: string;
  headers: Record<string, string> & { 'set-cookie'?: string | string[] };
  body: any;
  rawBodyBase64: string;
  time: number;
  details?: any;
}

// ====== ENVIRONMENT TYPES ======
export type EnvironmentVariableType = 'string' | 'number' | 'boolean';

export interface EnvironmentVariable {
  id: string;
  key: string;
  initialValue: string;
  currentValue: string;
  type: 'default' | 'secret';
  enabled: boolean;
}

export interface Environment {
  id: string; // Unique ID (UUID)
  name: string; // Unique name
  variables: EnvironmentVariable[];
  lastModified: number; // timestamp
}

export interface EnvironmentState {
  environments: Environment[];
  selectedEnvironmentId?: string;
}

// Webview <-> Extension messages for environments
export type EnvironmentPanelMessage = {
  command:
    | 'getEnvironments'
    | 'setActiveEnvironment'
    | 'createEnvironment'
    | 'updateEnvironment'
    | 'deleteEnvironment'
    | 'cloneEnvironment'
    | 'importEnvironments'
    | 'exportEnvironments'
    | 'renameEnvironment'
    | 'updateVariable'
    | 'addVariable'
    | 'deleteVariable'
    | 'persistVariable'
    | 'resetVariable'
    | 'persistAll'
    | 'resetAll'
    | 'switchEnvironment'
    | 'saveEnvironment'
    | 'shareEnvironment'
    | 'showError'
    | 'showSuccess';
  payload?: any;
};

export type EnvironmentPanelResponse =
  | { command: 'environments', payload: EnvironmentState }
  | { command: 'error', payload: { message: string } }
  | { command: 'success', payload?: any };
