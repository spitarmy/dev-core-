/**
 * @module @devcore/shared/utils/cost
 * Cost calculation and budget management utilities for the DevCore platform.
 * Provides functions for computing token costs, formatting monetary values,
 * checking budget constraints, and estimating task costs.
 */

import type { CostEstimate } from '../types/task.js';
import type { ModelConfig } from '../types/model.js';
import { ModelRole, DEFAULT_MODEL_CONFIG } from '../types/model.js';

/**
 * Calculates the total monetary cost for a given number of input and output tokens
 * based on the provided model configuration's per-token pricing.
 *
 * @param inputTokens - Number of input tokens consumed.
 * @param outputTokens - Number of output tokens generated.
 * @param config - Model configuration containing per-token cost rates.
 * @returns The total cost in the model's currency (typically USD).
 *
 * @example
 * ```typescript
 * const config = DEFAULT_MODEL_CONFIG[ModelRole.PLANNER];
 * const cost = calculateTokenCost(1000, 500, config);
 * // cost = (1000 * 2.5/1M) + (500 * 10/1M) = 0.0025 + 0.005 = 0.0075
 * ```
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  config: ModelConfig,
): number {
  return (
    inputTokens * config.costPerInputToken +
    outputTokens * config.costPerOutputToken
  );
}

/**
 * Formats a monetary amount into a human-readable currency string.
 * Uses locale-appropriate formatting with enough decimal places to
 * represent small token costs accurately.
 *
 * @param amount - The monetary amount to format.
 * @param currency - ISO 4217 currency code (defaults to 'USD').
 * @returns A formatted currency string (e.g., '$0.0023').
 *
 * @example
 * ```typescript
 * formatCost(0.0023);       // '$0.0023'
 * formatCost(1.5);          // '$1.50'
 * formatCost(0.005, 'EUR'); // '€0.0050'
 * ```
 */
export function formatCost(amount: number, currency: string = 'USD'): string {
  const decimals = amount < 0.01 ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Checks whether the current accumulated cost is within the specified budget limit.
 *
 * @param currentCost - The current total cost accumulated so far.
 * @param limit - The maximum allowed budget.
 * @returns `true` if the current cost does not exceed the limit, `false` otherwise.
 *
 * @example
 * ```typescript
 * isWithinBudget(3.50, 5.00); // true
 * isWithinBudget(5.01, 5.00); // false
 * ```
 */
export function isWithinBudget(currentCost: number, limit: number): boolean {
  return currentCost <= limit;
}

/**
 * Estimates the cost of processing a task based on the description length
 * and the default model configuration for the specified role.
 *
 * Uses a heuristic that approximates token count from character length:
 * - Input tokens are estimated as description length divided by 4 (rough chars-per-token ratio),
 *   plus a base overhead of 500 tokens for system prompts and context.
 * - Output tokens are estimated as 60% of the input token count.
 *
 * @param taskDescription - The full text description of the task.
 * @param role - The model role to use for cost estimation (defaults to IMPLEMENTER).
 * @returns A {@link CostEstimate} with estimated token counts and cost.
 *
 * @example
 * ```typescript
 * const estimate = estimateTaskCost('Implement a REST API for user management', ModelRole.IMPLEMENTER);
 * // Returns estimated input/output tokens and cost based on Claude Sonnet pricing
 * ```
 */
export function estimateTaskCost(
  taskDescription: string,
  role: ModelRole = ModelRole.IMPLEMENTER,
): CostEstimate {
  const config = DEFAULT_MODEL_CONFIG[role];

  /** Estimate input tokens: ~4 chars per token + 500 token overhead for system context. */
  const estimatedInputTokens = Math.ceil(taskDescription.length / 4) + 500;

  /** Estimate output tokens as ~60% of input tokens. */
  const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.6);

  const estimatedCost = calculateTokenCost(
    estimatedInputTokens,
    estimatedOutputTokens,
    config,
  );

  return {
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    estimatedCost,
    currency: 'USD',
  };
}
