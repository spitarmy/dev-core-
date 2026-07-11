/**
 * @module @devcore/providers/adapters/anthropic
 * Anthropic provider adapter implementing the unified {@link AIProviderAdapter} interface.
 */

import { AIProvider, MAX_RETRY_COUNT } from '@devcore/shared';
import type { AIProviderAdapter, ChatRequest, ChatResponse } from '../types.js';

/**
 * Configuration options for the {@link AnthropicAdapter}.
 */
export interface AnthropicAdapterConfig {
  /** The Anthropic API key used for authentication (sent via `x-api-key` header). */
  readonly apiKey: string;

  /**
   * The model identifier to use for requests.
   * @defaultValue `'claude-fable-5'`
   */
  readonly modelId?: string;

  /**
   * Maximum number of retry attempts for transient failures.
   * @defaultValue {@link MAX_RETRY_COUNT} from `@devcore/shared`
   */
  readonly maxRetries?: number;

  /**
   * The Anthropic API version string sent in the `anthropic-version` header.
   * @defaultValue `'2023-06-01'`
   */
  readonly anthropicVersion?: string;
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
 * Adapter for the Anthropic Messages API.
 *
 * Provides a unified interface for interacting with Anthropic Claude models
 * with built-in retry logic and exponential backoff for transient failures.
 *
 * Key differences from the OpenAI adapter:
 * - Uses `x-api-key` header instead of `Authorization: Bearer`.
 * - Sends the `anthropic-version` header.
 * - System prompts are passed as a top-level `system` parameter, not as a message.
 *
 * @example
 * ```typescript
 * const adapter = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
 * const response = await adapter.chat({
 *   messages: [{ role: 'user', content: 'Hello!', name: undefined }],
 *   model: 'claude-sonnet-4-20250514',
 *   maxTokens: 4096,
 *   temperature: undefined,
 *   systemPrompt: 'You are a helpful assistant.',
 *   responseFormat: undefined,
 * });
 * ```
 */
export class AnthropicAdapter implements AIProviderAdapter {
  /** @inheritdoc */
  readonly provider = AIProvider.ANTHROPIC;

  /** @inheritdoc */
  readonly modelId: string;

  /** The API key for authenticating with the Anthropic API. */
  private readonly apiKey: string;

  /** Maximum number of retry attempts on transient errors. */
  private readonly maxRetries: number;

  /** The Anthropic API version header value. */
  private readonly anthropicVersion: string;

  /** Base URL for all API requests. */
  private readonly baseUrl = 'https://api.anthropic.com/v1';

  /**
   * Lookup table of per-token cost rates (USD) keyed by model identifier.
   * Rates are approximate and should be updated as pricing changes.
   */
  private readonly costRates: Record<string, CostRate> = {
    'claude-fable-5': { input: 0.00001, output: 0.00005 },
    'claude-sonnet-5': { input: 0.000003, output: 0.000015 },
    'claude-opus-4-8': { input: 0.000015, output: 0.000075 },
    'claude-haiku-4-5': { input: 0.0000008, output: 0.000004 },
  };

  /**
   * Creates a new Anthropic adapter instance.
   *
   * @param config - Configuration options for the adapter.
   */
  constructor(config: AnthropicAdapterConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'claude-fable-5';
    this.maxRetries = config.maxRetries ?? MAX_RETRY_COUNT;
    this.anthropicVersion = config.anthropicVersion ?? '2023-06-01';
  }

  /**
   * Sends a chat message to the Anthropic Messages API with automatic retry logic.
   *
   * Retries transient failures using exponential backoff with a cap of 30 seconds.
   * System prompts are extracted from the message list and sent as the top-level
   * `system` parameter per the Anthropic API specification.
   *
   * @param request - The chat request payload.
   * @returns The normalised chat response.
   * @throws {Error} If all retry attempts are exhausted.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { messages, systemPrompt } = this.buildMessages(request);
    const body: Record<string, unknown> = {
      model: request.model || this.modelId,
      messages,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (systemPrompt !== undefined) {
      body['system'] = systemPrompt;
    }

    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const raw = await this._makeRequest('/messages', body);
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
      `Anthropic chat request failed after ${this.maxRetries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
    );
  }

  /**
   * Lists all model identifiers supported by this adapter.
   *
   * @returns An array of known Anthropic model identifier strings.
   */
  async listModels(): Promise<string[]> {
    return Object.keys(this.costRates);
  }

  /**
   * Estimates the monetary cost (USD) for the given token usage.
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
   * Builds the Anthropic-format messages and extracts the system prompt.
   *
   * Unlike OpenAI, Anthropic expects the system prompt as a separate top-level
   * parameter rather than as a message in the messages array.
   *
   * @param request - The incoming chat request.
   * @returns An object containing the formatted messages array and an optional system prompt.
   */
  private buildMessages(request: ChatRequest): {
    messages: Array<{ role: string; content: string }>;
    systemPrompt: string | undefined;
  } {
    const messages: Array<{ role: string; content: string }> = [];
    let systemPrompt = request.systemPrompt;

    for (const msg of request.messages) {
      // Anthropic does not support a 'system' role in the messages array;
      // merge any system messages into the systemPrompt.
      if (msg.role === 'system') {
        systemPrompt =
          systemPrompt !== undefined
            ? `${systemPrompt}\n\n${msg.content}`
            : msg.content;
        continue;
      }

      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return { messages, systemPrompt };
  }

  /**
   * Parses a raw Anthropic API response into a normalised {@link ChatResponse}.
   *
   * @param raw - The raw JSON-parsed response body.
   * @returns A normalised chat response.
   */
  private parseResponse(raw: unknown): ChatResponse {
    const response = raw as {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
      stop_reason: string;
    };

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      model: response.model,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      finishReason: this.mapStopReason(response.stop_reason),
      rawResponse: raw,
    };
  }

  /**
   * Maps an Anthropic stop_reason string to the normalised union type.
   *
   * @param reason - The raw stop reason from the API.
   * @returns A normalised finish reason.
   */
  private mapStopReason(reason: string | undefined): 'stop' | 'length' | 'error' {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'error';
    }
  }

  /**
   * Makes an HTTP request to the Anthropic API.
   *
   * @param endpoint - The API endpoint path (e.g. `'/messages'`).
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
      'x-api-key': this.apiKey,
      'anthropic-version': this.anthropicVersion,
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
        `Anthropic API error: ${response.status} ${response.statusText} — ${errorBody}`,
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
