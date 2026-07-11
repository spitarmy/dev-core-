/**
 * @module @devcore/shared/types/approval
 * Approval workflow type definitions for the DevCore platform.
 * Defines approval types, request/response structures, and a list
 * of dangerous operations that always require human approval.
 */

/**
 * Categories of operations that require human approval before execution.
 * Each type represents a different risk level and approval workflow.
 */
export enum ApprovalType {
  /** Approval for a generated implementation plan. */
  PLAN = 'plan',
  /** Approval for code changes before they are committed. */
  CODE_CHANGES = 'code_changes',
  /** Approval for deploying changes to a target environment. */
  DEPLOYMENT = 'deployment',
  /** Approval for executing a potentially destructive operation. */
  DANGEROUS_OPERATION = 'dangerous_operation',
  /** Approval required when estimated cost exceeds the configured threshold. */
  COST_THRESHOLD = 'cost_threshold',
  /** Approval for rolling back previously deployed changes. */
  ROLLBACK = 'rollback',
}

/**
 * Represents a pending approval request sent to a human operator.
 * Created when the AI pipeline encounters an operation that requires
 * explicit human authorization before proceeding.
 */
export interface ApprovalRequest {
  /** Unique identifier for the approval request. */
  id: string;
  /** Identifier of the task that triggered this approval request. */
  taskId: string;
  /** The category of operation requiring approval. */
  type: ApprovalType;
  /** Short human-readable title summarizing the approval request. */
  title: string;
  /** Detailed description of what is being requested for approval. */
  description: string;
  /** Additional structured details relevant to the approval decision. */
  details: Record<string, unknown>;
  /** Timestamp when the approval request was created. */
  createdAt: Date;
  /** Timestamp when the approval request expires (auto-rejected if not responded to). */
  expiresAt?: Date;
}

/**
 * Represents a human operator's response to an approval request.
 * Captures the decision, optional feedback, and audit information.
 */
export interface ApprovalResponse {
  /** Identifier of the approval request being responded to. */
  requestId: string;
  /** Whether the operation was approved (true) or rejected (false). */
  approved: boolean;
  /** Optional comment or feedback from the reviewer. */
  comment?: string;
  /** Timestamp when the response was submitted. */
  respondedAt: Date;
  /** Identifier of the human operator who responded. */
  respondedBy: string;
}

/**
 * List of dangerous shell commands and operations that always require
 * human approval before execution, regardless of project settings.
 * These operations are potentially destructive and irreversible.
 */
export const DangerousOperations: readonly string[] = [
  'rm -rf',
  'DROP TABLE',
  'DROP DATABASE',
  'TRUNCATE',
  'force push',
  'git push --force',
  'git push -f',
  'delete branch',
  'git branch -D',
  'chmod 777',
  'sudo',
  'kill -9',
  'pkill',
  'shutdown',
  'reboot',
  'format',
  'mkfs',
] as const;
