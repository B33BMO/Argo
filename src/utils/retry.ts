/**
 * Retry utility for handling transient failures in API calls and tool execution.
 * Based on Claude Code's retry pattern with exponential backoff.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

/**
 * Default retry predicate - retries on rate limits, server errors, and connection issues.
 */
function defaultShouldRetry(error: Error, _attempt: number): boolean {
  const msg = error.message.toLowerCase();
  const statusMatch = msg.match(/(\d{3})/);
  
  // Rate limiting
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return true;
  }
  
  // Server errors
  if (statusMatch) {
    const status = parseInt(statusMatch[1]!, 10);
    if (status >= 500 && status < 600) return true;
    if (status === 408) return true; // Request timeout
    if (status === 409) return true; // Conflict
  }
  
  // Connection errors
  if (msg.includes('econnrefused') || 
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('network error')) {
    return true;
  }
  
  // Provider-specific errors
  if (msg.includes('overloaded') || 
      msg.includes('service unavailable') ||
      msg.includes('temporary failure')) {
    return true;
  }
  
  return false;
}

/**
 * Execute a function with retry logic and exponential backoff.
 * 
 * @example
 * const result = await withRetry(
 *   () => provider.chat(messages),
 *   { maxRetries: 3, onRetry: (err, attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`) }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if we should retry
      if (attempt > maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delayMs = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      
      // Call onRetry callback if provided
      onRetry?.(lastError, attempt, delayMs);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrap a provider's chat method with retry logic.
 */
export function withRetries<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args) as Promise<ReturnType<T>>, options);
  }) as T;
}

/**
 * Create an abort-aware timeout wrapper.
 * Throws a specific error if the abort signal is triggered.
 */
export async function withAbortSignal<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;
    let aborted = false;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      aborted = true;
      cleanup();
      reject(new Error('Operation aborted by user'));
    };

    const onTimeout = () => {
      cleanup();
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    };

    // Set up abort listener
    signal?.addEventListener('abort', onAbort);

    // Set up timeout if specified
    if (timeoutMs) {
      timeoutId = setTimeout(onTimeout, timeoutMs);
    }

    // Execute the function
    fn()
      .then(result => {
        cleanup();
        if (!aborted) resolve(result);
      })
      .catch(error => {
        cleanup();
        if (!aborted) reject(error);
      });
  });
}