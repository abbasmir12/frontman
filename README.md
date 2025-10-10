<div align="center">
  <img src="media/logos/_logo.svg" alt="FrontmanLogo"/>
</div>


# Frontman

The AI-Powered VS Code Extension That Makes API Testing Effortless

## What Makes This Special?

AI-Powered Request Generation: Just tell the AI what you want to do - "Analyze NASA’s Astronomy Picture of the Day API — make a GET request for today’s image and it's metadata" - and watch as it generates the complete cURL command with all headers, authentication, and body content filled in automatically.

Zero-Configuration Import: Copy any cURL command from anywhere (Stack Overflow, API docs, your terminal) and paste it in - the extension automatically parses it and populates all the request fields.

Smart Environment Management: Define variables once, use them everywhere. The extension intelligently highlights and validates your environment variables as you type.

## Perfect For

API Developers who want to test endpoints quickly
Backend Engineers building and debugging APIs
Frontend Developers integrating with APIs
DevOps Engineers testing API deployments
Technical Writers documenting API usage
Students learning about APIs
Non-technical users who need to interact with APIs

## Key Features

### AI Generate - Your Personal API Assistant

"Just tell me what you want!"

This works by having you describe the API request you need in plain English, and the AI generates the complete cURL command for you.

How it works:
1. Click the AI Generate button in the floating widget
2. Type something like: "Simulate login by sending POST to https://reqres.in/api/login with email and password, extract the token, and use it in a subsequent GET request to /api/users/2."
3. The AI generates a complete cURL command with proper headers, authentication, and JSON body
4. Click "Accept" and all fields are populated automatically
5. Hit Send to test your request

Example prompts that work:
- "GET request to JSONPlaceholder for user data"
- "POST to httpbin.org with form data"
- "Upload file to API endpoint"
- "DELETE request with custom headers"

The AI understands context, handles authentication, and even suggests proper headers based on your requirements.

### Import - Bring Any Request In

Copy. Paste. Done.

Found a cURL command in documentation? On Stack Overflow? In your terminal history? Just paste it in and watch the magic happen.

Supports:
- cURL commands (with all options)
- Postman collections
- HAR files (HTTP Archive)
- Raw HTTP requests

Smart parsing handles:
- Complex authentication (Bearer tokens, API keys, OAuth)
- Custom headers and cookies
- Query parameters and form data
- Different content types (JSON, XML, form-data)

### Export - Share Your Work

Generate perfect cURL commands from your requests.

Building a request in the visual editor? Need to share it with your team? Export it as a clean cURL command that works anywhere.

Perfect for:
- Copying to documentation
- Sharing bug reports
- Team collaboration
- Migrating between tools

### Environment Management

Variables that work everywhere.

Define your API keys, endpoints, and configuration once, then use them across all your requests with intelligent autocomplete and validation.

Features:
- Smart highlighting - see your variables as you type
- Real-time validation - know if variables are defined
- Auto-resolution - variables are replaced when sending requests
- Organized storage - keep different environments for dev/staging/prod

### Collection Management

Organize your requests like a pro.

Save frequently used requests into collections with folders for better organization. Perfect for:
- Workflow automation
- API documentation
- Team sharing
- Testing suites

### Beautiful, Intuitive Interface

Built for developers, by developers.

- Dark theme that looks great with VS Code
- CodeMirror integration for syntax highlighting
- Real-time search in responses
- Multiple view formats (JSON, XML, HTML, Raw, Hex)
- Response history - never lose a response again

## Real-World Use Cases

### For API Documentation Writers
*"I need to document how to create a user via our API"*
- Use AI Generate: *"POST request to create a new user with name, email, and role fields"*
- Export the cURL command for your docs
- Test variations easily

### For Frontend Developers
*"The login API isn't working on mobile"*
- Use AI Generate: *"POST to login endpoint with mobile user agent"*
- Import existing cURL commands from browser dev tools
- Test with different headers and authentication

### For Backend Engineers
*"Need to test the new webhook endpoint"*
- Use AI Generate: *"POST webhook with JSON payload and proper signature"*
- Save to collection for regression testing
- Export for deployment scripts

### For DevOps Engineers
*"Verify the staging API is responding correctly"*
- Set up staging environment variables
- Use AI Generate to create health check requests
- Monitor response times and status codes

## Advanced Features

### Variable Resolution
```
Base URL: {{API_BASE}}/users/{{USER_ID}}
Headers: Authorization: Bearer {{API_TOKEN}}
Body: {"environment": "{{ENV}}"}
```

Variables are resolved at runtime from your environment configuration.

### Authentication Methods
- No Auth - Simple requests
- API Key - Header or query parameter
- Bearer Token - JWT and OAuth tokens
- Basic Auth - Username/password
- Digest Auth - Challenge-response
- AWS Signature - AWS API authentication
- Hawk Auth - Hawk authentication
- NTLM - Windows authentication

### Request History
Every request and response is automatically saved with:
- Timestamp
- Request details (method, URL, headers, body)
- Response metadata (status, time, size)
- Error messages (if any)

### Response Analysis
- Size breakdown - headers vs body size
- Timing details - DNS, TCP, SSL, request, response times
- Network info - HTTP version, local/remote addresses
- TLS details - protocol, cipher, certificate info

## Configuration

### AI Settings
```json
{
  "universalApiNavigator.aiConfig": {
    "provider": "huggingface",
    "model": "openai/gpt-oss-120b",
    "apiKey": "your-api-key-here"
  }
}
```

### Environment Variables
```json
{
  "apiSidebar.environments": [
    {
      "id": "dev",
      "name": "Development",
      "variables": [
        {
          "key": "API_BASE",
          "value": "https://api-dev.example.com",
          "enabled": true
        }
      ]
    }
  ]
}
```

## Installation & Setup

### Quick Start (2 minutes)
```bash
git clone https://gitlab.com/abbasmir12/frontman.git
cd frontman
npm install
npm run compile
```

### Run in Development Mode
```bash
# Compile and watch for changes
npm run watch

# In another terminal, launch extension
code --extensionDevelopmentPath=$(pwd) .
```

### Package for Publishing
```bash
npm run package
# Creates .vsix file in the root directory
```

## Troubleshooting

### Common Issues

**AI Generate not working?**
- Check your AI API key in settings
- Ensure you have internet connection
- Try a simpler prompt first

**Import failing?**
- Make sure the cURL command is complete
- Check for proper quoting in complex commands
- Try copying the command again

**Variables not resolving?**
- Verify environment is selected (check status bar)
- Ensure variable names match exactly
- Check if variables are enabled

## What's Next?

- Workflow Integration - CI/CD pipeline support
- Performance Testing - load testing capabilities
- API Discovery - automatic API schema detection
- Team Collaboration - shared collections and environments
- Mobile Companion App - test APIs from your phone
