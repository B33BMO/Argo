import type { Tool, ToolContext, ToolResult } from './types.js';

const MAX_RESPONSE_LENGTH = 50000;
const DEFAULT_TIMEOUT = 30000;

export const curlTool: Tool = {
  name: 'curl',
  description:
    'Make HTTP requests to URLs. Useful for fetching web content, calling APIs, and testing endpoints.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to request',
      },
      method: {
        type: 'string',
        description: 'HTTP method (GET, POST, PUT, DELETE, PATCH). Default: GET',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      headers: {
        type: 'object',
        description: 'HTTP headers as key-value pairs',
      },
      body: {
        type: 'string',
        description: 'Request body (for POST, PUT, PATCH)',
      },
      timeout: {
        type: 'number',
        description: `Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT})`,
      },
    },
    required: ['url'],
  },

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const url = params.url as string;
    const method = ((params.method as string) || 'GET').toUpperCase();
    const headers = (params.headers as Record<string, string>) || {};
    const body = params.body as string | undefined;
    const timeout = (params.timeout as number) || DEFAULT_TIMEOUT;

    // Confirm non-GET requests
    if (method !== 'GET' && context.requestConfirmation) {
      const confirmed = await context.requestConfirmation(
        `Make ${method} request to ${url}?`
      );
      if (!confirmed) {
        return {
          success: false,
          output: '',
          error: 'Request cancelled by user',
        };
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'Roo/1.0',
          ...headers,
        },
        body: body || undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let responseBody: string;

      if (
        contentType.includes('application/json') ||
        contentType.includes('text/')
      ) {
        responseBody = await response.text();
      } else {
        responseBody = `[Binary content: ${contentType}, ${response.headers.get('content-length') || 'unknown'} bytes]`;
      }

      let truncated = false;
      if (responseBody.length > MAX_RESPONSE_LENGTH) {
        responseBody =
          responseBody.slice(0, MAX_RESPONSE_LENGTH) +
          '\n... (response truncated)';
        truncated = true;
      }

      const statusLine = `HTTP ${response.status} ${response.statusText}`;
      const headerLines = Array.from(response.headers.entries())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      const output = `${statusLine}\n${headerLines}\n\n${responseBody}`;

      return {
        success: response.ok,
        output,
        truncated,
        error: response.ok ? undefined : `Request failed with status ${response.status}`,
      };
    } catch (err) {
      const error = err as Error;

      if (error.name === 'AbortError') {
        return {
          success: false,
          output: '',
          error: `Request timed out after ${timeout}ms`,
        };
      }

      return {
        success: false,
        output: '',
        error: error.message || 'Request failed',
      };
    }
  },
};
