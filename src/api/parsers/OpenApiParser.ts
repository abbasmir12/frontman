import type {
  OpenAPIObject,
  PathItemObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  ResponsesObject,
  ResponseObject,
  SchemaObject
} from 'openapi3-ts/oas30';


import SwaggerParser from '@apidevtools/swagger-parser';

// Ensure these types are correctly imported from your local types file
import { IApiDefinition, IServiceDefinition, IMethodDefinition, IParameter, ITypeDefinition } from '../UnifiedSchema';
import * as path from 'path';

export class OpenApiParser {

    public async parse(filePath: string, fileContent: string): Promise<IApiDefinition> {
        try {
            // CORRECTED: Cast the result of validate to OpenAPIObject from the imported types
            const api = await SwaggerParser.validate(filePath) as OpenAPIObject;

            const apiDefinition: IApiDefinition = {
                id: filePath,
                name: api.info?.title || path.basename(filePath),
                type: 'openapi',
                version: api.info?.version,
                description: api.info?.description,
                services: [],
                servers: api.servers || []
            };

            const servicesMap: Map<string, IServiceDefinition> = new Map();

             // CORRECTED: Use PathItemObject type from the imported types
            const httpMethods: (keyof PathItemObject)[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];


            for (const pathName in api.paths) {
                const pathItem = api.paths[pathName];

                 // CORRECTED: Use ReferenceObject type from the imported types
                if (!pathItem || typeof pathItem !== 'object' || '$ref' in pathItem) {
                    continue;
                }

                for (const httpMethodKey in pathItem) {
                    // CORRECTED: Check if the property key is one of the HTTP methods
                    if (httpMethods.includes(httpMethodKey as keyof PathItemObject)) {
                        // Access the potential operation object using the checked key
                        // CORRECTED: Cast to OperationObject from the imported types
                        const method = httpMethodKey as keyof PathItemObject;
                        const operation = pathItem[method] as OperationObject;

                         if (operation && typeof operation === 'object') {

                            const operationId = operation.operationId || `${httpMethodKey}_${pathName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
                            const serviceName = operation.tags?.[0] || 'Default';

                            if (!servicesMap.has(serviceName)) {
                                servicesMap.set(serviceName, {
                                    id: `${apiDefinition.id}-${serviceName}`,
                                    name: serviceName,
                                    description: '',
                                    methods: []
                                });
                            }

                            const methodDefinition: IMethodDefinition = {
                                id: `${servicesMap.get(serviceName)!.id}-${operationId}`,
                                name: operation.summary || operationId,
                                description: operation.description,
                                // CORRECTED: Cast parameters and responses to their expected types from the imported types
                                parameters: this.mapOpenApiParameters(operation.parameters as (ParameterObject | ReferenceObject)[]),
                                response: this.mapOpenApiResponse(operation.responses as ResponsesObject),
                                protocolDetails: {
                                    httpMethod: httpMethodKey.toUpperCase(),
                                    path: pathName,
                                     requestBody: operation.requestBody,
                                     security: operation.security
                                },
                                parentServiceId: servicesMap.get(serviceName)!.id,
                                parentApiId: apiDefinition.id,
                            };
                             // CORRECTED: Update method array immutably
                            servicesMap.set(serviceName, {...servicesMap.get(serviceName)! , methods: [...servicesMap.get(serviceName)!.methods, methodDefinition]});
                        }
                    }
                }
            }

            apiDefinition.services = Array.from(servicesMap.values());

            return apiDefinition;

        } catch (error) {
            console.error('OpenAPI parsing failed:', error);
            throw new Error(`OpenAPI parsing failed: ${(error as any).message || error}`);
        }
    }

    // Helper to map OpenAPI parameters (ParameterObject or ReferenceObject) to IParameter[]
     // CORRECTED: Use specific OpenAPI types from the imported types for input parameters
    private mapOpenApiParameters(parameters: (ParameterObject | ReferenceObject)[] | undefined): IParameter[] {
        if (!parameters) return [];
        return parameters.map(param => {
             // CORRECTED: Check if param is a ReferenceObject from the imported types
             if ('$ref' in param) {
                 console.warn(`OpenAPI $ref parameter not fully resolved: ${param.$ref}`);
                 return {
                     name: param.$ref.split('/').pop() || 'ref',
                     description: `Reference: ${param.$ref}`,
                     type: { name: param.$ref.split('/').pop() || 'ref', type: 'ref', ref: param.$ref },
                     required: false, // Cannot determine required from ref alone
                     schema: param
                 } as IParameter;
             } else {
                 // It's a ParameterObject
                 return {
                     name: param.name,
                     description: param.description,
                      // CORRECTED: Cast param.schema to the correct type from the imported types
                     type: this.mapOpenApiSchemaToType(param.schema as SchemaObject | ReferenceObject | undefined),
                     required: param.required || false,
                     schema: param.schema,
                      in: param.in
                 } as IParameter;
             }
        });
    }

    // Helper to map OpenAPI responses (ResponsesObject) to ITypeDefinition | string | undefined
     // CORRECTED: Use specific OpenAPI type from the imported types for input responses
    private mapOpenApiResponse(responses: ResponsesObject | undefined): ITypeDefinition | string | undefined {
        if (!responses) return undefined;

        const successResponseKey = Object.keys(responses).find(key => key.startsWith('2'));
        const successResponse = successResponseKey ? responses[successResponseKey] : responses.default;

         // CORRECTED: Check if successResponse is a ReferenceObject from the imported types
         if (successResponse && '$ref' in successResponse) {
             console.warn(`OpenAPI $ref response not fully resolved: ${successResponse.$ref}`);
             return { name: successResponse.$ref.split('/').pop() || 'ref', type: 'ref', ref: successResponse.$ref } as ITypeDefinition;
         }

        // Assume it's a ResponseObject
         // CORRECTED: Use the correct type for ResponseObject from the imported types
        const responseContent = (successResponse as ResponseObject)?.content;


        if (responseContent?.['application/json']?.schema) {
             // CORRECTED: Cast the schema to the correct type from the imported types
            return this.mapOpenApiSchemaToType(responseContent['application/json'].schema as SchemaObject | ReferenceObject);
        }
        return undefined;
    }

     // Helper to map a generic OpenAPI Schema Object or Reference Object to ITypeDefinition or string
     // CORRECTED: Use specific OpenAPI types from the imported types for input schema
     private mapOpenApiSchemaToType(schema: SchemaObject | ReferenceObject | undefined): ITypeDefinition | string {
         if (!schema) return 'any';

         // CORRECTED: Check if it's a ReferenceObject from the imported types
         if ('$ref' in schema) {
             const refName = schema.$ref.split('/').pop();
             return { name: refName, type: 'ref', ref: schema.$ref } as ITypeDefinition;
         }

         // It's a SchemaObject
         // CORRECTED: Cast schema to SchemaObject
         const schemaObject = schema as SchemaObject;

         switch (schemaObject.type) {
             case 'object':
                 return {
                     name: schemaObject.title || schemaObject.description || 'object',
                     type: 'object',
                     description: schemaObject.description,
                     // CORRECTED: Map properties recursively, ensuring they are SchemaObject | ReferenceObject
                     properties: Object.keys(schemaObject.properties || {}).map(propName => ({
                         name: propName,
                          // CORRECTED: Access description safely on the property schema, casting it
                         description: ('$ref' in schemaObject.properties![propName])
                            ? undefined
                            : (schemaObject.properties![propName] as SchemaObject).description,
                         // Recursively map properties, casting the property schema
                         type: this.mapOpenApiSchemaToType(schemaObject.properties![propName] as SchemaObject | ReferenceObject),
                         required: schemaObject.required?.includes(propName) || false,
                         schema: schemaObject.properties![propName],
                     }) as IParameter)
                 } as ITypeDefinition;
             case 'array':
                  // CORRECTED: Handle cases where items might be missing or primitive, casting items schema
                 const itemsSchema = schemaObject.items as SchemaObject | ReferenceObject | undefined;
                 const itemsType: ITypeDefinition | string = itemsSchema ? this.mapOpenApiSchemaToType(itemsSchema) : 'any';

                 return {
                     name: schemaObject.title || schemaObject.description || 'array',
                     type: 'array',
                     description: schemaObject.description,
                     items: itemsType
                 } as ITypeDefinition;
             case 'string':
             case 'number':
             case 'integer':
             case 'boolean':
                 return schemaObject.type;
             default:
                 return (typeof schemaObject.type === 'string') ? schemaObject.type : 'any';
         }
     }
}