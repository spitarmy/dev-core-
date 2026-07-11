/**
 * @module @devcore/providers/adapters/openai
 * OpenAI provider adapter implementing the unified {@link AIProviderAdapter} interface.
 */

import { AIProvider, MAX_RETRY_COUNT } from '@devcore/shared';
import type { AIProviderAdapter, ChatRequest, ChatResponse, ChatMessage } from '../types.js';

/**
 * Configuration options for the {@link OpenAIAdapter}.
 */
export interface OpenAIAdapterConfig {
  /** The OpenAI API key used for authentication. */
  readonly apiKey: string;

  /**
   * The model identifier to use for requests.
   * @defaultValue `'gpt-5.6-sol'`
   */
  readonly modelId?: string;

  /**
   * Maximum number of retry attempts for transient failures.
   * @defaultValue {@link MAX_RETRY_COUNT} from `@devcore/shared`
   */
  readonly maxRetries?: number;

  /**
   * Override the base URL for the OpenAI-compatible API.
   * Useful for proxies or OpenAI-compatible third-party services.
   * @defaultValue `'https://api.openai.com/v1'`
   */
  readonly baseUrl?: string;
}

/**
 * Per-token cost rates for a specific model.
 */
interface CostRate {
  /** Cost per input token in USD. */
  readonly input: number;
  /** Cost per output token in USD. */
  readonly output: number;
}

/**
 * Adapter for the OpenAI Chat Completions API.
 *
 * Provides a unified interface for interacting with OpenAI models (GPT-4o, GPT-4o-mini, o3, etc.)
 * with built-in retry logic and exponential backoff for transient failures.
 *
 * @example
 * ```typescript
 * const adapter = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
 * const response = await adapter.chat({
 *   messages: [{ role: 'user', content: 'Hello!', name: undefined }],
 *   model: 'gpt-4o',
 *   maxTokens: undefined,
 *   temperature: undefined,
 *   systemPrompt: undefined,
 *   responseFormat: undefined,
 * });
 * ```
 */
export class OpenAIAdapter implements AIProviderAdapter {
  /** @inheritdoc */
  readonly provider = AIProvider.OPENAI;

  /** @inheritdoc */
  readonly modelId: string;

  /** The API key for authenticating with the OpenAI API. */
  private readonly apiKey: string;

  /** Maximum number of retry attempts on transient errors. */
  private readonly maxRetries: number;

  /** Base URL for all API requests. */
  private readonly baseUrl: string;

  /**
   * Lookup table of per-token cost rates (USD) keyed by model identifier.
   * Rates are approximate and should be updated as pricing changes.
   */
  private readonly costRates: Record<string, CostRate> = {
    'gpt-5.6-sol': { input: 0.000005, output: 0.00003 },
    'gpt-5.6-terra': { input: 0.0000025, output: 0.000015 },
    'gpt-5.6-luna': { input: 0.000001, output: 0.000006 },
    'o3': { input: 0.00001, output: 0.00004 },
    'o4-mini': { input: 0.0000011, output: 0.0000044 },
  };

  /**
   * Creates a new OpenAI adapter instance.
   *
   * @param config - Configuration options for the adapter.
   */
  constructor(config: OpenAIAdapterConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'gpt-5.6-sol';
    this.maxRetries = config.maxRetries ?? MAX_RETRY_COUNT;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  /**
   * Sends a chat completion request to the OpenAI API with automatic retry logic.
   *
   * Retries transient failures using exponential backoff with a cap of 30 seconds.
   *
   * @param request - The chat request payload.
   * @returns The normalised chat response.
   * @throws {Error} If all retry attempts are exhausted.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.buildMessages(request);
    const body = {
      model: request.model || this.modelId,
      messages,
      ...(request.maxTokens !== undefined && { max_tokens: request.maxTokens }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.responseFormat === 'json' && {
        response_format: { type: 'json_object' },
      }),
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const raw = await this._makeRequest('/chat/completions', body);
        return this.parseResponse(raw);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this._sleep(delay);
        }
      }
    }

    throw new Error(
      `OpenAI chat request failed after ${this.maxRetries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
    );
  }

  /**
   * Lists all model identifiers supported by this adapter.
   *
   * @returns An array of known OpenAI model identifier strings.
   */
  async listModels(): Promise<string[]> {
    return Object.keys(this.costRates);
  }

  /**
   * Estimates the monetary cost (USD) for the given token usage.
   *
   * Falls back to the configured {@link modelId}'s rates when the model is not
   * found in the cost table.
   *
   * @param inputTokens  - Number of input tokens consumed.
   * @param outputTokens - Number of output tokens generated.
   * @returns Estimated cost in USD.
   */
  estimateCost(inputTokens: number, outputTokens: number): number {
    const rates = this.costRates[this.modelId] ?? { input: 0, output: 0 };
    return inputTokens * rates.input + outputTokens * rates.output;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the OpenAI-format messages array from a {@link ChatRequest}.
   *
   * If a `systemPrompt` is provided on the request it is prepended as a system message.
   *
   * @param request - The incoming chat request.
   * @returns An array of message objects in the shape expected by the OpenAI API.
   */
  private buildMessages(
    request: ChatRequest,
  ): Array<{ role: string; content: string; name?: string }> {
    const messages: Array<{ role: string; content: string; name?: string }> = [];

    if (request.systemPrompt !== undefined) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      const entry: { role: string; content: string; name?: string } = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.name !== undefined) {
        entry.name = msg.name;
      }
      messages.push(entry);
    }

    return messages;
  }

  /**
   * Parses a raw OpenAI API response into a normalised {@link ChatResponse}.
   *
   * @param raw - The raw JSON-parsed response body.
   * @returns A normalised chat response.
   */
  private parseResponse(raw: unknown): ChatResponse {
    const response = raw as {
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = response.choices[0];

    return {
      content: choice?.message?.content ?? '',
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      finishReason: this.mapFinishReason(choice?.finish_reason),
      rawResponse: raw,
    };
  }

  /**
   * Maps an OpenAI finish_reason string to the normalised union type.
   *
   * @param reason - The raw finish reason from the API.
   * @returns A normalised finish reason.
   */
  private mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      default:
        return 'error';
    }
  }

  /**
   * Makes an HTTP request to the OpenAI API.
   *
   * @param endpoint - The API endpoint path (e.g. `'/chat/completions'`).
   * @param body     - The JSON-serialisable request body.
   * @returns The parsed JSON response.
   *
   * @remarks
   * TODO: Implement actual HTTP call using `fetch` or a lightweight HTTP client.
   * The structure below outlines the expected request shape.
   */
  private async _makeRequest(endpoint: string, body: unknown): Promise<unknown> {
    const _url = `${this.baseUrl}${endpoint}`;
    const _headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    const _body = JSON.stringify(body);
    const _timeoutMs = 60_000;

    const response = await fetch(_url, {
      method: 'POST',
      headers: _headers,
      body: _body,
      signal: AbortSignal.timeout(_timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} — ${errorBody}`,
      );
    }

    return await response.json();
  }

  /**
   * Suspends execution for the specified duration.
   *
   * @param ms - Duration in milliseconds.
   * @returns A promise that resolves after `ms` milliseconds.
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
