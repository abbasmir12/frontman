export interface AIProvider {
    name: string;
    baseUrl: string;
    models: string[];
}

export interface AIConfig {
    provider: string;
    model: string;
    apiKey: string;
}

export interface AIPromptRequest {
    prompt: string;
    config: AIConfig;
    conversationHistory?: Array<{role: 'user' | 'assistant' | 'system', content: string}>;
}

export interface AICurlResponse {
    curlCommand: string;
    explanation?: string;
}

import fetch from 'node-fetch';

export class AIRequestService {
    private static readonly HUGGINGFACE_API_URL = 'https://router.huggingface.co/v1/chat/completions';

    private static readonly DEFAULT_PROVIDERS: AIProvider[] = [
        {
            name: 'Hugging Face',
            baseUrl: 'https://router.huggingface.co',
            models: ['openai/gpt-oss-120b']
        }
    ];

    /**
     * Generate a cURL command from a text prompt using AI
     */
    public static async generateCurlCommand(request: AIPromptRequest): Promise<AICurlResponse> {
        const { prompt, config, conversationHistory = [] } = request;

        if (!config.apiKey) {
            throw new Error('API key is required for AI-powered requests');
        }

        if (!prompt.trim()) {
            throw new Error('Prompt cannot be empty');
        }

        try {
            const curlCommand = await this.callHuggingFaceAPI(prompt, config, conversationHistory);
            return {
                curlCommand,
                explanation: 'Generated cURL command based on your prompt'
            };
        } catch (error: any) {
            console.error('AI Request Service Error:', error);
            throw new Error(`Failed to generate cURL command: ${error.message}`);
        }
    }

    /**
     * Call Hugging Face API to generate cURL command
     */
    private static async callHuggingFaceAPI(prompt: string, config: AIConfig, conversationHistory: Array<{role: 'user' | 'assistant' | 'system', content: string}> = []): Promise<string> {
        // Create a system prompt that instructs the AI to generate cURL commands
        const systemPrompt = `You are an expert API developer. Given a user's request description, generate a valid cURL command.

IMPORTANT INSTRUCTIONS:
- Respond ONLY with the cURL command
- Do not include any introductory text, explanations, or phrases like "Generated Curl Command:", "Here's the cURL command:", etc.
- Start your response directly with "curl"
- Do not add any concluding remarks or additional text`;

        // Build messages array with conversation history
        const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [];

        // Add system message first
        messages.push({
            role: 'system',
            content: systemPrompt
        });

        // Add conversation history if provided
        if (conversationHistory.length > 0) {
            messages.push(...conversationHistory);
        }

        // Add current user prompt with enhanced instruction
        const enhancedPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with the cURL command. Do not include any introductory text, explanations, or phrases like "Generated Curl Command:", "Here's the cURL command:", or similar. Just the raw cURL command starting with "curl".`;
        messages.push({
            role: 'user',
            content: enhancedPrompt
        });

        const response = await fetch(this.HUGGINGFACE_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages,
                model: config.model
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Hugging Face API error (${response.status}): ${errorText}`);
        }

        const result = await response.json() as any;

        // Enhanced validation for AI response
        if (!result) {
            throw new Error('Empty response from AI service');
        }

        if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
            throw new Error('No choices returned from AI service');
        }

        if (!result.choices[0] || !result.choices[0].message) {
            throw new Error('Invalid response structure from AI service');
        }

        if (!result.choices[0].message.content || result.choices[0].message.content.trim() === '') {
            throw new Error('No content in AI response');
        }

        // The AI should now return clean cURL commands directly thanks to our enhanced prompt
        const curlCommand = result.choices[0].message.content;

        // Basic validation - ensure it starts with curl
        if (!curlCommand || typeof curlCommand !== 'string' || !curlCommand.toLowerCase().startsWith('curl')) {
            throw new Error('AI did not generate a valid cURL command');
        }

        return curlCommand;
    }

    /**
     * Get available AI providers
     */
    public static getAvailableProviders(): AIProvider[] {
        return [...this.DEFAULT_PROVIDERS];
    }

    /**
     * Validate AI configuration
     */
    public static validateConfig(config: AIConfig): boolean {
        return !!(config.provider && config.model && config.apiKey);
    }

    /**
     * Test AI configuration by making a simple request
     */
    public static async testConfig(config: AIConfig): Promise<boolean> {
        try {
            await this.callHuggingFaceAPI('test', config);
            return true;
        } catch (error) {
            return false;
        }
    }
}