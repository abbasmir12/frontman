export interface ParsedCurlRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    params: Record<string, string>;
    auth?: {
        type: string;
        username?: string;
        password?: string;
        token?: string;
    };
}

export class CurlParser {
    /**
     * Parse a cURL command string into a structured request object
     * @param curlCommand The cURL command string
     * @returns ParsedCurlRequest object
     */
    static parse(curlCommand: string): ParsedCurlRequest {
        const result: ParsedCurlRequest = {
            method: 'GET',
            url: '',
            headers: {},
            params: {}
        };

        // Remove newlines and extra spaces for easier parsing
        const cleaned = curlCommand.replace(/\s+/g, ' ').trim();

        // Split by spaces but preserve quoted strings
        const tokens = this.tokenize(cleaned);

        let i = 0;
        while (i < tokens.length) {
            const token = tokens[i];

            switch (token) {
                case 'curl':
                    i++; // Skip 'curl'
                    break;

                case '-X':
                case '--request':
                    i++;
                    if (i < tokens.length) {
                        result.method = tokens[i].toUpperCase();
                        i++;
                    }
                    break;

                case '-H':
                case '--header':
                    i++;
                    if (i < tokens.length) {
                        const header = this.parseHeader(tokens[i]);
                        if (header) {
                            result.headers[header.key] = header.value;
                        }
                        i++;
                    }
                    break;

                case '-d':
                case '--data':
                case '--data-raw':
                    i++;
                    if (i < tokens.length) {
                        result.body = tokens[i];
                        i++;
                    }
                    break;

                case '--url':
                    i++;
                    if (i < tokens.length) {
                        result.url = tokens[i];
                        i++;
                    }
                    break;

                default:
                    // Check if it's a URL (doesn't start with -)
                    if (!token.startsWith('-') && !result.url) {
                        result.url = token;
                        i++;
                    } else {
                        i++;
                    }
                    break;
            }
        }

        // Parse URL parameters
        if (result.url) {
            result.params = this.parseUrlParams(result.url);
        }

        // Parse authentication from headers
        result.auth = this.parseAuthFromHeaders(result.headers);

        return result;
    }

    /**
     * Tokenize a cURL command string, preserving quoted strings
     */
    private static tokenize(command: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < command.length; i++) {
            const char = command[i];

            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
                current += char;
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
            } else if (char === ' ' && !inQuotes) {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            tokens.push(current.trim());
        }

        return tokens;
    }

    /**
     * Parse a header string like "Content-Type: application/json"
     */
    private static parseHeader(headerStr: string): { key: string; value: string } | null {
        const colonIndex = headerStr.indexOf(':');
        if (colonIndex === -1) {
            return null;
        }

        const key = headerStr.substring(0, colonIndex).trim();
        const value = headerStr.substring(colonIndex + 1).trim();

        return { key, value };
    }

    /**
     * Parse URL parameters from a URL string
     */
    private static parseUrlParams(url: string): Record<string, string> {
        const params: Record<string, string> = {};
        const urlObj = new URL(url.startsWith('http') ? url : 'http://' + url);
        urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
        });
        return params;
    }

    /**
     * Parse authentication information from headers
     */
    private static parseAuthFromHeaders(headers: Record<string, string>): ParsedCurlRequest['auth'] {
        // Check for Authorization header
        const authHeader = headers['Authorization'] || headers['authorization'];
        if (authHeader) {
            const match = authHeader.match(/^(\w+)\s+(.+)$/);
            if (match) {
                const [, type, credentials] = match;
                if (type.toLowerCase() === 'basic') {
                    // Basic auth: decode base64
                    try {
                        const decoded = atob(credentials);
                        const colonIndex = decoded.indexOf(':');
                        if (colonIndex !== -1) {
                            return {
                                type: 'basic',
                                username: decoded.substring(0, colonIndex),
                                password: decoded.substring(colonIndex + 1)
                            };
                        }
                    } catch (e) {
                        // Invalid base64, treat as bearer token
                        return {
                            type: 'bearer',
                            token: credentials
                        };
                    }
                } else if (type.toLowerCase() === 'bearer') {
                    return {
                        type: 'bearer',
                        token: credentials
                    };
                }
            }
        }

        return undefined;
    }

    /**
     * Validate if a string looks like a cURL command
     */
    static isValidCurlCommand(command: string): boolean {
        const trimmed = command.trim().toLowerCase();
        return trimmed.startsWith('curl') || trimmed.includes('curl');
    }

    /**
     * Get supported cURL options for help text
     */
    static getSupportedOptions(): string[] {
        return [
            '-X, --request <method> - HTTP method (GET, POST, PUT, etc.)',
            '-H, --header <header> - Add HTTP header',
            '-d, --data <data> - HTTP POST data',
            '--data-raw <data> - HTTP POST raw data',
            '--url <url> - Request URL'
        ];
    }
}