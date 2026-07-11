/**
 * @module @devcore/providers/router
 * Model routing layer that directs requests to the appropriate AI provider
 * based on role, task type, and fallback strategies.
 */

import { AIProvider, ModelRole } from '@devcore/shared';
import type { ModelUsage } from '@devcore/shared';
import type { AIProviderAdapter, ChatRequest, ChatResponse } from './types.js';

/**
 * Configuration for the {@link ModelRouter} that controls how requests
 * are mapped to providers and cost limits.
 */
export interface RoutingConfig {
  /**
   * Maps each {@link ModelRole} to the preferred {@link AIProvider}.
   * When a request arrives for a given role, the router selects the
   * adapter registered for that provider.
   */
  readonly roleMapping: Record<ModelRole, AIProvider>;

  /**
   * The fallback provider used when no role-specific mapping is found.
   */
  readonly defaultProvider: AIProvider;

  /**
   * Optional per-request cost ceiling in USD.
   * When set, the router will estimate costs before dispatching and throw
   * if the estimated cost would exceed this limit.
   */
  readonly costLimitPerRequest: number | undefined;
}

/**
 * Summary of accumulated costs and request counts across all providers.
 */
export interface CostSummary {
  /** Total estimated cost across all providers in USD. */
  readonly totalCost: number;

  /** Estimated cost broken down by provider name in USD. */
  readonly byProvider: Record<string, number>;

  /** Total number of requests made through the router. */
  readonly requestCount: number;
}

/**
 * Routes chat requests to the appropriate AI provider based on model roles,
 * task types, and configurable fallback strategies.
 *
 * The `ModelRouter` acts as the central dispatch layer in the provider abstraction,
 * enabling callers to think in terms of *roles* (e.g. "architect", "code", "review")
 * rather than specific provider APIs.
 *
 * @example
 * ```typescript
 * const adapters = new Map<AIProvider, AIProviderAdapter>([
 *   [AIProvider.OPENAI, openaiAdapter],
 *   [AIProvider.ANTHROPIC, anthropicAdapter],
 *   [AIProvider.GOOGLE, googleAdapter],
 * ]);
 *
 * const router = new ModelRouter(adapters, {
 *   roleMapping: {
 *     [ModelRole.ARCHITECT]: AIProvider.ANTHROPIC,
 *     [ModelRole.CODE]: AIProvider.ANTHROPIC,
 *     [ModelRole.REVIEW]: AIProvider.OPENAI,
 *     [ModelRole.DEBUG]: AIProvider.GOOGLE,
 *     [ModelRole.GENERAL]: AIProvider.OPENAI,
 *   },
 *   defaultProvider: AIProvider.OPENAI,
 *   costLimitPerRequest: 0.50,
 * });
 *
 * const response = await router.chat(ModelRole.CODE, request);
 * ```
 */
export class ModelRouter {
  /** Registered provider adapters keyed by {@link AIProvider}. */
  private readonly adapters: Map<AIProvider, AIProviderAdapter>;

  /** The active routing configuration. */
  private readonly config: RoutingConfig;

  /** Accumulated usage log for cost tracking. */
  private readonly usageLog: ModelUsage[] = [];

  /**
   * Sensible default role-to-provider mapping used when no explicit
   * mapping is provided in the constructor config.
   */
  private readonly defaultRoleMapping: Record<ModelRole, AIProvider> = {
    [ModelRole.PLANNER]: AIProvider.OPENAI,
    [ModelRole.ARCHITECT]: AIProvider.ANTHROPIC,
    [ModelRole.IMPLEMENTER]: AIProvider.ANTHROPIC,
    [ModelRole.REVIEWER]: AIProvider.OPENAI,
    [ModelRole.TESTER]: AIProvider.GOOGLE,
    [ModelRole.FAST]: AIProvider.OPENAI,
  };

  /**
   * Creates a new model router.
   *
   * @param adapters - A map of registered provider adapters. At least one adapter must be
   *                   registered for the {@link RoutingConfig.defaultProvider}.
   * @param config   - Optional routing configuration. When omitted, sensible defaults are used.
   */
  constructor(
    adapters: Map<AIProvider, AIProviderAdapter>,
    config?: RoutingConfig,
  ) {
    this.adapters = adapters;

    // Determine the default provider from the first registered adapter if none specified.
    const firstProvider = adapters.keys().next().value as AIProvider;

    this.config = config ?? {
      roleMapping: this.defaultRoleMapping,
      defaultProvider: firstProvider,
      costLimitPerRequest: undefined,
    };
  }

  /**
   * Returns the adapter mapped to the given role.
   *
   * Falls back to the default provider if no explicit mapping exists for the role.
   *
   * @param role - The model role to look up.
   * @returns The corresponding {@link AIProviderAdapter}.
   * @throws {Error} If no adapter is registered for the resolved provider.
   */
  routeByRole(role: ModelRole): AIProviderAdapter {
    const provider = this.config.roleMapping[role] ?? this.config.defaultProvider;
    return this.getAdapter(provider);
  }

  /**
   * Maps a free-form task type string to a {@link ModelRole} and returns the
   * corresponding adapter.
   *
   * Supported task type keywords:
   * - `'architecture'`, `'planning'`, `'design'` → {@link ModelRole.ARCHITECT}
   * - `'code'`, `'implement'`, `'develop'` → {@link ModelRole.CODE}
   * - `'review'`, `'audit'`, `'check'` → {@link ModelRole.REVIEW}
   * - `'debug'`, `'fix'`, `'troubleshoot'` → {@link ModelRole.DEBUG}
   * - Everything else → {@link ModelRole.GENERAL}
   *
   * @param taskType - A descriptive string indicating the type of task.
   * @returns The adapter best suited for the given task type.
   */
  routeByTaskType(taskType: string): AIProviderAdapter {
    const role = this.mapTaskTypeToRole(taskType);
    return this.routeByRole(role);
  }

  /**
   * Routes a chat request to the provider mapped to the given role, sends the
   * request, and logs token usage.
   *
   * @param role    - The model role determining which provider handles the request.
   * @param request - The chat request payload.
   * @returns The normalised chat response.
   * @throws {Error} If no adapter is found or the request fails.
   */
  async chat(role: ModelRole, request: ChatRequest): Promise<ChatResponse> {
    const adapter = this.routeByRole(role);
    const response = await adapter.chat(request);
    this.logUsage(adapter.provider, adapter.modelId, response);
    return response;
  }

  /**
   * Attempts to route a chat request to the primary role's provider. On failure,
   * tries each fallback role in order until one succeeds.
   *
   * This is useful for high-availability scenarios where a provider might be
   * experiencing transient outages.
   *
   * @param role          - The primary model role to attempt first.
   * @param request       - The chat request payload.
   * @param fallbackRoles - Optional ordered list of fallback roles to try on failure.
   *                        When omitted, falls back to {@link ModelRole.GENERAL}.
   * @returns The normalised chat response from the first successful provider.
   * @throws {Error} If all providers (primary + fallbacks) fail.
   */
  async chatWithFallback(
    role: ModelRole,
    request: ChatRequest,
    fallbackRoles?: ModelRole[],
  ): Promise<ChatResponse> {
    const rolesToTry = [role, ...(fallbackRoles ?? [ModelRole.FAST])];
    const errors: Error[] = [];

    for (const currentRole of rolesToTry) {
      try {
        const adapter = this.routeByRole(currentRole);
        const response = await adapter.chat(request);
        this.logUsage(adapter.provider, adapter.modelId, response);
        return response;
      } catch (error: unknown) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    const errorMessages = errors.map((e, i) => `  [${i}] ${e.message}`).join('\n');
    throw new Error(
      `All providers failed for role "${role}" with ${rolesToTry.length} attempt(s):\n${errorMessages}`,
    );
  }

  /**
   * Returns a summary of accumulated costs and usage across all providers.
   *
   * @returns A {@link CostSummary} with total cost, per-provider breakdown, and request count.
   */
  getCostSummary(): CostSummary {
    let totalCost = 0;
    const byProvider: Record<string, number> = {};

    for (const entry of this.usageLog) {
      const adapter = this.adapters.get(entry.provider as AIProvider);
      if (adapter === undefined) {
        continue;
      }

      const cost = adapter.estimateCost(entry.inputTokens, entry.outputTokens);
      totalCost += cost;

      const providerKey = entry.provider;
      byProvider[providerKey] = (byProvider[providerKey] ?? 0) + cost;
    }

    return {
      totalCost,
      byProvider,
      requestCount: this.usageLog.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Records a usage log entry for a completed chat request.
   *
   * @param provider - The AI provider that handled the request.
   * @param modelId  - The model identifier that served the request.
   * @param response - The chat response containing usage data.
   */
  private logUsage(
    provider: AIProvider,
    modelId: string,
    response: ChatResponse,
  ): void {
    this.usageLog.push({
      provider,
      modelId,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cost: 0, // Will be calculated in getCostSummary
      timestamp: new Date(),
    });
  }

  /**
   * Retrieves a registered adapter for the given provider.
   *
   * @param provider - The AI provider to look up.
   * @returns The registered {@link AIProviderAdapter}.
   * @throws {Error} If no adapter is registered for the provider.
   */
  private getAdapter(provider: AIProvider): AIProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      throw new Error(
        `No adapter registered for provider "${provider}". ` +
        `Registered providers: [${[...this.adapters.keys()].join(', ')}]`,
      );
    }
    return adapter;
  }

  /**
   * Maps a free-form task type string to the most appropriate {@link ModelRole}.
   *
   * @param taskType - A descriptive string indicating the type of task.
   * @returns The inferred model role.
   */
  private mapTaskTypeToRole(taskType: string): ModelRole {
    const normalised = taskType.toLowerCase().trim();

    if (['planning', 'requirements', 'spec'].some((k) => normalised.includes(k))) {
      return ModelRole.PLANNER;
    }
    if (['architecture', 'design', 'system'].some((k) => normalised.includes(k))) {
      return ModelRole.ARCHITECT;
    }
    if (['code', 'implement', 'develop', 'build'].some((k) => normalised.includes(k))) {
      return ModelRole.IMPLEMENTER;
    }
    if (['review', 'audit', 'check'].some((k) => normalised.includes(k))) {
      return ModelRole.REVIEWER;
    }
    if (['test', 'qa', 'verify'].some((k) => normalised.includes(k))) {
      return ModelRole.TESTER;
    }
    if (['debug', 'fix', 'troubleshoot'].some((k) => normalised.includes(k))) {
      return ModelRole.IMPLEMENTER;
    }

    return ModelRole.FAST;
  }
}
