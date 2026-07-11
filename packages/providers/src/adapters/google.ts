/**
 * @module @devcore/providers/adapters/google
 * Google AI (Gemini) provider adapter implementing the unified {@link AIProviderAdapter} interface.
 */

import { AIProvider, MAX_RETRY_COUNT } from '@devcore/shared';
import type { AIProviderAdapter, ChatRequest, ChatResponse } from '../types.js';

/**
 * Configuration options for the {@link GoogleAIAdapter}.
 */
export interface GoogleAIAdapterConfig {
  /** The Google AI API key used for authentication. */
  readonly apiKey: string;

  /**
   * The model identifier to use for requests.
   * @defaultValue `'gemini-3.1-pro'`
   */
  readonly modelId?: string;

  /**
   * Maximum number of retry attempts for transient failures.
   * @defaultValue {@link MAX_RETRY_COUNT} from `@devcore/shared`
   */
  readonly maxRetries?: number;

  /**
   * Optional Google Cloud project ID, required for certain Vertex AI endpoints.
   */
  readonly projectId?: string;
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
 * Adapter for the Google AI Gemini API.
 *
 * Provides a unified interface for interacting with Google Gemini models
 * (Gemini 2.5 Pro, Gemini 2.5 Flash, etc.) with built-in retry logic and
 * exponential backoff for transient failures.
 *
 * Key differences from OpenAI / Anthropic adapters:
 * - Uses the `generateContent` REST endpoint.
 * - Messages are structured as `contents` with `parts` arrays.
 * - The response contains `candidates` with `content.parts`.
 * - API key is passed as a query parameter.
 *
 * @example
 * ```typescript
 * const adapter = new GoogleAIAdapter({ apiKey: process.env.GOOGLE_AI_API_KEY });
 * const response = await adapter.chat({
 *   messages: [{ role: 'user', content: 'Hello!', name: undefined }],
 *   model: 'gemini-2.5-pro',
 *   maxTokens: undefined,
 *   temperature: undefined,
 *   systemPrompt: undefined,
 *   responseFormat: undefined,
 * });
 * ```
 */
export class GoogleAIAdapter implements AIProviderAdapter {
  /** @inheritdoc */
  readonly provider = AIProvider.GOOGLE;

  /** @inheritdoc */
  readonly modelId: string;

  /** The API key for authenticating with the Google AI API. */
  private readonly apiKey: string;

  /** Maximum number of retry attempts on transient errors. */
  private readonly maxRetries: number;

  /** Optional Google Cloud project ID. */
  private readonly projectId: string | undefined;

  /** Base URL for the Google AI Generative Language API. */
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  /**
   * Lookup table of per-token cost rates (USD) keyed by model identifier.
   * Rates are approximate and should be updated as pricing changes.
   */
  private readonly costRates: Record<string, CostRate> = {
    'gemini-3.1-pro': { input: 0.00000125, output: 0.00001 },
    'gemini-3.5-flash': { input: 0.00000015, output: 0.0000006 },
    'gemini-3.1-flash-lite': { input: 0.000000075, output: 0.0000003 },
  };

  /**
   * Creates a new Google AI adapter instance.
   *
   * @param config - Configuration options for the adapter.
   */
  constructor(config: GoogleAIAdapterConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'gemini-3.1-pro';
    this.maxRetries = config.maxRetries ?? MAX_RETRY_COUNT;
    this.projectId = config.projectId;
  }

  /**
   * Sends a content generation request to the Google AI API with automatic retry logic.
   *
   * Retries transient failures using exponential backoff with a cap of 30 seconds.
   *
   * @param request - The chat request payload.
   * @returns The normalised chat response.
   * @throws {Error} If all retry attempts are exhausted.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model || this.modelId;
    const { contents, systemInstruction } = this.buildContents(request);

    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction !== undefined) {
      body['systemInstruction'] = {
        parts: [{ text: systemInstruction }],
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.maxTokens !== undefined) {
      generationConfig['maxOutputTokens'] = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      generationConfig['temperature'] = request.temperature;
    }
    if (request.responseFormat === 'json') {
      generationConfig['responseMimeType'] = 'application/json';
    }
    if (Object.keys(generationConfig).length > 0) {
      body['generationConfig'] = generationConfig;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const raw = await this._makeRequest(model, body);
        return this.parseResponse(raw, model);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this._sleep(delay);
        }
      }
    }

    throw new Error(
      `Google AI chat request failed after ${this.maxRetries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
    );
  }

  /**
   * Lists all model identifiers supported by this adapter.
   *
   * @returns An array of known Google AI model identifier strings.
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
   * Builds the Google AI `contents` array and extracts the system instruction.
   *
   * Google's API uses a `contents` array where each item has a `role` and a `parts`
   * array containing text objects. The role values differ from OpenAI's:
   * - `'user'` → `'user'`
   * - `'assistant'` → `'model'`
   * - `'system'` messages are merged into the `systemInstruction` parameter.
   *
   * @param request - The incoming chat request.
   * @returns An object containing the formatted contents and optional system instruction.
   */
  private buildContents(request: ChatRequest): {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction: string | undefined;
  } {
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    let systemInstruction = request.systemPrompt;

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemInstruction =
          systemInstruction !== undefined
            ? `${systemInstruction}\n\n${msg.content}`
            : msg.content;
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    return { contents, systemInstruction };
  }

  /**
   * Parses a raw Google AI API response into a normalised {@link ChatResponse}.
   *
   * @param raw   - The raw JSON-parsed response body.
   * @param model - The model identifier used for the request.
   * @returns A normalised chat response.
   */
  private parseResponse(raw: unknown, model: string): ChatResponse {
    const response = raw as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
        finishReason: string;
      }>;
      usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
    };

    const candidate = response.candidates?.[0];
    const textContent = candidate?.content?.parts
      ?.map((part) => part.text)
      .join('') ?? '';

    return {
      content: textContent,
      model,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
      finishReason: this.mapFinishReason(candidate?.finishReason),
      rawResponse: raw,
    };
  }

  /**
   * Maps a Google AI finishReason string to the normalised union type.
   *
   * @param reason - The raw finish reason from the API.
   * @returns A normalised finish reason.
   */
  private mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'error' {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      default:
        return 'error';
    }
  }

  /**
   * Makes an HTTP request to the Google AI generateContent endpoint.
   *
   * The API key is passed as a query parameter and the model name is embedded
   * in the URL path.
   *
   * @param model - The model identifier (e.g. `'gemini-2.5-pro'`).
   * @param body  - The JSON-serialisable request body.
   * @returns The parsed JSON response.
   *
   * @remarks
   * TODO: Implement actual HTTP call using `fetch` or a lightweight HTTP client.
   */
  private async _makeRequest(model: string, body: unknown): Promise<unknown> {
    const _url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const _headers = {
      'Content-Type': 'application/json',
    };
    const _body = JSON.stringify(body);
    const _timeoutMs = 60_000;

    // Include projectId context if available (for potential Vertex AI support)
    void this.projectId;

    const response = await fetch(_url, {
      method: 'POST',
      headers: _headers,
      body: _body,
      signal: AbortSignal.timeout(_timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Google AI API error: ${response.status} ${response.statusText} — ${errorBody}`,
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
