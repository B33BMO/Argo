import type { Tool, ToolContext, ToolResult, ValidationResult } from './types.js';
import { validInput, invalidInput } from './types.js';
import { loadPermissions, isCommandAllowed, allowCommand, isSafeCommand } from '../utils/permissions.js';

const MAX_RESPONSE_LENGTH = 50000;
const DEFAULT_TIMEOUT = 30000;

interface CurlParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

function validateParams(params: Record<string, unknown>): ValidationResult {
  if (typeof params.url !== 'string' || params.url.trim() === '') {
    return invalidInput('url must be a non-empty string');
  }
  
  // Validate URL
  try {
    new URL(params.url as string);
  } catch {
    return invalidInput(`Invalid URL: ${params.url}`);
  }
  
  if (params.method !== undefined) {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const method = typeof params.method === 'string' ? params.method.toUpperCase() : '';
    if (!validMethods.includes(method)) {
      return invalidInput(`method must be one of: ${validMethods.join(', ')}`);
    }
  }
  
  if (params.headers !== undefined && typeof params.headers !== 'object') {
    return invalidInput('headers must be an object');
  }
  
  if (params.body !== undefined && typeof params.body !== 'string') {
    return invalidInput('body must be a string');
  }
  
  if (params.timeout !== undefined && typeof params.timeout !== 'number') {
    return invalidInput('timeout must be a number');
  }
  
  return validInput(params as Record<string, unknown>);
}

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

  isReadOnly: () => true, // GET is read-only; non-GET handled by confirmation

  validateInput: validateParams,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { url, method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT } = params as unknown as CurlParams;

    const upperMethod = method.toUpperCase();

    // Check permissions for non-GET requests
    if (upperMethod !== 'GET') {
      const permissions = await loadPermissions();
      const isAllowed = isCommandAllowed(permissions, `curl ${upperMethod}`);
      
      if (!isAllowed && context.requestConfirmation) {
        const confirmed = await context.requestConfirmation(
          `Make ${upperMethod} request to ${url}?`
        );
        if (!confirmed) {
          return {
            success: false,
            output: '',
            error: 'Request cancelled by user',
          };
        }
        await allowCommand(`curl ${upperMethod}`);
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: upperMethod,
        headers: {
          'User-Agent': 'Daedalus/1.0',
          ...headers,
        },
        body: body || undefined,
        signal: context.abortSignal 
          ? AbortSignal.any([controller.signal, context.abortSignal])
          : controller.signal,
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
      const headerLines: string[] = [];
      response.headers.forEach((value, key) => {
        headerLines.push(`${key}: ${value}`);
      });
      const headerBlock = headerLines.join('\n');

      const output = `${statusLine}\n${headerBlock}\n\n${responseBody}`;

      return {
        success: response.ok,
        output,
        truncated,
        error: response.ok ? undefined : `Request failed with status ${response.status}`,
      };
    } catch (err) {
      const error = err as Error;

      // Check if aborted by user
      if (context.abortSignal?.aborted) {
        return {
          success: false,
          output: '',
          error: 'Request cancelled by user',
        };
      }

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