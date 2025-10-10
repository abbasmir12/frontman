import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
// Ensure these types are correctly imported
import { IApiDefinition, IMethodDefinition, IParameter } from '../UnifiedSchema'; // Import IParameter

// CORRECTED: Remove imports for GrpcParser and GraphqlParser placeholder classes
// import { GrpcParser } from './GrpcParser';
// import { GraphqlParser } from './GraphqlParser';

// Import the actual OpenApiParser (assuming it exists)
import { OpenApiParser } from './OpenApiParser';

export class SchemaParser {
    private parsedApis: Map<string, IApiDefinition> = new Map();

    // TODO: Add an event emitter here to notify the tree view when schemas are added/removed

    constructor(private context: vscode.ExtensionContext) {
        // Initialize specific parsers
    }

    /**
     * Parses a schema file and adds it to the internal collection.
     * @param filePath The absolute path to the schema file.
     */
    public async parse(filePath: string): Promise<void> {
        const fileExtension = path.extname(filePath).toLowerCase();
        const fileContent = await fs.readFile(filePath, 'utf-8');
        let apiDefinition: IApiDefinition | undefined;

        // --- Schema Type Detection & Parsing ---
        if (fileExtension === '.json' || fileExtension === '.yaml' || fileExtension === '.yml') {
            // Assume OpenAPI
            const openApiParser = new OpenApiParser();
            apiDefinition = await openApiParser.parse(filePath, fileContent);
        } else if (fileExtension === '.proto') {
             // CORRECTED: Use the local placeholder class for now
            const grpcParser = new LocalGrpcParserPlaceholder();
            console.warn(`gRPC parsing for ${filePath} is not fully implemented. Using placeholder.`);
             // Create a dummy definition for gRPC for now
            apiDefinition = {
                 id: filePath,
                 name: path.basename(filePath),
                 type: 'grpc',
                 servers: [], // Added servers property as required by IApiDefinition
                 services: [{
                     id: `${filePath}-dummy`,
                     name: 'DummyService',
                     methods: [{
                         id: `${filePath}-dummy-SayHello`,
                         name: 'SayHello',
                         description: 'Dummy gRPC method',
                         // CORRECTED: Added 'required' property to dummy parameters
                         parameters: [{ name: 'request', type: 'object', required: true } as IParameter],
                         response: 'string',
                         protocolDetails: {},
                         parentServiceId: `${filePath}-dummy`,
                         parentApiId: filePath
                     }]
                 }]
            };

        } else if (fileExtension === '.graphql' || fileExtension === '.gql') {
             // CORRECTED: Use the local placeholder class for now
            const graphqlParser = new LocalGraphqlParserPlaceholder();
             console.warn(`GraphQL parsing for ${filePath} is not fully implemented. Using placeholder.`);
             // Create a dummy definition for GraphQL for now
              apiDefinition = {
                 id: filePath,
                 name: path.basename(filePath),
                 type: 'graphql',
                 servers: [], // Added servers property as required by IApiDefinition
                 services: [{
                     id: `${filePath}-queries`,
                     name: 'Queries',
                     methods: [{
                         id: `${filePath}-queries-greeting`,
                         name: 'greeting',
                         description: 'Dummy GraphQL query',
                         // CORRECTED: Added 'required' property to dummy parameters
                         parameters: [{ name: 'name', type: 'string', required: true } as IParameter],
                         response: 'string',
                         protocolDetails: {},
                         parentServiceId: `${filePath}-queries`,
                         parentApiId: filePath
                     }],
                 },
                 {
                      id: `${filePath}-mutations`,
                     name: 'Mutations',
                     methods: [{
                         id: `${filePath}-mutations-createUser`,
                         name: 'createUser',
                         description: 'Dummy GraphQL mutation',
                          // CORRECTED: Added 'required' property to dummy parameters
                         parameters: [{ name: 'input', type: { name: 'CreateUserInput', type: 'object', properties: [{name: 'name', type: 'string', required: true} as IParameter]}, required: true } as IParameter],
                         response: { name: 'User', type: 'object', properties: [{name: 'id', type: 'string', required: true}, {name: 'name', type: 'string', required: true}] }, // Dummy complex output
                         protocolDetails: {},
                         parentServiceId: `${filePath}-mutations`,
                         parentApiId: filePath
                     }]
                 }
                ]
            };

        }

        if (!apiDefinition) {
            throw new Error(`Unsupported file type or failed to detect schema type for ${filePath}`);
        }

        apiDefinition.id = filePath;

        this.parsedApis.set(apiDefinition.id, apiDefinition);

        console.log(`Parsed API: ${apiDefinition.name} (${apiDefinition.type}) from ${filePath}`);

        // TODO: Notify Tree View Provider that schemas have changed
        // The TreeViewProvider could subscribe to an event emitter here
    }

    public getAllApis(): IApiDefinition[] {
        return Array.from(this.parsedApis.values());
    }

     public getApiById(apiId: string): IApiDefinition | undefined {
         return this.parsedApis.get(apiId);
     }

    public getMethodById(methodId: string): IMethodDefinition | undefined {
        for (const api of this.parsedApis.values()) {
            for (const service of api.services) {
                const method = service.methods.find(m => m.id === methodId);
                if (method) {
                    return method;
                }
            }
        }
        return undefined;
    }
}

// CORRECTED: Define placeholder classes locally within SchemaParser.ts
class LocalGrpcParserPlaceholder {
    async parse(filePath: string, fileContent: string): Promise<IApiDefinition> {
        // This method should actually implement parsing logic
        throw new Error('gRPC parsing not implemented');
    }
}

class LocalGraphqlParserPlaceholder {
     async parse(filePath: string, fileContent: string): Promise<IApiDefinition> {
        // This method should actually implement parsing logic
        throw new Error('GraphQL parsing not implemented');
     }
}