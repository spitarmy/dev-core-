/**
 * Approval checking module for determining whether operations require human approval.
 * @module approval-checker
 */

import type { ApprovalType } from '@devcore/shared';
import { DangerousOperations } from '@devcore/shared';

/**
 * Result of an approval check indicating whether approval is required.
 */
export interface ApprovalCheckResult {
  /** Whether human approval is required for this operation. */
  required: boolean;
  /** The type of approval required. */
  approvalType: ApprovalType;
  /** Human-readable reason why approval is required. */
  reason: string;
}

/**
 * Evaluates operations to determine whether they require human approval
 * before execution.
 *
 * Checks are performed in priority order: destructive operations,
 * cost thresholds, deployments, deletions, and rollbacks.
 */
export class ApprovalChecker {
  private readonly costThreshold: number;

  /**
   * Creates a new ApprovalChecker instance.
   *
   * @param options - Optional configuration.
   * @param options.costThreshold - Cost threshold above which approval is required (default: 1.0).
   */
  constructor(options?: { costThreshold?: number }) {
    this.costThreshold = options?.costThreshold ?? 1.0;
  }

  /**
   * Determines whether an operation requires human approval.
   *
   * Checks are evaluated in the following order:
   * 1. Destructive operations or those matching {@link DangerousOperations} → `DANGEROUS_OPERATION`
   * 2. Cost exceeding the configured threshold → `COST_THRESHOLD`
   * 3. Operations with type containing `'deploy'` → `DEPLOYMENT`
   * 4. Operations with type containing `'delete'`, `'remove'`, or `'drop'` → `CODE_CHANGES`
   * 5. Operations with type containing `'rollback'` → `ROLLBACK`
   *
   * @param operation - The operation to evaluate.
   * @param operation.type - The operation type identifier.
   * @param operation.command - Optional command string associated with the operation.
   * @param operation.path - Optional filesystem path associated with the operation.
   * @param operation.cost - Optional estimated cost of the operation.
   * @param operation.isDestructive - Optional flag indicating the operation is destructive.
   * @returns An {@link ApprovalCheckResult} if approval is required, or `null` if not.
   */
  requiresApproval(operation: {
    type: string;
    command?: string;
    path?: string;
    cost?: number;
    isDestructive?: boolean;
  }): ApprovalCheckResult | null {
    const typeLower = operation.type.toLowerCase();

    // 1. Destructive or dangerous operations
    if (operation.isDestructive || (operation.command && ApprovalChecker.isDangerousCommand(operation.command))) {
      return {
        required: true,
        approvalType: 'DANGEROUS_OPERATION' as ApprovalType,
        reason: `Operation '${operation.type}' is destructive or matches a dangerous operation pattern`,
      };
    }

    // 2. Cost threshold
    if (operation.cost !== undefined && operation.cost > this.costThreshold) {
      return {
        required: true,
        approvalType: 'COST_THRESHOLD' as ApprovalType,
        reason: `Operation cost (${operation.cost}) exceeds threshold (${this.costThreshold})`,
      };
    }

    // 3. Deployment
    if (typeLower.includes('deploy')) {
      return {
        required: true,
        approvalType: 'DEPLOYMENT' as ApprovalType,
        reason: `Operation '${operation.type}' is a deployment operation`,
      };
    }

    // 4. Delete/remove/drop
    if (typeLower.includes('delete') || typeLower.includes('remove') || typeLower.includes('drop')) {
      return {
        required: true,
        approvalType: 'CODE_CHANGES' as ApprovalType,
        reason: `Operation '${operation.type}' involves deletion or removal`,
      };
    }

    // 5. Rollback
    if (typeLower.includes('rollback')) {
      return {
        required: true,
        approvalType: 'ROLLBACK' as ApprovalType,
        reason: `Operation '${operation.type}' is a rollback operation`,
      };
    }

    return null;
  }

  /**
   * Checks whether a command matches any known dangerous operation pattern.
   *
   * @param command - The command string to evaluate.
   * @returns `true` if the command is considered dangerous.
   */
  static isDangerousCommand(command: string): boolean {
    const trimmed = command.trim().toLowerCase();

    for (const pattern of DangerousOperations) {
      if (trimmed.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks whether an operation string contains deployment-related keywords.
   *
   * Matches keywords: `deploy`, `release`, `publish`, `ship`, `promote`, `rollout`.
   *
   * @param operation - The operation string to check.
   * @returns `true` if the operation appears to be deployment-related.
   */
  static isDeploymentOperation(operation: string): boolean {
    const deploymentKeywords = ['deploy', 'release', 'publish', 'ship', 'promote', 'rollout'];
    const lower = operation.toLowerCase();
    return deploymentKeywords.some((keyword) => lower.includes(keyword));
  }
}
